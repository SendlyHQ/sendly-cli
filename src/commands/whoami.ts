import { BaseCommand } from "../lib/base-command.js";
import { getAuthInfo } from "../lib/auth.js";
import { apiClient } from "../lib/api-client.js";
import { success, info, keyValue, colors, json } from "../lib/output.js";
import { getConfigValue, getConfigPath, getCurrentOrg } from "../lib/config.js";

export default class Whoami extends BaseCommand {
  static description = "Show current authentication status";

  static examples = ["<%= config.bin %> whoami"];

  static flags = {
    ...BaseCommand.baseFlags,
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Whoami);

    const authInfo = await getAuthInfo();

    // Local config first (set by `sendly login` / `sendly teams switch`).
    // API-key-only users have no local org, so fall back to asking the server
    // which workspace the key is bound to — otherwise whoami shows nothing
    // and there is no self-serve way to learn the workspace ID.
    let org = getCurrentOrg();
    if (!org && authInfo.authenticated) {
      try {
        const account = await apiClient.get<{
          organization?: { id: string; name: string } | null;
        }>("/api/v1/account");
        if (account.organization) {
          org = {
            id: account.organization.id,
            name: account.organization.name,
            slug: "",
          };
        }
      } catch {
        // Offline or older server without the organization field — keep the
        // existing behavior of showing no team rather than failing whoami.
      }
    }

    if (flags.json) {
      json({
        authenticated: authInfo.authenticated,
        email: authInfo.email,
        userId: authInfo.userId,
        environment: authInfo.environment,
        keyType: authInfo.keyType,
        configPath: getConfigPath(),
        organization: org ? { id: org.id, name: org.name, slug: org.slug } : null,
      });
      return;
    }

    if (!authInfo.authenticated) {
      info("Not logged in");
      console.log();
      console.log(`  Run ${colors.code("sendly login")} to authenticate`);
      return;
    }

    success("Authenticated");
    console.log();

    const displayData: Record<string, string> = {};

    // Show API mode (test vs live) - this determines if messages are actually sent
    const mode = authInfo.keyType || authInfo.environment;
    displayData["API Mode"] =
      mode === "test"
        ? colors.warning("test") + colors.dim(" (sandbox - no real messages)")
        : colors.success("live") + colors.dim(" (production)");

    if (authInfo.email) {
      displayData["Email"] = authInfo.email;
    }

    if (authInfo.userId) {
      displayData["User ID"] = colors.dim(authInfo.userId);
    }

    // Show which server we're connected to
    const baseUrl = getConfigValue("baseUrl");
    if (baseUrl && baseUrl !== "https://sendly.live") {
      displayData["Server"] = colors.dim(baseUrl);
    }

    if (org) {
      displayData["Team"] = colors.primary(org.name) + colors.dim(` (${org.id})`);
    }

    displayData["Config"] = colors.dim(getConfigPath());

    keyValue(displayData);
  }
}
