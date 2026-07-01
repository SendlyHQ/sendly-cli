import { AuthenticatedCommand } from "../../../lib/base-command.js";
import { apiClient } from "../../../lib/api-client.js";
import {
  table,
  json,
  info,
  formatRelativeTime,
  colors,
  isJsonMode,
} from "../../../lib/output.js";

interface Assignment {
  id: string;
  campaignId: string;
  phoneNumber: string;
  status: string;
  assignedAt: string | null;
}

interface ListAssignmentsResponse {
  data: Assignment[];
}

function formatAssignmentStatus(status: string): string {
  switch (status) {
    case "Active":
      return colors.success(status);
    case "Under review":
      return colors.warning(status);
    case "Action needed":
      return colors.error(status);
    default:
      return status;
  }
}

export default class TendlcAssignmentsList extends AuthenticatedCommand {
  static description = "List number-to-campaign assignments";

  static examples = [
    "<%= config.bin %> 10dlc assignments list",
    "<%= config.bin %> 10dlc assignments list --json",
  ];

  static flags = {
    ...AuthenticatedCommand.baseFlags,
  };

  async run(): Promise<void> {
    await this.parse(TendlcAssignmentsList);

    const response = await apiClient.get<ListAssignmentsResponse>(
      "/api/v1/tendlc/assignments",
    );

    if (isJsonMode()) {
      json(response);
      return;
    }

    if (!response.data || response.data.length === 0) {
      info(
        "No numbers assigned yet. Assign one with: sendly 10dlc campaigns assign <campaignId> --number <number>",
      );
      return;
    }

    console.log();
    console.log(colors.dim(`Showing ${response.data.length} assignments`));
    console.log();

    table(response.data, [
      {
        header: "Number",
        key: "phoneNumber",
        width: 18,
        formatter: (v) => colors.code(String(v)),
      },
      {
        header: "Campaign",
        key: "campaignId",
        width: 38,
        formatter: (v) => colors.dim(String(v)),
      },
      {
        header: "Status",
        key: "status",
        width: 14,
        formatter: (v) => formatAssignmentStatus(String(v)),
      },
      {
        header: "Assigned",
        key: "assignedAt",
        width: 12,
        formatter: (v) => (v ? formatRelativeTime(String(v)) : "-"),
      },
    ]);
  }
}
