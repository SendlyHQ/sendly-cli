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

import EnterpriseBilling from "../../../src/commands/enterprise/billing.js";
import { setOutputFormat } from "../../../src/lib/output.js";
import { respond, runCommand } from "../../helpers/run-command.js";

function workspace(id: string, name: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name,
    creditsUsed: 617,
    creditsPurchased: 1000,
    creditsTransferredIn: 0,
    creditsTransferredOut: 0,
    messagesSent: 300,
    messagesDelivered: 290,
    workspaceFee: 900,
    included: false,
    allocatedPlatformFee: 14950,
    totalCost: 16467,
    ...overrides,
  };
}

const BREAKDOWN = {
  period: "30d",
  includedWorkspaces: 0,
  summary: {
    platformFee: 29900,
    totalWorkspaceFees: 1800,
    totalCreditsUsed: 1234,
    totalCost: 32934,
  },
  workspaces: [workspace("org_one", "Acme East"), workspace("org_two", "Acme West")],
};

describe("sendly enterprise billing", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    setOutputFormat("human");
  });

  afterEach(() => {
    setOutputFormat("human");
  });

  it("shows the summary in dollars and each workspace's fee", async () => {
    mockFetch.mockResolvedValueOnce(respond(200, BREAKDOWN));

    const run = await runCommand(EnterpriseBilling, []);

    expect(run.stderr).toBe("");
    expect(run.exitCode).toBeUndefined();
    expect(run.stdout).toContain("$299.00");
    expect(run.stdout).toContain("$18.00");
    expect(run.stdout).toContain("$329.34");
    expect(run.stdout).toContain("1,234");
    expect(run.stdout).toContain("$9.00");
    expect(run.stdout).toContain("Acme East");
    expect(run.stdout).not.toContain("undefined");
    expect(run.stdout).not.toContain("NaN");
  });

  it("marks a workspace the plan includes", async () => {
    mockFetch.mockResolvedValueOnce(
      respond(200, {
        ...BREAKDOWN,
        includedWorkspaces: 1,
        workspaces: [
          workspace("org_one", "Acme East", { workspaceFee: 0, included: true }),
        ],
      }),
    );

    const run = await runCommand(EnterpriseBilling, []);

    expect(run.exitCode).toBeUndefined();
    expect(run.stdout).toContain("included");
  });

  it("sends page, limit and period, and points at the next page when this one is full", async () => {
    mockFetch.mockResolvedValueOnce(respond(200, BREAKDOWN));

    const run = await runCommand(EnterpriseBilling, [
      "--limit",
      "2",
      "--page",
      "3",
      "--period",
      "90d",
    ]);

    const url = new URL(mockFetch.mock.calls[0][0]);
    expect(url.searchParams.get("page")).toBe("3");
    expect(url.searchParams.get("limit")).toBe("2");
    expect(url.searchParams.get("period")).toBe("90d");
    expect(run.exitCode).toBeUndefined();
    expect(run.stdout).toContain("--page 4");
  });
});
