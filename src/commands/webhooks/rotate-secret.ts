import { Args, Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import {
  success,
  warn,
  error,
  json,
  colors,
  codeBlock,
  isJsonMode,
} from "../../lib/output.js";
import inquirer from "inquirer";

interface RotateSecretResponse {
  success?: boolean;
  id?: string;
  secret?: string;
  new_secret?: string;
  new_secret_version?: number;
  grace_period_hours?: number;
  rotated_at?: string;
  message?: string;
}

export default class WebhooksRotateSecret extends AuthenticatedCommand {
  static description = "Rotate webhook secret";

  static examples = [
    "<%= config.bin %> webhooks rotate-secret whk_abc123",
    "<%= config.bin %> webhooks rotate-secret whk_abc123 --yes",
    "<%= config.bin %> webhooks rotate-secret whk_abc123 --json",
  ];

  static args = {
    id: Args.string({
      description: "Webhook ID",
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
    const { args, flags } = await this.parse(WebhooksRotateSecret);

    // Get webhook details for confirmation
    let webhook;
    try {
      webhook = await apiClient.get<{
        id: string;
        url: string;
        secret_version: number;
      }>(`/api/v1/webhooks/${encodeURIComponent(args.id)}`);
    } catch (err) {
      error(`Webhook not found: ${args.id}`);
      this.exit(1);
    }

    // Confirm rotation
    if (!flags.yes && !isJsonMode()) {
      console.log();
      console.log(
        colors.warning(
          "⚠ This will rotate the webhook secret and invalidate the old one after 24 hours.",
        ),
      );
      console.log(
        colors.dim("Make sure to update your application with the new secret."),
      );
      console.log();

      const { confirm } = await inquirer.prompt([
        {
          type: "confirm",
          name: "confirm",
          message: `Rotate secret for webhook ${colors.code(args.id)} (${colors.dim(webhook.url)})?`,
          default: false,
        },
      ]);

      if (!confirm) {
        error("Secret rotation cancelled");
        return;
      }
    }

    try {
      const result = await apiClient.post<RotateSecretResponse>(
        `/api/v1/webhooks/${encodeURIComponent(args.id)}/rotate-secret`,
      );

      if (isJsonMode()) {
        json(result);
        return;
      }

      const secretValue = result.new_secret || result.secret || "";
      const gracePeriod = result.grace_period_hours || 24;

      success("Webhook secret rotated", {
        "Webhook ID": result.id || args.id,
        "Secret Version": `${webhook.secret_version || 1} → ${result.new_secret_version || "new"}`,
        "Grace Period": `${gracePeriod} hours`,
        "Rotated At": result.rotated_at || new Date().toISOString(),
      });

      console.log();
      warn(
        "Copy your new webhook secret now. The old secret will expire in 24 hours!",
      );
      codeBlock(secretValue);

      console.log();
      console.log(
        colors.dim(
          "Update your application with this new secret for webhook signature verification.",
        ),
      );
      console.log(
        colors.dim(
          `The old secret will remain valid for ${gracePeriod} hours to allow for graceful migration.`,
        ),
      );
    } catch (err) {
      if (err instanceof Error) {
        error(`Failed to rotate secret: ${err.message}`);
      } else {
        error(`Failed to rotate secret: ${String(err)}`);
      }
      this.exit(1);
    }
  }
}
