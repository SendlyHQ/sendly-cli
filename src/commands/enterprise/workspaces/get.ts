import { Args } from "@oclif/core";
import { AuthenticatedCommand } from "../../../lib/base-command.js";
import { apiClient } from "../../../lib/api-client.js";
import {
  json,
  keyValue,
  colors,
  header,
  isJsonMode,
  formatDate,
  formatCredits,
} from "../../../lib/output.js";

interface WorkspaceDetail {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  verification: {
    status: string;
    type: string | null;
    tollFreeNumber: string | null;
    businessName: string | null;
  } | null;
  creditBalance: number;
  keyCount: number;
  messages30d: number;
  delivered30d: number;
  failed30d: number;
  deliveryRate: number;
}

export default class WorkspacesGet extends AuthenticatedCommand {
  static description = "Get details of an enterprise workspace";

  static examples = [
    "<%= config.bin %> enterprise workspaces get org_abc123",
    "<%= config.bin %> enterprise workspaces get org_abc123 --json",
  ];

  static args = {
    workspaceId: Args.string({
      description: "Workspace ID",
      required: true,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
  };

  async run(): Promise<void> {
    const { args } = await this.parse(WorkspacesGet);

    const workspace = await apiClient.get<WorkspaceDetail>(
      `/api/v1/enterprise/workspaces/${encodeURIComponent(args.workspaceId)}`,
    );

    if (isJsonMode()) {
      json(workspace);
      return;
    }

    header(`Workspace: ${workspace.name}`);

    const verificationStatus = workspace.verification?.status || "unverified";

    keyValue({
      ID: colors.dim(workspace.id),
      Name: workspace.name,
      Slug: workspace.slug,
      Verification:
        verificationStatus === "approved"
          ? colors.success("verified")
          : verificationStatus === "pending"
            ? colors.warning("pending")
            : colors.dim(verificationStatus),
      Phone: workspace.verification?.tollFreeNumber || colors.dim("not assigned"),
      Business: workspace.verification?.businessName || colors.dim("n/a"),
      Credits: formatCredits(workspace.creditBalance),
      "API Keys": String(workspace.keyCount),
      "Messages (30d)": workspace.messages30d.toLocaleString(),
      "Delivered (30d)": workspace.delivered30d.toLocaleString(),
      "Delivery Rate":
        workspace.messages30d > 0
          ? `${workspace.deliveryRate.toFixed(1)}%`
          : colors.dim("n/a"),
      Created: formatDate(workspace.createdAt),
    });
  }
}
