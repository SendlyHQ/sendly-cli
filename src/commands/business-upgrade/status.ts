import { Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import { json, info, isJsonMode, colors } from "../../lib/output.js";

interface PendingRow {
  id: string;
  businessName: string;
  status: string;
  tollFreeNumber: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export default class BusinessUpgradeStatus extends AuthenticatedCommand {
  static description = "Show the status of any pending business entity upgrade for a workspace";

  static examples = [
    "<%= config.bin %> business-upgrade status --workspace ws_abc",
    "<%= config.bin %> business-upgrade status --workspace ws_abc --json",
  ];

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    workspace: Flags.string({
      description: "Workspace ID to check",
      required: true,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(BusinessUpgradeStatus);
    const data = await apiClient.get<{ pending: PendingRow | null }>(
      `/api/v1/workspaces/${encodeURIComponent(flags.workspace)}/upgrade/status`,
    );
    if (isJsonMode()) {
      json(data);
      return;
    }
    if (!data.pending) {
      info("No upgrade in flight for this workspace.");
      return;
    }
    info(`${colors.bold(data.pending.businessName)}  ·  status: ${data.pending.status}`);
    if (data.pending.tollFreeNumber) info(`Reserved number: ${data.pending.tollFreeNumber}`);
    if (data.pending.rejectionReason) {
      info(colors.yellow(`Carrier feedback: ${data.pending.rejectionReason}`));
    }
    info(colors.gray(`Submitted ${data.pending.createdAt}`));
  }
}
