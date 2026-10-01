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

import EnterpriseTransferCredits from "../../../src/commands/enterprise/transfer-credits.js";
import { setOutputFormat } from "../../../src/lib/output.js";
import { respond, runCommand } from "../../helpers/run-command.js";

describe("sendly enterprise transfer-credits", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    setOutputFormat("human");
    mockFetch.mockImplementation(async (url: string, init: RequestInit) => {
      const match = new URL(url).pathname.match(
        /^\/api\/v1\/enterprise\/workspaces\/([^/]+)\/transfer-credits$/,
      );
      if (!match) return respond(404, { error: "not_found" });
      const body = JSON.parse(String(init.body));
      const source = body.sourceWorkspaceId ?? body.source_workspace_id;
      if (!source) return respond(400, { error: "sourceWorkspaceId is required" });
      if (source === match[1]) {
        return respond(400, { error: "Cannot transfer to the same workspace" });
      }
      if (body.amount > 1000) {
        return respond(400, { error: "Insufficient credits" });
      }
      return respond(200, {
        success: true,
        amount: body.amount,
        sourceBalance: 250,
        targetBalance: 1500,
      });
    });
  });

  afterEach(() => {
    setOutputFormat("human");
  });

  it("puts the target in the path and the source in the body", async () => {
    const run = await runCommand(EnterpriseTransferCredits, [
      "--from",
      "ws_src",
      "--to",
      "ws_dst",
      "--amount",
      "500",
      "--yes",
    ]);

    expect(run.stderr).toBe("");
    expect(run.exitCode).toBeUndefined();
    const [url, init] = mockFetch.mock.calls[0];
    expect(new URL(url).pathname).toBe(
      "/api/v1/enterprise/workspaces/ws_dst/transfer-credits",
    );
    expect(JSON.parse(init.body)).toEqual({
      sourceWorkspaceId: "ws_src",
      amount: 500,
    });
    expect(run.stdout).toContain("250 credits");
    expect(run.stdout).toContain("1,500 credits");
  });

  it("reports the API's reason when the source can't cover the amount", async () => {
    const run = await runCommand(EnterpriseTransferCredits, [
      "--from",
      "ws_src",
      "--to",
      "ws_dst",
      "--amount",
      "5000",
      "--yes",
    ]);

    expect(run.exitCode).toBe(1);
    expect(run.stderr).toContain("Insufficient credits");
    expect(run.stderr).not.toContain("HTTP 400");
  });
});
