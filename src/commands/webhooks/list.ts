import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import {
  table,
  json,
  info,
  formatStatus,
  colors,
  isJsonMode,
} from "../../lib/output.js";

interface Webhook {
  id: string;
  url: string;
  description?: string;
  events: string[];
  isActive: boolean;
  failureCount: number;
  circuitState: "closed" | "open" | "half_open";
  createdAt: string;
}

export default class WebhooksList extends AuthenticatedCommand {
  static description = "List configured webhooks";

  static examples = [
    "<%= config.bin %> webhooks list",
    "<%= config.bin %> webhooks list --json",
  ];

  static flags = {
    ...AuthenticatedCommand.baseFlags,
  };

  async run(): Promise<void> {
    const webhooks = await apiClient.get<Webhook[]>("/api/v1/webhooks");

    if (isJsonMode()) {
      json(webhooks);
      return;
    }

    if (webhooks.length === 0) {
      info("No webhooks configured");
      console.log();
      console.log(`  Create one with ${colors.code("sendly webhooks create")}`);
      console.log(
        `  Or test locally with ${colors.code("sendly webhooks listen")}`,
      );
      return;
    }

    console.log();

    table(webhooks, [
      {
        header: "ID",
        key: "id",
        width: 18,
        formatter: (v) => colors.dim(String(v).slice(0, 15) + "..."),
      },
      {
        header: "URL",
        key: "url",
        width: 35,
        formatter: (v) => {
          const url = String(v);
          return url.length > 32 ? url.slice(0, 32) + "..." : url;
        },
      },
      {
        header: "Events",
        key: "events",
        width: 15,
        formatter: (v) => {
          const events = v as string[];
          return events.length > 2
            ? `${events.length} events`
            : events.join(", ").replace(/message\./g, "");
        },
      },
      {
        header: "Status",
        key: "isActive",
        width: 10,
        formatter: (v) =>
          v ? colors.success("active") : colors.error("disabled"),
      },
      {
        header: "Circuit",
        key: "circuitState",
        width: 10,
        formatter: (v) => {
          switch (v) {
            case "closed":
              return colors.success("closed");
            case "open":
              return colors.error("open");
            case "half_open":
              return colors.warning("half_open");
            default:
              return String(v);
          }
        },
      },
    ]);
  }
}
