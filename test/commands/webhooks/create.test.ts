import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../../../src/lib/config.js", () => ({
  isAuthenticated: vi.fn(() => true),
  getAuthToken: vi.fn(() => "sk_test_v1_mock"),
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

import WebhooksCreate from "../../../src/commands/webhooks/create.js";
import { setOutputFormat } from "../../../src/lib/output.js";
import { respond, runCommand } from "../../helpers/run-command.js";

describe("sendly webhooks create", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    setOutputFormat("human");
    mockFetch.mockImplementation(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      let url = String(body.url);
      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        url = `https://${url}`;
      }
      if (!url.startsWith("https://")) {
        return respond(400, {
          error: "validation_error",
          message: "Invalid webhook data",
          details: [{ path: ["url"], message: "HTTPS required for security" }],
        });
      }
      return respond(201, {
        id: "whk_1",
        url,
        events: body.events,
        mode: "all",
        is_active: true,
        secret: "whsec_new",
        secret_version: 1,
        created_at: "2026-09-25T12:00:00.000Z",
      });
    });
  });

  afterEach(() => {
    setOutputFormat("human");
  });

  it("refuses an http:// URL, local ones included, before any request", async () => {
    const run = await runCommand(WebhooksCreate, [
      "--url",
      "http://localhost:3000/webhook",
      "--events",
      "message.delivered",
    ]);

    expect(run.exitCode).toBe(1);
    expect(run.stderr).toMatch(/HTTPS/);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("creates a webhook with an https:// URL", async () => {
    const run = await runCommand(WebhooksCreate, [
      "--url",
      "https://localhost:3000/webhook",
      "--events",
      "message.delivered",
    ]);

    expect(run.exitCode).toBeUndefined();
    expect(run.stdout).toContain("whsec_new");
  });

  it("still sends a test URL without a scheme, which the API reads as https://", async () => {
    const run = await runCommand(WebhooksCreate, [
      "--url",
      "abc123.ngrok.io/webhook",
      "--events",
      "message.delivered",
    ]);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(mockFetch.mock.calls[0][1].body).url).toBe("abc123.ngrok.io/webhook");
    expect(run.stderr).toBe("");
    expect(run.exitCode).toBeUndefined();
    expect(run.stdout).toContain("https://abc123.ngrok.io/webhook");
    expect(run.stdout).toContain("whsec_new");
  });
});
