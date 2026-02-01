import { Args } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import { json, colors, isJsonMode, keyValue } from "../../lib/output.js";

interface Campaign {
  id: string;
  name: string;
  messageText: string;
  targetType: string;
  targetListId?: string;
  status: string;
  totalRecipients: number;
  sentCount: number;
  deliveredCount: number;
  failedCount: number;
  estimatedCredits: number;
  creditsUsed: number;
  scheduledAt?: string;
  timezone?: string;
  sentAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

function formatStatus(status: string): string {
  switch (status) {
    case "draft":
      return colors.dim("Draft");
    case "scheduled":
      return colors.warning("Scheduled");
    case "sending":
      return colors.info("Sending");
    case "completed":
      return colors.success("Completed");
    case "cancelled":
      return colors.dim("Cancelled");
    case "failed":
      return colors.error("Failed");
    default:
      return status;
  }
}

export default class CampaignsGet extends AuthenticatedCommand {
  static description = "Get campaign details";

  static examples = [
    "<%= config.bin %> campaigns get cmp_xxx",
    "<%= config.bin %> campaigns get cmp_xxx --json",
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
    const { args } = await this.parse(CampaignsGet);

    const campaign = await apiClient.get<Campaign>(
      `/api/v1/campaigns/${args.id}`,
    );

    if (isJsonMode()) {
      json(campaign);
      return;
    }

    console.log();
    console.log(colors.bold(`Campaign: ${campaign.name}`));
    console.log();

    keyValue([
      ["ID", campaign.id],
      ["Status", formatStatus(campaign.status)],
      ["Recipients", String(campaign.totalRecipients)],
      ...(campaign.status === "completed" || campaign.status === "sending"
        ? [
            ["Sent", String(campaign.sentCount)] as [string, string],
            ["Delivered", colors.success(String(campaign.deliveredCount))] as [
              string,
              string,
            ],
            [
              "Failed",
              campaign.failedCount > 0
                ? colors.error(String(campaign.failedCount))
                : "0",
            ] as [string, string],
          ]
        : []),
      ["Estimated Credits", String(campaign.estimatedCredits)],
      ...(campaign.creditsUsed > 0
        ? [["Credits Used", String(campaign.creditsUsed)] as [string, string]]
        : []),
      ...(campaign.scheduledAt
        ? [
            [
              "Scheduled For",
              new Date(campaign.scheduledAt).toLocaleString(),
            ] as [string, string],
          ]
        : []),
      ...(campaign.timezone
        ? [["Timezone", campaign.timezone] as [string, string]]
        : []),
      ["Created", new Date(campaign.createdAt).toLocaleString()],
      ...(campaign.sentAt
        ? [
            ["Started", new Date(campaign.sentAt).toLocaleString()] as [
              string,
              string,
            ],
          ]
        : []),
      ...(campaign.completedAt
        ? [
            ["Completed", new Date(campaign.completedAt).toLocaleString()] as [
              string,
              string,
            ],
          ]
        : []),
    ]);

    console.log();
    console.log(colors.dim("Message:"));
    console.log(`  ${campaign.messageText}`);

    if (campaign.targetListId) {
      console.log();
      console.log(colors.dim("Contact List:"));
      console.log(`  ${campaign.targetListId}`);
    }
  }
}
