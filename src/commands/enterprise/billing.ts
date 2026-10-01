import { Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import {
  json,
  table,
  colors,
  header,
  isJsonMode,
  formatCredits,
} from "../../lib/output.js";

interface WorkspaceBillingItem {
  id: string;
  name: string;
  creditsUsed: number;
  creditsPurchased: number;
  creditsTransferredIn: number;
  creditsTransferredOut: number;
  messagesSent: number;
  messagesDelivered: number;
  workspaceFee: number;
  included: boolean;
  allocatedPlatformFee: number;
  totalCost: number;
}

interface BillingBreakdown {
  period: string;
  includedWorkspaces: number;
  summary: {
    platformFee: number;
    totalWorkspaceFees: number;
    totalCreditsUsed: number;
    totalCost: number;
  };
  workspaces: WorkspaceBillingItem[];
}

function dollars(cents: number | undefined): string {
  return `$${(Number(cents ?? 0) / 100).toFixed(2)}`;
}

export default class EnterpriseBilling extends AuthenticatedCommand {
  static description = "Get billing breakdown by workspace";

  static examples = [
    "<%= config.bin %> enterprise billing",
    "<%= config.bin %> enterprise billing --page 2",
    "<%= config.bin %> enterprise billing --period 90d",
    "<%= config.bin %> enterprise billing --json",
  ];

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    page: Flags.integer({
      description: "Page number",
      default: 1,
    }),
    limit: Flags.integer({
      description: "Results per page",
      default: 20,
    }),
    period: Flags.string({
      description:
        "Period the credits and messages cover (7d, 30d, 90d). Defaults to 30d",
      options: ["7d", "30d", "90d"],
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(EnterpriseBilling);

    const response = await apiClient.get<BillingBreakdown>(
      "/api/v1/enterprise/billing/workspace-breakdown",
      { page: flags.page, limit: flags.limit, period: flags.period },
    );

    if (isJsonMode()) {
      json(response);
      return;
    }

    const summary = response.summary;
    const workspaces = response.workspaces ?? [];

    header(`Billing Breakdown (${response.period ?? flags.period ?? "30d"})`);

    console.log();
    console.log(
      `  ${colors.dim("Platform Fee:")}    ${dollars(summary?.platformFee)}/mo`,
    );
    console.log(
      `  ${colors.dim("Workspace Fees:")}  ${dollars(summary?.totalWorkspaceFees)}/mo`,
    );
    console.log(
      `  ${colors.dim("Credits Used:")}    ${formatCredits(summary?.totalCreditsUsed ?? 0)}`,
    );
    console.log(
      `  ${colors.bold("Total:")}           ${colors.primary(dollars(summary?.totalCost))}`,
    );
    console.log();

    table(workspaces, [
      { header: "Workspace", key: "name", width: 24 },
      {
        header: "Seat Fee",
        key: "workspaceFee",
        width: 10,
        formatter: (v, row) =>
          row?.included ? colors.dim("included") : dollars(Number(v)),
      },
      {
        header: "Credits Bought",
        key: "creditsPurchased",
        width: 14,
        formatter: (v) => Number(v ?? 0).toLocaleString(),
      },
      {
        header: "Credits Used",
        key: "creditsUsed",
        width: 12,
        formatter: (v) => Number(v ?? 0).toLocaleString(),
      },
      {
        header: "Messages",
        key: "messagesSent",
        width: 10,
        formatter: (v) => Number(v ?? 0).toLocaleString(),
      },
    ]);

    if (workspaces.length > 0 && workspaces.length === flags.limit) {
      console.log();
      console.log(
        colors.dim(
          `  Page ${flags.page}. Use --page ${flags.page + 1} to see more.`,
        ),
      );
    }
  }
}
