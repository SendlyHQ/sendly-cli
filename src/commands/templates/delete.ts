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
import { confirm } from "@inquirer/prompts";

export default class TemplatesDelete extends AuthenticatedCommand {
  static description = "Delete a template";

  static examples = [
    "<%= config.bin %> templates delete tpl_xxx",
    "<%= config.bin %> templates delete tpl_xxx --force",
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
    const { args, flags } = await this.parse(TemplatesDelete);

    if (!flags.force && !isJsonMode()) {
      const confirmed = await confirm({
        message: `Delete template ${args.id}?`,
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
      await apiClient.delete(`/api/v1/templates/${encodeURIComponent(args.id)}`);

      deleteSpinner.stop();

      if (isJsonMode()) {
        json({ success: true, id: args.id });
        return;
      }

      success("Template deleted", {
        ID: colors.code(args.id),
      });
    } catch (err: any) {
      deleteSpinner.stop();

      if (err.message?.includes("preset")) {
        error("Cannot delete preset templates");
      } else if (err.message?.includes("not_found")) {
        error("Template not found");
      } else {
        throw err;
      }
      this.exit(1);
    }
  }
}
