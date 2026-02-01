import { Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import {
  table,
  json,
  info,
  formatRelativeTime,
  colors,
  isJsonMode,
} from "../../lib/output.js";

interface Campaign {
  id: string;
  name: string;
  messageText: string;
  status: string;
  totalRecipients: number;
  sentCount: number;
  deliveredCount: number;
  failedCount: number;
  estimatedCredits: number;
  scheduledAt?: string;
  createdAt: string;
}

interface ListCampaignsResponse {
  campaigns: Campaign[];
  total: number;
  limit: number;
  offset: number;
}

function formatCampaignStatus(status: string): string {
  switch (status) {
    case "draft":
      return colors.dim("draft");
    case "scheduled":
      return colors.warning("scheduled");
    case "sending":
      return colors.info("sending");
    case "completed":
      return colors.success("completed");
    case "cancelled":
      return colors.dim("cancelled");
    case "failed":
      return colors.error("failed");
    default:
      return status;
  }
}

export default class CampaignsList extends AuthenticatedCommand {
  static description = "List campaigns";

  static examples = [
    "<%= config.bin %> campaigns list",
    "<%= config.bin %> campaigns list --status draft",
    "<%= config.bin %> campaigns list --limit 10",
    "<%= config.bin %> campaigns list --json",
  ];

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    limit: Flags.integer({
      char: "l",
      description: "Number of campaigns to show",
      default: 20,
    }),
    offset: Flags.integer({
      description: "Offset for pagination",
      default: 0,
    }),
    status: Flags.string({
      char: "s",
      description:
        "Filter by status (draft, scheduled, sending, sent, cancelled)",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(CampaignsList);

    const response = await apiClient.get<ListCampaignsResponse>(
      "/api/v1/campaigns",
      {
        limit: flags.limit,
        offset: flags.offset,
        ...(flags.status && { status: flags.status }),
      },
    );

    if (isJsonMode()) {
      json(response);
      return;
    }

    if (response.campaigns.length === 0) {
      info("No campaigns found");
      return;
    }

    console.log();
    console.log(
      colors.dim(
        `Showing ${response.campaigns.length} of ${response.total} campaigns`,
      ),
    );
    console.log();

    table(response.campaigns, [
      {
        header: "ID",
        key: "id",
        width: 18,
        formatter: (v) => colors.dim(String(v).slice(0, 15) + "..."),
      },
      {
        header: "Name",
        key: "name",
        width: 20,
        formatter: (v) => {
          const name = String(v);
          return name.length > 18 ? name.slice(0, 18) + "..." : name;
        },
      },
      {
        header: "Status",
        key: "status",
        width: 11,
        formatter: (v) => formatCampaignStatus(String(v)),
      },
      {
        header: "Recipients",
        key: "totalRecipients",
        width: 11,
        formatter: (v) => String(v),
      },
      {
        header: "Delivered",
        key: "deliveredCount",
        width: 10,
        formatter: (v, row) => {
          const campaign = row as Campaign;
          if (
            campaign.status === "completed" ||
            campaign.status === "sending"
          ) {
            return `${v}/${campaign.totalRecipients}`;
          }
          return "-";
        },
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
