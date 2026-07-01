import { Args, Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../../lib/base-command.js";
import { apiClient } from "../../../lib/api-client.js";
import {
  json,
  success,
  colors,
  isJsonMode,
  keyValue,
} from "../../../lib/output.js";

interface Assignment {
  id: string;
  campaignId: string;
  phoneNumber: string;
  status: string;
  assignedAt: string | null;
}

interface AssignResponse {
  data: Assignment;
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

export default class TendlcCampaignsAssign extends AuthenticatedCommand {
  static description =
    "Assign a phone number you own to an active campaign, making it sendable";

  static examples = [
    '<%= config.bin %> 10dlc campaigns assign cmp_xxx --number "+15551234567"',
    '<%= config.bin %> 10dlc campaigns assign cmp_xxx --number "+15551234567" --json',
  ];

  static args = {
    id: Args.string({
      description: "Campaign ID",
      required: true,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    number: Flags.string({
      char: "n",
      description: "Phone number to assign (E.164, must be on your account)",
      required: true,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(TendlcCampaignsAssign);

    const response = await apiClient.post<AssignResponse>(
      `/api/v1/tendlc/campaigns/${args.id}/assign`,
      { phoneNumber: flags.number },
    );

    if (isJsonMode()) {
      json(response);
      return;
    }

    const assignment = response.data;

    success(`Number assigned: ${assignment.phoneNumber}`);
    console.log();

    keyValue([
      ["Assignment", assignment.id],
      ["Campaign", assignment.campaignId],
      ["Status", formatAssignmentStatus(assignment.status)],
      ...(assignment.assignedAt
        ? [
            [
              "Assigned",
              new Date(assignment.assignedAt).toLocaleString(),
            ] as [string, string],
          ]
        : []),
    ]);

    console.log();
    console.log(
      colors.dim(
        `Send from it with: sendly sms send --to "+15559876543" --text "Hi!" --from "${assignment.phoneNumber}"`,
      ),
    );
  }
}
