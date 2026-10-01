import os from "node:os";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../../../src/lib/config.js", () => ({
  isAuthenticated: vi.fn(() => true),
  getAuthToken: vi.fn(() => "sk_live_v1_mock"),
  getStoredAccessToken: vi.fn(() => undefined),
  setAuthTokens: vi.fn(),
  resolveBaseUrl: vi.fn(() => "https://sendly.live"),
  getConfigValue: vi.fn(() => undefined),
  getConfigDir: vi.fn(() => os.tmpdir()),
  getEffectiveValue: vi.fn((key: string) => {
    if (key === "maxRetries") return 0;
    if (key === "timeout") return 30000;
    return undefined;
  }),
}));

vi.mock("open", () => ({
  default: vi.fn(() => Promise.resolve()),
}));

vi.mock("../../../src/lib/keypress.js", () => ({
  attachLoginKeypressHandler: vi.fn(() => () => {}),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

import WhatsappConnect from "../../../src/commands/whatsapp/connect.js";
import WhatsappStatus from "../../../src/commands/whatsapp/status.js";
import { setOutputFormat } from "../../../src/lib/output.js";
import {
  respond,
  runCommand,
  startCommand,
} from "../../helpers/run-command.js";

const SIGNUP_ID = "3f6a1c9e-1111-4222-8333-944455556666";
const NUMBER = "+15555550100";

function signup(status: string, failureReasons: string[] | null = null) {
  return {
    id: SIGNUP_ID,
    status,
    phoneNumber: NUMBER,
    businessAccountId: status === "active" ? "102290129340398" : null,
    failureReasons,
    updatedAt: "2026-10-01T09:00:00.000Z",
  };
}

function refuseStart(status: number, body: Record<string, unknown>) {
  mockFetch.mockResolvedValueOnce(respond(status, body));
  return runCommand(WhatsappConnect, ["--number", NUMBER]);
}

describe("sendly whatsapp connect", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    setOutputFormat("human");
  });

  afterEach(() => {
    setOutputFormat("human");
    vi.useRealTimers();
  });

  describe("when WhatsApp connections are unavailable (503 whatsapp_unavailable)", () => {
    const unavailable = {
      error: "whatsapp_unavailable",
      message:
        "WhatsApp connections are temporarily unavailable. You haven't been charged. Please try again later.",
      retryAfter: 3600,
    };

    it("says to try again later using retryAfter, not the status-page hint", async () => {
      const run = await refuseStart(503, unavailable);

      expect(run.exitCode).toBe(1);
      expect(run.stderr).toContain(
        "WhatsApp connections are temporarily unavailable",
      );
      expect(run.stderr).toContain("Try again in about 1 hour");
      expect(run.stderr).not.toContain("status.sendly.live");
      expect(run.stderr).not.toContain("server error");
    });

    it("keeps the code and retryAfter in --json", async () => {
      setOutputFormat("json");
      const run = await refuseStart(503, unavailable);

      expect(run.exitCode).toBe(1);
      const out = JSON.parse(run.stderr);
      expect(out.code).toBe("whatsapp_unavailable");
      expect(out.retryAfter).toBe(3600);
    });

    it("words a short retryAfter in minutes", async () => {
      const run = await refuseStart(503, { ...unavailable, retryAfter: 600 });

      expect(run.stderr).toContain("Try again in about 10 minutes");
    });
  });

  it("explains the daily failed-signup cap instead of a 60-second rate-limit wait", async () => {
    const run = await refuseStart(429, {
      error: "whatsapp_signup_limit_reached",
      message:
        "Too many WhatsApp connection attempts failed in the last 24 hours. Try again tomorrow, or contact support.",
    });

    expect(run.exitCode).toBe(1);
    expect(run.stderr).toContain("Too many WhatsApp connection attempts failed");
    expect(run.stderr).toContain("whatsapp_signup_limit_reached");
    expect(run.stderr).not.toMatch(/60 seconds|upgrade your plan/);
  });

  it("says connecting needs an owner or admin when the role is refused", async () => {
    const run = await refuseStart(403, {
      error: "insufficient_permissions",
      message: "Insufficient permissions: requires settings:write",
    });

    expect(run.exitCode).toBe(1);
    expect(run.stderr).toContain("owner or admin");
  });

  it("names the whatsapp:write scope when the API key lacks it", async () => {
    const run = await refuseStart(403, {
      error: "insufficient_permissions",
      message: "Missing required scopes: whatsapp:write",
    });

    expect(run.exitCode).toBe(1);
    expect(run.stderr).toContain("whatsapp:write");
  });

  describe("when it stops waiting after 20 minutes", () => {
    function pollUntilTimeout(status: string) {
      vi.useFakeTimers();
      mockFetch.mockImplementation(async (_url: string, init?: RequestInit) => {
        if (init?.method === "POST") {
          return respond(201, {
            id: SIGNUP_ID,
            connectUrl: "https://sendly.live/whatsapp/connect?token=tok",
            status: "initiated",
          });
        }
        return respond(200, signup(status));
      });
      const run = startCommand(WhatsappConnect, ["--number", NUMBER]);
      return (async () => {
        await vi.advanceTimersByTimeAsync(21 * 60 * 1000);
        return run.done;
      })();
    }

    it("says registration is still in progress and how to check, not to finish Facebook sign-in", async () => {
      const run = await pollUntilTimeout("registering");

      expect(run.stdout).not.toContain("Finish the Facebook sign-in");
      expect(run.stdout).toContain("still activating");
      expect(run.stdout).toContain(`sendly whatsapp status ${SIGNUP_ID}`);
    });

    it("still asks for the Facebook sign-in when it never started", async () => {
      const run = await pollUntilTimeout("initiated");

      expect(run.stdout).toContain("Finish the Facebook sign-in");
    });
  });
});

describe("sendly whatsapp status", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    setOutputFormat("human");
  });

  it("says a registering number is being activated, not that someone must sign in with Facebook", async () => {
    mockFetch.mockResolvedValueOnce(respond(200, signup("registering")));
    const run = await runCommand(WhatsappStatus, [SIGNUP_ID]);

    expect(run.stdout).not.toContain("sign in with Facebook");
    expect(run.stdout).toContain("activating");
  });

  it("still points an unfinished sign-in at the connect link", async () => {
    mockFetch.mockResolvedValueOnce(respond(200, signup("initiated")));
    const run = await runCommand(WhatsappStatus, [SIGNUP_ID]);

    expect(run.stdout).toContain("sign in with Facebook");
  });
});
