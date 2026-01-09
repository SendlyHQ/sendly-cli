import { Args } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import {
  keyValue,
  json,
  header,
  formatDate,
  colors,
  divider,
  isJsonMode,
} from "../../lib/output.js";

type WebhookMode = "all" | "test" | "live";

interface Webhook {
  id: string;
  url: string;
  events: string[];
  description?: string;
  mode: WebhookMode;
  is_active: boolean;
  failure_count: number;
  circuit_state: "closed" | "open" | "half_open";
  secret_version: number;
  created_at: string;
  updated_at: string;
}

export default class WebhooksGet extends AuthenticatedCommand {
  static description = "Get webhook details";

  static examples = [
    "<%= config.bin %> webhooks get whk_abc123",
    "<%= config.bin %> webhooks get whk_abc123 --json",
  ];

  static args = {
    id: Args.string({
      description: "Webhook ID",
      required: true,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
  };

  async run(): Promise<void> {
    const { args } = await this.parse(WebhooksGet);

    const webhook = await apiClient.get<Webhook>(`/api/v1/webhooks/${args.id}`);

    if (isJsonMode()) {
      json(webhook);
      return;
    }

    header(`Webhook ${webhook.id}`);
    console.log();

    const modeDisplay = {
      all: colors.dim("all"),
      test: colors.warning("test"),
      live: colors.success("live"),
    };

    keyValue({
      ID: webhook.id,
      URL: webhook.url,
      Events: webhook.events.join(", "),
      Mode: modeDisplay[webhook.mode] || webhook.mode || colors.dim("all"),
      ...(webhook.description ? { Description: webhook.description } : {}),
      Status: webhook.is_active
        ? colors.success("active")
        : colors.warning("inactive"),
      "Circuit State":
        webhook.circuit_state === "closed"
          ? colors.success("closed")
          : webhook.circuit_state === "open"
            ? colors.error("open")
            : colors.warning("half_open"),
      "Failure Count": String(webhook.failure_count),
      "Secret Version": webhook.secret_version
        ? String(webhook.secret_version)
        : "1",
      Created: formatDate(webhook.created_at),
      Updated: formatDate(webhook.updated_at),
    });

    if (webhook.failure_count > 0) {
      console.log();
      console.log(
        colors.warning(
          `⚠ This webhook has failed ${webhook.failure_count} times recently.`,
        ),
      );
      console.log(
        colors.dim("Check delivery history with:"),
        colors.code(`sendly webhooks deliveries ${webhook.id}`),
      );
    }

    if (webhook.circuit_state === "open") {
      console.log();
      console.log(
        colors.error(
          "⚠ Circuit breaker is OPEN - webhook deliveries are paused.",
        ),
      );
      console.log(
        colors.dim("Test your endpoint and the circuit will auto-recover."),
      );
    }
  }
}
