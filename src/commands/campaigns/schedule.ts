import { Args, Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import {
  json,
  success,
  colors,
  isJsonMode,
  isQuietMode,
  keyValue,
  info,
} from "../../lib/output.js";
import * as chrono from "chrono-node";

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
  static description = 'Schedule a campaign for later. Supports natural language dates like "tomorrow at 9am".';

  static examples = [
    '<%= config.bin %> campaigns schedule cmp_xxx --at "tomorrow at 9am"',
    '<%= config.bin %> campaigns schedule cmp_xxx --at "next Monday 10am" --timezone "America/New_York"',
    '<%= config.bin %> campaigns schedule cmp_xxx --at "2026-04-01T10:00:00Z"',
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
      description: 'When to send — ISO 8601 or natural language ("tomorrow at 9am", "in 2 hours")',
      required: true,
    }),
    timezone: Flags.string({
      char: "z",
      description: 'Timezone (e.g., "America/New_York")',
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(CampaignsSchedule);

    let scheduledAt = new Date(flags.at);
    if (isNaN(scheduledAt.getTime())) {
      const parsed = chrono.parseDate(flags.at, new Date(), { forwardDate: true });
      if (!parsed) {
        this.error('Could not understand the date. Try: "tomorrow at 9am", "in 2 hours", or ISO 8601: 2026-04-01T10:00:00Z');
      }
      scheduledAt = parsed;
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (!isJsonMode()) {
        info(`Interpreted "${flags.at}" as ${scheduledAt.toLocaleString()} (${tz})`);
      }
    }

    if (scheduledAt <= new Date()) {
      this.error('That time is in the past. Try: "tomorrow at 9am" or "in 2 hours"');
    }

    const campaign = await apiClient.post<Campaign>(
      `/api/v1/campaigns/${args.id}/schedule`,
      {
        scheduledAt: scheduledAt.toISOString(),
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
