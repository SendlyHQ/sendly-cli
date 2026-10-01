import { Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../../lib/base-command.js";
import { apiClient } from "../../../lib/api-client.js";
import {
  json,
  table,
  colors,
  header,
  isJsonMode,
} from "../../../lib/output.js";

interface MessageDataPoint {
  date: string;
  sent: number;
  delivered: number;
  failed: number;
}

interface MessagesResponse {
  period: string;
  data: MessageDataPoint[];
  totals?: {
    sent: number;
    delivered: number;
    failed: number;
  };
}

export default class AnalyticsMessages extends AuthenticatedCommand {
  static description = "Get message analytics across all workspaces";

  static examples = [
    "<%= config.bin %> enterprise analytics messages",
    "<%= config.bin %> enterprise analytics messages --period 30d",
    "<%= config.bin %> enterprise analytics messages --period 90d --json",
  ];

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    period: Flags.string({
      char: "p",
      description: "Time period (7d, 30d, 90d)",
      options: ["7d", "30d", "90d"],
      default: "7d",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(AnalyticsMessages);

    const response = await apiClient.get<MessagesResponse>(
      "/api/v1/enterprise/analytics/messages",
      { period: flags.period },
    );

    if (isJsonMode()) {
      json(response);
      return;
    }

    const data = response.data ?? [];
    const totals =
      response.totals ??
      data.reduce(
        (sum, day) => ({
          sent: sum.sent + Number(day.sent || 0),
          delivered: sum.delivered + Number(day.delivered || 0),
          failed: sum.failed + Number(day.failed || 0),
        }),
        { sent: 0, delivered: 0, failed: 0 },
      );

    header(`Message Analytics (${flags.period})`);

    console.log();
    console.log(
      `  ${colors.dim("Totals:")} ${totals.sent.toLocaleString()} sent, ` +
        `${colors.success(totals.delivered.toLocaleString() + " delivered")}, ` +
        `${totals.failed > 0 ? colors.error(totals.failed.toLocaleString() + " failed") : colors.dim("0 failed")}`,
    );
    console.log();

    table(data, [
      { header: "Date", key: "date", width: 12 },
      {
        header: "Sent",
        key: "sent",
        width: 10,
        formatter: (v) => Number(v).toLocaleString(),
      },
      {
        header: "Delivered",
        key: "delivered",
        width: 10,
        formatter: (v) => colors.success(Number(v).toLocaleString()),
      },
      {
        header: "Failed",
        key: "failed",
        width: 10,
        formatter: (v) =>
          Number(v) > 0
            ? colors.error(Number(v).toLocaleString())
            : colors.dim("0"),
      },
    ]);
  }
}
