import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import {
  json,
  keyValue,
  table,
  colors,
  header,
  isJsonMode,
  formatCredits,
  formatStatus,
} from "../../lib/output.js";

interface EnterpriseWorkspace {
  id: string;
  name: string;
  slug: string;
  status: string;
  suspendedAt: string | null;
  verificationStatus: string | null;
  verificationType: string | null;
  tollFreeNumber: string | null;
  creditBalance: number;
  monthlyMessageQuota: number | null;
  messagesThisMonth: number;
}

interface EnterpriseAccount {
  id: string;
  maxWorkspaces: number;
  workspaceCount: number;
  workspaces: EnterpriseWorkspace[];
  metadata: { webhookUrl?: string } | null;
}

export default class EnterpriseStatus extends AuthenticatedCommand {
  static description = "Show enterprise account status";

  static examples = [
    "<%= config.bin %> enterprise status",
    "<%= config.bin %> enterprise status --json",
  ];

  static flags = {
    ...AuthenticatedCommand.baseFlags,
  };

  async run(): Promise<void> {
    const account = await apiClient.get<EnterpriseAccount>(
      "/api/v1/enterprise/account",
    );

    if (isJsonMode()) {
      json(account);
      return;
    }

    const workspaces = account.workspaces ?? [];
    const totalCredits = workspaces.reduce(
      (sum, workspace) => sum + Number(workspace.creditBalance || 0),
      0,
    );

    header("Enterprise Account");

    keyValue({
      "Account ID": colors.dim(account.id),
      Workspaces: `${account.workspaceCount} / ${account.maxWorkspaces}`,
      "Credits (all workspaces)": formatCredits(totalCredits),
      "Enterprise Webhook":
        account.metadata?.webhookUrl || colors.dim("not configured"),
    });

    if (workspaces.length > 0) {
      console.log();
      table(workspaces, [
        { header: "Workspace", key: "name", width: 24 },
        {
          header: "Status",
          key: "status",
          width: 12,
          formatter: (v) => formatStatus(String(v ?? "active")),
        },
        {
          header: "Verification",
          key: "verificationStatus",
          width: 14,
          formatter: (v) => (v ? formatStatus(String(v)) : colors.dim("none")),
        },
        {
          header: "Credits",
          key: "creditBalance",
          width: 12,
          formatter: (v) => Number(v ?? 0).toLocaleString(),
        },
      ]);
    }
  }
}
