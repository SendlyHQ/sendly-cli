import { Args, Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import {
  json,
  success,
  colors,
  isJsonMode,
  keyValue,
} from "../../lib/output.js";

interface Campaign {
  id: string;
  name: string;
  status: string;
  totalRecipients: number;
  estimatedCredits: number;
  scheduledAt: string;
  timezone?: string;
}

export default class CampaignsSchedule extends AuthenticatedCommand {
  static description = "Schedule a campaign for later";

  static examples = [
    '<%= config.bin %> campaigns schedule cmp_xxx --at "2024-01-15T10:00:00Z"',
    '<%= config.bin %> campaigns schedule cmp_xxx --at "2024-01-15T10:00:00" --timezone "America/New_York"',
  ];

  static args = {
    id: Args.string({
      description: "Campaign ID",
      required: true,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    at: Flags.string({
      description: "When to send (ISO 8601 datetime)",
      required: true,
    }),
    timezone: Flags.string({
      char: "z",
      description: 'Timezone (e.g., "America/New_York")',
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(CampaignsSchedule);

    const scheduledAt = new Date(flags.at);
    if (isNaN(scheduledAt.getTime())) {
      this.error(
        "Invalid date format. Use ISO 8601 format (e.g., 2024-01-15T10:00:00Z)",
      );
    }

    if (scheduledAt <= new Date()) {
      this.error("Scheduled time must be in the future");
    }

    const campaign = await apiClient.post<Campaign>(
      `/api/v1/campaigns/${args.id}/schedule`,
      {
        scheduledAt: flags.at,
        timezone: flags.timezone,
      },
    );

    if (isJsonMode()) {
      json(campaign);
      return;
    }

    success(`Campaign scheduled!`);
    console.log();

    keyValue([
      ["Campaign", campaign.name],
      ["Status", colors.warning("scheduled")],
      ["Recipients", String(campaign.totalRecipients)],
      ["Scheduled For", new Date(campaign.scheduledAt).toLocaleString()],
      ...(campaign.timezone
        ? [["Timezone", campaign.timezone] as [string, string]]
        : []),
    ]);

    console.log();
    console.log(colors.dim("To cancel:"));
    console.log(`  ${colors.code(`sendly campaigns cancel ${campaign.id}`)}`);
  }
}
