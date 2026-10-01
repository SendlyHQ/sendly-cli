import { Args } from "@oclif/core";
import { AuthenticatedCommand } from "../../../lib/base-command.js";
import { apiClient } from "../../../lib/api-client.js";
import {
  json,
  keyValue,
  colors,
  header,
  isJsonMode,
  formatDate,
} from "../../../lib/output.js";

interface QuotaSettings {
  monthlyMessageQuota: number | null;
  messagesThisMonth: number;
  quotaResetAt: string | null;
}

export default class QuotaGet extends AuthenticatedCommand {
  static description = "Get message quota for an enterprise workspace";

  static examples = [
    "<%= config.bin %> enterprise quota get org_abc123",
    "<%= config.bin %> enterprise quota get org_abc123 --json",
  ];

  static args = {
    workspaceId: Args.string({
      description: "Workspace ID",
      required: true,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
  };

  async run(): Promise<void> {
    const { args } = await this.parse(QuotaGet);

    const quota = await apiClient.get<QuotaSettings>(
      `/api/v1/enterprise/workspaces/${encodeURIComponent(args.workspaceId)}/quota`,
    );

    if (isJsonMode()) {
      json(quota);
      return;
    }

    header("Workspace Quota");

    keyValue({
      "Monthly Limit": quota.monthlyMessageQuota != null
        ? quota.monthlyMessageQuota.toLocaleString()
        : colors.dim("unlimited"),
      "Monthly Used": `${(quota.messagesThisMonth || 0).toLocaleString()}${quota.monthlyMessageQuota ? ` / ${quota.monthlyMessageQuota.toLocaleString()}` : ""}`,
      "Resets At": quota.quotaResetAt
        ? formatDate(quota.quotaResetAt)
        : colors.dim("not scheduled"),
    });
  }
}
