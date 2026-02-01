import { Args, Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import {
  json,
  success,
  colors,
  isJsonMode,
  keyValue,
  warn,
} from "../../lib/output.js";
import * as readline from "readline";

interface Campaign {
  id: string;
  name: string;
  status: string;
  totalRecipients: number;
  estimatedCredits: number;
}

interface CampaignPreview {
  recipientCount: number;
  estimatedCredits: number;
  currentBalance: number;
  hasEnoughCredits: boolean;
  blockedCount?: number;
  sendableCount?: number;
  warnings?: string[];
}

async function confirm(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} (y/N) `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
    });
  });
}

export default class CampaignsSend extends AuthenticatedCommand {
  static description = "Send a campaign immediately";

  static examples = [
    "<%= config.bin %> campaigns send cmp_xxx",
    "<%= config.bin %> campaigns send cmp_xxx --yes",
  ];

  static args = {
    id: Args.string({
      description: "Campaign ID",
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
    const { args, flags } = await this.parse(CampaignsSend);

    const preview = await apiClient.get<CampaignPreview>(
      `/api/v1/campaigns/${args.id}/preview`,
    );

    if (!preview.hasEnoughCredits) {
      warn(
        `You need ${preview.estimatedCredits - preview.currentBalance} more credits to send this campaign.`,
      );
      console.log(colors.dim(`  Top up at: https://sendly.live/billing`));
      this.exit(1);
    }

    if (preview.sendableCount === 0) {
      warn("No recipients can be reached with your current verification.");
      if (preview.warnings) {
        for (const w of preview.warnings) {
          warn(w);
        }
      }
      this.exit(1);
    }

    if (preview.blockedCount && preview.blockedCount > 0) {
      warn(
        `${preview.blockedCount} of ${preview.recipientCount} recipients cannot be reached with your current verification.`,
      );
    }

    if (preview.warnings && preview.warnings.length > 0) {
      for (const w of preview.warnings) {
        warn(w);
      }
    }

    if (!flags.yes && !isJsonMode()) {
      console.log();
      console.log(colors.bold("Campaign Summary"));
      console.log();
      keyValue([
        ["Recipients", String(preview.recipientCount)],
        ["Credits to use", colors.bold(String(preview.estimatedCredits))],
      ]);
      console.log();

      const confirmed = await confirm(
        colors.warning("Send this campaign now?"),
      );
      if (!confirmed) {
        console.log(colors.dim("Cancelled"));
        return;
      }
    }

    const campaign = await apiClient.post<Campaign>(
      `/api/v1/campaigns/${args.id}/send`,
    );

    if (isJsonMode()) {
      json(campaign);
      return;
    }

    success(`Campaign is now sending!`);
    console.log();

    keyValue([
      ["Campaign", campaign.name],
      ["Status", colors.info("sending")],
      ["Recipients", String(campaign.totalRecipients)],
    ]);

    console.log();
    console.log(colors.dim("Check status:"));
    console.log(`  ${colors.code(`sendly campaigns get ${campaign.id}`)}`);
  }
}
