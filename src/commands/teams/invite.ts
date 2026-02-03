import { Args, Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import { success, json, colors, isJsonMode } from "../../lib/output.js";
import { getCurrentOrg } from "../../lib/config.js";

interface InvitationResponse {
  id: string;
  email: string;
  role: string;
  status: string;
  expiresAt: string;
  createdAt: string;
}

export default class TeamsInvite extends AuthenticatedCommand {
  static description = "Invite a member to the current team";

  static examples = [
    "<%= config.bin %> teams invite user@example.com",
    "<%= config.bin %> teams invite user@example.com --role admin",
  ];

  static args = {
    email: Args.string({
      description: "Email address to invite",
      required: true,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    role: Flags.string({
      char: "r",
      description: "Role to assign (admin, member, viewer)",
      options: ["admin", "member", "viewer"],
      default: "member",
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(TeamsInvite);

    const org = getCurrentOrg();
    if (!org) {
      this.error(
        "No active team. Run 'sendly teams switch' to select one.",
      );
    }

    const response = await apiClient.post<InvitationResponse>(
      `/api/organizations/${org.id}/invitations`,
      {
        email: args.email,
        role: flags.role,
      },
    );

    if (isJsonMode()) {
      json(response);
      return;
    }

    success(`Invitation sent to ${colors.primary(args.email)}`, {
      Team: org.name,
      Role: flags.role!,
      Expires: new Date(response.expiresAt).toLocaleDateString(),
    });
  }
}
