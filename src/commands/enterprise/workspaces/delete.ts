import { Args, Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../../lib/base-command.js";
import { apiClient } from "../../../lib/api-client.js";
import {
  success,
  error,
  json,
  colors,
  isJsonMode,
  spinner,
} from "../../../lib/output.js";
import inquirer from "inquirer";

export default class WorkspacesDelete extends AuthenticatedCommand {
  static description = "Delete an enterprise workspace";

  static examples = [
    "<%= config.bin %> enterprise workspaces delete org_abc123",
    "<%= config.bin %> enterprise workspaces delete org_abc123 --yes",
    "<%= config.bin %> enterprise workspaces delete org_abc123 --release-numbers",
  ];

  static args = {
    workspaceId: Args.string({
      description: "Workspace ID",
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
    "release-numbers": Flags.boolean({
      description:
        "Release the workspace's phone numbers with it. Without this, a workspace that still has numbers is not deleted",
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(WorkspacesDelete);

    if (!flags.yes && !isJsonMode()) {
      console.log();
      console.log(
        colors.error(
          "  This will permanently delete the workspace and all its data.",
        ),
      );
      if (flags["release-numbers"]) {
        console.log(
          colors.error(
            "  Its phone numbers will be released. Ported numbers are never released this way.",
          ),
        );
      }
      console.log();

      const { confirm } = await inquirer.prompt([
        {
          type: "confirm",
          name: "confirm",
          message: `Delete workspace ${args.workspaceId}?`,
          default: false,
        },
      ]);

      if (!confirm) {
        error("Deletion cancelled");
        return;
      }
    }

    const spin = spinner("Deleting workspace...");
    spin.start();

    const releaseQuery = flags["release-numbers"] ? "?release_numbers=true" : "";
    await apiClient.delete(
      `/api/v1/enterprise/workspaces/${encodeURIComponent(args.workspaceId)}${releaseQuery}`,
    );

    spin.succeed("Workspace deleted");

    if (isJsonMode()) {
      json({ success: true, workspaceId: args.workspaceId });
      return;
    }

    success("Workspace deleted", {
      ID: args.workspaceId,
    });
  }
}
