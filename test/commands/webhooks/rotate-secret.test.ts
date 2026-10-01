import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../../../src/lib/config.js", () => ({
  isAuthenticated: vi.fn(() => true),
  getAuthToken: vi.fn(() => "sk_live_v1_mock"),
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

import WebhooksRotateSecret from "../../../src/commands/webhooks/rotate-secret.js";
import { setOutputFormat } from "../../../src/lib/output.js";
import { respond, runCommand } from "../../helpers/run-command.js";

describe("sendly webhooks rotate-secret", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    setOutputFormat("human");
    mockFetch.mockImplementation(async (url: string, init: RequestInit) => {
      if (init.method === "GET") {
        return respond(200, { id: "whk_1", url: "https://example.com/hook", secret_version: 1 });
      }
      return respond(200, {
        success: true,
        id: "whk_1",
        secret: "whsec_rotated",
        new_secret: "whsec_rotated",
        new_secret_version: 1,
        grace_period_hours: 24,
        rotated_at: "2026-09-25T12:00:00.000Z",
        message: "Webhook secret rotated successfully. Save this secret - it won't be shown again.",
      });
    });
  });

  afterEach(() => {
    setOutputFormat("human");
  });

  it("shows the new secret without promising the old one keeps working", async () => {
    const run = await runCommand(WebhooksRotateSecret, ["whk_1", "--yes"]);

    expect(run.exitCode).toBeUndefined();
    expect(run.stdout).toContain("whsec_rotated");
    expect(run.stdout).not.toMatch(/24 hours|remain valid|Grace Period/i);
  });
});
