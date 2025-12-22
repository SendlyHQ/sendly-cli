import { Args, Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import {
  table,
  json,
  info,
  colors,
  formatDate,
  isJsonMode,
} from "../../lib/output.js";

interface WebhookDelivery {
  id: string;
  eventType: string;
  attemptNumber: number;
  maxAttempts: number;
  status: "pending" | "delivered" | "failed" | "cancelled";
  responseStatusCode?: number;
  responseTime?: number;
  errorMessage?: string;
  errorCode?: string;
  nextRetryAt?: string;
  createdAt: string;
  deliveredAt?: string;
}

export default class WebhooksDeliveries extends AuthenticatedCommand {
  static description = "View webhook delivery history";

  static examples = [
    "<%= config.bin %> webhooks deliveries whk_abc123",
    "<%= config.bin %> webhooks deliveries whk_abc123 --limit 20",
    "<%= config.bin %> webhooks deliveries whk_abc123 --failed-only",
    "<%= config.bin %> webhooks deliveries whk_abc123 --json",
  ];

  static args = {
    id: Args.string({
      description: "Webhook ID",
      required: true,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    limit: Flags.integer({
      char: "l",
      description: "Number of deliveries to show",
      default: 10,
    }),
    "failed-only": Flags.boolean({
      description: "Show only failed deliveries",
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(WebhooksDeliveries);

    const params = new URLSearchParams({
      limit: String(flags.limit),
      ...(flags["failed-only"] && { status: "failed" }),
    });

    const deliveries = await apiClient.get<WebhookDelivery[]>(
      `/api/v1/webhooks/${args.id}/deliveries?${params.toString()}`
    );

    if (isJsonMode()) {
      json(deliveries);
      return;
    }

    if (deliveries.length === 0) {
      info(flags["failed-only"] ? "No failed deliveries found" : "No deliveries found");
      return;
    }

    console.log();
    console.log(colors.dim(`Showing ${deliveries.length} deliveries for webhook ${args.id}`));
    console.log();

    table(deliveries, [
      {
        header: "Delivery ID",
        key: "id",
        width: 18,
        formatter: (v) => colors.dim(String(v).slice(0, 15) + "..."),
      },
      {
        header: "Event",
        key: "eventType",
        width: 15,
        formatter: (v) => String(v).replace("message.", ""),
      },
      {
        header: "Status",
        key: "status",
        width: 12,
        formatter: (v) => {
          switch (v) {
            case "delivered":
              return colors.success("delivered");
            case "failed":
              return colors.error("failed");
            case "pending":
              return colors.warning("pending");
            case "cancelled":
              return colors.dim("cancelled");
            default:
              return String(v);
          }
        },
      },
      {
        header: "Attempt",
        key: "attemptNumber",
        width: 10,
        formatter: (v, item) => `${v}/${item.maxAttempts}`,
      },
      {
        header: "Status Code",
        key: "responseStatusCode",
        width: 12,
        formatter: (v) => {
          if (!v) return colors.dim("-");
          const code = Number(v);
          return code >= 200 && code < 300 
            ? colors.success(String(code))
            : colors.error(String(code));
        },
      },
      {
        header: "Response Time",
        key: "responseTime",
        width: 14,
        formatter: (v) => v ? `${v}ms` : colors.dim("-"),
      },
      {
        header: "Created",
        key: "createdAt",
        width: 16,
        formatter: (v) => formatDate(String(v), { short: true }),
      },
    ]);

    // Show failed delivery details
    const failed = deliveries.filter(d => d.status === "failed" && d.errorMessage);
    if (failed.length > 0 && !flags["failed-only"]) {
      console.log();
      console.log(colors.error("Failed deliveries:"));
      failed.forEach(delivery => {
        console.log(colors.dim(`  ${delivery.id.slice(0, 15)}...:`), delivery.errorMessage);
      });
    }

    // Show pending retries
    const pending = deliveries.filter(d => d.status === "pending" && d.nextRetryAt);
    if (pending.length > 0) {
      console.log();
      console.log(colors.warning("Pending retries:"));
      pending.forEach(delivery => {
        console.log(colors.dim(`  ${delivery.id.slice(0, 15)}...:`), `Next retry at ${formatDate(delivery.nextRetryAt!)}`);
      });
    }
  }
}