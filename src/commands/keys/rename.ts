import { Args, Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import { success, error, json, isJsonMode } from "../../lib/output.js";

export default class KeysRename extends AuthenticatedCommand {
  static description = "Rename an API key";

  static examples = [
    '<%= config.bin %> keys rename key_abc123 --name "Production Key"',
    '<%= config.bin %> keys rename key_abc123 -n "Staging"',
  ];

  static args = {
    keyId: Args.string({
      description: "Key ID to rename (e.g., key_abc123)",
      required: true,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    name: Flags.string({
      char: "n",
      description: "New name for the API key",
      required: true,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(KeysRename);

    try {
      const response = await apiClient.patch<{
        id: string;
        name: string;
        createdAt: string;
      }>(`/api/v1/account/keys/${encodeURIComponent(args.keyId)}/rename`, {
        name: flags.name,
      });

      if (isJsonMode()) {
        json({
          success: true,
          keyId: response.id,
          name: response.name,
        });
        return;
      }

      success("API key renamed", {
        "Key ID": response.id,
        Name: response.name,
      });
    } catch (err: any) {
      if (err.message?.includes("not_found") || err.message?.includes("404")) {
        error(`Key not found: ${args.keyId}`);
        this.exit(1);
      }
      throw err;
    }
  }
}
