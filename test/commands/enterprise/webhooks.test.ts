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

import EnterpriseWebhooksSet from "../../../src/commands/enterprise/webhooks/set.js";
import EnterpriseWebhooksGet from "../../../src/commands/enterprise/webhooks/get.js";
import EnterpriseWebhooksRotateSecret from "../../../src/commands/enterprise/webhooks/rotate-secret.js";
import { setOutputFormat } from "../../../src/lib/output.js";
import { respond, runCommand } from "../../helpers/run-command.js";

const URL_ = "https://example.com/hook";

describe("sendly enterprise webhooks", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    setOutputFormat("human");
  });

  afterEach(() => {
    setOutputFormat("human");
  });

  it("set without --events shows the one-time signing secret", async () => {
    mockFetch.mockResolvedValueOnce(
      respond(200, {
        url: URL_,
        events: null,
        workspaces: null,
        signingSecret: "whsec_abc",
      }),
    );

    const run = await runCommand(EnterpriseWebhooksSet, ["--url", URL_]);

    expect(run.stderr).toBe("");
    expect(run.exitCode).toBeUndefined();
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({ url: URL_ });
    expect(run.stdout).toContain("whsec_abc");
    expect(run.stdout).toContain("all events");
    expect(run.stdout).not.toContain("inactive");
  });

  it("set with --events lists them, and prints no secret when the API keeps the existing one", async () => {
    mockFetch.mockResolvedValueOnce(
      respond(200, {
        url: URL_,
        events: ["workspace.created", "credits.transferred"],
        workspaces: null,
      }),
    );

    const run = await runCommand(EnterpriseWebhooksSet, [
      "--url",
      URL_,
      "--events",
      "workspace.created, credits.transferred",
    ]);

    expect(run.exitCode).toBeUndefined();
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({
      url: URL_,
      events: ["workspace.created", "credits.transferred"],
    });
    expect(run.stdout).toContain("workspace.created, credits.transferred");
    expect(run.stdout).not.toMatch(/won't be shown again/);
    expect(run.stdout).not.toContain("inactive");
  });

  it("get shows all events when none were chosen", async () => {
    mockFetch.mockResolvedValueOnce(
      respond(200, { url: URL_, events: null, workspaces: null }),
    );

    const run = await runCommand(EnterpriseWebhooksGet, []);

    expect(run.stderr).toBe("");
    expect(run.exitCode).toBeUndefined();
    expect(run.stdout).toContain(URL_);
    expect(run.stdout).toContain("all events");
    expect(run.stdout).not.toContain("inactive");
  });

  it("get says so when no webhook is set", async () => {
    mockFetch.mockResolvedValueOnce(
      respond(200, { url: null, events: null, workspaces: null }),
    );

    const run = await runCommand(EnterpriseWebhooksGet, []);

    expect(run.exitCode).toBeUndefined();
    expect(run.stdout).toContain("No enterprise webhook configured");
  });

  it("rotate-secret shows the new secret the API returns", async () => {
    mockFetch.mockResolvedValueOnce(
      respond(200, {
        success: true,
        secret: "whsec_rotated",
        rotated_at: "2026-09-25T12:00:00.000Z",
        message: "Webhook signing secret rotated. Save this secret - it won't be shown again.",
      }),
    );

    const run = await runCommand(EnterpriseWebhooksRotateSecret, ["--yes"]);

    expect(run.stderr).toBe("");
    expect(run.exitCode).toBeUndefined();
    const [url, init] = mockFetch.mock.calls[0];
    expect(new URL(url).pathname).toBe("/api/v1/enterprise/webhooks/rotate-secret");
    expect(init.method).toBe("POST");
    expect(run.stdout).toContain("whsec_rotated");
  });

  it("rotate-secret reports the API's refusal when no webhook is set", async () => {
    mockFetch.mockResolvedValueOnce(
      respond(400, { error: "No webhook configured. Set a webhook URL first." }),
    );

    const run = await runCommand(EnterpriseWebhooksRotateSecret, ["--yes"]);

    expect(run.exitCode).toBe(1);
    expect(run.stderr).toContain("No webhook configured. Set a webhook URL first.");
    expect(run.stderr).not.toContain("HTTP 400");
  });
});
