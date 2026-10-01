import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: { token: "sk_test_v1_abc" as string | undefined },
}));

vi.mock("../../src/lib/config.js", () => ({
  isAuthenticated: vi.fn(() => state.token !== undefined),
  getAuthToken: vi.fn(() => state.token),
  getStoredAccessToken: vi.fn(() => undefined),
  getConfigPath: vi.fn(() => "/nonexistent/.sendly/config.json"),
  getConfigDir: vi.fn(() => "/nonexistent/.sendly"),
  resolveBaseUrlSafe: vi.fn(() => ({ url: "https://sendly.live", source: "default" })),
  resolveBaseUrl: vi.fn(() => "https://sendly.live"),
  isCI: vi.fn(() => false),
  isColorDisabled: vi.fn(() => false),
  getConfigValue: vi.fn(() => undefined),
  getEffectiveValue: vi.fn((key: string) => {
    if (key === "maxRetries") return 0;
    if (key === "timeout") return 30000;
    return undefined;
  }),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

import Doctor from "../../src/commands/doctor.js";
import { setOutputFormat } from "../../src/lib/output.js";
import { respond, runCommand } from "../helpers/run-command.js";

function serveHealthy() {
  mockFetch.mockImplementation(async (url: string) => {
    const { pathname } = new URL(url);
    const headers = new Map([["date", new Date().toUTCString()]]);
    if (pathname === "/health") return { ...respond(200, { ok: true }), headers };
    if (pathname === "/api/v1/account/credits") {
      return respond(200, { balance: 250, reservedBalance: 0, availableBalance: 250 });
    }
    return respond(404, {});
  });
}

describe("sendly doctor", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    state.token = "sk_test_v1_abc";
    serveHealthy();
  });

  afterEach(() => {
    setOutputFormat("human");
  });

  it("--json prints only the report", async () => {
    setOutputFormat("json");

    const run = await runCommand(Doctor, ["--json"]);

    const report = JSON.parse(run.stdout);
    expect(typeof report.summary.errors).toBe("number");
    expect(Array.isArray(report.results)).toBe(true);
    expect(run.stdout.split("\n").some((line) => /^[✔⚠✘]/.test(line))).toBe(false);
  });

  it("accepts a sendly login session as the credential", async () => {
    setOutputFormat("human");
    state.token = "cli_v2_session.sig";

    const run = await runCommand(Doctor, []);

    expect(run.exitCode).toBeUndefined();
    expect(run.stdout).not.toContain("Invalid format");
    expect(run.stdout).toMatch(/sendly login/);
  });
});
