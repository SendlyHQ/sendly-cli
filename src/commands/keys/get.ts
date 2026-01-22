import { Args } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import {
  success,
  json,
  formatRelativeTime,
  colors,
  isJsonMode,
} from "../../lib/output.js";

interface ApiKeyResponse {
  id: string;
  name: string;
  prefix: string;
  type: "test" | "live";
  scopes: string[];
  isActive: boolean;
  lastUsedAt?: string;
  createdAt: string;
  expiresAt?: string;
  revokedAt?: string;
}

export default class KeysGet extends AuthenticatedCommand {
  static description = "Get details of a specific API key";

  static examples = [
    "<%= config.bin %> keys get KEY_ID",
    "<%= config.bin %> keys get KEY_ID --json",
  ];

  static args = {
    id: Args.string({
      description: "API key ID",
      required: true,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
  };

  async run(): Promise<void> {
    const { args } = await this.parse(KeysGet);

    const response = await apiClient.get<ApiKeyResponse>(
      `/api/v1/account/keys/${args.id}`,
    );

    if (isJsonMode()) {
      json(response);
      return;
    }

    const typeDisplay =
      response.type === "test"
        ? colors.warning("test")
        : colors.success("live");

    const statusDisplay = response.isActive
      ? colors.success("active")
      : colors.error("revoked");

    success("API Key Details", {
      ID: response.id,
      Name: response.name,
      Prefix: colors.code(response.prefix),
      Type: typeDisplay,
      Status: statusDisplay,
      Scopes: response.scopes.length > 0 ? response.scopes.join(", ") : "all",
      Created: formatRelativeTime(response.createdAt),
      "Last Used": response.lastUsedAt
        ? formatRelativeTime(response.lastUsedAt)
        : colors.dim("never"),
      ...(response.expiresAt && {
        Expires: formatRelativeTime(response.expiresAt),
      }),
      ...(response.revokedAt && {
        "Revoked At": formatRelativeTime(response.revokedAt),
      }),
    });
  }
}
