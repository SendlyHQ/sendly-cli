import { Args, Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../../lib/base-command.js";
import { apiClient } from "../../../lib/api-client.js";
import { success, error, json, isJsonMode } from "../../../lib/output.js";
import inquirer from "inquirer";

export default class EnterpriseKeysRevoke extends AuthenticatedCommand {
  static description = "Revoke an API key for an enterprise workspace";

  static examples = [
    "<%= config.bin %> enterprise keys revoke org_abc123 key_xyz",
    "<%= config.bin %> enterprise keys revoke org_abc123 key_xyz --yes",
  ];

  static args = {
    workspaceId: Args.string({
      description: "Workspace ID",
      required: true,
    }),
    keyId: Args.string({
      description: "API key ID to revoke",
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
    const { args, flags } = await this.parse(EnterpriseKeysRevoke);

    if (!flags.yes && !isJsonMode()) {
      const { confirm } = await inquirer.prompt([
        {
          type: "confirm",
          name: "confirm",
          message: `Revoke API key ${args.keyId}? This cannot be undone.`,
          default: false,
        },
      ]);

      if (!confirm) {
        error("Revocation cancelled");
        return;
      }
    }

    await apiClient.delete(
      `/api/v1/enterprise/workspaces/${encodeURIComponent(args.workspaceId)}/keys/${encodeURIComponent(args.keyId)}`,
    );

    if (isJsonMode()) {
      json({ success: true, keyId: args.keyId });
      return;
    }

    success("API key revoked", {
      "Key ID": args.keyId,
      Workspace: args.workspaceId,
    });
  }
}
