import { Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import {
  success,
  warn,
  json,
  colors,
  codeBlock,
  isJsonMode,
} from "../../lib/output.js";

interface CreateKeyResponse {
  id: string;
  name: string;
  key: string; // Only returned on creation
  keyPrefix: string;
  type: "test" | "live";
  createdAt: string;
}

export default class KeysCreate extends AuthenticatedCommand {
  static description = "Create a new API key";

  static examples = [
    '<%= config.bin %> keys create --name "Production"',
    '<%= config.bin %> keys create --name "CI Testing" --type test',
    '<%= config.bin %> keys create --name "Backend" --type live --json',
  ];

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
      default: "test",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(KeysCreate);

    const response = await apiClient.post<CreateKeyResponse>(
      "/api/v1/account/keys",
      {
        name: flags.name,
        type: flags.type,
      },
      true,
      { preferSession: flags.type === "live" },
    );

    if (isJsonMode()) {
      json(response);
      return;
    }

    success("API key created", {
      Name: response.name,
      "Key ID": response.id,
      Type:
        flags.type === "test" ? colors.warning("test") : colors.success("live"),
    });

    console.log();
    warn("Copy your API key now. You won't be able to see it again!");
    codeBlock(response.key);

    console.log(
      colors.dim(
        "Store this key securely. It provides access to your Sendly account.",
      ),
    );
  }
}
