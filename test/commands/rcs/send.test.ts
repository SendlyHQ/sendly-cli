import os from "node:os";
import { describe, it, expect, beforeEach, vi } from "vitest";

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

const mockFetch = vi.fn();
global.fetch = mockFetch;

import RcsSend from "../../../src/commands/rcs/send.js";
import { setOutputFormat } from "../../../src/lib/output.js";
import { respond, runCommand } from "../../helpers/run-command.js";

const FALLBACK = {
  id: "msg_1",
  channel: "sms",
  fellBackTo: "sms",
  message_format: "sms",
  messageFormat: "sms",
  to: "+15125550190",
  from: "+18005550199",
  text: "20% off this weekend",
  status: "sent",
  direction: "outbound",
  segments: 1,
  creditsUsed: 2,
  createdAt: "2026-10-15T10:00:00.000Z",
  metadata: {},
};

function body(n: number) {
  const [, init] = mockFetch.mock.calls[n] as [string, RequestInit];
  return JSON.parse(String(init.body));
}

beforeEach(() => {
  mockFetch.mockReset();
  setOutputFormat("human");
});

describe("rcs send", () => {
  it("sends --type as messageType", async () => {
    mockFetch.mockResolvedValueOnce(
      respond(201, {
        ...FALLBACK,
        rcs: { requestedChannel: "rcs", agentId: "agent_1", fallbackReason: "not_rcs_capable" },
      }),
    );
    const run = await runCommand(RcsSend, [
      "--to",
      "+15125550190",
      "--text",
      "20% off this weekend",
      "--type",
      "marketing",
    ]);
    expect(run.exitCode).toBeUndefined();
    expect(body(0)).toMatchObject({ channel: "rcs", messageType: "marketing" });
  });

  it("leaves messageType out without --type, so the API's RCS default applies", async () => {
    mockFetch.mockResolvedValueOnce(
      respond(201, { ...FALLBACK, rcs: { requestedChannel: "rcs", agentId: "agent_1" } }),
    );
    await runCommand(RcsSend, ["--to", "+15125550190", "--text", "Your order shipped"]);
    expect(body(0)).not.toHaveProperty("messageType");
  });

  it("only takes transactional or marketing for --type", () => {
    expect(RcsSend.flags.type.options).toEqual(["transactional", "marketing"]);
  });

  it("says why a message went as an SMS", async () => {
    mockFetch.mockResolvedValueOnce(
      respond(201, {
        ...FALLBACK,
        rcs: { requestedChannel: "rcs", agentId: "agent_1", fallbackReason: "capability_check_failed" },
      }),
    );
    const run = await runCommand(RcsSend, ["--to", "+15125550190", "--text", "Your order shipped"]);
    expect(run.stdout).toContain("Message queued as SMS — the RCS capability check failed");
  });
});
