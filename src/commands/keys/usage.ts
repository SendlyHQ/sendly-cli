import { Args } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import {
  table,
  json,
  info,
  colors,
  isJsonMode,
  formatRelativeTime,
} from "../../lib/output.js";

interface RecentRequest {
  endpoint: string;
  method: string;
  statusCode: number;
  creditsUsed: number;
  createdAt: string;
}

interface EndpointBreakdown {
  endpoint: string;
  count: number;
}

interface UsageResponse {
  keyId: string;
  keyName: string;
  summary: {
    totalRequests: number;
    totalCredits: number;
    lastUsed: string | null;
  };
  recentRequests: RecentRequest[];
  endpointBreakdown: EndpointBreakdown[];
}

export default class KeysUsage extends AuthenticatedCommand {
  static description = "Get usage statistics for an API key";

  static examples = [
    "<%= config.bin %> keys usage KEY_ID",
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
  };

  async run(): Promise<void> {
    const { args } = await this.parse(KeysUsage);

    const response = await apiClient.get<UsageResponse>(
      `/api/v1/account/keys/${args.id}/usage`,
    );

    if (isJsonMode()) {
      json(response);
      return;
    }

    console.log();
    console.log(colors.bold(`Usage for "${response.keyName}"`));
    console.log();

    console.log(`  ${colors.dim("Total Requests:")}  ${colors.info(String(response.summary.totalRequests))}`);
    console.log(`  ${colors.dim("Total Credits:")}   ${colors.warning(String(response.summary.totalCredits))}`);
    console.log(`  ${colors.dim("Last Used:")}       ${response.summary.lastUsed ? formatRelativeTime(response.summary.lastUsed) : colors.dim("never")}`);

    if (response.endpointBreakdown.length > 0) {
      console.log();
      console.log(colors.bold("Endpoint Breakdown"));
      console.log();

      table(response.endpointBreakdown.slice(0, 10), [
        {
          header: "Endpoint",
          key: "endpoint",
          width: 40,
        },
        {
          header: "Requests",
          key: "count",
          width: 10,
          formatter: (v) => colors.info(String(v)),
        },
      ]);
    }

    if (response.recentRequests.length > 0) {
      console.log();
      console.log(colors.bold("Recent Requests"));
      console.log();

      table(response.recentRequests.slice(0, 10), [
        {
          header: "Endpoint",
          key: "endpoint",
          width: 25,
          formatter: (v) => {
            const s = String(v);
            return s.length > 22 ? s.slice(0, 22) + "..." : s;
          },
        },
        {
          header: "Method",
          key: "method",
          width: 8,
        },
        {
          header: "Status",
          key: "statusCode",
          width: 8,
          formatter: (v) => {
            const code = Number(v);
            if (code >= 200 && code < 300) return colors.success(String(code));
            if (code >= 400) return colors.error(String(code));
            return String(code);
          },
        },
        {
          header: "Credits",
          key: "creditsUsed",
          width: 8,
          formatter: (v) => (v ? colors.warning(String(v)) : colors.dim("0")),
        },
        {
          header: "Time",
          key: "createdAt",
          width: 12,
          formatter: (v) => formatRelativeTime(String(v)),
        },
      ]);
    }

    if (response.summary.totalRequests === 0) {
      info("No usage recorded yet for this key");
    }
  }
}
