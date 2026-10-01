import { Args, Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../../lib/base-command.js";
import { apiClient } from "../../../lib/api-client.js";
import { error, json, spinner, isJsonMode } from "../../../lib/output.js";
import {
  parseCommandFlags,
  printConversationalComponents,
  reportWhatsappError,
  whatsappSenderPath,
  type WhatsappConversationalComponents,
} from "../../../lib/whatsapp.js";

export default class WhatsappComponentsUpdate extends AuthenticatedCommand {
  static description =
    "Set the ice breakers and commands of one of your connected WhatsApp numbers. Each list you pass replaces the stored one; a list you leave out stays as it is. Up to 4 ice breakers of at most 80 characters, and up to 30 commands (letters, digits or underscores, at most 32 characters, with a description of at most 256). Needs a live API key with the whatsapp:write scope and, in a team workspace, an owner or admin.";

  static examples = [
    '<%= config.bin %> whatsapp components update +15555550123 --ice-breaker "Book a repair" --ice-breaker "Get a quote"',
    '<%= config.bin %> whatsapp components update +15555550123 --command "quote=Get a price for a job" --command "status=Check your booking"',
    "<%= config.bin %> whatsapp components update +15555550123 --clear-ice-breakers --clear-commands",
  ];

  static args = {
    number: Args.string({
      description: "WhatsApp-connected sender number (E.164 format)",
      required: true,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    "ice-breaker": Flags.string({
      description:
        "Ice breaker text. Repeatable; the ones you pass replace the stored list",
      multiple: true,
      exclusive: ["clear-ice-breakers"],
    }),
    "clear-ice-breakers": Flags.boolean({
      description: "Remove every ice breaker",
      exclusive: ["ice-breaker"],
    }),
    command: Flags.string({
      description:
        'Command as name=description (e.g. "quote=Get a price for a job"; a leading / is dropped). Repeatable; the ones you pass replace the stored list',
      multiple: true,
      exclusive: ["clear-commands"],
    }),
    "clear-commands": Flags.boolean({
      description: "Remove every command",
      exclusive: ["command"],
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(WhatsappComponentsUpdate);

    const commands = flags["clear-commands"]
      ? []
      : parseCommandFlags(flags.command);
    if (typeof commands === "string") {
      error(commands);
      this.exit(1);
    }

    const iceBreakers = flags["clear-ice-breakers"]
      ? []
      : flags["ice-breaker"];

    if (iceBreakers === undefined && commands === undefined) {
      error("Nothing to update", {
        hint: "Pass --ice-breaker, --command, --clear-ice-breakers or --clear-commands",
      });
      this.exit(1);
    }

    const updateSpinner = spinner("Saving ice breakers and commands...");
    if (!isJsonMode()) {
      updateSpinner.start();
    }

    let response: WhatsappConversationalComponents;
    try {
      response = await apiClient.patch<WhatsappConversationalComponents>(
        whatsappSenderPath(args.number, "conversational_components"),
        {
          ...(iceBreakers !== undefined && { iceBreakers }),
          ...(commands !== undefined && { commands }),
        },
      );
      updateSpinner.stop();
    } catch (err) {
      updateSpinner.stop();
      if (
        reportWhatsappError(err, {
          number: args.number,
          roleAction: "Changing sender settings",
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

    printConversationalComponents("WhatsApp ice breakers and commands saved", response);
  }
}
