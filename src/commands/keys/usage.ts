import { Args, Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import {
  table,
  json,
  info,
  colors,
  isJsonMode,
} from "../../lib/output.js";

interface UsageEntry {
  date: string;
  requests: number;
  messagesSent: number;
  creditsUsed: number;
}

interface UsageResponse {
  keyId: string;
  keyName: string;
  usage: UsageEntry[];
}

export default class KeysUsage extends AuthenticatedCommand {
  static description = "Get usage statistics for an API key";

  static examples = [
    "<%= config.bin %> keys usage KEY_ID",
    "<%= config.bin %> keys usage KEY_ID --days 7",
    "<%= config.bin %> keys usage KEY_ID --json",
  ];

  static args = {
    id: Args.string({
      description: "API key ID",
      required: true,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    days: Flags.integer({
      char: "d",
      description: "Number of days to show (default: 30)",
      default: 30,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(KeysUsage);

    const response = await apiClient.get<UsageResponse>(
      `/api/v1/account/keys/${args.id}/usage`,
    );

    if (isJsonMode()) {
      json(response);
      return;
    }

    const usage = response.usage.slice(0, flags.days);

    if (usage.length === 0) {
      info(`No usage data found for key "${response.keyName}"`);
      return;
    }

    const totalRequests = usage.reduce((sum, u) => sum + u.requests, 0);
    const totalMessages = usage.reduce((sum, u) => sum + u.messagesSent, 0);
    const totalCredits = usage.reduce((sum, u) => sum + u.creditsUsed, 0);

    console.log();
    console.log(
      colors.bold(`Usage for "${response.keyName}" (last ${usage.length} days)`),
    );
    console.log();

    table(usage, [
      {
        header: "Date",
        key: "date",
        width: 12,
        formatter: (v) => String(v).slice(0, 10),
      },
      {
        header: "Requests",
        key: "requests",
        width: 10,
        formatter: (v) => colors.info(String(v)),
      },
      {
        header: "Messages",
        key: "messagesSent",
        width: 10,
        formatter: (v) => colors.success(String(v)),
      },
      {
        header: "Credits",
        key: "creditsUsed",
        width: 10,
        formatter: (v) => colors.warning(String(v)),
      },
    ]);

    console.log();
    console.log(colors.dim("─".repeat(44)));
    console.log(
      `  ${colors.bold("Total:")}  ${colors.info(String(totalRequests))} requests, ${colors.success(String(totalMessages))} messages, ${colors.warning(String(totalCredits))} credits`,
    );
  }
}
