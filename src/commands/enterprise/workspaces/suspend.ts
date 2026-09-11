import { Args, Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../../lib/base-command.js";
import { apiClient } from "../../../lib/api-client.js";
import { success, error, json, isJsonMode, spinner } from "../../../lib/output.js";
import inquirer from "inquirer";

interface SuspendResponse {
  success: boolean;
  workspaceId: string;
  status: string;
}

export default class WorkspacesSuspend extends AuthenticatedCommand {
  static description = "Suspend an enterprise workspace";

  static examples = [
    "<%= config.bin %> enterprise workspaces suspend org_abc123",
    '<%= config.bin %> enterprise workspaces suspend org_abc123 --reason "Policy violation"',
  ];

  static args = {
    workspaceId: Args.string({
      description: "Workspace ID",
      required: true,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    reason: Flags.string({
      char: "r",
      description: "Reason for suspension",
    }),
    yes: Flags.boolean({
      char: "y",
      description: "Skip confirmation prompt",
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(WorkspacesSuspend);

    if (!flags.yes && !isJsonMode()) {
      const { confirm } = await inquirer.prompt([
        {
          type: "confirm",
          name: "confirm",
          message: `Suspend workspace ${args.workspaceId}? This will halt all messaging.`,
          default: false,
        },
      ]);

      if (!confirm) {
        error("Suspension cancelled");
        return;
      }
    }

    const spin = spinner("Suspending workspace...");
    spin.start();

    const response = await apiClient.post<SuspendResponse>(
      `/api/v1/enterprise/workspaces/${encodeURIComponent(args.workspaceId)}/suspend`,
      flags.reason ? { reason: flags.reason } : undefined,
    );

    spin.succeed("Workspace suspended");

    if (isJsonMode()) {
      json(response);
      return;
    }

    success("Workspace suspended", {
      ID: args.workspaceId,
      Status: "suspended",
    });
  }
}
