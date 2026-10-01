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
  keyPrefix: string;
  type: "test" | "live";
  scopes?: string[];
  isActive?: boolean;
  lastUsedAt?: string | null;
  createdAt: string;
}

type KeysResponse = ApiKey[] | { keys?: ApiKey[] };

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

    const keys = Array.isArray(response) ? response : (response.keys ?? []);

    if (isJsonMode()) {
      json(keys);
      return;
    }

    if (keys.length === 0) {
      info("No API keys found for this workspace");
      console.log();
      console.log(
        `  Create one with ${colors.code(`sendly enterprise keys create ${args.workspaceId} --name "Production"`)}`,
      );
      return;
    }

    console.log();
    table(keys, [
      { header: "Name", key: "name", width: 20 },
      {
        header: "Key ID",
        key: "id",
        width: 18,
        formatter: (v) => colors.dim(String(v).slice(0, 16)),
      },
      {
        header: "Prefix",
        key: "keyPrefix",
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
          v === false ? colors.error("revoked") : colors.success("active"),
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
