import { Args, Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import { success, error, json, colors, isJsonMode } from "../../lib/output.js";
import inquirer from "inquirer";

interface RotateResponse {
  newKey: {
    id: string;
    name: string;
    type?: "test" | "live";
    scopes?: string[];
    isActive?: boolean;
    createdAt?: string;
    expiresAt?: string | null;
    // The raw `sk_…` secret — shown only on this response, never again.
    key: string;
    warning: string;
  };
  oldKey: {
    id: string;
    expiresAt?: string | null;
  };
  message: string;
}

export default class KeysRotate extends AuthenticatedCommand {
  static description = "Rotate an API key (generate new key, optionally keep old one active)";

  static examples = [
    "<%= config.bin %> keys rotate key_abc123",
    "<%= config.bin %> keys rotate key_abc123 --grace-period 24",
    "<%= config.bin %> keys rotate key_abc123 --yes",
  ];

  static args = {
    keyId: Args.string({
      description: "Key ID to rotate (e.g., key_abc123)",
      required: true,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    "grace-period": Flags.integer({
      char: "g",
      description:
        "Hours to keep the old key active during rotation (24-168, default 24)",
    }),
    yes: Flags.boolean({
      char: "y",
      description: "Skip confirmation prompt",
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(KeysRotate);

    if (!flags.yes) {
      const { confirm } = await inquirer.prompt([
        {
          type: "confirm",
          name: "confirm",
          message: `Are you sure you want to rotate ${colors.code(args.keyId)}? A new key will be generated.`,
          default: false,
        },
      ]);

      if (!confirm) {
        error("Rotation cancelled");
        return;
      }
    }

    try {
      const body: Record<string, any> = {};
      if (flags["grace-period"] !== undefined) {
        body.gracePeriodHours = flags["grace-period"];
      }

      const response = await apiClient.post<RotateResponse>(
        `/api/v1/account/keys/${args.keyId}/rotate`,
        body,
      );

      if (isJsonMode()) {
        json(response);
        return;
      }

      success("API key rotated", {
        "New Key ID": response.newKey.id,
        "New Key": colors.highlight(response.newKey.key),
        Name: response.newKey.name,
        ...(response.oldKey?.expiresAt && {
          "Old Key Expires": new Date(
            response.oldKey.expiresAt,
          ).toLocaleString(),
        }),
      });

      this.log("");
      this.log(
        colors.warning(
          response.newKey.warning || "Save this key - it won't be shown again!",
        ),
      );
    } catch (err: any) {
      if (err.message?.includes("not_found") || err.message?.includes("404")) {
        error(`Key not found: ${args.keyId}`);
        this.exit(1);
      }
      throw err;
    }
  }
}
