import { BaseCommand } from "../lib/base-command.js";
import { logout } from "../lib/auth.js";
import { success, info, warn, error, isJsonMode } from "../lib/output.js";
import { isAuthenticated, getStoredAccessToken } from "../lib/config.js";
import { apiClient, type SessionRevocation } from "../lib/api-client.js";

type ServerSignOut = SessionRevocation | { status: "none" };

function jsonFields(
  signOut: ServerSignOut,
): Record<string, unknown> | undefined {
  if (!isJsonMode()) return undefined;
  return {
    serverSignOut: signOut.status,
    ...("reason" in signOut && { reason: signOut.reason }),
  };
}

export default class Logout extends BaseCommand {
  static description = "Log out of Sendly";

  static examples = ["<%= config.bin %> logout"];

  static flags = {
    ...BaseCommand.baseFlags,
  };

  async run(): Promise<void> {
    if (!isAuthenticated()) {
      info("Not currently logged in");
      return;
    }

    const sessionToken = getStoredAccessToken();
    const signOut: ServerSignOut = sessionToken?.startsWith("cli_")
      ? await apiClient.revokeSession(sessionToken)
      : { status: "none" };

    if (signOut.status === "refused") {
      error(`Not logged out. ${signOut.reason}`, {
        ...jsonFields(signOut),
        hint: "Your local credentials were kept so this session can still be signed out on the server. Run 'sendly logout' again once the host is fixed.",
      });
      this.exit(1);
    }

    logout();

    if (signOut.status === "unconfirmed") {
      success("Logged out locally", jsonFields(signOut));
      warn(
        `Could not confirm the sign-out with the Sendly server: ${signOut.reason}. The session may stay valid on the server until it expires, and can be refreshed for up to 150 days after that. Your local copy has been removed.`,
      );
      return;
    }

    success("Logged out successfully", jsonFields(signOut));
  }
}
