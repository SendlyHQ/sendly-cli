import { Args, Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import { success, error, json, colors, isJsonMode } from "../../lib/output.js";
import inquirer from "inquirer";

export default class KeysRevoke extends AuthenticatedCommand {
  static description = "Revoke an API key";

  static examples = [
    "<%= config.bin %> keys revoke key_abc123",
    '<%= config.bin %> keys revoke key_abc123 --reason "Compromised"',
    "<%= config.bin %> keys revoke key_abc123 --yes",
  ];

  static args = {
    keyId: Args.string({
      description: "Key ID to revoke (e.g., key_abc123)",
      required: true,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    reason: Flags.string({
      char: "r",
      description: "Reason for revoking the key",
    }),
    yes: Flags.boolean({
      char: "y",
      description: "Skip confirmation prompt",
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(KeysRevoke);

    // Confirm revocation
    if (!flags.yes) {
      const { confirm } = await inquirer.prompt([
        {
          type: "confirm",
          name: "confirm",
          message: `Are you sure you want to revoke ${colors.code(args.keyId)}? This cannot be undone.`,
          default: false,
        },
      ]);

      if (!confirm) {
        error("Revocation cancelled");
        return;
      }
    }

    // Revoke the key directly by ID
    try {
      await apiClient.patch(`/api/v1/account/keys/${encodeURIComponent(args.keyId)}/revoke`, {
        reason: flags.reason || "Revoked via CLI",
      });
    } catch (err: any) {
      if (err.message?.includes("not_found") || err.message?.includes("404")) {
        error(`Key not found: ${args.keyId}`);
        this.exit(1);
      }
      throw err;
    }

    if (isJsonMode()) {
      json({ success: true, keyId: args.keyId, revoked: true });
      return;
    }

    success("API key revoked", {
      "Key ID": args.keyId,
      Reason: flags.reason || "Revoked via CLI",
    });
  }
}
