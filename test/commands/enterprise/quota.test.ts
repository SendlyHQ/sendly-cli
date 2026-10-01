import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../../../src/lib/config.js", () => ({
  isAuthenticated: vi.fn(() => true),
  getAuthToken: vi.fn(() => "sk_live_v1_enterprise"),
  getStoredAccessToken: vi.fn(() => undefined),
  setAuthTokens: vi.fn(),
  resolveBaseUrl: vi.fn(() => "https://sendly.live"),
  getConfigValue: vi.fn(() => undefined),
  getEffectiveValue: vi.fn((key: string) => {
    if (key === "maxRetries") return 0;
    if (key === "timeout") return 30000;
    return undefined;
  }),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

import QuotaGet from "../../../src/commands/enterprise/quota/get.js";
import QuotaSet from "../../../src/commands/enterprise/quota/set.js";
import { setOutputFormat } from "../../../src/lib/output.js";
import { respond, runCommand } from "../../helpers/run-command.js";

const RESET_AT = "2026-10-01T00:00:00.000Z";

function serveQuota(stored: { monthlyMessageQuota: number | null }) {
  mockFetch.mockImplementation(async (_url: string, init: RequestInit) => {
    if (init.method === "PUT") {
      const body = JSON.parse(String(init.body));
      if (!("monthlyMessageQuota" in body)) {
        return respond(500, { error: "Failed to update quota" });
      }
      stored.monthlyMessageQuota = body.monthlyMessageQuota;
    }
    return respond(200, {
      monthlyMessageQuota: stored.monthlyMessageQuota,
      messagesThisMonth: 12,
      quotaResetAt: RESET_AT,
    });
  });
}

describe("sendly enterprise quota", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    setOutputFormat("human");
  });

  afterEach(() => {
    setOutputFormat("human");
  });

  it("get shows the monthly quota, usage and reset date", async () => {
    serveQuota({ monthlyMessageQuota: null });

    const run = await runCommand(QuotaGet, ["org_one"]);

    expect(run.stderr).toBe("");
    expect(run.exitCode).toBeUndefined();
    expect(run.stdout).toMatch(/Monthly Limit\s+unlimited/);
    expect(run.stdout).toMatch(/Monthly Used\s+12/);
    expect(run.stdout).toContain(new Date(RESET_AT).toLocaleString());
    expect(run.stdout).not.toContain("Daily");
  });

  it("get shows a set monthly quota next to the usage", async () => {
    serveQuota({ monthlyMessageQuota: 25000 });

    const run = await runCommand(QuotaGet, ["org_one"]);

    expect(run.exitCode).toBeUndefined();
    expect(run.stdout).toMatch(/Monthly Limit\s+25,000/);
    expect(run.stdout).toMatch(/Monthly Used\s+12 \/ 25,000/);
  });

  it("set --daily is refused before any request", async () => {
    serveQuota({ monthlyMessageQuota: null });

    const run = await runCommand(QuotaSet, ["org_one", "--daily", "1000"]);

    expect(run.exitCode).toBe(1);
    expect(run.stderr).toMatch(/--monthly/);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("set --daily with --monthly saves the monthly limit, as before, and says --daily was ignored", async () => {
    const stored = { monthlyMessageQuota: null as number | null };
    serveQuota(stored);

    const run = await runCommand(QuotaSet, [
      "org_one",
      "--daily",
      "1000",
      "--monthly",
      "25000",
    ]);

    expect(run.stderr).toBe("");
    expect(run.exitCode).toBeUndefined();
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({
      monthlyMessageQuota: 25000,
    });
    expect(stored.monthlyMessageQuota).toBe(25000);
    expect(run.stdout).toMatch(/--daily was ignored/);
    expect(run.stdout).toMatch(/Monthly Limit:?\s+25,000/);
  });

  it("set --daily with --monthly --json prints the saved quota and exits 0", async () => {
    serveQuota({ monthlyMessageQuota: null });
    setOutputFormat("json");

    const run = await runCommand(QuotaSet, [
      "org_one",
      "--daily",
      "1000",
      "--monthly",
      "25000",
    ]);

    expect(run.exitCode).toBeUndefined();
    expect(JSON.parse(run.stdout)).toEqual({
      monthlyMessageQuota: 25000,
      messagesThisMonth: 12,
      quotaResetAt: RESET_AT,
    });
  });

  it("set --monthly sends only the monthly quota and shows it", async () => {
    serveQuota({ monthlyMessageQuota: null });

    const run = await runCommand(QuotaSet, ["org_one", "--monthly", "25000"]);

    expect(run.stderr).toBe("");
    expect(run.exitCode).toBeUndefined();
    const [, init] = mockFetch.mock.calls[0];
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({ monthlyMessageQuota: 25000 });
    expect(run.stdout).toMatch(/Monthly Limit:?\s+25,000/);
  });

  it("set --monthly unlimited clears the quota", async () => {
    serveQuota({ monthlyMessageQuota: 5000 });

    const run = await runCommand(QuotaSet, ["org_one", "--monthly", "unlimited"]);

    expect(run.exitCode).toBeUndefined();
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({
      monthlyMessageQuota: null,
    });
    expect(run.stdout).toMatch(/Monthly Limit:?\s+unlimited/);
  });
});
