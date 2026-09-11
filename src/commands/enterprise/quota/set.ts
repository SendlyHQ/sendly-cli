import { Args, Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../../lib/base-command.js";
import { apiClient } from "../../../lib/api-client.js";
import { success, json, colors, isJsonMode } from "../../../lib/output.js";

interface QuotaSettings {
  dailyMessageQuota: number | null;
  monthlyMessageQuota: number | null;
  messagesThisMonth: number;
  messagesThisDay: number;
}

export default class QuotaSet extends AuthenticatedCommand {
  static description = "Set message quota for an enterprise workspace";

  static examples = [
    "<%= config.bin %> enterprise quota set org_abc123 --daily 1000",
    "<%= config.bin %> enterprise quota set org_abc123 --monthly 25000",
    "<%= config.bin %> enterprise quota set org_abc123 --daily 1000 --monthly 25000",
    "<%= config.bin %> enterprise quota set org_abc123 --daily unlimited",
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
      description: 'Daily message limit (number or "unlimited")',
    }),
    monthly: Flags.string({
      description: 'Monthly message limit (number or "unlimited")',
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(QuotaSet);

    if (!flags.daily && !flags.monthly) {
      this.error("Specify at least one of --daily or --monthly.");
    }

    const body: Record<string, unknown> = {};

    if (flags.daily !== undefined) {
      body.dailyMessageQuota =
        flags.daily === "unlimited" ? null : parseInt(flags.daily, 10);
      if (flags.daily !== "unlimited" && isNaN(body.dailyMessageQuota as number)) {
        this.error('--daily must be a number or "unlimited".');
      }
    }

    if (flags.monthly !== undefined) {
      body.monthlyMessageQuota =
        flags.monthly === "unlimited" ? null : parseInt(flags.monthly, 10);
      if (flags.monthly !== "unlimited" && isNaN(body.monthlyMessageQuota as number)) {
        this.error('--monthly must be a number or "unlimited".');
      }
    }

    const quota = await apiClient.put<QuotaSettings>(
      `/api/v1/enterprise/workspaces/${encodeURIComponent(args.workspaceId)}/quota`,
      body,
    );

    if (isJsonMode()) {
      json(quota);
      return;
    }

    const details: Record<string, string> = {};

    if (flags.daily !== undefined) {
      details["Daily Limit"] =
        quota.dailyMessageQuota !== null
          ? quota.dailyMessageQuota.toLocaleString()
          : colors.dim("unlimited");
    }

    if (flags.monthly !== undefined) {
      details["Monthly Limit"] =
        quota.monthlyMessageQuota !== null
          ? quota.monthlyMessageQuota.toLocaleString()
          : colors.dim("unlimited");
    }

    success("Quota updated", details);
  }
}
