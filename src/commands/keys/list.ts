import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import {
  table,
  json,
  info,
  formatStatus,
  formatRelativeTime,
  colors,
  isJsonMode,
} from "../../lib/output.js";

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  type: "test" | "live";
  scopes: string[];
  isActive: boolean;
  lastUsedAt?: string;
  createdAt: string;
  expiresAt?: string;
}

interface KeysResponse {
  keys: ApiKey[];
}

export default class KeysList extends AuthenticatedCommand {
  static description = "List your API keys";

  static examples = [
    "<%= config.bin %> keys list",
    "<%= config.bin %> keys list --json",
  ];

  static flags = {
    ...AuthenticatedCommand.baseFlags,
  };

  async run(): Promise<void> {
    const response = await apiClient.get<KeysResponse>("/api/v1/account/keys");
    const keys = response.keys;

    if (isJsonMode()) {
      json(keys);
      return;
    }

    if (keys.length === 0) {
      info("No API keys found");
      console.log();
      console.log(`  Create one with ${colors.code("sendly keys create")}`);
      return;
    }

    console.log();

    table(keys, [
      {
        header: "Name",
        key: "name",
        width: 20,
      },
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
