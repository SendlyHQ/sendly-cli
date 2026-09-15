/**
 * Voice configuration wire-contract tests
 * Validates the request/response shapes the `sendly voice` commands rely on
 * (numbers, emergency address, agents, voices), the refusal codes the CLI
 * explains, and the shared helpers.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  ApiError,
  ApiKeyRequiredError,
  AuthenticationError,
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
  VOICE_AGENTS_PATH,
  VOICE_MODES,
  VOICE_NUMBERS_PATH,
  VOICE_VOICES_PATH,
  apiErrorCode,
  buildAgentBody,
  buildEmergencyAddressBody,
  buildNumberUpdateBody,
  emergencyAddressCommand,
  formatAddress,
  formatEmergencyStatus,
  formatRates,
  formatTexting,
  formatVoiceMode,
  needsEmergencyAddress,
  reportVoiceError,
  shellQuote,
  voiceAgentPath,
  voiceNumberEmergencyAddressPath,
  voiceNumberPath,
  type DeletedVoiceAgent,
  type Voice,
  type VoiceAgent,
  type VoiceListResponse,
  type VoiceNumber,
} from "../../../src/lib/voice.js";
import VoiceNumbersUpdate from "../../../src/commands/voice/numbers/update.js";
import VoiceNumbersEmergencyAddress from "../../../src/commands/voice/numbers/emergency-address.js";
import VoiceAgentsCreate from "../../../src/commands/voice/agents/create.js";
import VoiceAgentsUpdate from "../../../src/commands/voice/agents/update.js";
import VoiceAgentsDelete from "../../../src/commands/voice/agents/delete.js";

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

const NUMBER_ID = "5f0c1c2e-2a44-4d4b-9d51-0a9b0f6f4a11";
const AGENT_ID = "3c4d5e6f-7081-4293-a4b5-c6d7e8f90a1b";

const NUMBER: VoiceNumber = {
  id: NUMBER_ID,
  object: "voice_number",
  phoneNumber: "+15555550188",
  phoneNumberType: "local",
  countryCode: "US",
  isDefault: true,
  voiceEnabled: true,
  voiceMode: "agent",
  agentId: AGENT_ID,
  emergencyAddress: {
    status: "active",
    address: {
      street: "500 Example Ave",
      unit: "Suite 2",
      city: "Austin",
      state: "TX",
      zip: "78701",
      country: "US",
    },
  },
  ratePerMinute: { inbound: 2, outbound: 2, agent: 10 },
};

const AGENT: VoiceAgent = {
  id: AGENT_ID,
  object: "voice_agent",
  name: "Front desk",
  enabled: true,
  voice: "ashley",
  voiceLabel: "Ashley (US, warm)",
  language: "en-US",
  greeting: "Thanks for calling Acme, how can I help?",
  instructions: "Answer questions about opening hours.",
  tools: { sendSms: false, transferTo: null },
  canSendSms: true,
  callsHandled: 12,
  avgDurationSecs: 74,
  createdAt: "2026-09-14T17:00:00.000Z",
  updatedAt: "2026-09-14T17:05:00.000Z",
};

describe("voice wire contract", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("numbers list GETs /api/v1/voice/numbers and returns the data array", async () => {
    mockFetch.mockResolvedValueOnce(ok(200, { data: [NUMBER] }));

    const response = await apiClient.get<VoiceListResponse<VoiceNumber>>(
      VOICE_NUMBERS_PATH,
    );

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://sendly.live/api/v1/voice/numbers");
    expect(init.method).toBe("GET");
    expect(init.headers).not.toHaveProperty("Idempotency-Key");
    expect(response.data).toHaveLength(1);
    expect(response.data[0].voiceMode).toBe("agent");
    expect(response.data[0].emergencyAddress?.address?.unit).toBe("Suite 2");
  });

  it("names a number by id or by its E.164 phone number with the + percent-encoded", async () => {
    expect(voiceNumberPath("+15555550188")).toBe(
      "/api/v1/voice/numbers/%2B15555550188",
    );
    expect(voiceNumberPath(NUMBER_ID)).toBe(`/api/v1/voice/numbers/${NUMBER_ID}`);
    expect(voiceNumberEmergencyAddressPath("+15555550188")).toBe(
      "/api/v1/voice/numbers/%2B15555550188/emergency-address",
    );
    expect(voiceNumberPath("a/b?c#d")).toBe("/api/v1/voice/numbers/a%2Fb%3Fc%23d");
    expect(voiceAgentPath("../account/keys")).toBe(
      "/api/v1/voice/agents/..%2Faccount%2Fkeys",
    );

    mockFetch.mockResolvedValueOnce(ok(200, NUMBER));
    const number = await apiClient.get<VoiceNumber>(voiceNumberPath("+15555550188"));
    expect(mockFetch.mock.calls[0][0]).toBe(
      "https://sendly.live/api/v1/voice/numbers/%2B15555550188",
    );
    expect(number.phoneNumber).toBe("+15555550188");
  });

  it("numbers update PATCHes voiceEnabled, voiceMode and agentId with no idempotency key", async () => {
    mockFetch.mockResolvedValueOnce(ok(200, NUMBER));

    const body = buildNumberUpdateBody({
      enable: true,
      mode: "agent",
      agent: ` ${AGENT_ID} `,
    });
    await apiClient.patch<VoiceNumber>(voiceNumberPath("+15555550188"), body);

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://sendly.live/api/v1/voice/numbers/%2B15555550188");
    expect(init.method).toBe("PATCH");
    expect(init.headers).not.toHaveProperty("Idempotency-Key");
    const sent = JSON.parse(init.body);
    expect(sent).toEqual({ voiceEnabled: true, voiceMode: "agent", agentId: AGENT_ID });
    expect(sent).not.toHaveProperty("voiceAgentId");
  });

  it("builds the number update body from exactly the flags passed", () => {
    expect(buildNumberUpdateBody({})).toEqual({});
    expect(buildNumberUpdateBody({ disable: true })).toEqual({ voiceEnabled: false });
    expect(buildNumberUpdateBody({ mode: "none" })).toEqual({ voiceMode: "none" });
    expect(buildNumberUpdateBody({ mode: "ring_dashboard" })).toEqual({
      voiceMode: "ring_dashboard",
    });
    expect(buildNumberUpdateBody({ agent: "" })).toEqual({ agentId: null });
  });

  it("emergency address POSTs the address with an automatic idempotency key", async () => {
    mockFetch.mockResolvedValueOnce(
      ok(200, { ...NUMBER, emergencyAddress: { ...NUMBER.emergencyAddress, status: "provisioning" } }),
    );

    const body = buildEmergencyAddressBody({
      street: " 500 Example Ave ",
      unit: "Suite 2",
      city: "Austin",
      state: "TX",
      zip: "78701",
    });
    expect(typeof body).toBe("object");
    const number = await apiClient.post<VoiceNumber>(
      voiceNumberEmergencyAddressPath("+15555550188"),
      body as Record<string, string>,
    );

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe(
      "https://sendly.live/api/v1/voice/numbers/%2B15555550188/emergency-address",
    );
    expect(init.method).toBe("POST");
    expect(init.headers["Idempotency-Key"]).toMatch(/^sendly-cli-retry-/);
    expect(JSON.parse(init.body)).toEqual({
      street: "500 Example Ave",
      unit: "Suite 2",
      city: "Austin",
      state: "TX",
      zip: "78701",
    });
    expect(number.emergencyAddress?.status).toBe("provisioning");
  });

  it("refuses a blank address field and omits unit and country when they were not given", () => {
    expect(
      buildEmergencyAddressBody({ street: "  ", city: "Austin", state: "TX", zip: "78701" }),
    ).toBe("--street cannot be empty");
    expect(
      buildEmergencyAddressBody({ street: "500 Example Ave", city: "Austin", state: "TX", zip: "" }),
    ).toBe("--zip cannot be empty");
    expect(
      buildEmergencyAddressBody({
        street: "100 Sample St",
        city: "Toronto",
        state: "ON",
        zip: "M5V 2T6",
        unit: " ",
        country: "CA",
      }),
    ).toEqual({ street: "100 Sample St", city: "Toronto", state: "ON", zip: "M5V 2T6", country: "CA" });
  });

  it("agents list and get return VoiceAgents with no model field", async () => {
    mockFetch.mockResolvedValueOnce(ok(200, { data: [AGENT] }));
    const list = await apiClient.get<VoiceListResponse<VoiceAgent>>(VOICE_AGENTS_PATH);
    expect(mockFetch.mock.calls[0][0]).toBe("https://sendly.live/api/v1/voice/agents");
    expect(list.data[0]).not.toHaveProperty("llmModel");

    mockFetch.mockResolvedValueOnce(ok(200, AGENT));
    const agent = await apiClient.get<VoiceAgent>(voiceAgentPath(AGENT_ID));
    expect(mockFetch.mock.calls[1][0]).toBe(
      `https://sendly.live/api/v1/voice/agents/${AGENT_ID}`,
    );
    expect(agent.canSendSms).toBe(true);
    expect(agent.tools).toEqual({ sendSms: false, transferTo: null });
  });

  it("agents create POSTs the camelCase body with an automatic idempotency key", async () => {
    mockFetch.mockResolvedValueOnce(ok(201, { ...AGENT, enabled: false }));

    const body = buildAgentBody({
      name: " Front desk ",
      disable: true,
      voice: "olivia",
      language: "en-GB",
      greeting: "Thanks for calling Acme, how can I help?",
      instructions: "Answer questions about opening hours.",
      sms: false,
    });
    const agent = await apiClient.post<VoiceAgent>(VOICE_AGENTS_PATH, body);

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://sendly.live/api/v1/voice/agents");
    expect(init.method).toBe("POST");
    expect(init.headers["Idempotency-Key"]).toMatch(/^sendly-cli-retry-/);
    expect(JSON.parse(init.body)).toEqual({
      name: "Front desk",
      enabled: false,
      voice: "olivia",
      language: "en-GB",
      greeting: "Thanks for calling Acme, how can I help?",
      instructions: "Answer questions about opening hours.",
      tools: { sendSms: false },
    });
    expect(agent.enabled).toBe(false);
  });

  it("builds the agent body from exactly the flags passed", () => {
    expect(buildAgentBody({})).toEqual({});
    expect(buildAgentBody({ enable: true })).toEqual({ enabled: true });
    expect(buildAgentBody({ sms: true })).toEqual({ tools: { sendSms: true } });
    expect(buildAgentBody({ greeting: "" })).toEqual({ greeting: "" });
    expect(buildAgentBody({ name: "Front desk", sms: undefined })).toEqual({
      name: "Front desk",
    });
  });

  it("agents update PATCHes only the changed fields, and an empty body is allowed", async () => {
    mockFetch.mockResolvedValue(ok(200, AGENT));

    await apiClient.patch<VoiceAgent>(
      voiceAgentPath(AGENT_ID),
      buildAgentBody({ voice: "edward", sms: false }),
    );
    let [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe(`https://sendly.live/api/v1/voice/agents/${AGENT_ID}`);
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ voice: "edward", tools: { sendSms: false } });

    await apiClient.patch<VoiceAgent>(voiceAgentPath(AGENT_ID), buildAgentBody({}));
    [, init] = mockFetch.mock.calls[1];
    expect(init.body).toBe("{}");
  });

  it("agents delete sends DELETE with no body and returns the deleted marker", async () => {
    const deleted: DeletedVoiceAgent = { id: AGENT_ID, object: "voice_agent", deleted: true };
    mockFetch.mockResolvedValueOnce(ok(200, deleted));

    const response = await apiClient.delete<DeletedVoiceAgent>(voiceAgentPath(AGENT_ID));

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe(`https://sendly.live/api/v1/voice/agents/${AGENT_ID}`);
    expect(init.method).toBe("DELETE");
    expect(init.body).toBeUndefined();
    expect(response).toEqual(deleted);
  });

  it("voices GETs /api/v1/voice/voices", async () => {
    const voices: Voice[] = [
      { id: "ashley", label: "Ashley (US, warm)", language: "en" },
      { id: "diego", label: "Diego (Spanish, MX)", language: "es" },
    ];
    mockFetch.mockResolvedValueOnce(ok(200, { data: voices }));

    const response = await apiClient.get<VoiceListResponse<Voice>>(VOICE_VOICES_PATH);
    expect(mockFetch.mock.calls[0][0]).toBe("https://sendly.live/api/v1/voice/voices");
    expect(response.data).toEqual(voices);
  });

  it("keeps the server's error body on typed errors so the code and extra fields survive", async () => {
    mockFetch.mockResolvedValueOnce(
      fail(409, {
        error: "agent_in_use",
        message: "This agent answers 1 number. Point it elsewhere first.",
        numbers: ["+15555550188"],
      }),
    );
    const inUse = await apiClient
      .delete(voiceAgentPath(AGENT_ID))
      .catch((err: unknown) => err);
    expect(inUse).toBeInstanceOf(ApiError);
    expect(apiErrorCode(inUse as ApiError)).toBe("agent_in_use");
    expect((inUse as ApiError).statusCode).toBe(409);
    expect((inUse as ApiError).body?.numbers).toEqual(["+15555550188"]);

    mockFetch.mockResolvedValueOnce(
      fail(404, { error: "number_not_found", message: "This number isn't in your workspace." }),
    );
    const missing = await apiClient
      .get(voiceNumberPath("+15555550100"))
      .catch((err: unknown) => err);
    expect(missing).toBeInstanceOf(NotFoundError);
    expect(apiErrorCode(missing as ApiError)).toBe("number_not_found");

    mockFetch.mockResolvedValueOnce(
      fail(400, { error: "agent_required", message: "Choose an agent to answer this number." }),
    );
    const required = await apiClient
      .patch(voiceNumberPath("+15555550188"), { voiceMode: "agent" })
      .catch((err: unknown) => err);
    expect(required).toBeInstanceOf(ValidationError);
    expect(apiErrorCode(required as ApiError)).toBe("agent_required");

    mockFetch.mockResolvedValueOnce(
      fail(422, {
        error: "invalid_address",
        message: "That address couldn't be verified for emergency services.",
        suggested: { street: "500 Example Avenue", city: "Austin", state: "TX", zip: "78701" },
      }),
    );
    const unverified = await apiClient
      .post(voiceNumberEmergencyAddressPath("+15555550188"), { street: "500 Example Ave" })
      .catch((err: unknown) => err);
    expect(apiErrorCode(unverified as ApiError)).toBe("invalid_address");
    expect((unverified as ApiError).statusCode).toBe(422);
    expect((unverified as ApiError).body?.suggested).toMatchObject({
      street: "500 Example Avenue",
    });
  });
});

describe("voice command flags", () => {
  it("numbers update takes --enable or --disable, a --mode from the API's vocabulary, and --agent", () => {
    const flags = VoiceNumbersUpdate.flags;
    expect(flags.mode.options).toEqual([...VOICE_MODES]);
    expect(flags.enable.exclusive).toEqual(["disable"]);
    expect(flags.disable.exclusive).toEqual(["enable"]);
    expect(flags.agent).toBeDefined();
  });

  it("emergency-address requires street, city, state and zip but not unit or country", () => {
    const flags = VoiceNumbersEmergencyAddress.flags;
    for (const name of ["street", "city", "state", "zip"] as const) {
      expect(flags[name].required, name).toBe(true);
    }
    expect(flags.unit.required).toBeFalsy();
    expect(flags.country.required).toBeFalsy();
  });

  it("agents create requires --name and offers --sms/--no-sms and --disabled", () => {
    const flags = VoiceAgentsCreate.flags;
    expect(flags.name.required).toBe(true);
    expect(flags.sms.allowNo).toBe(true);
    expect(flags.sms.default).toBeUndefined();
    expect(flags.disabled).toBeDefined();
  });

  it("agents update accepts the create flags, with --disabled as an alias of --disable", () => {
    const flags = VoiceAgentsUpdate.flags;
    expect(flags.name.required).toBeFalsy();
    expect(flags.sms.allowNo).toBe(true);
    expect(flags.disable.aliases).toContain("disabled");
    expect(flags.enable.exclusive).toEqual(["disable"]);
  });

  it("agents delete can skip its confirmation with --yes", () => {
    expect(VoiceAgentsDelete.flags.yes.char).toBe("y");
  });
});

describe("voice helpers", () => {
  it("labels voice modes the way the dashboard does", () => {
    expect(formatVoiceMode("agent", true)).toContain("AI agent");
    expect(formatVoiceMode("ring_dashboard", true)).toContain("team");
    expect(formatVoiceMode("ring_dashboard", false)).toContain("off");
    expect(formatVoiceMode("none", true)).toContain("off");
  });

  it("formats an address on one line and the emergency status", () => {
    expect(formatAddress(NUMBER.emergencyAddress?.address)).toBe(
      "500 Example Ave, Suite 2, Austin, TX 78701, US",
    );
    expect(
      formatAddress({ street: "100 Sample St", city: "Toronto", state: "ON", zip: "M5V 2T6", country: "CA" }),
    ).toBe("100 Sample St, Toronto, ON M5V 2T6, CA");
    expect(formatAddress(null)).toBe("-");
    expect(formatEmergencyStatus(null)).toContain("not registered");
    expect(formatEmergencyStatus({ status: "active", address: null })).toContain("active");
    expect(formatEmergencyStatus({ status: "failed", address: null })).toContain("failed");
    expect(formatRates(NUMBER.ratePerMinute)).toBe("2 / 2 / 10");
  });

  it("says texting is on only when the tool is on, and flags a missing sending key", () => {
    expect(formatTexting({ tools: { sendSms: false, transferTo: null }, canSendSms: true })).toContain("off");
    expect(formatTexting({ tools: { sendSms: true, transferTo: null }, canSendSms: true })).toContain("on");
    expect(formatTexting({ tools: { sendSms: true, transferTo: null }, canSendSms: false })).toContain(
      "no sending key",
    );
  });

  it("asks for an emergency address only on US and Canadian numbers without an active or pending one", () => {
    expect(needsEmergencyAddress(NUMBER)).toBe(false);
    expect(needsEmergencyAddress({ ...NUMBER, emergencyAddress: null })).toBe(true);
    expect(
      needsEmergencyAddress({ ...NUMBER, emergencyAddress: { status: "failed", address: null } }),
    ).toBe(true);
    expect(
      needsEmergencyAddress({ ...NUMBER, emergencyAddress: { status: "provisioning", address: null } }),
    ).toBe(false);
    expect(needsEmergencyAddress({ ...NUMBER, countryCode: "GB", emergencyAddress: null })).toBe(false);
  });

  it("builds a runnable emergency-address command, quoting values that need it", () => {
    expect(
      emergencyAddressCommand("+15555550188", NUMBER.emergencyAddress!.address!),
    ).toBe(
      'sendly voice numbers emergency-address +15555550188 --street "500 Example Ave" --unit "Suite 2" --city Austin --state TX --zip 78701 --country US',
    );
    expect(shellQuote("TX")).toBe("TX");
    expect(shellQuote('12 "B" St $HOME')).toBe('"12 \\"B\\" St \\$HOME"');
  });
});

describe("reportVoiceError", () => {
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

  function withBody<T extends ApiError>(err: T, body: Record<string, unknown>): T {
    err.body = body;
    return err;
  }

  it("names the numbers an agent still answers and how to move them", () => {
    const err = withBody(
      new ApiError("agent_in_use", "This agent answers 2 numbers. Point them elsewhere first.", 409),
      {
        error: "agent_in_use",
        message: "This agent answers 2 numbers. Point them elsewhere first.",
        numbers: ["+15555550188", "+15555550199"],
      },
    );
    expect(reportVoiceError(err, { agentId: AGENT_ID })).toBe(true);
    const out = reported();
    expect(out.code).toBe("agent_in_use");
    expect(out.numbers).toEqual(["+15555550188", "+15555550199"]);
    expect(out.hint).toBe(
      "Point those numbers at another agent or back to the team first: sendly voice numbers update +15555550188 --mode ring_dashboard",
    );
  });

  it("joins the numbers into one line in human output", () => {
    setOutputFormat("human");
    const err = withBody(new ApiError("agent_in_use", "In use.", 409), {
      error: "agent_in_use",
      numbers: ["+15555550188", "+15555550199"],
    });
    expect(reportVoiceError(err)).toBe(true);
    const printed = errorSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(printed).toContain("+15555550188, +15555550199");
  });

  it("prints the suggested address on a 422 and the command that registers it", () => {
    const err = withBody(
      new ApiError("invalid_address", "That address couldn't be verified for emergency services.", 422),
      {
        error: "invalid_address",
        suggested: { street: "100 Sample Street", unit: null, city: "Toronto", state: "ON", zip: "M5V 2T6" },
      },
    );
    expect(
      reportVoiceError(err, {
        number: "+15555550199",
        address: { street: "100 Sample St", city: "Toronto", state: "ON", zip: "M5V2T6", country: "CA" },
      }),
    ).toBe(true);
    const out = reported();
    expect(out.code).toBe("invalid_address");
    expect(out.suggested).toEqual({ street: "100 Sample Street", city: "Toronto", state: "ON", zip: "M5V 2T6" });
    expect(out.hint).toBe(
      'If the suggested address is right, register it with: sendly voice numbers emergency-address +15555550199 --street "100 Sample Street" --city Toronto --state ON --zip "M5V 2T6" --country CA',
    );
  });

  it("prints the suggestion as one line in human output", () => {
    setOutputFormat("human");
    const err = withBody(new ApiError("invalid_address", "Not verified.", 422), {
      error: "invalid_address",
      suggested: { street: "500 Example Avenue", city: "Austin", state: "TX", zip: "78701", country: "US" },
    });
    expect(reportVoiceError(err, { number: "+15555550188" })).toBe(true);
    const printed = errorSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(printed).toContain("500 Example Avenue, Austin, TX 78701, US");
  });

  it("explains a malformed address without a suggestion", () => {
    const err = withBody(new ValidationError("Enter a five-digit ZIP code."), {
      error: "invalid_address",
      message: "Enter a five-digit ZIP code.",
    });
    expect(reportVoiceError(err, { number: "+15555550188" })).toBe(true);
    const out = reported();
    expect(out.code).toBe("invalid_address");
    expect(out).not.toHaveProperty("suggested");
    expect(String(out.hint)).toContain("--street");
  });

  it("points 404s at the list commands", () => {
    expect(
      reportVoiceError(
        withBody(new NotFoundError("This number isn't in your workspace."), { error: "number_not_found" }),
      ),
    ).toBe(true);
    expect(reported().code).toBe("number_not_found");
    expect(String(reported().hint)).toContain("sendly voice numbers list");

    errorSpy.mockClear();
    expect(
      reportVoiceError(
        withBody(new NotFoundError("That agent was already removed."), { error: "agent_not_found" }),
      ),
    ).toBe(true);
    expect(reported().code).toBe("agent_not_found");
    expect(String(reported().hint)).toContain("sendly voice agents list");
  });

  it("explains agent_required, agent_disabled and agent_limit", () => {
    expect(
      reportVoiceError(
        withBody(new ValidationError("Choose an agent to answer this number."), { error: "agent_required" }),
      ),
    ).toBe(true);
    expect(reported().code).toBe("agent_required");
    expect(String(reported().hint)).toContain("--agent");

    errorSpy.mockClear();
    expect(
      reportVoiceError(
        withBody(new ApiError("agent_disabled", "That agent is switched off.", 409), { error: "agent_disabled" }),
        { agentId: AGENT_ID },
      ),
    ).toBe(true);
    expect(reported().hint).toBe(
      `Switch the agent on first: sendly voice agents update ${AGENT_ID} --enable`,
    );

    errorSpy.mockClear();
    expect(
      reportVoiceError(
        withBody(new ApiError("agent_limit", "You've reached the agent limit.", 409), { error: "agent_limit" }),
      ),
    ).toBe(true);
    expect(String(reported().hint)).toContain("sendly voice agents delete");
  });

  it("uses the role hint the command passes on a 403 forbidden", () => {
    const err = withBody(
      new AuthenticationError("You don't have permission to do that in this workspace."),
      { error: "forbidden" },
    );
    expect(reportVoiceError(err, { forbiddenHint: "Owners and admins only" })).toBe(true);
    expect(reported().code).toBe("forbidden");
    expect(reported().hint).toBe("Owners and admins only");
  });

  it("tells a test key it can read voice settings but not change them", () => {
    const err = withBody(new ApiKeyRequiredError("Phone calls need a live API key."), {
      error: "live_key_required",
    });
    expect(reportVoiceError(err)).toBe(true);
    expect(reported().code).toBe("live_key_required");
    expect(String(reported().hint)).toContain("--type live");
    expect(String(reported().hint)).toContain("voice settings");
  });

  it("asks for a retry when voice could not be switched on or the address was refused", () => {
    for (const code of ["voice_attach_failed", "carrier_refused"]) {
      errorSpy.mockClear();
      const err = withBody(new ApiError(code, "Try again in a moment.", 502), { error: code });
      expect(reportVoiceError(err), code).toBe(true);
      expect(reported().code).toBe(code);
      expect(String(reported().hint)).toContain("Try again");
    }
  });

  it("falls back to the calls explanations for the shared refusals", () => {
    const dark = withBody(new NotFoundError("Voice is not enabled for your account."), {
      error: "voice_not_enabled",
    });
    expect(reportVoiceError(dark)).toBe(true);
    expect(reported().code).toBe("voice_not_enabled");

    errorSpy.mockClear();
    const scope = withBody(new AuthenticationError("Missing required scopes: calls:write"), {
      error: "insufficient_permissions",
    });
    expect(reportVoiceError(scope)).toBe(true);
    expect(String(reported().hint)).toContain("calls:write");
  });

  it("leaves unrelated errors to the base command", () => {
    expect(reportVoiceError(new ApiError("unknown_error", "HTTP 418", 418))).toBe(false);
    expect(reportVoiceError(new Error("boom"))).toBe(false);
  });
});
