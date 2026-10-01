import { Flags } from "@oclif/core";
import open from "open";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import {
  apiClient,
  ApiError,
  ForbiddenError,
  isMissingScopesError,
  NotFoundError,
} from "../../lib/api-client.js";
import {
  json,
  success,
  info,
  warn,
  error,
  colors,
  spinner,
  isJsonMode,
} from "../../lib/output.js";
import { attachLoginKeypressHandler } from "../../lib/keypress.js";
import {
  VERIFICATION_METHODS,
  rememberSignup,
  reportWhatsappError,
  whatsappErrorCode,
  type WhatsappSignup,
} from "../../lib/whatsapp.js";

interface SignupStartResponse {
  id: string;
  connectUrl: string;
  status: string;
}

interface SignupStatusResponse {
  id: string;
  status: string;
  phoneNumber: string;
  businessAccountId: string | null;
  failureReasons: string[] | null;
  updatedAt: string;
}

const SIGNUP_POLL_INTERVAL = 5000; // 5 seconds
const SIGNUP_MAX_ATTEMPTS = 240; // ~20 minutes

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryWait(seconds: number): string {
  if (seconds >= 3600) {
    const hours = Math.round(seconds / 3600);
    return `about ${hours} hour${hours === 1 ? "" : "s"}`;
  }
  if (seconds >= 60) {
    const minutes = Math.round(seconds / 60);
    return `about ${minutes} minute${minutes === 1 ? "" : "s"}`;
  }
  return `${seconds} second${seconds === 1 ? "" : "s"}`;
}

type StartRefusal = { message: string; details: Record<string, unknown> };

function explainStartRefusal(err: unknown): StartRefusal | undefined {
  if (!(err instanceof ApiError)) return undefined;
  const code = err.body?.error;
  if (code === "whatsapp_unavailable") {
    const retryAfter = Number(err.body?.retryAfter);
    const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 3600;
    return {
      message: err.message,
      details: {
        code,
        retryAfter: wait,
        hint: `Try again in ${retryWait(wait)}. Nothing was charged.`,
      },
    };
  }
  if (code === "whatsapp_signup_limit_reached") {
    return {
      message: err.message,
      details: {
        code,
        hint: "Each failed attempt was refunded. Check why the last one failed with `sendly whatsapp status`, then try again tomorrow or contact support@sendly.live.",
      },
    };
  }
  if (err instanceof ForbiddenError && err.code === "insufficient_permissions") {
    return {
      message: err.message,
      details: {
        code: err.code,
        hint: isMissingScopesError(err)
          ? "Use an API key with the whatsapp:write scope."
          : "Connecting WhatsApp needs a workspace owner or admin (settings:write). Ask one of them to run this command.",
      },
    };
  }
  return undefined;
}

export default class WhatsappConnect extends AuthenticatedCommand {
  static description =
    "Connect one of your numbers to WhatsApp. Prints a secure link a person must open and sign in with Facebook to finish; the command then waits until the sender is active. With --business-account it instead adds the number to a WhatsApp Business account already connected in this workspace, with no Facebook step: WhatsApp sends a 6-digit code to the number, which you enter with `sendly whatsapp verify`; that request is never retried automatically, so a failed start can't charge the fee twice. Needs a live API key with the whatsapp:write scope and, in a team workspace, an owner or admin. One-time $19 connection fee, no monthly fee. If the connection fails, the $19 fee is refunded automatically.";

  static examples = [
    "<%= config.bin %> whatsapp connect --number +15551234567",
    "<%= config.bin %> whatsapp connect --number +15551234567 --json",
    "<%= config.bin %> whatsapp connect --number +15555550142 --business-account 104996582519384",
    '<%= config.bin %> whatsapp connect --number +15555550142 --business-account 104996582519384 --verification-method voice --display-name "Acme Plumbing"',
  ];

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    number: Flags.string({
      char: "n",
      description: "Number on your workspace to connect (E.164 format)",
      required: true,
    }),
    "business-account": Flags.string({
      description:
        "Id of a WhatsApp Business account already connected in this workspace (`sendly whatsapp senders` shows it). Adds the number to it with a verification code instead of the Facebook step",
    }),
    "verification-method": Flags.string({
      description:
        "With --business-account: how WhatsApp sends the code, sms (default) or voice",
      options: [...VERIFICATION_METHODS],
      dependsOn: ["business-account"],
    }),
    "display-name": Flags.string({
      description:
        "With --business-account: the business name WhatsApp shows for this number (max 512 characters). Defaults to the account's existing display name",
      dependsOn: ["business-account"],
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(WhatsappConnect);

    if (flags["business-account"] !== undefined) {
      if (!flags["business-account"].trim()) {
        error("--business-account can't be empty", {
          hint: "Pass the business account id that `sendly whatsapp senders` shows, or leave --business-account out to connect with Facebook.",
        });
        this.exit(1);
      }
      await this.addByCode(flags.number, flags["business-account"], {
        verificationMethod: flags["verification-method"],
        displayName: flags["display-name"],
      });
      return;
    }

    const startSpinner = spinner("Starting WhatsApp connection...");
    if (!isJsonMode()) {
      startSpinner.start();
    }

    let response: SignupStartResponse;
    try {
      response = await apiClient.post<SignupStartResponse>(
        "/api/v1/whatsapp/signup",
        { phoneNumber: flags.number },
      );
      startSpinner.stop();
    } catch (err: any) {
      startSpinner.stop();
      if (err instanceof NotFoundError && err.message === "Resource not found") {
        error("WhatsApp isn't enabled for your account yet.", {
          hint: "WhatsApp is enabled per person (the user who owns the API key, not the workspace) and is rolling out gradually. Contact support@sendly.live for early access.",
        });
        this.exit(1);
      }
      const refusal = explainStartRefusal(err);
      if (refusal) {
        error(refusal.message, refusal.details);
        this.exit(1);
      }
      if (
        err instanceof ApiError &&
        whatsappErrorCode(err) === "whatsapp_verification_in_progress" &&
        reportWhatsappError(err)
      ) {
        this.exit(1);
      }
      throw err;
    }

    rememberSignup(response.id, flags.number);

    if (isJsonMode()) {
      // Non-interactive: surface the link so the caller can hand it to a
      // person, then poll with `sendly whatsapp status <id>`.
      json(response);
      return;
    }

    console.log();
    console.log(colors.bold("Finish connecting on the web"));
    console.log();
    console.log(
      "Open this link and sign in with Facebook to finish connecting your number to WhatsApp:",
    );
    console.log(colors.bold(colors.primary(`  ${response.connectUrl}`)));
    console.log();
    console.log(colors.dim(`Signup id: ${response.id}`));
    console.log();

    try {
      await open(response.connectUrl);
      console.log(colors.dim("Browser opened automatically"));
    } catch {
      console.log(colors.dim("Please open the URL manually"));
    }

    const keypressCleanup = attachLoginKeypressHandler(response.connectUrl);
    console.log();

    const final = await this.pollSignup(response.id);
    keypressCleanup();

    if (final === "timeout") {
      warn(
        "We stopped waiting. Finish the Facebook sign-in in your browser, then check `sendly whatsapp status`.",
      );
      return;
    }

    if (final === "timeout_registering") {
      warn(
        `We stopped waiting, but the Facebook sign-in is done: WhatsApp is still activating the number. Activation usually takes a few minutes but can take hours. If it hasn't finished about 6 hours after the session began, the session fails with registration_timeout and the fee is refunded. Check with \`sendly whatsapp status ${response.id}\`.`,
      );
      return;
    }

    if (final === "gone") {
      warn(
        "This connection attempt is no longer available. Re-run `sendly whatsapp connect` to start over.",
      );
      return;
    }

    if (final.status === "active") {
      success("WhatsApp sender connected", {
        number: final.phoneNumber,
        "business account": final.businessAccountId ?? "—",
      });
      console.log();
      console.log(
        colors.dim(
          `Send with: ${colors.code(`sendly whatsapp send --from ${final.phoneNumber} --to +15551230000 --text "Hello!"`)}`,
        ),
      );
      return;
    }

    if (final.status === "expired") {
      error("The connect link expired before signup finished.", {
        hint: "Run `sendly whatsapp connect` again to get a fresh link.",
      });
      this.exit(1);
    }

    // failed
    error("WhatsApp connection failed.", {
      ...(final.failureReasons?.length && {
        reasons: final.failureReasons.join("; "),
      }),
      hint: "If the connection fails, the $19 fee is refunded automatically. Re-run `sendly whatsapp connect` to try again.",
    });
    this.exit(1);
  }

  private async addByCode(
    number: string,
    businessAccountId: string,
    options: { verificationMethod?: string; displayName?: string },
  ): Promise<void> {
    const startSpinner = spinner("Asking WhatsApp for a verification code...");
    if (!isJsonMode()) {
      startSpinner.start();
    }

    let response: WhatsappSignup;
    let httpStatus: number | undefined;
    try {
      response = await apiClient.post<WhatsappSignup>(
        "/api/v1/whatsapp/signup",
        {
          phoneNumber: number,
          businessAccountId,
          ...(options.verificationMethod && {
            verificationMethod: options.verificationMethod,
          }),
          ...(options.displayName !== undefined && {
            displayName: options.displayName,
          }),
        },
        true,
        {
          retry: false,
          onStatus: (status) => {
            httpStatus = status;
          },
        },
      );
      startSpinner.stop();
    } catch (err) {
      startSpinner.stop();
      const refusal = explainStartRefusal(err);
      if (refusal) {
        error(refusal.message, refusal.details);
        this.exit(1);
      }
      if (
        reportWhatsappError(err, {
          number,
          roleAction: "Connecting WhatsApp",
          keepApiCode: true,
        })
      ) {
        this.exit(1);
      }
      throw err;
    }

    rememberSignup(response.id, number);

    if (isJsonMode()) {
      json(response);
      return;
    }

    if (httpStatus === 200 && response.status === "verifying") {
      success("This number is already being added", {
        "Signup ID": colors.code(response.id),
        Number: response.phoneNumber,
        "Business account": response.businessAccountId ?? colors.dim("—"),
        "Code sent by": response.verificationMethod ?? colors.dim("—"),
        "Attempts left":
          response.verificationAttemptsRemaining ?? colors.dim("—"),
      });
      console.log();
      console.log(
        `No new code was sent. Enter the one WhatsApp already sent with: ${colors.code(`sendly whatsapp verify ${response.id} --code <code>`)}`,
      );
      console.log(
        colors.dim(
          `${response.verificationMethod === "voice" ? "" : `${colors.code(`sendly whatsapp status ${response.id}`)} shows a texted code once it has arrived. `}Didn't get it, or it no longer works? ${colors.code(`sendly whatsapp resend-code ${response.id}`)} asks for a new one.`,
        ),
      );
      return;
    }

    success("Verification code requested", {
      "Signup ID": colors.code(response.id),
      Number: response.phoneNumber,
      "Business account": response.businessAccountId ?? colors.dim("—"),
      "Code sent by": response.verificationMethod ?? colors.dim("—"),
      "Attempts left": response.verificationAttemptsRemaining ?? colors.dim("—"),
    });
    console.log();
    console.log(
      response.verificationMethod === "voice"
        ? `WhatsApp is calling ${response.phoneNumber} to read out a 6-digit code.`
        : `WhatsApp is texting a 6-digit code to ${response.phoneNumber}. ${colors.code(`sendly whatsapp status ${response.id}`)} shows it once it arrives.`,
    );
    console.log(
      `Enter it with: ${colors.code(`sendly whatsapp verify ${response.id} --code <code>`)}`,
    );
    console.log(
      colors.dim(
        `No code? ${colors.code(`sendly whatsapp resend-code ${response.id} --verification-method voice`)}. An attempt left untouched for about an hour expires and the fee is refunded.`,
      ),
    );
  }

  /**
   * Poll the signup until it goes terminal (active / failed / expired).
   * Mirrors the numbers-buy hosted-action poll: a human is completing a
   * browser step (the Facebook sign-in) while we wait.
   */
  private async pollSignup(
    id: string,
  ): Promise<
    SignupStatusResponse | "timeout" | "timeout_registering" | "gone"
  > {
    const spin = spinner("Waiting for you to finish signing in with Facebook...");
    spin.start();

    let attempts = 0;
    let lastStatus: string | undefined;
    while (attempts < SIGNUP_MAX_ATTEMPTS) {
      await sleep(SIGNUP_POLL_INTERVAL);
      attempts++;

      let status: SignupStatusResponse;
      try {
        status = await apiClient.get<SignupStatusResponse>(
          `/api/v1/whatsapp/signup/${encodeURIComponent(id)}`,
        );
      } catch (err) {
        if (err instanceof NotFoundError) {
          spin.fail("Connection attempt no longer exists");
          return "gone";
        }
        // Transient error — keep polling.
        continue;
      }

      lastStatus = status.status;
      if (status.status === "registering") {
        spin.text =
          "Facebook sign-in complete — activating your number on WhatsApp...";
      }

      if (status.status === "active") {
        spin.succeed("Connected");
        return status;
      }
      if (status.status === "failed") {
        spin.fail("Connection failed");
        return status;
      }
      if (status.status === "expired") {
        spin.fail("Connect link expired");
        return status;
      }
      // initiated / registering — keep polling
    }

    spin.stop();
    return lastStatus === "registering" ? "timeout_registering" : "timeout";
  }
}
