import { Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import {
  success,
  json,
  colors,
  isJsonMode,
} from "../../lib/output.js";
import { setCurrentOrg } from "../../lib/config.js";
import { isCI } from "../../lib/config.js";

interface CreateOrgResponse {
  id: string;
  name: string;
  slug: string;
  description?: string;
  createdAt: string;
}

export default class TeamsCreate extends AuthenticatedCommand {
  static description = "Create a new team";

  static examples = [
    '<%= config.bin %> teams create --name "Acme Corp"',
    '<%= config.bin %> teams create --name "Acme Corp" --description "Our main team"',
  ];

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    name: Flags.string({
      char: "n",
      description: "Team name",
      required: true,
    }),
    description: Flags.string({
      char: "d",
      description: "Team description",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(TeamsCreate);

    const body: Record<string, unknown> = { name: flags.name };
    if (flags.description) body.description = flags.description;

    const response = await apiClient.post<CreateOrgResponse>(
      "/api/organizations",
      body,
    );

    if (isJsonMode()) {
      json(response);
      return;
    }

    success("Team created", {
      Name: response.name,
      ID: colors.dim(response.id),
      Slug: colors.dim(response.slug),
    });

    if (!isCI()) {
      const { default: inquirer } = await import("inquirer");
      const { switchNow } = await inquirer.prompt([
        {
          type: "confirm",
          name: "switchNow",
          message: "Switch to this team now?",
          default: true,
        },
      ]);

      if (switchNow) {
        setCurrentOrg(response.id, response.name, response.slug);
        console.log();
        success(`Switched to ${colors.primary(response.name)}`);
      }
    }
  }
}
