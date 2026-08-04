import fs from "node:fs";
import path from "node:path";
import { Flags } from "@oclif/core";
import open from "open";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient, NotFoundError } from "../../lib/api-client.js";
import { getConfigDir } from "../../lib/config.js";
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

/**
 * Remember the most recent signup so `sendly whatsapp status` works with no
 * argument. Best effort — the id is also printed, so losing this is harmless.
 */
function rememberSignup(id: string, phoneNumber: string): void {
  try {
    fs.writeFileSync(
      path.join(getConfigDir(), "whatsapp-signup.json"),
      JSON.stringify({ id, phoneNumber, createdAt: new Date().toISOString() }),
      { mode: 0o600 },
    );
  } catch {
    // non-fatal
  }
}

export default class WhatsappConnect extends AuthenticatedCommand {
  static description =
    "Connect one of your numbers to WhatsApp. Prints a secure link a person must open and sign in with Facebook to finish; the command then waits until the sender is active. One-time $19 connection fee — no monthly fee.";

  static examples = [
    "<%= config.bin %> whatsapp connect --number +15551234567",
    "<%= config.bin %> whatsapp connect --number +15551234567 --json",
  ];

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    number: Flags.string({
      char: "n",
      description: "Number on your workspace to connect (E.164 format)",
      required: true,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(WhatsappConnect);

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
        error("WhatsApp isn't available on your workspace yet.", {
          hint: "WhatsApp is rolling out gradually — contact support@sendly.live for early access.",
        });
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
      hint: "Re-run `sendly whatsapp connect` to try again.",
    });
    this.exit(1);
  }

  /**
   * Poll the signup until it goes terminal (active / failed / expired).
   * Mirrors the numbers-buy hosted-action poll: a human is completing a
   * browser step (the Facebook sign-in) while we wait.
   */
  private async pollSignup(
    id: string,
  ): Promise<SignupStatusResponse | "timeout" | "gone"> {
    const spin = spinner("Waiting for you to finish signing in with Facebook...");
    spin.start();

    let attempts = 0;
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
    return "timeout";
  }
}
