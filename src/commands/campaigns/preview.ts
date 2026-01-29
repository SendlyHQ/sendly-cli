import { Args } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import { json, colors, isJsonMode, keyValue, warn } from "../../lib/output.js";

interface CampaignPreview {
  id: string;
  recipientCount: number;
  estimatedSegments: number;
  estimatedCredits: number;
  currentBalance: number;
  hasEnoughCredits: boolean;
  breakdown?: Array<{
    country: string;
    count: number;
    creditsPerMessage: number;
    totalCredits: number;
  }>;
  blockedCount?: number;
  sendableCount?: number;
  warnings?: string[];
}

export default class CampaignsPreview extends AuthenticatedCommand {
  static description = "Preview campaign cost and recipients";

  static examples = [
    "<%= config.bin %> campaigns preview cmp_xxx",
    "<%= config.bin %> campaigns preview cmp_xxx --json",
  ];

  static args = {
    id: Args.string({
      description: "Campaign ID",
      required: true,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
  };

  async run(): Promise<void> {
    const { args } = await this.parse(CampaignsPreview);

    const preview = await apiClient.get<CampaignPreview>(
      `/api/v1/campaigns/${args.id}/preview`,
    );

    if (isJsonMode()) {
      json(preview);
      return;
    }

    console.log();
    console.log(colors.bold("Campaign Preview"));
    console.log();

    keyValue([
      ["Recipients", String(preview.recipientCount)],
      ["Segments per message", String(preview.estimatedSegments)],
      ["Estimated Credits", colors.bold(String(preview.estimatedCredits))],
      ["Your Balance", String(preview.currentBalance)],
      [
        "Status",
        preview.hasEnoughCredits
          ? colors.success("Ready to send")
          : colors.error("Insufficient credits"),
      ],
    ]);

    if (!preview.hasEnoughCredits) {
      console.log();
      warn(
        `You need ${preview.estimatedCredits - preview.currentBalance} more credits to send this campaign.`,
      );
      console.log(colors.dim(`  Top up at: https://sendly.live/billing`));
    }

    if (preview.blockedCount && preview.blockedCount > 0) {
      console.log();
      warn(
        `${preview.blockedCount} of ${preview.recipientCount} recipients cannot be reached with your current verification.`,
      );
    }

    if (preview.warnings && preview.warnings.length > 0) {
      console.log();
      for (const w of preview.warnings) {
        warn(w);
      }
    }

    if (preview.breakdown && preview.breakdown.length > 0) {
      console.log();
      console.log(colors.dim("Cost breakdown by country:"));
      console.log();

      for (const item of preview.breakdown) {
        console.log(
          `  ${item.country.padEnd(20)} ${String(item.count).padStart(6)} recipients × ${item.creditsPerMessage} = ${colors.bold(String(item.totalCredits))} credits`,
        );
      }
    }

    console.log();
    console.log(colors.dim("To send this campaign:"));
    console.log(`  ${colors.code(`sendly campaigns send ${args.id}`)}`);
  }
}
