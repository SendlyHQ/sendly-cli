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

interface Webhook {
  id: string;
  url: string;
  events: string[];
  description?: string;
  isActive: boolean;
  failureCount: number;
  circuitState: "closed" | "open" | "half_open";
  secretVersion: number;
  createdAt: string;
  updatedAt: string;
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

    keyValue([
      { key: "ID", value: webhook.id },
      { key: "URL", value: webhook.url },
      { key: "Events", value: webhook.events.join(", ") },
      ...(webhook.description ? [{ key: "Description", value: webhook.description }] : []),
      { 
        key: "Status", 
        value: webhook.isActive ? colors.success("active") : colors.warning("inactive") 
      },
      { 
        key: "Circuit State", 
        value: webhook.circuitState === "closed" 
          ? colors.success("closed")
          : webhook.circuitState === "open" 
            ? colors.error("open")
            : colors.warning("half_open")
      },
      { key: "Failure Count", value: String(webhook.failureCount) },
      { key: "Secret Version", value: String(webhook.secretVersion) },
      { key: "Created", value: formatDate(webhook.createdAt) },
      { key: "Updated", value: formatDate(webhook.updatedAt) },
    ]);

    if (webhook.failureCount > 0) {
      console.log();
      console.log(colors.warning(`⚠ This webhook has failed ${webhook.failureCount} times recently.`));
      console.log(colors.dim("Check delivery history with:"), colors.code(`sendly webhooks deliveries ${webhook.id}`));
    }

    if (webhook.circuitState === "open") {
      console.log();
      console.log(colors.error("⚠ Circuit breaker is OPEN - webhook deliveries are paused."));
      console.log(colors.dim("Test your endpoint and the circuit will auto-recover."));
    }
  }
}