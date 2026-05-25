import { Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import { json, success, error, info, isJsonMode } from "../../lib/output.js";

export default class BusinessUpgradeDisposition extends AuthenticatedCommand {
  static description =
    "Choose what happens to the old toll-free number after a successful business entity upgrade — either move it to another workspace you own, or release it back to the carrier pool";

  static examples = [
    "<%= config.bin %> business-upgrade disposition --workspace ws_abc --disposition moved --target-workspace ws_xyz",
    "<%= config.bin %> business-upgrade disposition --workspace ws_abc --disposition released",
  ];

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    workspace: Flags.string({
      required: true,
      description: "Workspace whose upgrade was just approved",
    }),
    disposition: Flags.string({
      required: true,
      options: ["moved", "released"],
      description: "What to do with the old toll-free number",
    }),
    "target-workspace": Flags.string({
      description: "Required when disposition='moved' — workspace to attach old number to",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(BusinessUpgradeDisposition);
    if (flags.disposition === "moved" && !flags["target-workspace"]) {
      error("--target-workspace is required when --disposition=moved.");
      this.exit(1);
    }
    const result = await apiClient.post<{
      success: boolean;
      disposition: string;
      supersededVerificationId: string;
      message: string;
    }>(
      `/api/v1/workspaces/${encodeURIComponent(flags.workspace)}/upgrade/disposition`,
      {
        disposition: flags.disposition,
        targetOrgId: flags["target-workspace"],
      },
    );
    if (isJsonMode()) {
      json(result);
      return;
    }
    success(result.message);
    info(`Superseded verification: ${result.supersededVerificationId}`);
  }
}
