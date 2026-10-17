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

  it("shows the API's rcs_not_enabled code when RCS is off", async () => {
    setOutputFormat("json");
    mockFetch.mockResolvedValueOnce(
      respond(404, {
        error: "rcs_not_enabled",
        message: "RCS isn't enabled for this account yet.",
      }),
    );
    const run = await runCommand(RcsSend, ["--to", "+15125550190", "--text", "Hi"]);
    expect(run.exitCode).toBe(1);
    expect(JSON.parse(run.stderr)).toMatchObject({
      message: "RCS isn't enabled for this account yet.",
      code: "rcs_not_enabled",
    });
  });

  it("reports an unknown --agent with the API's code, not the early-access hint", async () => {
    setOutputFormat("json");
    mockFetch.mockResolvedValueOnce(
      respond(404, {
        error: "rcs_not_found",
        message: "No RCS agent with this id belongs to the workspace.",
      }),
    );
    const run = await runCommand(RcsSend, [
      "--to",
      "+15125550190",
      "--text",
      "Hi",
      "--agent",
      "agent_missing",
    ]);
    expect(run.exitCode).toBe(1);
    const reported = JSON.parse(run.stderr);
    expect(reported).toMatchObject({
      message: "No RCS agent with this id belongs to the workspace.",
      code: "rcs_not_found",
    });
    expect(JSON.stringify(reported)).not.toContain("early access");
  });

  it("shows the API's code and suggestion for a 400", async () => {
    setOutputFormat("json");
    mockFetch.mockResolvedValueOnce(
      respond(400, {
        error: "rcs_invalid_content",
        message: "A suggested reply is longer than 25 characters.",
        suggestion: "Shorten the reply to 25 characters or fewer.",
      }),
    );
    const run = await runCommand(RcsSend, ["--to", "+15125550190", "--text", "Hi"]);
    expect(run.exitCode).toBe(1);
    expect(JSON.parse(run.stderr)).toMatchObject({
      message: "A suggested reply is longer than 25 characters.",
      code: "rcs_invalid_content",
      hint: "Shorten the reply to 25 characters or fewer.",
    });
  });
});
