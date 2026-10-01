import { Args } from "@oclif/core";
import { AuthenticatedCommand } from "../../../lib/base-command.js";
import { apiClient } from "../../../lib/api-client.js";
import { json, colors, spinner, isJsonMode } from "../../../lib/output.js";
import {
  printConversationalComponents,
  reportWhatsappError,
  whatsappSenderPath,
  type WhatsappConversationalComponents,
} from "../../../lib/whatsapp.js";

export default class WhatsappComponentsGet extends AuthenticatedCommand {
  static description =
    "Show the ice breakers (tappable suggestions when someone opens a chat with the business for the first time) and commands (shown when the customer types /) of one of your connected WhatsApp numbers";

  static examples = [
    "<%= config.bin %> whatsapp components get +15555550123",
    "<%= config.bin %> whatsapp components get +15555550123 --json",
  ];

  static args = {
    number: Args.string({
      description: "WhatsApp-connected sender number (E.164 format)",
      required: true,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
  };

  async run(): Promise<void> {
    const { args } = await this.parse(WhatsappComponentsGet);

    const getSpinner = spinner("Fetching ice breakers and commands...");
    if (!isJsonMode()) {
      getSpinner.start();
    }

    let response: WhatsappConversationalComponents;
    try {
      response = await apiClient.get<WhatsappConversationalComponents>(
        whatsappSenderPath(args.number, "conversational_components"),
      );
      getSpinner.stop();
    } catch (err) {
      getSpinner.stop();
      if (
        reportWhatsappError(err, { number: args.number, keepApiCode: true })
      ) {
        this.exit(1);
      }
      throw err;
    }

    if (isJsonMode()) {
      json(response);
      return;
    }

    printConversationalComponents("WhatsApp ice breakers and commands", response);
    console.log();
    console.log(
      colors.dim(
        `Change them with: ${colors.code(`sendly whatsapp components update ${response.phoneNumber} --ice-breaker "..."`)}`,
      ),
    );
  }
}
