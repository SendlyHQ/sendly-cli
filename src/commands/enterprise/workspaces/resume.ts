import { Args } from "@oclif/core";
import { AuthenticatedCommand } from "../../../lib/base-command.js";
import { apiClient } from "../../../lib/api-client.js";
import { success, json, isJsonMode, spinner } from "../../../lib/output.js";

interface ResumeResponse {
  success: boolean;
  workspaceId: string;
  status: string;
}

export default class WorkspacesResume extends AuthenticatedCommand {
  static description = "Resume a suspended enterprise workspace";

  static examples = [
    "<%= config.bin %> enterprise workspaces resume org_abc123",
  ];

  static args = {
    workspaceId: Args.string({
      description: "Workspace ID",
      required: true,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
  };

  async run(): Promise<void> {
    const { args } = await this.parse(WorkspacesResume);

    const spin = spinner("Resuming workspace...");
    spin.start();

    const response = await apiClient.post<ResumeResponse>(
      `/api/v1/enterprise/workspaces/${encodeURIComponent(args.workspaceId)}/resume`,
    );

    spin.succeed("Workspace resumed");

    if (isJsonMode()) {
      json(response);
      return;
    }

    success("Workspace resumed", {
      ID: args.workspaceId,
      Status: "active",
    });
  }
}
