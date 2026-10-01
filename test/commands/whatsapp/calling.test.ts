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

import WhatsappCalling from "../../../src/commands/whatsapp/calling.js";
import { setOutputFormat } from "../../../src/lib/output.js";
import { respond, runCommand } from "../../helpers/run-command.js";

const NUMBER = "+14155550123";
const PATH = `https://sendly.live/api/v1/whatsapp/senders/${encodeURIComponent(NUMBER)}/calling`;

function sent() {
  const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
  return {
    url,
    method: init.method,
    body: init.body ? JSON.parse(String(init.body)) : undefined,
  };
}

beforeEach(() => {
  mockFetch.mockReset();
  setOutputFormat("human");
});

afterEach(() => {
  setOutputFormat("human");
});

describe("sendly whatsapp calling", () => {
  it("--enable PATCHes enabled true and says calls ring like phone calls", async () => {
    mockFetch.mockResolvedValueOnce(
      respond(200, {
        phoneNumber: NUMBER,
        callingEnabled: true,
        outboundCallingAllowed: false,
      }),
    );

    const run = await runCommand(WhatsappCalling, [NUMBER, "--enable"]);

    expect(run.exitCode).toBeUndefined();
    expect(sent()).toEqual({ url: PATH, method: "PATCH", body: { enabled: true } });
    expect(run.stdout).toMatch(/Calling:.*on/);
    expect(run.stdout).toMatch(/Outbound calls:.*not allowed/);
  });

  it("--disable PATCHes enabled false", async () => {
    mockFetch.mockResolvedValueOnce(
      respond(200, {
        phoneNumber: "+442079460123",
        callingEnabled: false,
        outboundCallingAllowed: true,
      }),
    );

    const run = await runCommand(WhatsappCalling, ["+442079460123", "--disable"]);

    expect(sent().body).toEqual({ enabled: false });
    expect(run.stdout).toMatch(/Calling:.*off/);
  });

  it("prints the API object in --json", async () => {
    setOutputFormat("json");
    const body = {
      phoneNumber: "+442079460123",
      callingEnabled: true,
      outboundCallingAllowed: true,
    };
    mockFetch.mockResolvedValueOnce(respond(200, body));

    const run = await runCommand(WhatsappCalling, ["+442079460123", "--enable"]);

    expect(JSON.parse(run.stdout)).toEqual(body);
  });

  it("needs --enable or --disable", async () => {
    const run = await runCommand(WhatsappCalling, [NUMBER]);

    expect(run.exitCode).toBe(1);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("refuses --enable and --disable together", async () => {
    const run = await runCommand(WhatsappCalling, [NUMBER, "--enable", "--disable"]);

    expect(run.exitCode).toBe(1);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("points voice_not_enabled at the voice settings command", async () => {
    setOutputFormat("json");
    mockFetch.mockResolvedValueOnce(
      respond(409, {
        error: "voice_not_enabled",
        message:
          "Turn on calls for this number first, in its voice settings, so WhatsApp calls have somewhere to ring.",
      }),
    );

    const run = await runCommand(WhatsappCalling, [NUMBER, "--enable"]);

    expect(run.exitCode).toBe(1);
    const out = JSON.parse(run.stderr);
    expect(out.code).toBe("voice_not_enabled");
    expect(out.hint).toContain(`sendly voice numbers update ${NUMBER} --enable`);
  });

  it("keeps whatsapp_calling_unavailable", async () => {
    setOutputFormat("json");
    mockFetch.mockResolvedValueOnce(
      respond(422, {
        error: "whatsapp_calling_unavailable",
        message:
          "WhatsApp didn't allow calling on this number. Meta only enables calling once the account may message at least 2,000 people a day, and the number's display name must be approved.",
      }),
    );

    const run = await runCommand(WhatsappCalling, [NUMBER, "--enable"]);

    const out = JSON.parse(run.stderr);
    expect(out.code).toBe("whatsapp_calling_unavailable");
    expect(out.message).toContain("2,000 people a day");
  });

  it("says a calling change needs an owner or admin when the role is refused", async () => {
    mockFetch.mockResolvedValueOnce(
      respond(403, {
        error: "insufficient_permissions",
        message: "Insufficient permissions: requires settings:write",
      }),
    );

    const run = await runCommand(WhatsappCalling, [NUMBER, "--enable"]);

    expect(run.exitCode).toBe(1);
    expect(run.stderr).toContain("owner or admin");
  });

  it("names the whatsapp:write scope when the key lacks it", async () => {
    mockFetch.mockResolvedValueOnce(
      respond(403, {
        error: "insufficient_permissions",
        message: "Missing required scopes: whatsapp:write",
      }),
    );

    const run = await runCommand(WhatsappCalling, [NUMBER, "--enable"]);

    expect(run.stderr).toContain("whatsapp:write");
  });
});
