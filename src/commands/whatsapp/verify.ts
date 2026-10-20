import { Args, Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import {
  success,
  error,
  info,
  json,
  colors,
  spinner,
  isJsonMode,
} from "../../lib/output.js";
import {
  lastSignupId,
  reportWhatsappError,
  whatsappSignupPath,
  type WhatsappSignup,
} from "../../lib/whatsapp.js";

export default class WhatsappVerify extends AuthenticatedCommand {
  static description =
    "Enter the 6-digit code WhatsApp sent to a number you are adding with `whatsapp connect --business-account`. Without --code it submits the code that already arrived on the number, if one has; right after `resend-code`, before any code has been entered, that can still be the earlier code until the new one arrives, so pass --code then. Five wrong codes end the attempt and refund the fee. The request is never retried automatically, because each one uses an attempt. Needs a live API key with the whatsapp:write scope and, in a team workspace, an owner or admin.";

  static examples = [
    "<%= config.bin %> whatsapp verify --code 482913",
    "<%= config.bin %> whatsapp verify 6f1d2c7e-3a4b-4c5d-9e8f-0a1b2c3d4e5f --code 482913",
    "<%= config.bin %> whatsapp verify 6f1d2c7e-3a4b-4c5d-9e8f-0a1b2c3d4e5f",
  ];

  static args = {
    id: Args.string({
      description: "Signup id (from `whatsapp connect`); omit for the latest",
      required: false,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    code: Flags.string({
      char: "c",
      description:
        "The 6-digit code WhatsApp sent. Omit it to use the code that arrived on the number",
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(WhatsappVerify);

    const id = args.id || lastSignupId();
    if (!id) {
      error("No WhatsApp connection found on this machine.", {
        hint: "Pass the signup id that `sendly whatsapp connect --business-account` printed.",
      });
      this.exit(1);
    }

    const verifySpinner = spinner("Checking the code...");

    let code = flags.code;
    if (code === undefined) {
      if (!isJsonMode()) verifySpinner.start();
      let current: WhatsappSignup;
      try {
        current = await apiClient.get<WhatsappSignup>(whatsappSignupPath(id!));
        verifySpinner.stop();
      } catch (err) {
        verifySpinner.stop();
        if (reportWhatsappError(err, { signupId: id, keepApiCode: true })) {
          this.exit(1);
        }
        throw err;
      }
      if (current.status === "active") {
        this.connected(current);
        return;
      }
      if (current.status !== "verifying" || !current.verificationCode) {
        error(
          current.status === "verifying"
            ? "No code has arrived on the number yet."
            : `This connection isn't waiting for a code (status: ${current.status}).`,
          {
            hint:
              current.status === "verifying"
                ? `Pass it with --code once it arrives, check with \`sendly whatsapp status ${id}\`, or request another with \`sendly whatsapp resend-code ${id}\`.`
                : `Check it with \`sendly whatsapp status ${id}\`.`,
          },
        );
        this.exit(1);
      }
      code = current.verificationCode!;
      info(`Using the code that arrived on ${current.phoneNumber}: ${code}`);
    }

    if (!isJsonMode()) verifySpinner.start();
    let response: WhatsappSignup;
    try {
      response = await apiClient.post<WhatsappSignup>(
        whatsappSignupPath(id!, "verify"),
        { code },
        true,
        { retry: false },
      );
      verifySpinner.stop();
    } catch (err) {
      verifySpinner.stop();
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

    this.connected(response);
  }

  private connected(signup: WhatsappSignup): void {
    if (isJsonMode()) {
      json(signup);
      return;
    }

    success("WhatsApp sender connected", {
      Number: signup.phoneNumber,
      "Business account": signup.businessAccountId ?? colors.dim("—"),
    });
    console.log();
    console.log(
      colors.dim(
        `Send with: ${colors.code(`sendly whatsapp send --from ${signup.phoneNumber} --to +14155550100 --text "Hello!"`)}`,
      ),
    );
  }
}
