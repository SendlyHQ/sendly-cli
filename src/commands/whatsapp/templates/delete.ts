import { Args, Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../../lib/base-command.js";
import { apiClient, NotFoundError } from "../../../lib/api-client.js";
import {
  success,
  error,
  json,
  colors,
  spinner,
  isJsonMode,
} from "../../../lib/output.js";
import { confirm } from "@inquirer/prompts";

interface DeleteTemplateResponse {
  id: string;
  deleted: boolean;
}

export default class WhatsappTemplatesDelete extends AuthenticatedCommand {
  static description = "Delete a WhatsApp template";

  static examples = [
    "<%= config.bin %> whatsapp templates delete 3f6a1c9e-0000-0000-0000-000000000000",
    "<%= config.bin %> whatsapp templates delete 3f6a1c9e-0000-0000-0000-000000000000 --force",
  ];

  static args = {
    id: Args.string({
      description: "Template ID",
      required: true,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    force: Flags.boolean({
      char: "f",
      description: "Skip confirmation",
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(WhatsappTemplatesDelete);

    if (!flags.force && !isJsonMode()) {
      const confirmed = await confirm({
        message: `Delete WhatsApp template ${args.id}? Its name stays reserved for up to 30 days.`,
        default: false,
      });

      if (!confirmed) {
        console.log(colors.dim("Cancelled"));
        return;
      }
    }

    const deleteSpinner = spinner("Deleting template...");
    if (!isJsonMode()) {
      deleteSpinner.start();
    }

    try {
      const response = await apiClient.delete<DeleteTemplateResponse>(
        `/api/v1/whatsapp/templates/${encodeURIComponent(args.id)}`,
      );

      deleteSpinner.stop();

      if (isJsonMode()) {
        json(response);
        return;
      }

      success("Template deleted", {
        ID: colors.code(response.id),
      });
      console.log();
      console.log(
        colors.dim(
          "WhatsApp reserves a deleted template's name for up to 30 days — edit an existing template rather than re-creating one under the same name.",
        ),
      );
    } catch (err: any) {
      deleteSpinner.stop();

      if (err instanceof NotFoundError) {
        error("Template not found", {
          hint: "Run `sendly whatsapp templates list` to see template ids",
        });
      } else {
        throw err;
      }
      this.exit(1);
    }
  }
}
