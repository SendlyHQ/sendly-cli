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

import WorkspacesGet from "../../../src/commands/enterprise/workspaces/get.js";
import WorkspacesDelete from "../../../src/commands/enterprise/workspaces/delete.js";
import { setOutputFormat } from "../../../src/lib/output.js";
import { respond, runCommand } from "../../helpers/run-command.js";

const WORKSPACE = {
  id: "org_one",
  name: "Acme East",
  slug: "acme-east",
  createdAt: "2026-09-01T10:00:00.000Z",
  verification: {
    status: "approved",
    type: "toll_free",
    tollFreeNumber: "+18885550100",
    businessName: "Acme East LLC",
  },
  credits: 750,
  keyCount: 2,
};

describe("sendly enterprise workspaces get", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    setOutputFormat("human");
  });

  afterEach(() => {
    setOutputFormat("human");
  });

  it("shows the workspace's credits and leaves out stats the API doesn't send", async () => {
    mockFetch.mockResolvedValueOnce(respond(200, WORKSPACE));

    const run = await runCommand(WorkspacesGet, ["org_one"]);

    expect(run.stderr).toBe("");
    expect(run.exitCode).toBeUndefined();
    expect(run.stdout).toMatch(/Credits\s+750 credits/);
    expect(run.stdout).toContain("+18885550100");
    expect(run.stdout).not.toContain("Messages (30d)");
    expect(run.stdout).not.toContain("undefined");
  });

  it("tolerates 30-day stats, which GET /api/v1/enterprise/workspaces/:id doesn't send", async () => {
    mockFetch.mockResolvedValueOnce(
      respond(200, {
        ...WORKSPACE,
        messages30d: 1200,
        delivered30d: 1188,
        failed30d: 12,
        deliveryRate: 99,
      }),
    );

    const run = await runCommand(WorkspacesGet, ["org_one"]);

    expect(run.exitCode).toBeUndefined();
    expect(run.stdout).toMatch(/Messages \(30d\)\s+1,200/);
    expect(run.stdout).toContain("99.0%");
  });
});

describe("sendly enterprise workspaces delete", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    setOutputFormat("human");
  });

  afterEach(() => {
    setOutputFormat("human");
  });

  it("deletes without releasing numbers by default", async () => {
    mockFetch.mockResolvedValueOnce(respond(200, { success: true }));

    const run = await runCommand(WorkspacesDelete, ["org_one", "--yes"]);

    expect(run.exitCode).toBeUndefined();
    const url = String(mockFetch.mock.calls[0][0]);
    expect(mockFetch.mock.calls[0][1].method).toBe("DELETE");
    expect(url).toContain("/api/v1/enterprise/workspaces/org_one");
    expect(url).not.toContain("release_numbers");
  });

  it("passes release_numbers=true with --release-numbers", async () => {
    mockFetch.mockResolvedValueOnce(respond(200, { success: true }));

    const run = await runCommand(WorkspacesDelete, ["org_one", "--yes", "--release-numbers"]);

    expect(run.exitCode).toBeUndefined();
    const url = new URL(String(mockFetch.mock.calls[0][0]));
    expect(url.pathname).toBe("/api/v1/enterprise/workspaces/org_one");
    expect(url.searchParams.get("release_numbers")).toBe("true");
  });
});
