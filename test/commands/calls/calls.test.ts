/**
 * Voice calls wire-contract tests
 * Validates the request/response shapes the `sendly calls` commands rely on
 * (create -> list -> get -> hangup -> recording), the refusal codes the CLI
 * explains, and the shared formatting helpers.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  ApiError,
  ApiKeyRequiredError,
  AuthenticationError,
  InsufficientCreditsError,
  NotFoundError,
  ValidationError,
} from "../../../src/lib/api-client.js";

vi.mock("../../../src/lib/config.js", () => ({
  isAuthenticated: vi.fn(() => true),
  getAuthToken: vi.fn(() => "sk_live_v1_mock"),
  getStoredAccessToken: vi.fn(() => undefined),
  setAuthTokens: vi.fn(),
  resolveBaseUrl: vi.fn(() => "https://sendly.live"),
  getConfigValue: vi.fn((key: string) => {
    if (key === "baseUrl") return "https://sendly.live";
    return undefined;
  }),
  getEffectiveValue: vi.fn((key: string) => {
    if (key === "baseUrl") return "https://sendly.live";
    if (key === "maxRetries") return 0;
    if (key === "timeout") return 30000;
    return undefined;
  }),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

import { apiClient } from "../../../src/lib/api-client.js";
import { setOutputFormat } from "../../../src/lib/output.js";
import {
  CALLS_PATH,
  callHangupPath,
  callPath,
  callRecordingPath,
  formatCallStatus,
  formatDuration,
  formatHangupClass,
  formatTranscriptTime,
  parseMetadataFlags,
  reportCallsError,
  shortId,
  type Call,
  type CallListResponse,
  type CallRecording,
} from "../../../src/lib/calls.js";
import { nextPageCommand } from "../../../src/commands/calls/list.js";

function ok(status: number, body: unknown) {
  return {
    ok: true,
    status,
    json: () => Promise.resolve(body),
    headers: new Map(),
  };
}

function fail(status: number, body: unknown) {
  return {
    ok: false,
    status,
    json: () => Promise.resolve(body),
    headers: new Map(),
  };
}

const CALL_ID = "6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f";
const AGENT_ID = "3c4d5e6f-7081-4293-a4b5-c6d7e8f90a1b";

const CALL: Call = {
  id: CALL_ID,
  object: "call",
  kind: "pstn",
  direction: "outbound",
  status: "ringing",
  handledBy: "agent",
  agentId: AGENT_ID,
  from: "+15555550188",
  to: "+15555550123",
  callerName: "Front Desk",
  calleeName: "+15555550123",
  startedAt: "2026-09-12T14:03:11.000Z",
  answeredAt: null,
  endedAt: null,
  durationSecs: 0,
  creditsCharged: 0,
  billing: "metered",
  hangupClass: null,
  recordingStatus: null,
  metadata: { crmId: "lead_8812" },
};

describe("calls wire contract", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("create POSTs to, agentId, from, context and metadata with an automatic idempotency key", async () => {
    mockFetch.mockResolvedValueOnce(ok(201, CALL));

    const response = await apiClient.post<Call>(CALLS_PATH, {
      to: "+15555550123",
      agentId: AGENT_ID,
      from: "+15555550188",
      context: "Confirm the 3pm appointment on Tuesday",
      metadata: { crmId: "lead_8812" },
    });

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://sendly.live/api/v1/calls");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer sk_live_v1_mock");
    expect(init.headers["Idempotency-Key"]).toMatch(/^sendly-cli-retry-/);
    expect(JSON.parse(init.body)).toEqual({
      to: "+15555550123",
      agentId: AGENT_ID,
      from: "+15555550188",
      context: "Confirm the 3pm appointment on Tuesday",
      metadata: { crmId: "lead_8812" },
    });
    expect(response.id).toBe(CALL_ID);
    expect(response.status).toBe("ringing");
    expect(response.handledBy).toBe("agent");
    expect(response.billing).toBe("metered");
    expect(response.creditsCharged).toBe(0);
    expect(response.metadata).toEqual({ crmId: "lead_8812" });
  });

  it("create omits from, context and metadata when they were not given", async () => {
    mockFetch.mockResolvedValueOnce(ok(201, CALL));

    await apiClient.post<Call>(CALLS_PATH, {
      to: "+15555550123",
      agentId: AGENT_ID,
    });

    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({
      to: "+15555550123",
      agentId: AGENT_ID,
    });
  });

  it("list GETs /api/v1/calls with the camelCase query keys and drops unset filters", async () => {
    const body: CallListResponse = {
      data: [CALL],
      pagination: { total: 132, limit: 20, offset: 20, hasMore: true },
    };
    mockFetch.mockResolvedValueOnce(ok(200, body));

    const response = await apiClient.get<CallListResponse>(CALLS_PATH, {
      limit: 20,
      offset: 20,
      status: "active",
      direction: "outbound",
      agentId: AGENT_ID,
    });

    const [url, init] = mockFetch.mock.calls[0];
    const parsed = new URL(url);
    expect(parsed.pathname).toBe("/api/v1/calls");
    expect(parsed.searchParams.get("limit")).toBe("20");
    expect(parsed.searchParams.get("offset")).toBe("20");
    expect(parsed.searchParams.get("status")).toBe("active");
    expect(parsed.searchParams.get("direction")).toBe("outbound");
    expect(parsed.searchParams.get("agentId")).toBe(AGENT_ID);
    expect(init.method).toBe("GET");
    expect(init.headers).not.toHaveProperty("Idempotency-Key");
    expect(response.data[0].id).toBe(CALL_ID);
    expect(response.pagination.hasMore).toBe(true);
    expect(response.pagination.total).toBe(132);

    mockFetch.mockResolvedValueOnce(ok(200, { ...body, data: [] }));
    await apiClient.get<CallListResponse>(CALLS_PATH, {
      limit: 50,
      offset: 0,
      status: undefined,
      direction: undefined,
      agentId: undefined,
    });
    const second = new URL(mockFetch.mock.calls[1][0]);
    expect([...second.searchParams.keys()].sort()).toEqual(["limit", "offset"]);
  });

  it("get returns the Call with a transcript for agent calls", async () => {
    mockFetch.mockResolvedValueOnce(
      ok(200, {
        ...CALL,
        status: "completed",
        answeredAt: "2026-09-12T14:03:19.000Z",
        endedAt: "2026-09-12T14:05:02.000Z",
        durationSecs: 103,
        creditsCharged: 20,
        billing: "settled",
        hangupClass: "agent_agent_hangup",
        recordingStatus: "ready",
        transcript: [
          { speaker: "agent", text: "Hi Jordan, this is the front desk.", atMs: 0 },
          { speaker: "caller", text: "Hello.", atMs: 2400 },
        ],
      }),
    );

    const call = await apiClient.get<Call>(callPath(CALL_ID));

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe(`https://sendly.live/api/v1/calls/${CALL_ID}`);
    expect(init.method).toBe("GET");
    expect(call.transcript).toHaveLength(2);
    expect(call.transcript?.[1]).toEqual({
      speaker: "caller",
      text: "Hello.",
      atMs: 2400,
    });
    expect(call.hangupClass).toBe("agent_agent_hangup");
    expect(call.billing).toBe("settled");
  });

  it("get has no transcript key on a dashboard-handled call", async () => {
    mockFetch.mockResolvedValueOnce(
      ok(200, {
        ...CALL,
        handledBy: "dashboard",
        agentId: null,
        status: "completed",
        hangupClass: "normal",
      }),
    );

    const call = await apiClient.get<Call>(callPath(CALL_ID));
    expect(call).not.toHaveProperty("transcript");
    expect(call.metadata).toEqual({ crmId: "lead_8812" });
  });

  it("ids are percent-encoded before they reach the path", () => {
    expect(callPath("a/b?c#d")).toBe("/api/v1/calls/a%2Fb%3Fc%23d");
    expect(callHangupPath("x y")).toBe("/api/v1/calls/x%20y/hangup");
    expect(callRecordingPath("x y")).toBe("/api/v1/calls/x%20y/recording");
  });

  it("hangup POSTs an empty JSON object and returns the updated Call", async () => {
    mockFetch.mockResolvedValueOnce(
      ok(200, { ...CALL, status: "cancelled", hangupClass: "caller_cancelled" }),
    );

    const call = await apiClient.post<Call>(callHangupPath(CALL_ID), {});

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe(`https://sendly.live/api/v1/calls/${CALL_ID}/hangup`);
    expect(init.method).toBe("POST");
    expect(init.body).toBe("{}");
    expect(init.headers["Idempotency-Key"]).toMatch(/^sendly-cli-retry-/);
    expect(call.status).toBe("cancelled");
    expect(call.hangupClass).toBe("caller_cancelled");
  });

  it("recording returns a null URL until it is ready and a signed URL with expiry once it is", async () => {
    mockFetch.mockResolvedValueOnce(
      ok(200, {
        callId: CALL_ID,
        status: "recording",
        url: null,
        expiresAt: null,
        contentType: null,
      }),
    );
    const pending = await apiClient.get<CallRecording>(
      callRecordingPath(CALL_ID),
    );
    expect(mockFetch.mock.calls[0][0]).toBe(
      `https://sendly.live/api/v1/calls/${CALL_ID}/recording`,
    );
    expect(pending.url).toBeNull();
    expect(pending.expiresAt).toBeNull();
    expect(pending.contentType).toBeNull();

    mockFetch.mockResolvedValueOnce(
      ok(200, {
        callId: CALL_ID,
        status: "ready",
        url: "https://media.sendly.live/recordings/signed",
        expiresAt: "2026-09-12T14:10:00.000Z",
        contentType: "audio/ogg",
      }),
    );
    const ready = await apiClient.get<CallRecording>(
      callRecordingPath(CALL_ID),
    );
    expect(ready.status).toBe("ready");
    expect(ready.url).toBe("https://media.sendly.live/recordings/signed");
    expect(ready.expiresAt).toBe("2026-09-12T14:10:00.000Z");
    expect(ready.contentType).toBe("audio/ogg");
  });

  it("a 402 insufficient_credits keeps the server's message with the balance", async () => {
    mockFetch.mockResolvedValueOnce(
      fail(402, {
        error: "insufficient_credits",
        message: "Calls cost 10 credits a minute. Current balance: 4.",
        creditsNeeded: 10,
        currentBalance: 4,
      }),
    );

    const attempt = apiClient.post(CALLS_PATH, {
      to: "+15555550123",
      agentId: AGENT_ID,
    });
    await expect(attempt).rejects.toBeInstanceOf(InsufficientCreditsError);
    await expect(attempt).rejects.toMatchObject({
      code: "insufficient_credits",
      message: "Calls cost 10 credits a minute. Current balance: 4.",
    });
  });

  it("a 428 e911_required surfaces its code and message", async () => {
    mockFetch.mockResolvedValueOnce(
      fail(428, {
        error: "e911_required",
        message:
          "Register an emergency address for this number before placing calls. It's required by US law.",
      }),
    );

    const attempt = apiClient.post(CALLS_PATH, {
      to: "+15555550123",
      agentId: AGENT_ID,
    });
    await expect(attempt).rejects.toBeInstanceOf(ApiError);
    await expect(attempt).rejects.toMatchObject({
      code: "e911_required",
      statusCode: 428,
    });
  });

  it("a 409 lines_busy surfaces its code", async () => {
    mockFetch.mockResolvedValueOnce(
      fail(409, {
        error: "lines_busy",
        message: "Your workspace's lines are all in use. Try again in a moment.",
      }),
    );

    const attempt = apiClient.post(CALLS_PATH, {
      to: "+15555550123",
      agentId: AGENT_ID,
    });
    await expect(attempt).rejects.toMatchObject({
      code: "lines_busy",
      statusCode: 409,
    });
  });

  it("the dark-entitlement 404 keeps its message so the CLI can tell it from a bad id", async () => {
    mockFetch.mockResolvedValueOnce(
      fail(404, {
        error: "voice_not_enabled",
        message: "Voice is not enabled for your account.",
      }),
    );

    const attempt = apiClient.get(CALLS_PATH);
    await expect(attempt).rejects.toBeInstanceOf(NotFoundError);
    await expect(attempt).rejects.toMatchObject({
      message: "Voice is not enabled for your account.",
    });
  });

  it("a test key on a write surfaces the live-key message", async () => {
    mockFetch.mockResolvedValueOnce(
      fail(403, {
        error: "live_key_required",
        message: "Phone calls need a live API key.",
      }),
    );

    const attempt = apiClient.post(callHangupPath(CALL_ID), {});
    await expect(attempt).rejects.toBeInstanceOf(ApiKeyRequiredError);
    await expect(attempt).rejects.toMatchObject({
      message: "Phone calls need a live API key.",
    });
  });

  it("a missing scope surfaces as an AuthenticationError with the scope named", async () => {
    mockFetch.mockResolvedValueOnce(
      fail(403, {
        error: "insufficient_permissions",
        message: "Missing required scopes: calls:write",
      }),
    );

    const attempt = apiClient.post(CALLS_PATH, {});
    await expect(attempt).rejects.toBeInstanceOf(AuthenticationError);
    await expect(attempt).rejects.toMatchObject({
      message: "Missing required scopes: calls:write",
    });
  });
});

describe("calls helpers", () => {
  it("formats durations as seconds under a minute and m/ss above", () => {
    expect(formatDuration(0)).toBe("-");
    expect(formatDuration(null)).toBe("-");
    expect(formatDuration(45)).toBe("45s");
    expect(formatDuration(60)).toBe("1m 00s");
    expect(formatDuration(103)).toBe("1m 43s");
    expect(formatDuration(3600)).toBe("60m 00s");
  });

  it("formats transcript offsets as mm:ss", () => {
    expect(formatTranscriptTime(0)).toBe("00:00");
    expect(formatTranscriptTime(2400)).toBe("00:02");
    expect(formatTranscriptTime(65_000)).toBe("01:05");
  });

  it("builds the next-page hint from the filters and limit actually passed", () => {
    expect(
      nextPageCommand(
        { status: "active", direction: "outbound", agent: AGENT_ID, limit: 20 },
        40,
      ),
    ).toBe(
      `sendly calls list --status active --direction outbound --agent ${AGENT_ID} --limit 20 --offset 40`,
    );
    expect(nextPageCommand({ limit: 50 }, 50)).toBe(
      "sendly calls list --limit 50 --offset 50",
    );
    expect(nextPageCommand({ direction: "inbound", limit: 10 }, 30)).toBe(
      "sendly calls list --direction inbound --limit 10 --offset 30",
    );
  });

  it("shortens ids to their first 8 characters", () => {
    expect(shortId(CALL_ID)).toBe("6f1c2d3e");
    expect(shortId("abc")).toBe("abc");
  });

  it("keeps the status text inside any colouring", () => {
    for (const status of [
      "ringing",
      "active",
      "completed",
      "no_answer",
      "busy",
      "cancelled",
      "declined",
      "failed",
      "suspended",
    ]) {
      expect(formatCallStatus(status)).toContain(status);
    }
  });

  it("labels known hangup classes and passes unknown ones through", () => {
    expect(formatHangupClass(null)).toBe("-");
    expect(formatHangupClass("credits_exhausted")).toContain("credits_exhausted");
    expect(formatHangupClass("credits_exhausted")).toContain("ran out of credits");
    expect(formatHangupClass("something_new")).toBe("something_new");
  });

  it("parses repeatable key=value metadata flags", () => {
    expect(parseMetadataFlags(undefined)).toEqual({});
    expect(parseMetadataFlags([])).toEqual({});
    expect(
      parseMetadataFlags(["crmId=lead_8812", "note=a=b", "source=cli"]),
    ).toEqual({ crmId: "lead_8812", note: "a=b", source: "cli" });
    expect(parseMetadataFlags(["novalue"])).toMatch(/key=value/);
    expect(parseMetadataFlags(["=x"])).toMatch(/key=value/);
  });
});

describe("reportCallsError", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    setOutputFormat("json");
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
    setOutputFormat("human");
  });

  function reported(): Record<string, unknown> {
    return JSON.parse(String(errorSpy.mock.calls[0][0]));
  }

  it("explains 402 with the API message and the credits hint", () => {
    const handled = reportCallsError(
      new InsufficientCreditsError(
        "Calls cost 10 credits a minute. Current balance: 4.",
      ),
    );
    expect(handled).toBe(true);
    const out = reported();
    expect(out.message).toBe("Calls cost 10 credits a minute. Current balance: 4.");
    expect(out.code).toBe("insufficient_credits");
    expect(String(out.hint)).toContain("sendly credits");
  });

  it("explains 428 e911_required with the dashboard hint", () => {
    const handled = reportCallsError(
      new ApiError(
        "e911_required",
        "Register an emergency address for this number before placing calls. It's required by US law.",
        428,
      ),
    );
    expect(handled).toBe(true);
    const out = reported();
    expect(out.code).toBe("e911_required");
    expect(String(out.hint)).toContain("Calls → Settings");
  });

  it("explains 409 lines_busy, agent_disabled and no_voice_number", () => {
    for (const code of ["lines_busy", "agent_disabled", "no_voice_number"]) {
      errorSpy.mockClear();
      expect(reportCallsError(new ApiError(code, "refused", 409))).toBe(true);
      expect(reported().code).toBe(code);
      expect(reported().hint).toBeTruthy();
    }
  });

  it("recognises the dark-entitlement and call_not_found 404s by their messages", () => {
    expect(
      reportCallsError(new NotFoundError("Voice is not enabled for your account.")),
    ).toBe(true);
    expect(reported().code).toBe("voice_not_enabled");

    errorSpy.mockClear();
    expect(
      reportCallsError(
        new NotFoundError("No call with that id is in this workspace."),
      ),
    ).toBe(true);
    expect(reported().code).toBe("call_not_found");

    errorSpy.mockClear();
    expect(reportCallsError(new NotFoundError("Resource not found"))).toBe(false);
  });

  it("points a test key at a live key instead of the generic key hint", () => {
    expect(
      reportCallsError(new ApiKeyRequiredError("Phone calls need a live API key.")),
    ).toBe(true);
    const out = reported();
    expect(out.code).toBe("live_key_required");
    expect(String(out.hint)).toContain("--type live");
  });

  it("names the calls scopes on a missing-scope 403", () => {
    expect(
      reportCallsError(
        new AuthenticationError("Missing required scopes: calls:write"),
      ),
    ).toBe(true);
    expect(String(reported().hint)).toContain("calls:write");
  });

  it("explains from_number_required and agent_required 400s", () => {
    expect(
      reportCallsError(new ValidationError("Choose which number to call from.")),
    ).toBe(true);
    expect(reported().code).toBe("from_number_required");
    expect(String(reported().hint)).toContain("--from");

    errorSpy.mockClear();
    expect(
      reportCallsError(
        new ValidationError(
          "Calls placed over the API are answered by an AI agent. Pass agentId.",
        ),
      ),
    ).toBe(true);
    expect(reported().code).toBe("agent_required");
  });

  it("leaves unrelated errors to the base command", () => {
    expect(reportCallsError(new ApiError("unknown_error", "HTTP 418", 418))).toBe(
      false,
    );
    expect(reportCallsError(new Error("boom"))).toBe(false);
  });
});
