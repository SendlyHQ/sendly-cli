import { Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import {
  success,
  warn,
  json,
  colors,
  codeBlock,
  isJsonMode,
} from "../../lib/output.js";

interface CreateWebhookResponse {
  id: string;
  url: string;
  events: string[];
  description?: string;
  secret: string; // Only returned on creation
  secretVersion: number;
  isActive: boolean;
  createdAt: string;
}

export default class WebhooksCreate extends AuthenticatedCommand {
  static description = "Create a webhook";

  static examples = [
    '<%= config.bin %> webhooks create --url https://myapp.com/webhook --events message.delivered',
    '<%= config.bin %> webhooks create --url https://myapp.com/webhook --events message.delivered,message.failed --description "Production webhook"',
    '<%= config.bin %> webhooks create --url https://webhook.site/abc123 --events message.sent --json',
  ];

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    url: Flags.string({
      char: "u",
      description: "Webhook URL (must be HTTPS)",
      required: true,
    }),
    events: Flags.string({
      char: "e",
      description: "Comma-separated list of events to listen for",
      required: true,
    }),
    description: Flags.string({
      char: "d",
      description: "Description for the webhook",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(WebhooksCreate);

    const events = flags.events.split(",").map(e => e.trim());

    const response = await apiClient.post<CreateWebhookResponse>("/api/v1/webhooks", {
      url: flags.url,
      events,
      ...(flags.description && { description: flags.description }),
    });

    if (isJsonMode()) {
      json(response);
      return;
    }

    success("Webhook created", {
      ID: response.id,
      URL: response.url,
      Events: response.events.join(", "),
      ...(response.description && { Description: response.description }),
      Status: response.isActive ? colors.success("active") : colors.warning("inactive"),
    });

    console.log();
    warn("Copy your webhook secret now. You won't be able to see it again!");
    codeBlock(response.secret);

    console.log();
    console.log(colors.dim("Use this secret to verify webhook signatures in your application."));
    console.log(colors.dim("See the docs for signature verification examples."));
  }
}