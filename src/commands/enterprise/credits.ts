import { Args } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import {
  json,
  keyValue,
  colors,
  header,
  isJsonMode,
  formatCredits,
} from "../../lib/output.js";

interface WorkspaceCredits {
  balance: number;
  lifetimeCredits: number;
}

export default class EnterpriseCredits extends AuthenticatedCommand {
  static description = "Check credit balance for an enterprise workspace";

  static examples = [
    "<%= config.bin %> enterprise credits org_abc123",
    "<%= config.bin %> enterprise credits org_abc123 --json",
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
    const { args } = await this.parse(EnterpriseCredits);

    const credits = await apiClient.get<WorkspaceCredits>(
      `/api/v1/enterprise/workspaces/${encodeURIComponent(args.workspaceId)}/credits`,
    );

    if (isJsonMode()) {
      json(credits);
      return;
    }

    header("Workspace Credits");

    keyValue({
      Balance: colors.primary(formatCredits(credits.balance)),
      Lifetime: formatCredits(credits.lifetimeCredits),
    });
  }
}
