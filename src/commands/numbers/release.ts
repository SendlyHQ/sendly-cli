import { Args, Flags } from "@oclif/core";
import inquirer from "inquirer";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import { success, info, json, colors, isJsonMode } from "../../lib/output.js";

interface ReleaseResponse {
  success: boolean;
  scheduled?: boolean;
  scheduledReleaseAt?: string;
}

/**
 * `sendly numbers release <id>` — give up a number you own. A live paid
 * purchase is scheduled to release at the end of the current billing period
 * (undo with `sendly numbers update <id> --keep`); anything else is released at
 * the carrier immediately.
 *
 * Wraps `DELETE /api/v1/numbers/:id`. Prompts for confirmation unless --yes is
 * passed. Returns 404 when the id isn't one of your numbers.
 */
export default class NumbersRelease extends AuthenticatedCommand {
  static description =
    "Release a number you own (paid purchases release at period end, others immediately)";

  static examples = [
    "<%= config.bin %> numbers release num_abc123",
    "<%= config.bin %> numbers release num_abc123 --yes",
    "<%= config.bin %> numbers release num_abc123 --json",
  ];

  static args = {
    id: Args.string({
      description: "Phone number ID (from `sendly numbers list`)",
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
    const { args, flags } = await this.parse(NumbersRelease);

    if (!flags.yes && !isJsonMode() && process.stdin.isTTY) {
      const { confirm } = await inquirer.prompt([
        {
          type: "confirm",
          name: "confirm",
          message: `Release ${colors.code(args.id)}? Paid numbers release at the end of the billing period; everything else releases immediately.`,
          default: false,
        },
      ]);
      if (!confirm) {
        info("Release cancelled");
        return;
      }
    }

    const response = await apiClient.delete<ReleaseResponse>(
      `/api/v1/numbers/${encodeURIComponent(args.id)}`,
    );

    if (isJsonMode()) {
      json(response);
      return;
    }

    if (response.scheduled && response.scheduledReleaseAt) {
      success("Number scheduled for release", {
        Releases: new Date(response.scheduledReleaseAt).toLocaleDateString(),
        Note: `It stays active until then. Undo with: sendly numbers update ${args.id} --keep`,
      });
      return;
    }

    success("Number released");
  }
}
