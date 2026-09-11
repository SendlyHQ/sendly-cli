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

interface BatchResult {
  batchId: string;
  status: string;
  total: number;
  sent: number;
  failed: number;
  creditsUsed: number;
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
      `/api/v1/campaigns/${encodeURIComponent(args.id)}/preview`,
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

    const result = await apiClient.post<BatchResult>(
      `/api/v1/campaigns/${encodeURIComponent(args.id)}/send`,
    );

    if (isJsonMode()) {
      json(result);
      return;
    }

    success(`Campaign sent!`);
    console.log();

    keyValue([
      ["Total", String(result.total)],
      ["Sent", colors.success(String(result.sent))],
      ["Failed", result.failed > 0 ? colors.error(String(result.failed)) : "0"],
      ["Credits Used", String(result.creditsUsed)],
    ]);

    console.log();
    console.log(colors.dim("Check status:"));
    console.log(`  ${colors.code(`sendly campaigns get ${args.id}`)}`);
  }
}
