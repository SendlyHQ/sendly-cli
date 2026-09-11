import { Args, Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../../lib/base-command.js";
import { apiClient } from "../../../lib/api-client.js";
import {
  success,
  warn,
  json,
  colors,
  codeBlock,
  isJsonMode,
} from "../../../lib/output.js";

interface CreateKeyResponse {
  id: string;
  name: string;
  key: string;
  keyPrefix: string;
  type: "test" | "live";
  createdAt: string;
}

export default class EnterpriseKeysCreate extends AuthenticatedCommand {
  static description = "Create an API key for an enterprise workspace";

  static examples = [
    '<%= config.bin %> enterprise keys create org_abc123 --name "Production"',
    '<%= config.bin %> enterprise keys create org_abc123 --name "CI" --type test',
  ];

  static args = {
    workspaceId: Args.string({
      description: "Workspace ID",
      required: true,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    name: Flags.string({
      char: "n",
      description: "Name for the API key",
      required: true,
    }),
    type: Flags.string({
      char: "t",
      description: "Key type (test or live)",
      options: ["test", "live"],
      default: "live",
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(EnterpriseKeysCreate);

    const response = await apiClient.post<CreateKeyResponse>(
      `/api/v1/enterprise/workspaces/${encodeURIComponent(args.workspaceId)}/keys`,
      {
        name: flags.name,
        type: flags.type,
      },
    );

    if (isJsonMode()) {
      json(response);
      return;
    }

    success("API key created", {
      Name: response.name,
      "Key ID": response.id,
      Type:
        flags.type === "test"
          ? colors.warning("test")
          : colors.success("live"),
    });

    console.log();
    warn("Copy your API key now. You won't be able to see it again!");
    codeBlock(response.key);
  }
}
