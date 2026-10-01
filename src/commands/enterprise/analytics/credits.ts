import { Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../../lib/base-command.js";
import { apiClient } from "../../../lib/api-client.js";
import {
  json,
  keyValue,
  colors,
  header,
  isJsonMode,
  formatCredits,
} from "../../../lib/output.js";

interface CreditsAnalyticsResponse {
  period: string;
  totalBalance: number;
  totalLifetime: number;
  totalUsed: number;
  workspaceCount: number;
}

export default class AnalyticsCredits extends AuthenticatedCommand {
  static description =
    "Get all-time credit totals across your workspaces: used, lifetime and remaining";

  static examples = [
    "<%= config.bin %> enterprise analytics credits",
    "<%= config.bin %> enterprise analytics credits --period 30d",
    "<%= config.bin %> enterprise analytics credits --json",
  ];

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    period: Flags.string({
      char: "p",
      description:
        "Time period (7d, 30d, 90d). The API reports all-time totals whatever the period",
      options: ["7d", "30d", "90d"],
      default: "7d",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(AnalyticsCredits);

    const response = await apiClient.get<CreditsAnalyticsResponse>(
      "/api/v1/enterprise/analytics/credits",
      { period: flags.period },
    );

    if (isJsonMode()) {
      json(response);
      return;
    }

    header("Credit Usage (all time)");

    keyValue({
      Used: formatCredits(response.totalUsed),
      Lifetime: formatCredits(response.totalLifetime),
      Balance: colors.primary(formatCredits(response.totalBalance)),
      Workspaces: String(response.workspaceCount ?? 0),
    });
  }
}
