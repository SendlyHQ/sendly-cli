import { Args, Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import { success, error, json, colors, isJsonMode } from "../../lib/output.js";
import inquirer from "inquirer";

export default class ContactsDelete extends AuthenticatedCommand {
  static description = "Delete a contact";

  static examples = [
    "<%= config.bin %> contacts delete cnt_xxx",
    "<%= config.bin %> contacts delete cnt_xxx --yes",
  ];

  static args = {
    id: Args.string({
      description: "Contact ID to delete",
      required: true,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    yes: Flags.boolean({
      char: "y",
      description: "Skip confirmation prompt",
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ContactsDelete);

    if (!flags.yes) {
      const { confirm } = await inquirer.prompt([
        {
          type: "confirm",
          name: "confirm",
          message: `Are you sure you want to delete contact ${colors.code(args.id)}?`,
          default: false,
        },
      ]);

      if (!confirm) {
        error("Deletion cancelled");
        return;
      }
    }

    await apiClient.delete(`/api/v1/contacts/${encodeURIComponent(args.id)}`);

    if (isJsonMode()) {
      json({ success: true, deletedId: args.id });
      return;
    }

    success("Contact deleted", {
      ID: args.id,
    });
  }
}
