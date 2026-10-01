import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    token: "cli_x",
    currentOrg: { id: "org_A", name: "Workspace A" } as
      | { id: string; name: string }
      | null,
  },
}));

vi.mock("../../../src/lib/config.js", () => ({
  isAuthenticated: vi.fn(() => true),
  getAuthToken: vi.fn(() => state.token),
  getStoredAccessToken: vi.fn(() => undefined),
  setAuthTokens: vi.fn(),
  resolveBaseUrl: vi.fn(() => "https://sendly.live"),
  getConfigValue: vi.fn(() => undefined),
  getCurrentOrg: vi.fn(() => state.currentOrg),
  getEffectiveValue: vi.fn((key: string) => {
    if (key === "maxRetries") return 0;
    if (key === "timeout") return 30000;
    if (key === "currentOrgId") return state.currentOrg?.id;
    return undefined;
  }),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

import CreditsTransfer from "../../../src/commands/credits/transfer.js";
import { setOutputFormat } from "../../../src/lib/output.js";
import { respond, runCommand } from "../../helpers/run-command.js";

const ORGS = [
  { id: "org_A", name: "Workspace A", slug: "a", role: "owner", isPersonal: false },
  { id: "org_B", name: "Workspace B", slug: "b", role: "owner", isPersonal: false },
];

function serve(accountOrg: { id: string; name: string; isPersonal: boolean } | null) {
  mockFetch.mockImplementation(async (url: string, init: RequestInit) => {
    const { pathname } = new URL(url);
    if (pathname === "/api/organizations" && init.method === "GET") {
      return respond(200, ORGS);
    }
    if (pathname === "/api/v1/account") {
      return respond(200, {
        user: { id: "usr_1", email: "a@example.com", createdAt: "2026-01-01T00:00:00.000Z" },
        organization: accountOrg,
        credits: { balance: 1000, reservedBalance: 0 },
      });
    }
    if (pathname === "/api/v1/account/credits") {
      return respond(200, {
        balance: 1000,
        reservedBalance: 0,
        availableBalance: 1000,
        billingMode: "prepaid",
        recentTransactions: [],
      });
    }
    if (pathname === "/api/v1/credits/transfer") {
      return respond(200, {
        success: true,
        amount: 5,
        sourceBalance: 995,
        targetBalance: 5,
      });
    }
    if (/^\/api\/organizations\/[^/]+\/transfer-credits$/.test(pathname)) {
      return respond(401, { error: "Not authenticated" });
    }
    return respond(404, { error: "not_found", message: "Not found" });
  });
}

function posts() {
  return mockFetch.mock.calls.filter(([, init]) => init.method === "POST");
}

describe("sendly credits transfer", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    state.token = "cli_x";
    state.currentOrg = { id: "org_A", name: "Workspace A" };
    setOutputFormat("human");
  });

  afterEach(() => {
    setOutputFormat("human");
  });

  it("transfers with POST /api/v1/credits/transfer from the selected workspace", async () => {
    serve({ id: "org_A", name: "Workspace A", isPersonal: false });

    const run = await runCommand(CreditsTransfer, [
      "--to",
      "org_B",
      "--amount",
      "5",
      "--yes",
    ]);

    expect(run.stderr).toBe("");
    expect(run.exitCode).toBeUndefined();
    const sent = posts();
    expect(sent).toHaveLength(1);
    const [url, init] = sent[0];
    expect(new URL(url).pathname).toBe("/api/v1/credits/transfer");
    expect(JSON.parse(init.body)).toEqual({
      targetOrganizationId: "org_B",
      amount: 5,
    });
    expect(init.headers["X-Organization-Id"]).toBe("org_A");
    expect(
      mockFetch.mock.calls.some(([u]) => String(u).includes("/transfer-credits")),
    ).toBe(false);
    expect(run.stdout).toContain("995 credits");
    expect(run.stdout).toContain("5 credits");
  });

  it("refuses when the API key belongs to another workspace than the selected one", async () => {
    state.token = "sk_live_v1_keyforB";
    serve({ id: "org_B", name: "Workspace B", isPersonal: false });

    const run = await runCommand(CreditsTransfer, [
      "--to",
      "org_B",
      "--amount",
      "5",
      "--yes",
    ]);

    expect(run.exitCode).toBe(1);
    expect(posts()).toHaveLength(0);
    expect(run.stderr).toContain("Workspace B");
  });

  it("refuses an API key that is not scoped to a workspace", async () => {
    state.token = "sk_live_v1_personal";
    serve(null);

    const run = await runCommand(CreditsTransfer, [
      "--to",
      "org_B",
      "--amount",
      "5",
      "--yes",
    ]);

    expect(run.exitCode).toBe(1);
    expect(posts()).toHaveLength(0);
    expect(run.stderr).toMatch(/workspace/i);
  });

  it("transfers with an API key that belongs to the selected workspace", async () => {
    state.token = "sk_live_v1_keyforA";
    serve({ id: "org_A", name: "Workspace A", isPersonal: false });

    const run = await runCommand(CreditsTransfer, [
      "--to",
      "org_B",
      "--amount",
      "5",
      "--yes",
    ]);

    expect(run.exitCode).toBeUndefined();
    expect(posts()).toHaveLength(1);
    expect(new URL(posts()[0][0]).pathname).toBe("/api/v1/credits/transfer");
  });
});
