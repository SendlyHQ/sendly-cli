/**
 * Sendly Doctor Command
 * Diagnoses CLI setup and connectivity issues
 */

import { BaseCommand } from "../lib/base-command.js";
import {
  isAuthenticated,
  getAuthToken,
  getConfigPath,
  getConfigDir,
  resolveBaseUrlSafe,
  isCI,
  isColorDisabled,
  type BaseUrlResolution,
} from "../lib/config.js";
import { success, error, warn, info, json, colors } from "../lib/output.js";
import * as fs from "node:fs";
import * as path from "node:path";

interface DiagnosticResult {
  name: string;
  status: "ok" | "warning" | "error";
  message: string;
  details?: string;
}

interface DoctorReport {
  timestamp: string;
  version: string;
  results: DiagnosticResult[];
  summary: {
    passed: number;
    warnings: number;
    errors: number;
  };
}

export default class Doctor extends BaseCommand {
  static description = "Diagnose CLI setup and connectivity issues";

  static examples = [
    "<%= config.bin %> doctor",
    "<%= config.bin %> doctor --json",
  ];

  static flags = {
    ...BaseCommand.baseFlags,
  };

  private results: DiagnosticResult[] = [];
  private baseUrl: BaseUrlResolution = { url: "", source: "" };

  async run(): Promise<void> {
    const { flags } = await this.parse(Doctor);

    if (!flags.json) {
      console.log();
      console.log(colors.primary("Sendly CLI Diagnostics"));
      console.log();
    }

    // Run all diagnostics
    await this.checkApiKey();
    await this.checkBaseUrl();
    await this.checkNetwork();
    await this.checkClockSkew();
    await this.checkCredits();
    await this.checkEnvironment();
    await this.checkConfig();
    await this.checkAiAgents();

    // Generate report
    const report = this.generateReport();

    if (flags.json) {
      json(report);
      return;
    }

    // Print summary
    console.log();
    if (report.summary.errors > 0) {
      error(
        `${report.summary.errors} issue(s) found. Please resolve before using the CLI.`,
      );
      this.exit(1);
    } else if (report.summary.warnings > 0) {
      warn(
        `${report.summary.warnings} warning(s). CLI should work but may have issues.`,
      );
    } else {
      success("All systems operational!");
    }
  }

  /**
   * The host every network check will use, resolved once. An unusable value
   * is the single failure reported here; the checks that depend on it are
   * skipped rather than each restating the same problem.
   */
  private async checkBaseUrl(): Promise<void> {
    this.baseUrl = resolveBaseUrlSafe();

    if (this.baseUrl.error) {
      this.addResult({
        name: "Base URL",
        status: "error",
        message: "Unusable API base URL",
        details: this.baseUrl.error,
      });
      return;
    }

    this.addResult({
      name: "Base URL",
      status: "ok",
      message: `${this.baseUrl.url} (from ${this.baseUrl.source})`,
    });
  }

  /**
   * The host for a network check, or null when the base URL is unusable — in
   * which case the check records itself as skipped so the rest still run.
   */
  private resolveHost(checkName: string): string | null {
    if (this.baseUrl.error) {
      this.addResult({
        name: checkName,
        status: "warning",
        message: "Skipped (API base URL is unusable)",
        details: "See the Base URL check above",
      });
      return null;
    }
    return this.baseUrl.url;
  }

  private addResult(result: DiagnosticResult): void {
    this.results.push(result);

    // Print result immediately (unless in JSON mode)
    const { flags } = this as any;
    if (flags?.json) return;

    const icon =
      result.status === "ok"
        ? colors.success("\u2714")
        : result.status === "warning"
          ? colors.warning("\u26A0")
          : colors.error("\u2718");

    console.log(`${icon} ${result.name}: ${result.message}`);
    if (result.details) {
      console.log(colors.dim(`   ${result.details}`));
    }
  }

  private async checkApiKey(): Promise<void> {
    const token = getAuthToken();
    const fromEnv = !!process.env.SENDLY_API_KEY;

    if (!token) {
      this.addResult({
        name: "API Key",
        status: "error",
        message: "Not configured",
        details:
          "Run 'sendly login' or set SENDLY_API_KEY environment variable",
      });
      return;
    }

    // Check key format
    const isTestKey = token.startsWith("sk_test_");
    const isLiveKey = token.startsWith("sk_live_");

    if (!isTestKey && !isLiveKey) {
      this.addResult({
        name: "API Key",
        status: "error",
        message: "Invalid format",
        details: "API key should start with sk_test_ or sk_live_",
      });
      return;
    }

    const keyType = isTestKey ? "test" : "live";
    const source = fromEnv ? "environment variable" : "config file";

    this.addResult({
      name: "API Key",
      status: "ok",
      message: `Valid (${keyType} mode, from ${source})`,
    });
  }

  private async checkNetwork(): Promise<void> {
    const baseUrl = this.resolveHost("Network");
    if (!baseUrl) return;
    const startTime = Date.now();

    try {
      const response = await fetch(`${baseUrl}/health`, {
        method: "GET",
        signal: AbortSignal.timeout(10000),
      });

      const latency = Date.now() - startTime;

      if (response.ok) {
        this.addResult({
          name: "Network",
          status: "ok",
          message: `Connected to ${new URL(baseUrl).host} (${latency}ms)`,
        });
      } else {
        this.addResult({
          name: "Network",
          status: "warning",
          message: `API returned ${response.status}`,
          details: `Endpoint: ${baseUrl}/health`,
        });
      }
    } catch (err: any) {
      this.addResult({
        name: "Network",
        status: "error",
        message: "Cannot reach API",
        details: err.message || "Check your internet connection",
      });
    }
  }

  private async checkClockSkew(): Promise<void> {
    const baseUrl = this.resolveHost("Clock");
    if (!baseUrl) return;

    try {
      const response = await fetch(`${baseUrl}/health`, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      });

      const serverDate = response.headers.get("date");
      if (!serverDate) {
        this.addResult({
          name: "Clock",
          status: "warning",
          message: "Could not verify (no server date header)",
        });
        return;
      }

      const serverTime = new Date(serverDate).getTime();
      const localTime = Date.now();
      const skewSeconds = Math.abs(serverTime - localTime) / 1000;

      if (skewSeconds > 300) {
        // 5 minutes
        this.addResult({
          name: "Clock",
          status: "error",
          message: `Significant drift detected (${skewSeconds.toFixed(0)}s)`,
          details: "This may cause webhook signature verification to fail",
        });
      } else if (skewSeconds > 30) {
        this.addResult({
          name: "Clock",
          status: "warning",
          message: `Minor drift detected (${skewSeconds.toFixed(1)}s)`,
        });
      } else {
        this.addResult({
          name: "Clock",
          status: "ok",
          message: `Synchronized (drift: ${skewSeconds.toFixed(1)}s)`,
        });
      }
    } catch {
      this.addResult({
        name: "Clock",
        status: "warning",
        message: "Could not verify (network error)",
      });
    }
  }

  private async checkCredits(): Promise<void> {
    if (!isAuthenticated()) {
      this.addResult({
        name: "Credits",
        status: "warning",
        message: "Cannot check (not authenticated)",
      });
      return;
    }

    const baseUrl = this.resolveHost("Credits");
    if (!baseUrl) return;
    const token = getAuthToken();

    try {
      const response = await fetch(`${baseUrl}/api/v1/account/credits`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(10000),
      });

      if (response.ok) {
        const data = (await response.json()) as { balance?: string };
        const balance = parseFloat(data.balance || "0");

        if (balance === 0) {
          this.addResult({
            name: "Credits",
            status: "warning",
            message: "0 available",
            details: "Add credits to send messages",
          });
        } else {
          this.addResult({
            name: "Credits",
            status: "ok",
            message: `${balance.toLocaleString()} available`,
          });
        }
      } else if (response.status === 401) {
        this.addResult({
          name: "Credits",
          status: "error",
          message: "API key invalid or expired",
        });
      } else {
        this.addResult({
          name: "Credits",
          status: "warning",
          message: `Could not fetch (HTTP ${response.status})`,
        });
      }
    } catch (err: any) {
      this.addResult({
        name: "Credits",
        status: "warning",
        message: "Could not fetch",
        details: err.message,
      });
    }
  }

  private async checkEnvironment(): Promise<void> {
    const checks: string[] = [];

    if (isCI()) {
      checks.push("CI mode detected");
    }

    if (isColorDisabled()) {
      checks.push("color disabled");
    }

    if (process.env.SENDLY_API_KEY) {
      checks.push("using SENDLY_API_KEY env var");
    }

    this.addResult({
      name: "Environment",
      status: "ok",
      message: checks.length > 0 ? checks.join(", ") : "Standard terminal mode",
    });
  }

  private async checkConfig(): Promise<void> {
    const configPath = getConfigPath();
    const configDir = getConfigDir();

    // Check if config directory exists
    if (!fs.existsSync(configDir)) {
      this.addResult({
        name: "Config",
        status: "warning",
        message: "Config directory not found",
        details: `Expected: ${configDir}`,
      });
      return;
    }

    // Check if config file exists
    if (!fs.existsSync(configPath)) {
      this.addResult({
        name: "Config",
        status: "warning",
        message: "Config file not found (using defaults)",
        details: configPath,
      });
      return;
    }

    // Check file permissions (should be readable only by owner)
    try {
      const stats = fs.statSync(configPath);
      const mode = stats.mode & 0o777;

      if (mode & 0o077) {
        // Group or others have access
        this.addResult({
          name: "Config",
          status: "warning",
          message: "Config file has loose permissions",
          details: `${configPath} (mode: ${mode.toString(8)})`,
        });
      } else {
        this.addResult({
          name: "Config",
          status: "ok",
          message: configPath,
        });
      }
    } catch {
      this.addResult({
        name: "Config",
        status: "ok",
        message: configPath,
      });
    }
  }

  private async checkAiAgents(): Promise<void> {
    const detected: string[] = [];
    const home = process.env.HOME || process.env.USERPROFILE || "";

    const checks = [
      { name: "Cursor", paths: [path.join(home, ".cursor")] },
      { name: "Claude Desktop", paths: [
        path.join(home, "Library", "Application Support", "Claude"),
        path.join(home, ".config", "claude"),
      ]},
      { name: "VS Code MCP", paths: [
        path.join(process.cwd(), ".vscode", "mcp.json"),
        path.join(home, ".vscode", "mcp.json"),
      ]},
      { name: "Claude Code", paths: [
        path.join(home, ".claude"),
      ]},
    ];

    for (const check of checks) {
      for (const p of check.paths) {
        if (fs.existsSync(p)) {
          detected.push(check.name);
          break;
        }
      }
    }

    if (detected.length > 0) {
      this.addResult({
        name: "AI Agents",
        status: "ok",
        message: `Detected: ${detected.join(", ")}`,
        details: "Use @sendly/mcp for AI agent SMS integration",
      });
    } else {
      this.addResult({
        name: "AI Agents",
        status: "ok",
        message: "None detected",
        details: "Install @sendly/mcp for AI agent integration",
      });
    }
  }

  private generateReport(): DoctorReport {
    const passed = this.results.filter((r) => r.status === "ok").length;
    const warnings = this.results.filter((r) => r.status === "warning").length;
    const errors = this.results.filter((r) => r.status === "error").length;

    return {
      timestamp: new Date().toISOString(),
      version: "1.0.0",
      results: this.results,
      summary: {
        passed,
        warnings,
        errors,
      },
    };
  }
}
