import { BaseCommand } from "../lib/base-command.js";
import { logout } from "../lib/auth.js";
import { success, info, warn } from "../lib/output.js";
import { isAuthenticated, getAuthToken } from "../lib/config.js";
import { apiClient } from "../lib/api-client.js";

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

    const token = getAuthToken();

    // Revoke token server-side first (if it's a CLI session token)
    if (token?.startsWith("cli_")) {
      try {
        await apiClient.post("/api/cli/auth/logout", {}, true);
      } catch {
        // Continue with local logout even if server revocation fails
        // This handles offline scenarios and ensures user can always logout
      }
    }

    // Clear local credentials
    logout();
    success("Logged out successfully");
  }
}
