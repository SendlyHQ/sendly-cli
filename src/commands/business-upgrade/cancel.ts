import { Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import { json, success, info, isJsonMode } from "../../lib/output.js";

export default class BusinessUpgradeCancel extends AuthenticatedCommand {
  static description =
    "Cancel a pending business entity upgrade. Releases the reserved toll-free number, deletes the new messaging profile + EIN document. Current toll-free number unaffected. Idempotent.";

  static examples = [
    "<%= config.bin %> business-upgrade cancel --workspace ws_abc",
    "<%= config.bin %> business-upgrade cancel --workspace ws_abc --yes",
  ];

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    workspace: Flags.string({ required: true }),
    yes: Flags.boolean({
      char: "y",
      description: "Skip the confirmation prompt",
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(BusinessUpgradeCancel);
    if (!flags.yes && !flags.json) {
      // Best-effort prompt — oclif's readline-based confirm. Skip if --yes.
      info(`About to cancel the pending upgrade for workspace ${flags.workspace}.`);
      const { default: inquirer } = await import("@inquirer/confirm").catch(() => ({
        default: undefined,
      }));
      if (inquirer) {
        const ok = await inquirer({
          message: "Continue?",
          default: false,
        });
        if (!ok) {
          info("Cancelled — no changes made.");
          return;
        }
      }
    }
    const result = await apiClient.post<{
      success: boolean;
      cancelled: boolean;
      message: string;
    }>(`/api/v1/workspaces/${encodeURIComponent(flags.workspace)}/upgrade/cancel`, {});
    if (isJsonMode()) {
      json(result);
      return;
    }
    success(result.message);
  }
}
