import { Args } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient, NotFoundError } from "../../lib/api-client.js";
import {
  success,
  error,
  json,
  colors,
  spinner,
  isJsonMode,
} from "../../lib/output.js";
import { lastSignupId, type WhatsappSignup } from "../../lib/whatsapp.js";

export default class WhatsappStatus extends AuthenticatedCommand {
  static description =
    "Show the status of a WhatsApp connection (defaults to your most recent one)";

  static examples = [
    "<%= config.bin %> whatsapp status",
    "<%= config.bin %> whatsapp status 3f6a1c9e-0000-0000-0000-000000000000",
    "<%= config.bin %> whatsapp status --json",
  ];

  static args = {
    id: Args.string({
      description: "Signup id (from `whatsapp connect`); omit for the latest",
      required: false,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
  };

  async run(): Promise<void> {
    const { args } = await this.parse(WhatsappStatus);

    const id = args.id || lastSignupId();
    if (!id) {
      error("No WhatsApp connection found on this machine.", {
        hint: "Run `sendly whatsapp connect --number <phone>` first, or pass a signup id.",
      });
      this.exit(1);
    }

    const statusSpinner = spinner("Fetching WhatsApp status...");
    if (!isJsonMode()) {
      statusSpinner.start();
    }

    let response: WhatsappSignup;
    try {
      response = await apiClient.get<WhatsappSignup>(
        `/api/v1/whatsapp/signup/${encodeURIComponent(id!)}`,
      );
      statusSpinner.stop();
    } catch (err: any) {
      statusSpinner.stop();
      if (err instanceof NotFoundError) {
        error("WhatsApp connection not found.", {
          hint: "Check the signup id, or start one with `sendly whatsapp connect`.",
        });
        this.exit(1);
      }
      throw err;
    }

    if (isJsonMode()) {
      json(response);
      return;
    }

    const statusColor =
      response.status === "active"
        ? colors.success
        : response.status === "failed" || response.status === "expired"
          ? colors.error
          : colors.warning;

    success("WhatsApp connection status", {
      "Signup ID": colors.code(response.id),
      Number: response.phoneNumber,
      Status: statusColor(response.status),
      "Business account": response.businessAccountId ?? colors.dim("—"),
      ...(response.status === "verifying" && {
        "Code sent by": response.verificationMethod ?? colors.dim("—"),
        "Attempts left":
          response.verificationAttemptsRemaining ?? colors.dim("—"),
        Code: response.verificationCode
          ? colors.bold(response.verificationCode)
          : colors.dim("not arrived yet"),
      }),
      ...(response.failureReasons?.length && {
        Reasons: response.failureReasons.join("; "),
      }),
      Updated: new Date(response.updatedAt).toLocaleString(),
    });

    if (response.status === "verifying") {
      console.log();
      if (response.verificationCode) {
        console.log(
          `Enter it with: ${colors.code(`sendly whatsapp verify ${response.id}`)} ${colors.dim(`(or --code ${response.verificationCode})`)}`,
        );
      } else {
        console.log(
          colors.dim(
            `The code hasn't arrived on the number yet. A code sent by voice call is never shown here: enter it with ${colors.code(`sendly whatsapp verify ${response.id} --code <code>`)}. To get another, run ${colors.code(`sendly whatsapp resend-code ${response.id}`)} (add --verification-method voice for a call).`,
          ),
        );
      }
    } else if (response.status === "registering") {
      console.log();
      console.log(
        colors.dim(
          "The Facebook sign-in is done and WhatsApp is activating the number. Activation usually takes a few minutes but can take hours. If it hasn't finished about 6 hours after the session began, the session fails with registration_timeout and the fee is refunded. Run this command again to check.",
        ),
      );
    } else if (response.status === "initiated") {
      console.log();
      console.log(
        colors.dim(
          "Still connecting. If you closed the browser, re-run `sendly whatsapp connect` to get the link again — someone needs to open it and sign in with Facebook to finish.",
        ),
      );
    } else if (response.status === "active") {
      console.log();
      console.log(
        colors.dim(
          `Send with: ${colors.code(`sendly whatsapp send --from ${response.phoneNumber} --to +15551230000 --text "Hello!"`)}`,
        ),
      );
    }
  }
}
