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

import EnterpriseStatus from "../../../src/commands/enterprise/status.js";
import { setOutputFormat } from "../../../src/lib/output.js";
import { respond, runCommand } from "../../helpers/run-command.js";

const ACCOUNT = {
  id: "ent_123",
  maxWorkspaces: 10,
  workspaceCount: 2,
  workspaces: [
    {
      id: "org_one",
      name: "Acme East",
      slug: "acme-east",
      status: "active",
      suspendedAt: null,
      verificationStatus: "approved",
      rejectionReason: null,
      verificationType: "toll_free",
      tollFreeNumber: "+18885550100",
      creditBalance: 1200,
      monthlyMessageQuota: null,
      messagesThisMonth: 40,
    },
    {
      id: "org_two",
      name: "Acme West",
      slug: "acme-west",
      status: "suspended",
      suspendedAt: "2026-09-20T00:00:00.000Z",
      verificationStatus: "pending",
      rejectionReason: null,
      verificationType: null,
      tollFreeNumber: null,
      creditBalance: 300,
      monthlyMessageQuota: 5000,
      messagesThisMonth: 0,
    },
  ],
  metadata: { webhookUrl: "https://hooks.example.com/sendly" },
};

describe("sendly enterprise status", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    setOutputFormat("human");
  });

  afterEach(() => {
    setOutputFormat("human");
  });

  it("shows the workspace count, credits and webhook the API returns", async () => {
    mockFetch.mockResolvedValueOnce(respond(200, ACCOUNT));

    const run = await runCommand(EnterpriseStatus, []);

    expect(run.stderr).toBe("");
    expect(run.exitCode).toBeUndefined();
    expect(run.stdout).toContain("2 / 10");
    expect(run.stdout).toContain("https://hooks.example.com/sendly");
    expect(run.stdout).toContain("1,500");
    expect(run.stdout).toContain("Acme East");
    expect(run.stdout).toContain("Acme West");
    expect(run.stdout).not.toContain("undefined");
  });

  it("says when no enterprise webhook is configured", async () => {
    mockFetch.mockResolvedValueOnce(
      respond(200, { ...ACCOUNT, workspaces: [], workspaceCount: 0, metadata: {} }),
    );

    const run = await runCommand(EnterpriseStatus, []);

    expect(run.exitCode).toBeUndefined();
    expect(run.stdout).toContain("not configured");
  });

  it("--json prints the body unchanged", async () => {
    setOutputFormat("json");
    mockFetch.mockResolvedValueOnce(respond(200, ACCOUNT));

    const run = await runCommand(EnterpriseStatus, []);

    expect(JSON.parse(run.stdout)).toEqual(ACCOUNT);
  });
});
