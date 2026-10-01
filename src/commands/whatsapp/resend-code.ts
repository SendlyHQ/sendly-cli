import { Args, Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import {
  success,
  error,
  json,
  colors,
  spinner,
  isJsonMode,
} from "../../lib/output.js";
import {
  VERIFICATION_METHODS,
  lastSignupId,
  reportWhatsappError,
  whatsappSignupPath,
  type WhatsappSignup,
} from "../../lib/whatsapp.js";

export default class WhatsappResendCode extends AuthenticatedCommand {
  static description =
    "Ask WhatsApp for a new verification code for a number you are adding with `whatsapp connect --business-account`, by text (the default) or voice call. Allowed 30 seconds after the last code request or submission. Needs a live API key with the whatsapp:write scope and, in a team workspace, an owner or admin.";

  static examples = [
    "<%= config.bin %> whatsapp resend-code",
    "<%= config.bin %> whatsapp resend-code 6f1d2c7e-3a4b-4c5d-9e8f-0a1b2c3d4e5f --verification-method voice",
  ];

  static args = {
    id: Args.string({
      description: "Signup id (from `whatsapp connect`); omit for the latest",
      required: false,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    "verification-method": Flags.string({
      description:
        "How WhatsApp sends the code: sms or voice. Defaults to sms, whatever the last code used",
      options: [...VERIFICATION_METHODS],
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(WhatsappResendCode);

    const id = args.id || lastSignupId();
    if (!id) {
      error("No WhatsApp connection found on this machine.", {
        hint: "Pass the signup id that `sendly whatsapp connect --business-account` printed.",
      });
      this.exit(1);
    }

    const resendSpinner = spinner("Requesting a new code...");
    if (!isJsonMode()) {
      resendSpinner.start();
    }

    let response: WhatsappSignup;
    try {
      response = await apiClient.post<WhatsappSignup>(
        whatsappSignupPath(id!, "resend"),
        {
          ...(flags["verification-method"] && {
            verificationMethod: flags["verification-method"],
          }),
        },
      );
      resendSpinner.stop();
    } catch (err) {
      resendSpinner.stop();
      if (
        reportWhatsappError(err, {
          signupId: id,
          roleAction: "Connecting WhatsApp",
          keepApiCode: true,
        })
      ) {
        this.exit(1);
      }
      throw err;
    }

    if (isJsonMode()) {
      json(response);
      return;
    }

    if (response.status === "active") {
      success("This number is already connected", {
        Number: response.phoneNumber,
        "Business account": response.businessAccountId ?? colors.dim("—"),
      });
      return;
    }

    success("New code requested", {
      "Signup ID": colors.code(response.id),
      Number: response.phoneNumber,
      "Code sent by": response.verificationMethod ?? colors.dim("—"),
      "Attempts left": response.verificationAttemptsRemaining ?? colors.dim("—"),
    });
    console.log();
    console.log(
      colors.dim(
        `Enter it with: ${colors.code(`sendly whatsapp verify ${response.id} --code <code>`)}`,
      ),
    );
    console.log(
      colors.dim(
        `If no code has been entered yet, ${colors.code(`sendly whatsapp status ${response.id}`)} and \`verify\` without --code can still show the earlier code until the new one arrives: wait until the code shown changes, or pass it with --code.`,
      ),
    );
  }
}
