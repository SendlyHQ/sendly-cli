import { Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../../lib/base-command.js";
import { apiClient } from "../../../lib/api-client.js";
import {
  success,
  warn,
  json,
  colors,
  codeBlock,
  isJsonMode,
} from "../../../lib/output.js";

interface WebhookResponse {
  url: string;
  events: string[] | null;
  workspaces: string[] | null;
  signingSecret?: string;
  secret?: string;
}

export default class EnterpriseWebhooksSet extends AuthenticatedCommand {
  static description = "Create or update the enterprise-level webhook";

  static examples = [
    "<%= config.bin %> enterprise webhooks set --url https://example.com/webhook",
    '<%= config.bin %> enterprise webhooks set --url https://example.com/webhook --events "message.sent,message.delivered"',
  ];

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    url: Flags.string({
      description: "Webhook endpoint URL",
      required: true,
    }),
    events: Flags.string({
      description: "Comma-separated list of event types to subscribe to",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(EnterpriseWebhooksSet);

    const body: Record<string, unknown> = { url: flags.url };
    if (flags.events) {
      body.events = flags.events.split(",").map((e) => e.trim());
    }

    const response = await apiClient.post<WebhookResponse>(
      "/api/v1/enterprise/webhooks",
      body,
    );

    if (isJsonMode()) {
      json(response);
      return;
    }

    success("Enterprise webhook configured", {
      URL: response.url,
      Events: response.events?.length
        ? response.events.join(", ")
        : colors.dim("all events"),
    });

    const secret = response.signingSecret ?? response.secret;
    if (secret) {
      console.log();
      warn("Save the webhook secret — it won't be shown again!");
      codeBlock(secret);
    }
  }
}
