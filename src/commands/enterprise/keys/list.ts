import { Args } from "@oclif/core";
import { AuthenticatedCommand } from "../../../lib/base-command.js";
import { apiClient } from "../../../lib/api-client.js";
import {
  table,
  json,
  info,
  colors,
  isJsonMode,
  formatRelativeTime,
} from "../../../lib/output.js";

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  type: "test" | "live";
  isActive: boolean;
  lastUsedAt?: string;
  createdAt: string;
}

interface KeysResponse {
  keys: ApiKey[];
}

export default class EnterpriseKeysList extends AuthenticatedCommand {
  static description = "List API keys for an enterprise workspace";

  static examples = [
    "<%= config.bin %> enterprise keys list org_abc123",
    "<%= config.bin %> enterprise keys list org_abc123 --json",
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
    const { args } = await this.parse(EnterpriseKeysList);

    const response = await apiClient.get<KeysResponse>(
      `/api/v1/enterprise/workspaces/${encodeURIComponent(args.workspaceId)}/keys`,
    );

    if (isJsonMode()) {
      json(response.keys);
      return;
    }

    if (response.keys.length === 0) {
      info("No API keys found for this workspace");
      console.log();
      console.log(
        `  Create one with ${colors.code(`sendly enterprise keys create ${args.workspaceId}`)}`,
      );
      return;
    }

    console.log();
    table(response.keys, [
      { header: "Name", key: "name", width: 20 },
      {
        header: "Key ID",
        key: "id",
        width: 18,
        formatter: (v) => colors.dim(String(v).slice(0, 16)),
      },
      {
        header: "Prefix",
        key: "prefix",
        width: 16,
        formatter: (v) => colors.code(String(v)),
      },
      {
        header: "Type",
        key: "type",
        width: 8,
        formatter: (v) =>
          v === "test" ? colors.warning("test") : colors.success("live"),
      },
      {
        header: "Status",
        key: "isActive",
        width: 10,
        formatter: (v) =>
          v ? colors.success("active") : colors.error("revoked"),
      },
      {
        header: "Last Used",
        key: "lastUsedAt",
        width: 12,
        formatter: (v) =>
          v ? formatRelativeTime(String(v)) : colors.dim("never"),
      },
    ]);
  }
}
