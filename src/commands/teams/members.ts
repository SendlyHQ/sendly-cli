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

interface Member {
  id: string;
  userId: string;
  role: string;
  joinedAt: string;
  userName: string | null;
  userEmail: string | null;
}

export default class TeamsMembers extends AuthenticatedCommand {
  static description = "List members of the current team";

  static examples = [
    "<%= config.bin %> teams members",
    "<%= config.bin %> teams members --json",
  ];

  static flags = {
    ...AuthenticatedCommand.baseFlags,
  };

  async run(): Promise<void> {
    const org = getCurrentOrg();
    if (!org) {
      this.error(
        "No active team. Run 'sendly teams switch' to select one.",
      );
    }

    const members = await apiClient.get<Member[]>(
      `/api/organizations/${org.id}/members`,
    );

    if (isJsonMode()) {
      json(members);
      return;
    }

    if (members.length === 0) {
      info("No members found");
      return;
    }

    console.log();
    info(`${colors.primary(org.name)} — ${members.length} member${members.length === 1 ? "" : "s"}`);
    console.log();

    table(members, [
      {
        header: "Name",
        key: "userName",
        width: 22,
        formatter: (v) => String(v || "Unknown"),
      },
      {
        header: "Email",
        key: "userEmail",
        width: 28,
        formatter: (v) => (v ? colors.dim(String(v)) : colors.dim("-")),
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
        header: "Joined",
        key: "joinedAt",
        width: 14,
        formatter: (v) => (v ? formatRelativeTime(String(v)) : colors.dim("-")),
      },
    ]);
  }
}
