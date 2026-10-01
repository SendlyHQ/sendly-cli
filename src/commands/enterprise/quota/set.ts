import { Args, Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../../lib/base-command.js";
import { apiClient } from "../../../lib/api-client.js";
import { success, warn, json, colors, isJsonMode } from "../../../lib/output.js";

interface QuotaSettings {
  monthlyMessageQuota: number | null;
  messagesThisMonth: number;
  quotaResetAt: string | null;
}

export default class QuotaSet extends AuthenticatedCommand {
  static description = "Set message quota for an enterprise workspace";

  static examples = [
    "<%= config.bin %> enterprise quota set org_abc123 --monthly 25000",
    "<%= config.bin %> enterprise quota set org_abc123 --monthly unlimited",
  ];

  static args = {
    workspaceId: Args.string({
      description: "Workspace ID",
      required: true,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    daily: Flags.string({
      description: "Not supported: workspaces have a monthly quota only",
      hidden: true,
    }),
    monthly: Flags.string({
      description: 'Monthly message limit (number or "unlimited")',
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(QuotaSet);

    if (flags.monthly === undefined) {
      this.error(
        flags.daily !== undefined
          ? "Daily quotas are not supported: a workspace has a monthly quota only. Use --monthly."
          : 'Specify --monthly with a number or "unlimited".',
      );
    }

    if (flags.daily !== undefined) {
      warn(
        "Daily quotas are not supported: a workspace has a monthly quota only, so --daily was ignored.",
      );
    }

    const body: Record<string, unknown> = {
      monthlyMessageQuota:
        flags.monthly === "unlimited" ? null : parseInt(flags.monthly, 10),
    };
    if (flags.monthly !== "unlimited" && isNaN(body.monthlyMessageQuota as number)) {
      this.error('--monthly must be a number or "unlimited".');
    }

    const quota = await apiClient.put<QuotaSettings>(
      `/api/v1/enterprise/workspaces/${encodeURIComponent(args.workspaceId)}/quota`,
      body,
    );

    if (isJsonMode()) {
      json(quota);
      return;
    }

    success("Quota updated", {
      "Monthly Limit":
        quota.monthlyMessageQuota != null
          ? quota.monthlyMessageQuota.toLocaleString()
          : colors.dim("unlimited"),
    });
  }
}
