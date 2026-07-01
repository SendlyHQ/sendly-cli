import { AuthenticatedCommand } from "../../../lib/base-command.js";
import { apiClient } from "../../../lib/api-client.js";
import {
  table,
  json,
  info,
  formatStatus,
  formatRelativeTime,
  colors,
  isJsonMode,
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

interface ListCampaignsResponse {
  data: Campaign[];
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

export default class TendlcCampaignsList extends AuthenticatedCommand {
  static description = "List the messaging campaigns registered for carrier review";

  static examples = [
    "<%= config.bin %> 10dlc campaigns list",
    "<%= config.bin %> 10dlc campaigns list --json",
  ];

  static flags = {
    ...AuthenticatedCommand.baseFlags,
  };

  async run(): Promise<void> {
    await this.parse(TendlcCampaignsList);

    const response = await apiClient.get<ListCampaignsResponse>(
      "/api/v1/tendlc/campaigns",
    );

    if (isJsonMode()) {
      json(response);
      return;
    }

    if (!response.data || response.data.length === 0) {
      info(
        "No campaigns yet. Create one with: sendly 10dlc campaigns create --brand <brandId> ...",
      );
      return;
    }

    console.log();
    console.log(colors.dim(`Showing ${response.data.length} campaigns`));
    console.log();

    table(response.data, [
      {
        header: "ID",
        key: "id",
        width: 38,
        formatter: (v) => colors.dim(String(v)),
      },
      {
        header: "Use case",
        key: "useCase",
        width: 22,
      },
      {
        header: "Status",
        key: "status",
        width: 11,
        formatter: (v) => formatCampaignStatus(String(v)),
      },
      {
        header: "Throughput",
        key: "throughput",
        width: 13,
        formatter: (v) =>
          v ? (v as Campaign["throughput"])!.tier : "-",
      },
      {
        header: "Created",
        key: "createdAt",
        width: 12,
        formatter: (v) => formatRelativeTime(String(v)),
      },
    ]);
  }
}
