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

type WebhookMode = "all" | "test" | "live";

interface CreateWebhookResponse {
  id: string;
  url: string;
  events: string[];
  description?: string;
  mode: WebhookMode;
  secret: string; // Only returned on creation
  secret_version: number;
  is_active: boolean;
  created_at: string;
}

export default class WebhooksCreate extends AuthenticatedCommand {
  static description = "Create a webhook";

  static examples = [
    "<%= config.bin %> webhooks create --url https://myapp.com/webhook --events message.delivered",
    '<%= config.bin %> webhooks create --url https://myapp.com/webhook --events message.delivered,message.failed --description "Production webhook"',
    "<%= config.bin %> webhooks create --url https://webhook.site/abc123 --events message.sent --json",
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
    mode: Flags.string({
      char: "m",
      description:
        "Event mode filter: all (default), test (sandbox only), live (production only)",
      options: ["all", "test", "live"],
      default: "all",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(WebhooksCreate);

    const testUrlPatterns = ["localhost", "127.0.0.1", ".ngrok.", ".loca.lt", "webhook.site"];
    const isTestUrl = testUrlPatterns.some((p) => flags.url.toLowerCase().includes(p));
    if (
      flags.url.toLowerCase().startsWith("http://") ||
      (!flags.url.startsWith("https://") && !isTestUrl)
    ) {
      this.error(
        "Webhook URL must use HTTPS: the API refuses http:// URLs, local ones included. To receive events on this machine, use `sendly webhooks listen`.",
      );
    }

    const events = flags.events.split(",").map((e) => e.trim());

    const response = await apiClient.post<CreateWebhookResponse>(
      "/api/v1/webhooks",
      {
        url: flags.url,
        events,
        mode: flags.mode,
        ...(flags.description && { description: flags.description }),
      },
    );

    if (isJsonMode()) {
      json(response);
      return;
    }

    const modeDisplay = {
      all: colors.dim("all"),
      test: colors.warning("test"),
      live: colors.success("live"),
    };

    success("Webhook created", {
      ID: response.id,
      URL: response.url,
      Events: response.events.join(", "),
      Mode: modeDisplay[response.mode] || response.mode,
      ...(response.description && { Description: response.description }),
      Status: response.is_active
        ? colors.success("active")
        : colors.warning("inactive"),
    });

    console.log();
    warn("Copy your webhook secret now. You won't be able to see it again!");
    codeBlock(response.secret);

    console.log();
    console.log(
      colors.dim(
        "Use this secret to verify webhook signatures in your application.",
      ),
    );
    console.log(
      colors.dim("See the docs for signature verification examples."),
    );
  }
}
