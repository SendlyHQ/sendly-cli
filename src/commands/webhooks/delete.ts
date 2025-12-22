import { Args, Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import { success, error, json, colors, isJsonMode } from "../../lib/output.js";
import inquirer from "inquirer";

export default class WebhooksDelete extends AuthenticatedCommand {
  static description = "Delete a webhook";

  static examples = [
    "<%= config.bin %> webhooks delete whk_abc123",
    "<%= config.bin %> webhooks delete whk_abc123 --yes",
    "<%= config.bin %> webhooks delete whk_abc123 --json",
  ];

  static args = {
    id: Args.string({
      description: "Webhook ID to delete",
      required: true,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    yes: Flags.boolean({
      char: "y",
      description: "Skip confirmation prompt",
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(WebhooksDelete);

    // Get webhook details for confirmation
    let webhook;
    try {
      webhook = await apiClient.get<{ id: string; url: string }>(`/api/v1/webhooks/${args.id}`);
    } catch (err) {
      error(`Webhook not found: ${args.id}`);
      this.exit(1);
    }

    // Confirm deletion
    if (!flags.yes && !isJsonMode()) {
      const { confirm } = await inquirer.prompt([
        {
          type: "confirm",
          name: "confirm",
          message: `Are you sure you want to delete webhook ${colors.code(args.id)} (${colors.dim(webhook.url)})? This cannot be undone.`,
          default: false,
        },
      ]);

      if (!confirm) {
        error("Deletion cancelled");
        return;
      }
    }

    await apiClient.delete(`/api/v1/webhooks/${args.id}`);

    if (isJsonMode()) {
      json({ success: true, webhookId: args.id, deleted: true });
      return;
    }

    success("Webhook deleted", {
      ID: args.id,
      URL: webhook.url,
    });
  }
}