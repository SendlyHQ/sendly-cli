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

import CallsTransfer from "../../../src/commands/calls/transfer.js";
import CallsGet from "../../../src/commands/calls/get.js";
import CallsList from "../../../src/commands/calls/list.js";
import { VOICE_AGENT_KINDS } from "../../../src/lib/voice.js";
import { setOutputFormat } from "../../../src/lib/output.js";
import { respond, runCommand } from "../../helpers/run-command.js";

const CALL = {
  id: "00000000-0000-4000-8000-000000000001",
  object: "call",
  kind: "pstn",
  channel: "phone",
  direction: "inbound",
  status: "active",
  handledBy: "agent",
  agentId: "00000000-0000-4000-8000-000000000002",
  from: "+15555550101",
  to: "+15555550100",
  callerName: "+15555550101",
  calleeName: "Front Desk",
  startedAt: "2026-01-01T00:00:00.000Z",
  answeredAt: "2026-01-01T00:00:05.000Z",
  endedAt: null,
  durationSecs: 0,
  creditsCharged: 10,
  billing: "metered",
  hangupClass: null,
  agentKind: "websocket",
  agentFallback: false,
  transfer: { to: "+15555550102", status: "pending", failureReason: null },
  recordingStatus: null,
  metadata: {},
};

describe("sendly calls transfer", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    setOutputFormat("human");
  });

  afterEach(() => {
    setOutputFormat("human");
  });

  it("POSTs { to } to the call's transfer path and shows the pending transfer", async () => {
    mockFetch.mockResolvedValueOnce(respond(202, CALL));

    const run = await runCommand(CallsTransfer, [CALL.id, "--to", " +15555550102 "]);

    expect(run.exitCode).toBeUndefined();
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe(`https://sendly.live/api/v1/calls/${CALL.id}/transfer`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ to: "+15555550102" });
    expect(init.headers["Idempotency-Key"]).toMatch(/^sendly-cli-retry-/);
    expect(run.stdout).toContain("Transfer started");
    expect(run.stdout).toMatch(/Transfer.*\+15555550102.*pending/);
    expect(run.stdout).toContain(`sendly calls get ${CALL.id}`);
  });

  it("sends an empty body without --to so the agent's transfer number is used", async () => {
    mockFetch.mockResolvedValueOnce(respond(202, CALL));

    await runCommand(CallsTransfer, [CALL.id]);

    expect(mockFetch.mock.calls[0][1].body).toBe("{}");
  });

  it("prints the Call unchanged with --json", async () => {
    setOutputFormat("json");
    mockFetch.mockResolvedValueOnce(respond(202, CALL));

    const run = await runCommand(CallsTransfer, [CALL.id, "--to", "+15555550102"]);

    expect(JSON.parse(run.stdout)).toEqual(CALL);
  });

  it("exits 1 with the code and a hint when the API refuses", async () => {
    setOutputFormat("json");
    mockFetch.mockResolvedValueOnce(
      respond(409, {
        error: "call_not_transferable",
        message: "Only incoming phone calls can be transferred.",
      }),
    );

    const run = await runCommand(CallsTransfer, [CALL.id]);

    expect(run.exitCode).toBe(1);
    const out = JSON.parse(run.stderr);
    expect(out.code).toBe("call_not_transferable");
    expect(out.hint).toBeTruthy();
  });
});

describe("calls get and list show the agent kind, fallback and transfer", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    setOutputFormat("human");
  });

  afterEach(() => {
    setOutputFormat("human");
  });

  it("get shows the agent kind and the transfer", async () => {
    mockFetch.mockResolvedValueOnce(
      respond(200, {
        ...CALL,
        transfer: { to: "+15555550102", status: "failed", failureReason: "busy" },
      }),
    );

    const run = await runCommand(CallsGet, [CALL.id]);

    expect(run.stdout).toMatch(/Agent kind\s.*websocket/);
    expect(run.stdout).toMatch(/Transfer\s.*\+15555550102.*failed.*line busy/);
    expect(run.stdout).not.toContain("Agent fallback");
  });

  it("get says when the customer's agent could not be reached", async () => {
    mockFetch.mockResolvedValueOnce(
      respond(200, {
        ...CALL,
        status: "completed",
        agentFallback: true,
        hangupClass: "agent_byo_failed",
        transfer: null,
      }),
    );

    const run = await runCommand(CallsGet, [CALL.id]);

    expect(run.stdout).toMatch(/Agent fallback\s.*could not be reached/);
    expect(run.stdout).toMatch(/Transfer\s.*none/);
  });

  it("list sends --agent-kind as agentKind and shows the kind column", async () => {
    mockFetch.mockResolvedValueOnce(
      respond(200, {
        data: [{ ...CALL, agentFallback: true }],
        pagination: { total: 1, limit: 50, offset: 0, hasMore: false },
      }),
    );

    const run = await runCommand(CallsList, ["--agent-kind", "websocket"]);

    const parsed = new URL(mockFetch.mock.calls[0][0]);
    expect(parsed.searchParams.get("agentKind")).toBe("websocket");
    expect(run.stdout).toContain("websocket");
    expect(run.stdout).toContain("fallback");
    expect(CallsList.flags["agent-kind"].options).toEqual([...VOICE_AGENT_KINDS]);
  });
});
