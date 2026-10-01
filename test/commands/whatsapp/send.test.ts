import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const settings = vi.hoisted(() => ({ maxRetries: 0 }));

vi.mock("../../../src/lib/config.js", () => ({
  isAuthenticated: vi.fn(() => true),
  getAuthToken: vi.fn(() => "sk_live_v1_mock"),
  getStoredAccessToken: vi.fn(() => undefined),
  setAuthTokens: vi.fn(),
  resolveBaseUrl: vi.fn(() => "https://sendly.live"),
  getConfigValue: vi.fn(() => undefined),
  getEffectiveValue: vi.fn((key: string) => {
    if (key === "maxRetries") return settings.maxRetries;
    if (key === "timeout") return 30000;
    return undefined;
  }),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

import WhatsappSend from "../../../src/commands/whatsapp/send.js";
import { setOutputFormat } from "../../../src/lib/output.js";
import { respond, runCommand } from "../../helpers/run-command.js";

const ARGS = ["--to", "+14155550177", "--from", "+14155550123", "--text", "Your table is ready!"];

beforeEach(() => {
  mockFetch.mockReset();
  settings.maxRetries = 0;
  setOutputFormat("human");
});

afterEach(() => {
  setOutputFormat("human");
});

describe("sendly whatsapp send refusals", () => {
  it("409 whatsapp_send_unconfirmed says it may still arrive and is not retried", async () => {
    settings.maxRetries = 1;
    setOutputFormat("json");
    mockFetch.mockResolvedValue(
      respond(409, {
        error: "whatsapp_send_unconfirmed",
        errorCode: "E024",
        message:
          "We couldn't confirm whether WhatsApp accepted this message. It has been marked failed and refunded, but it may still be delivered. Check before sending it again, or it could arrive twice.",
      }),
    );

    const run = await runCommand(WhatsappSend, ARGS);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(run.exitCode).toBe(1);
    const out = JSON.parse(run.stderr);
    expect(out.code).toBe("whatsapp_send_unconfirmed");
    expect(out.message).toContain("may still be delivered");
    expect(out.hint).toMatch(/may still be delivered|could arrive twice/);
    expect(out.hint).toContain("--idempotency-key");
  });

  it("502 whatsapp_send_failed says it was not sent and is safe to send again", async () => {
    setOutputFormat("json");
    mockFetch.mockResolvedValueOnce(
      respond(502, {
        error: "whatsapp_send_failed",
        errorCode: "E028",
        message: "The message couldn't be delivered.",
      }),
    );

    const run = await runCommand(WhatsappSend, ARGS);

    const out = JSON.parse(run.stderr);
    expect(out.code).toBe("whatsapp_send_failed");
    expect(out.hint).toContain("Not sent, safe to send again");
    expect(out.hint).not.toContain("status.sendly.live");
  });

  it("422 whatsapp_send_failed says the refusal is final", async () => {
    setOutputFormat("json");
    mockFetch.mockResolvedValueOnce(
      respond(422, {
        error: "whatsapp_send_failed",
        errorCode: "E024",
        message: "The message couldn't be delivered.",
      }),
    );

    const run = await runCommand(WhatsappSend, ARGS);

    const out = JSON.parse(run.stderr);
    expect(out.code).toBe("whatsapp_send_failed");
    expect(out.hint).toMatch(/refused/i);
  });
});
