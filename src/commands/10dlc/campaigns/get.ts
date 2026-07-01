import { Args } from "@oclif/core";
import { AuthenticatedCommand } from "../../../lib/base-command.js";
import { apiClient } from "../../../lib/api-client.js";
import {
  json,
  colors,
  formatStatus,
  isJsonMode,
  keyValue,
} from "../../../lib/output.js";

interface Campaign {
  id: string;
  brandId: string;
  useCase: string;
  subUseCases: string[];
  description: string | null;
  status: string;
  sampleMessages: string[];
  throughput: {
    tier: string;
    carriersReady: number;
  } | null;
  failureReasons: string[] | null;
  createdAt: string;
  updatedAt: string;
}

interface GetCampaignResponse {
  data: Campaign;
}

function formatCampaignStatus(status: string): string {
  switch (status) {
    case "suspended":
      return colors.warning(status);
    case "expired":
      return colors.dim(status);
    default:
      return formatStatus(status);
  }
}

export default class TendlcCampaignsGet extends AuthenticatedCommand {
  static description =
    "Get campaign details with the latest carrier-review status (run again to refresh)";

  static examples = [
    "<%= config.bin %> 10dlc campaigns get cmp_xxx",
    "<%= config.bin %> 10dlc campaigns get cmp_xxx --json",
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
    const { args } = await this.parse(TendlcCampaignsGet);

    const response = await apiClient.get<GetCampaignResponse>(
      `/api/v1/tendlc/campaigns/${args.id}`,
    );

    if (isJsonMode()) {
      json(response);
      return;
    }

    const campaign = response.data;

    console.log();
    console.log(colors.bold(`Campaign: ${campaign.useCase}`));
    console.log();

    keyValue([
      ["ID", campaign.id],
      ["Brand", campaign.brandId],
      ["Status", formatCampaignStatus(campaign.status)],
      ...(campaign.subUseCases.length > 0
        ? [["Sub use cases", campaign.subUseCases.join(", ")] as [string, string]]
        : []),
      ...(campaign.throughput
        ? [
            ["Throughput tier", campaign.throughput.tier] as [string, string],
            [
              "Carriers ready",
              String(campaign.throughput.carriersReady),
            ] as [string, string],
          ]
        : []),
      ["Created", new Date(campaign.createdAt).toLocaleString()],
      ["Updated", new Date(campaign.updatedAt).toLocaleString()],
    ]);

    if (campaign.description) {
      console.log();
      console.log(colors.dim("Description:"));
      console.log(`  ${campaign.description}`);
    }

    if (campaign.sampleMessages.length > 0) {
      console.log();
      console.log(colors.dim("Sample messages:"));
      campaign.sampleMessages.forEach((m) => console.log(`  - ${m}`));
    }

    if (campaign.failureReasons && campaign.failureReasons.length > 0) {
      console.log();
      console.log(colors.error("Failure reasons:"));
      campaign.failureReasons.forEach((r) => console.log(`  - ${r}`));
    }

    console.log();
    if (campaign.status === "pending") {
      console.log(
        colors.dim(
          "Carrier review is in progress — run this command again to refresh.",
        ),
      );
    } else if (campaign.status === "active") {
      console.log(
        colors.dim(
          `Assign a number with: sendly 10dlc campaigns assign ${campaign.id} --number "+15551234567"`,
        ),
      );
    }
  }
}
