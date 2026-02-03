import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import {
  table,
  json,
  info,
  colors,
  isJsonMode,
  formatRelativeTime,
} from "../../lib/output.js";
import { getCurrentOrg } from "../../lib/config.js";

interface Organization {
  id: string;
  name: string;
  slug: string;
  description?: string;
  isPersonal: boolean;
  role: string;
  memberCount?: number;
  createdAt: string;
}

export default class TeamsList extends AuthenticatedCommand {
  static description = "List your teams";

  static examples = [
    "<%= config.bin %> teams list",
    "<%= config.bin %> teams list --json",
  ];

  static flags = {
    ...AuthenticatedCommand.baseFlags,
  };

  async run(): Promise<void> {
    const orgs = await apiClient.get<Organization[]>("/api/organizations");

    if (isJsonMode()) {
      json(orgs);
      return;
    }

    if (orgs.length === 0) {
      info("No teams found");
      console.log();
      console.log(
        `  Create one with ${colors.code("sendly teams create --name \"My Team\"")}`,
      );
      return;
    }

    const currentOrg = getCurrentOrg();

    console.log();

    table(
      orgs.map((org) => ({
        ...org,
        isCurrent: currentOrg?.id === org.id,
      })),
      [
        {
          header: "",
          key: "isCurrent",
          width: 3,
          formatter: (v) => (v ? colors.primary("→") : " "),
        },
        {
          header: "Name",
          key: "name",
          width: 24,
        },
        {
          header: "Role",
          key: "role",
          width: 10,
          formatter: (v) => {
            const role = String(v);
            if (role === "owner") return colors.warning(role);
            if (role === "admin") return colors.info(role);
            return role;
          },
        },
        {
          header: "Members",
          key: "memberCount",
          width: 10,
          formatter: (v) => (v != null ? String(v) : colors.dim("-")),
        },
        {
          header: "Created",
          key: "createdAt",
          width: 14,
          formatter: (v) => (v ? formatRelativeTime(String(v)) : colors.dim("-")),
        },
      ],
    );
  }
}
