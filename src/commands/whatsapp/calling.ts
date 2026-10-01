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
  reportWhatsappError,
  whatsappSenderPath,
  type WhatsappCallingSettings,
} from "../../lib/whatsapp.js";

export default class WhatsappCalling extends AuthenticatedCommand {
  static description =
    "Switch WhatsApp calling on or off for a connected number. Once it is on, a WhatsApp user calling the number rings like a phone call (your team in the dashboard or an AI agent, per the number's voice settings), billed at the normal inbound rate. Turning it on needs voice on for the number, and Meta only allows it once the account may message at least 2,000 people a day and the number's display name is approved. Needs a live API key with the whatsapp:write scope and, in a team workspace, an owner or admin.";

  static examples = [
    "<%= config.bin %> whatsapp calling +15555550123 --enable",
    "<%= config.bin %> whatsapp calling +15555550123 --disable --json",
  ];

  static args = {
    number: Args.string({
      description: "WhatsApp-connected sender number (E.164 format)",
      required: true,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    enable: Flags.boolean({
      description: "Switch WhatsApp calling on",
      exclusive: ["disable"],
    }),
    disable: Flags.boolean({
      description: "Switch WhatsApp calling off",
      exclusive: ["enable"],
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(WhatsappCalling);

    if (!flags.enable && !flags.disable) {
      error("Nothing to change", { hint: "Pass --enable or --disable" });
      this.exit(1);
    }

    const saveSpinner = spinner("Changing WhatsApp calling...");
    if (!isJsonMode()) {
      saveSpinner.start();
    }

    let response: WhatsappCallingSettings;
    try {
      response = await apiClient.patch<WhatsappCallingSettings>(
        whatsappSenderPath(args.number, "calling"),
        { enabled: Boolean(flags.enable) },
      );
      saveSpinner.stop();
    } catch (err) {
      saveSpinner.stop();
      if (
        reportWhatsappError(err, {
          number: args.number,
          roleAction: "Changing WhatsApp calling",
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

    success(`WhatsApp calling ${response.callingEnabled ? "on" : "off"}`, {
      Number: response.phoneNumber,
      Calling: response.callingEnabled
        ? colors.success("on")
        : colors.dim("off"),
      "Outbound calls": response.outboundCallingAllowed
        ? "allowed"
        : colors.dim("not allowed from this number's country code"),
    });
  }
}
