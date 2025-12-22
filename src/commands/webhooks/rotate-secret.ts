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
  id: string;
  newSecret: string;
  newSecretVersion: number;
  gracePeriodHours: number;
  rotatedAt: string;
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
      webhook = await apiClient.get<{ id: string; url: string; secretVersion: number }>(
        `/api/v1/webhooks/${args.id}`
      );
    } catch (err) {
      error(`Webhook not found: ${args.id}`);
      this.exit(1);
    }

    // Confirm rotation
    if (!flags.yes && !isJsonMode()) {
      console.log();
      console.log(colors.warning("⚠ This will rotate the webhook secret and invalidate the old one after 24 hours."));
      console.log(colors.dim("Make sure to update your application with the new secret."));
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
        `/api/v1/webhooks/${args.id}/rotate-secret`
      );

      if (isJsonMode()) {
        json(result);
        return;
      }

      success("Webhook secret rotated", {
        "Webhook ID": result.id,
        "Secret Version": `${webhook.secretVersion} → ${result.newSecretVersion}`,
        "Grace Period": `${result.gracePeriodHours} hours`,
        "Rotated At": result.rotatedAt,
      });

      console.log();
      warn("Copy your new webhook secret now. The old secret will expire in 24 hours!");
      codeBlock(result.newSecret);

      console.log();
      console.log(colors.dim("Update your application with this new secret for webhook signature verification."));
      console.log(colors.dim(`The old secret will remain valid for ${result.gracePeriodHours} hours to allow for graceful migration.`));

    } catch (err) {
      error("Failed to rotate secret", err instanceof Error ? err.message : String(err));
      this.exit(1);
    }
  }
}