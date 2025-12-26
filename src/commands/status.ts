import { AuthenticatedCommand } from "../lib/base-command.js";
import { apiClient } from "../lib/api-client.js";
import { colors, json, isJsonMode, formatRelativeTime } from "../lib/output.js";
import { getConfigValue } from "../lib/config.js";

interface AccountStatusResponse {
  account: {
    email: string;
    tier: "sandbox" | "international" | "domestic" | "global";
    onboardingCompleted: boolean;
  };
  verification: {
    type: string | null;
    status: string | null;
    isVerified: boolean;
    alphaSenderId: string | null;
    tollFreeNumber: string | null;
    businessName: string | null;
  } | null;
  capabilities: {
    canSendSandbox: boolean;
    canSendInternational: boolean;
    canSendDomestic: boolean;
    regions: string[];
  };
  credits: {
    balance: number;
    canSendLive: boolean;
  };
  keys: {
    hasTestKey: boolean;
    hasLiveKey: boolean;
    totalActive: number;
  };
  nextSteps: string[];
}

export default class Status extends AuthenticatedCommand {
  static description =
    "Show account status dashboard with credits, usage, and capabilities";

  static examples = [
    "<%= config.bin %> status",
    "<%= config.bin %> status --json",
  ];

  static flags = {
    ...AuthenticatedCommand.baseFlags,
  };

  async run(): Promise<void> {
    // Fetch comprehensive account status
    const status = await apiClient
      .get<AccountStatusResponse>("/api/cli/account/status")
      .catch(() => null);

    // Fallback data if new endpoint not available
    const [credits, messages, webhooks, keys] = await Promise.all([
      apiClient
        .get<{
          balance: number;
          reservedBalance: number;
          availableBalance: number;
        }>("/api/v1/account/credits")
        .catch(() => ({ balance: 0, reservedBalance: 0, availableBalance: 0 })),
      apiClient
        .get<{ messages: any[]; total: number }>("/api/v1/messages", {
          limit: 5,
        })
        .catch(() => ({ messages: [], total: 0 })),
      apiClient.get<any[]>("/api/v1/webhooks").catch(() => []),
      apiClient
        .get<{ keys: any[] }>("/api/v1/account/keys")
        .catch(() => ({ keys: [] })),
    ]);

    const email =
      status?.account?.email || getConfigValue("email") || "Unknown";
    const apiMode = getConfigValue("environment") || "test";

    if (isJsonMode()) {
      json({
        account: status?.account || { email, tier: "sandbox" },
        verification: status?.verification || null,
        capabilities: status?.capabilities || { regions: ["sandbox"] },
        credits: status?.credits || {
          balance: credits.balance,
          canSendLive: false,
        },
        keys: status?.keys || {
          hasTestKey: false,
          hasLiveKey: false,
          totalActive: keys.keys?.filter((k: any) => k.isActive).length || 0,
        },
        nextSteps: status?.nextSteps || [],
      });
      return;
    }

    // Beautiful dashboard output
    console.log();
    console.log(colors.bold(colors.primary("  Sendly Account Status")));
    console.log(colors.dim("  " + "─".repeat(50)));
    console.log();

    // Account & Tier Section
    console.log(colors.bold("  Account"));
    console.log(`    ${colors.dim("Email:")}         ${email}`);

    // Show tier with color coding
    const tier = status?.account?.tier || "sandbox";
    const tierDisplay = {
      sandbox: colors.warning("Sandbox") + colors.dim(" (test only)"),
      international:
        colors.primary("International") + colors.dim(" (48 countries)"),
      domestic: colors.success("US & Canada") + colors.dim(" (toll-free)"),
      global: colors.success("Global") + colors.dim(" (full access)"),
    };
    console.log(`    ${colors.dim("Tier:")}          ${tierDisplay[tier]}`);
    console.log();

    // Verification Section
    if (status?.verification) {
      console.log(colors.bold("  Verification"));
      const v = status.verification;

      // Status with color
      const statusColors: Record<string, (s: string) => string> = {
        approved: colors.success,
        verified: colors.success,
        pending: colors.warning,
        in_progress: colors.warning,
        rejected: colors.error,
      };
      const statusColor = statusColors[v.status || ""] || colors.dim;
      console.log(
        `    ${colors.dim("Status:")}        ${statusColor(v.status || "unknown")}`,
      );

      // Type
      const typeLabels: Record<string, string> = {
        toll_free: "Toll-Free (US/CA)",
        international: "International",
        both: "Global (US/CA + Intl)",
      };
      console.log(
        `    ${colors.dim("Type:")}          ${typeLabels[v.type || ""] || v.type}`,
      );

      // Show sender ID or toll-free number
      if (v.alphaSenderId) {
        console.log(
          `    ${colors.dim("Sender ID:")}     ${colors.primary(v.alphaSenderId)}`,
        );
      }
      if (v.tollFreeNumber) {
        console.log(
          `    ${colors.dim("Toll-Free:")}     ${colors.primary(v.tollFreeNumber)}`,
        );
      }
      console.log();
    }

    // Capabilities Section
    console.log(colors.bold("  Send Capabilities"));
    const caps = status?.capabilities || {
      canSendSandbox: true,
      canSendInternational: false,
      canSendDomestic: false,
    };

    // Sandbox
    const sandboxIcon = caps.canSendSandbox
      ? colors.success("✓")
      : colors.dim("○");
    console.log(
      `    ${sandboxIcon} ${colors.dim("Sandbox")}        Test numbers only`,
    );

    // International
    const intlIcon = caps.canSendInternational
      ? colors.success("✓")
      : colors.dim("○");
    const intlLabel = caps.canSendInternational
      ? "48 countries"
      : colors.dim("Upgrade to unlock");
    console.log(`    ${intlIcon} ${colors.dim("International")}  ${intlLabel}`);

    // US & Canada
    const usIcon = caps.canSendDomestic ? colors.success("✓") : colors.dim("○");
    const usLabel = caps.canSendDomestic
      ? "Two-way messaging"
      : colors.dim("Upgrade to unlock");
    console.log(`    ${usIcon} ${colors.dim("US & Canada")}    ${usLabel}`);
    console.log();

    // Credits Section
    const creditBalance = status?.credits?.balance ?? credits.balance ?? 0;
    console.log(colors.bold("  Credits"));
    const creditColor =
      creditBalance > 100
        ? colors.success
        : creditBalance > 10
          ? colors.warning
          : colors.error;
    console.log(
      `    ${colors.dim("Balance:")}       ${creditColor(creditBalance.toLocaleString())} credits`,
    );
    if (credits.reservedBalance > 0) {
      console.log(
        `    ${colors.dim("Reserved:")}      ${colors.warning(credits.reservedBalance.toLocaleString())} credits`,
      );
    }
    console.log();

    // Resources Section
    const activeKeys =
      status?.keys?.totalActive ??
      keys.keys?.filter((k: any) => k.isActive).length ??
      0;
    const activeWebhooks = webhooks.filter((w: any) => w.is_active).length;
    console.log(colors.bold("  Resources"));
    console.log(`    ${colors.dim("API Keys:")}      ${activeKeys} active`);
    console.log(
      `    ${colors.dim("Webhooks:")}      ${activeWebhooks} configured`,
    );
    console.log();

    // Recent Activity
    if (messages.messages && messages.messages.length > 0) {
      console.log(colors.bold("  Recent Messages"));
      messages.messages.slice(0, 3).forEach((msg: any) => {
        const msgStatus = msg.status || "unknown";
        const statusIcon =
          msgStatus === "delivered"
            ? colors.success("✓")
            : msgStatus === "sent"
              ? colors.primary("→")
              : msgStatus === "failed"
                ? colors.error("✗")
                : colors.dim("○");
        const to = msg.to || "Unknown";
        const time = msg.createdAt
          ? formatRelativeTime(msg.createdAt)
          : "recently";
        console.log(
          `    ${statusIcon} ${colors.dim(to.slice(-4).padStart(8, "•"))} ${colors.dim(msgStatus.padEnd(10))} ${colors.dim(time)}`,
        );
      });
      console.log();
    }

    // Next Steps (if any)
    if (status?.nextSteps && status.nextSteps.length > 0) {
      console.log(colors.bold(colors.warning("  Next Steps")));
      status.nextSteps.forEach((step, i) => {
        console.log(`    ${colors.warning(`${i + 1}.`)} ${step}`);
      });
      console.log();
    }

    // Quick Actions
    console.log(colors.dim("  Quick Actions"));
    console.log(`    ${colors.code("sendly sms send")}      Send a message`);
    console.log(`    ${colors.code("sendly keys list")}     View API keys`);
    if (tier === "sandbox") {
      console.log(
        `    ${colors.code("sendly onboarding")}    Upgrade to production`,
      );
    }
    console.log();
  }
}
