import { AuthenticatedCommand } from "../../../lib/base-command.js";
import { apiClient } from "../../../lib/api-client.js";
import {
  json,
  table,
  colors,
  header,
  isJsonMode,
} from "../../../lib/output.js";

interface WorkspaceDelivery {
  workspaceId: string;
  workspaceName: string;
  totalMessages?: number;
  sent?: number;
  delivered: number;
  failed?: number;
  deliveryRate: number;
}

type DeliveryResponse = WorkspaceDelivery[] | { workspaces?: WorkspaceDelivery[] };

export default class AnalyticsDelivery extends AuthenticatedCommand {
  static description = "Get delivery rate analytics by workspace";

  static examples = [
    "<%= config.bin %> enterprise analytics delivery",
    "<%= config.bin %> enterprise analytics delivery --json",
  ];

  static flags = {
    ...AuthenticatedCommand.baseFlags,
  };

  async run(): Promise<void> {
    const response = await apiClient.get<DeliveryResponse>(
      "/api/v1/enterprise/analytics/delivery",
    );

    if (isJsonMode()) {
      json(response);
      return;
    }

    const rows = Array.isArray(response)
      ? response
      : (response.workspaces ?? []);

    header("Delivery Rates by Workspace");

    console.log();
    table(rows, [
      { header: "Workspace", key: "workspaceName", width: 24 },
      {
        header: "Sent",
        key: "sent",
        width: 10,
        formatter: (v, row) =>
          Number(v ?? row?.totalMessages ?? 0).toLocaleString(),
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
          v == null
            ? colors.dim("-")
            : Number(v) > 0
              ? colors.error(Number(v).toLocaleString())
              : colors.dim("0"),
      },
      {
        header: "Rate",
        key: "deliveryRate",
        width: 8,
        formatter: (v) => {
          const rate = Number(v);
          const text = `${rate.toFixed(1)}%`;
          return rate >= 95
            ? colors.success(text)
            : rate >= 80
              ? colors.warning(text)
              : colors.error(text);
        },
      },
    ]);
  }
}
