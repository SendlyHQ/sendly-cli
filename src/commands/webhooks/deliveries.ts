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
  event_type: string;
  attempt_number: number;
  max_attempts?: number;
  status: "pending" | "delivered" | "failed" | "cancelled";
  response_status_code?: number;
  response_time?: number;
  error_message?: string;
  error_code?: string;
  next_retry_at?: string;
  created_at: string;
  delivered_at?: string;
}

interface DeliveriesResponse {
  deliveries: WebhookDelivery[];
  pagination: {
    limit: number;
    offset: number;
  };
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

    const response = await apiClient.get<DeliveriesResponse>(
      `/api/v1/webhooks/${encodeURIComponent(args.id)}/deliveries?${params.toString()}`,
    );

    const deliveries = response.deliveries || [];

    if (isJsonMode()) {
      json(response);
      return;
    }

    if (deliveries.length === 0) {
      info(
        flags["failed-only"]
          ? "No failed deliveries found"
          : "No deliveries found",
      );
      return;
    }

    console.log();
    console.log(
      colors.dim(
        `Showing ${deliveries.length} deliveries for webhook ${args.id}`,
      ),
    );
    console.log();

    // Add computed fields for better display
    const deliveriesWithComputed = deliveries.map((d) => ({
      ...d,
      attemptDisplay: `${d.attempt_number}/${d.max_attempts || 3}`,
    }));

    table(deliveriesWithComputed, [
      {
        header: "Delivery ID",
        key: "id",
        width: 18,
        formatter: (v) => colors.dim(String(v).slice(0, 15) + "..."),
      },
      {
        header: "Event",
        key: "event_type",
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
        key: "attemptDisplay",
        width: 10,
      },
      {
        header: "Status Code",
        key: "response_status_code",
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
        key: "response_time",
        width: 14,
        formatter: (v) => (v ? `${v}ms` : colors.dim("-")),
      },
      {
        header: "Created",
        key: "created_at",
        width: 16,
        formatter: (v) => formatDate(String(v)),
      },
    ]);

    // Show failed delivery details
    const failed = deliveries.filter(
      (d) => d.status === "failed" && d.error_message,
    );
    if (failed.length > 0 && !flags["failed-only"]) {
      console.log();
      console.log(colors.error("Failed deliveries:"));
      failed.forEach((delivery) => {
        console.log(
          colors.dim(`  ${delivery.id.slice(0, 15)}...:`),
          delivery.error_message || "Unknown error",
        );
      });
    }

    // Show pending retries
    const pending = deliveries.filter(
      (d) => d.status === "pending" && d.next_retry_at,
    );
    if (pending.length > 0) {
      console.log();
      console.log(colors.warning("Pending retries:"));
      pending.forEach((delivery) => {
        console.log(
          colors.dim(`  ${delivery.id.slice(0, 15)}...:`),
          `Next retry at ${formatDate(delivery.next_retry_at!)}`,
        );
      });
    }
  }
}
