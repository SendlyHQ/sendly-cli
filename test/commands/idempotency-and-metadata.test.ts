import os from "node:os";
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../../src/lib/config.js", () => ({
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

vi.mock("../../src/lib/keypress.js", () => ({
  attachLoginKeypressHandler: vi.fn(() => () => {}),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

import CallsCreate from "../../src/commands/calls/create.js";
import ShortCodesSubmit from "../../src/commands/short-codes/submit.js";
import WhatsappConnect from "../../src/commands/whatsapp/connect.js";
import WhatsappTemplatesCreate from "../../src/commands/whatsapp/templates/create.js";
import SmsSend from "../../src/commands/sms/send.js";
import WhatsappSend from "../../src/commands/whatsapp/send.js";
import RcsSend from "../../src/commands/rcs/send.js";
import { setOutputFormat } from "../../src/lib/output.js";
import { respond, runCommand } from "../helpers/run-command.js";

const REFUSED = { error: "invalid_request", message: "Refused" };

function request(n = 0) {
  const [url, init] = mockFetch.mock.calls[n] as [string, RequestInit];
  return {
    url,
    key: (init.headers as Record<string, string>)["Idempotency-Key"],
    body: JSON.parse(String(init.body)),
  };
}

beforeEach(() => {
  mockFetch.mockReset();
  mockFetch.mockResolvedValue(respond(400, REFUSED));
  setOutputFormat("human");
});

describe("--idempotency-key", () => {
  it("calls create sends it", async () => {
    await runCommand(CallsCreate, [
      "--to",
      "+15125550123",
      "--agent",
      "agent_1",
      "--idempotency-key",
      "call-lead-8812",
    ]);
    expect(request().url).toBe("https://sendly.live/api/v1/calls");
    expect(request().key).toBe("call-lead-8812");
  });

  it("short-codes submit sends it", async () => {
    await runCommand(ShortCodesSubmit, ["--accept-terms", "--idempotency-key", "sc-submit-1"]);
    expect(request().url).toBe("https://sendly.live/api/v1/short_codes/application/submit");
    expect(request().key).toBe("sc-submit-1");
    expect(request().body).toEqual({ acceptTerms: true });
  });

  it("whatsapp connect sends it", async () => {
    await runCommand(WhatsappConnect, [
      "--number",
      "+15555550100",
      "--idempotency-key",
      "connect-1",
    ]);
    expect(request().url).toBe("https://sendly.live/api/v1/whatsapp/signup");
    expect(request().key).toBe("connect-1");
  });

  it("whatsapp connect --business-account sends it", async () => {
    await runCommand(WhatsappConnect, [
      "--number",
      "+15555550100",
      "--business-account",
      "104996582519384",
      "--idempotency-key",
      "add-1",
    ]);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(request().key).toBe("add-1");
    expect(request().body).toMatchObject({ businessAccountId: "104996582519384" });
  });

  it("whatsapp templates create sends it", async () => {
    await runCommand(WhatsappTemplatesCreate, [
      "--sender",
      "+15551234567",
      "--name",
      "order_shipped",
      "--language",
      "en_US",
      "--category",
      "utility",
      "--body",
      "Your order shipped",
      "--idempotency-key",
      "tpl-1",
    ]);
    expect(request().url).toBe("https://sendly.live/api/v1/whatsapp/templates");
    expect(request().key).toBe("tpl-1");
  });

  it("is still generated when not given", async () => {
    await runCommand(ShortCodesSubmit, ["--accept-terms"]);
    expect(request().key).toMatch(/^sendly-cli-retry-/);
  });
});

describe("--metadata", () => {
  const META = '{"orderId":"4821","tags":["vip"]}';

  it("sms send sends it as a JSON object", async () => {
    await runCommand(SmsSend, ["--to", "+15551234567", "--text", "Hi", "--metadata", META]);
    expect(request().body.metadata).toEqual({ orderId: "4821", tags: ["vip"] });
  });

  it("whatsapp send sends it", async () => {
    await runCommand(WhatsappSend, [
      "--to",
      "+15551234567",
      "--from",
      "+15559876543",
      "--text",
      "Hi",
      "--metadata",
      META,
    ]);
    expect(request().body).toMatchObject({ channel: "whatsapp", metadata: { orderId: "4821" } });
  });

  it("rcs send sends it", async () => {
    await runCommand(RcsSend, ["--to", "+15551234567", "--text", "Hi", "--metadata", META]);
    expect(request().body).toMatchObject({ channel: "rcs", metadata: { orderId: "4821" } });
  });

  it("is left out when not given", async () => {
    await runCommand(SmsSend, ["--to", "+15551234567", "--text", "Hi"]);
    expect(request().body).not.toHaveProperty("metadata");
  });

  it.each([["not json"], ["[1,2]"], ["null"], ['"text"']])(
    "refuses %s before sending anything",
    async (raw) => {
      const run = await runCommand(SmsSend, ["--to", "+15551234567", "--text", "Hi", "--metadata", raw]);
      expect(run.exitCode).toBe(1);
      expect(mockFetch).not.toHaveBeenCalled();
    },
  );
});
