import { Args, Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import {
  success,
  error,
  json,
  colors,
  isJsonMode,
} from "../../lib/output.js";

interface UpdateWebhookResponse {
  id: string;
  url: string;
  events: string[];
  description?: string;
  isActive: boolean;
  updatedAt: string;
}

export default class WebhooksUpdate extends AuthenticatedCommand {
  static description = "Update a webhook";

  static examples = [
    '<%= config.bin %> webhooks update whk_abc123 --url https://newdomain.com/webhook',
    '<%= config.bin %> webhooks update whk_abc123 --events message.delivered,message.failed',
    '<%= config.bin %> webhooks update whk_abc123 --description "Updated production webhook"',
    '<%= config.bin %> webhooks update whk_abc123 --active false',
    '<%= config.bin %> webhooks update whk_abc123 --url https://newdomain.com/webhook --events message.sent --json',
  ];

  static args = {
    id: Args.string({
      description: "Webhook ID to update",
      required: true,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    url: Flags.string({
      char: "u",
      description: "Update webhook URL (must be HTTPS)",
    }),
    events: Flags.string({
      char: "e",
      description: "Update events list (comma-separated)",
    }),
    description: Flags.string({
      char: "d",
      description: "Update description",
    }),
    active: Flags.boolean({
      char: "a",
      description: "Enable or disable the webhook",
      allowNo: true,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(WebhooksUpdate);

    // Check if any update flags were provided
    const hasUpdates = !!(flags.url || flags.events || flags.description || flags.active !== undefined);
    
    if (!hasUpdates) {
      error("No updates specified. Use --url, --events, --description, or --active flags.");
      this.exit(1);
    }

    // Build update payload
    const updateData: any = {};
    
    if (flags.url) {
      updateData.url = flags.url;
    }
    
    if (flags.events) {
      updateData.events = flags.events.split(",").map(e => e.trim());
    }
    
    if (flags.description !== undefined) {
      updateData.description = flags.description;
    }
    
    if (flags.active !== undefined) {
      updateData.isActive = flags.active;
    }

    try {
      const webhook = await apiClient.patch<UpdateWebhookResponse>(
        `/api/v1/webhooks/${args.id}`,
        updateData
      );

      if (isJsonMode()) {
        json(webhook);
        return;
      }

      success("Webhook updated", {
        ID: webhook.id,
        URL: webhook.url,
        Events: webhook.events.join(", "),
        ...(webhook.description && { Description: webhook.description }),
        Status: webhook.isActive ? colors.success("active") : colors.warning("inactive"),
        "Updated At": webhook.updatedAt,
      });

      // Show what changed
      console.log();
      console.log(colors.dim("Updated fields:"));
      if (flags.url) console.log(colors.dim("  • URL"));
      if (flags.events) console.log(colors.dim("  • Events"));
      if (flags.description !== undefined) console.log(colors.dim("  • Description"));
      if (flags.active !== undefined) console.log(colors.dim("  • Active status"));

    } catch (err) {
      if (err instanceof Error && err.message.includes("404")) {
        error(`Webhook not found: ${args.id}`);
      } else {
        if (err instanceof Error) {
          error(`Failed to update webhook: ${err.message}`);
        } else {
          error(`Failed to update webhook: ${String(err)}`);
        }
      }
      this.exit(1);
    }
  }
}