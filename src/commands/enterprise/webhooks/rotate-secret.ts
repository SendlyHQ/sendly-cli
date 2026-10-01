import { Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../../lib/base-command.js";
import { apiClient } from "../../../lib/api-client.js";
import {
  success,
  warn,
  error,
  json,
  codeBlock,
  isJsonMode,
} from "../../../lib/output.js";
import inquirer from "inquirer";

interface RotateSecretResponse {
  success: boolean;
  secret: string;
  rotated_at: string;
  message?: string;
}

export default class EnterpriseWebhooksRotateSecret extends AuthenticatedCommand {
  static description =
    "Rotate the enterprise webhook signing secret and show the new one";

  static examples = [
    "<%= config.bin %> enterprise webhooks rotate-secret",
    "<%= config.bin %> enterprise webhooks rotate-secret --yes",
    "<%= config.bin %> enterprise webhooks rotate-secret --json",
  ];

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    yes: Flags.boolean({
      char: "y",
      description: "Skip confirmation prompt",
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(EnterpriseWebhooksRotateSecret);

    if (!flags.yes && !isJsonMode()) {
      const { confirm } = await inquirer.prompt([
        {
          type: "confirm",
          name: "confirm",
          message:
            "Rotate the enterprise webhook signing secret? Deliveries are signed with the new secret straight away, so signatures checked with the old one will fail.",
          default: false,
        },
      ]);

      if (!confirm) {
        error("Rotation cancelled");
        return;
      }
    }

    const result = await apiClient.post<RotateSecretResponse>(
      "/api/v1/enterprise/webhooks/rotate-secret",
    );

    if (isJsonMode()) {
      json(result);
      return;
    }

    success("Enterprise webhook secret rotated", {
      "Rotated At": result.rotated_at,
    });

    console.log();
    warn(
      "Save the new secret now — it won't be shown again. Deliveries are signed with it from now on.",
    );
    codeBlock(result.secret);
  }
}
