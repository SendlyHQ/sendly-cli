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

import VerifySend from "../../../src/commands/verify/send.js";
import { setOutputFormat } from "../../../src/lib/output.js";
import { respond, runCommand } from "../../helpers/run-command.js";

async function send(status: number, body: Record<string, unknown>) {
  mockFetch.mockResolvedValueOnce(respond(status, body));
  return runCommand(VerifySend, ["--to", "+14155552671"]);
}

const REFUSALS = [
  [
    402,
    {
      error: "insufficient_credits",
      message: "This verification requires 2 credits (standard rate). Current balance: 0",
      creditsNeeded: 2,
      currentBalance: 0,
      tier: "standard",
    },
    "insufficient_credits",
  ],
  [
    403,
    {
      error: "verification_required",
      message: "Business verification required to send live OTP messages",
    },
    "verification_required",
  ],
  [
    400,
    {
      error: "invalid_phone_format",
      message: "Invalid phone number. Use E.164 format (e.g., +14155552671)",
    },
    "invalid_phone_format",
  ],
] as const;

describe("sendly verify send", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    setOutputFormat("human");
  });

  afterEach(() => {
    setOutputFormat("human");
  });

  it("points a verification refusal at the verify page", async () => {
    const run = await send(403, REFUSALS[1][1]);

    expect(run.exitCode).toBe(1);
    expect(run.stderr).toContain("Business verification required");
    expect(run.stderr).toContain("https://sendly.live/verify");
  });

  it.each(REFUSALS)("keeps the API's code for a %i in --json", async (status, body, code) => {
    setOutputFormat("json");

    const run = await send(status, body);

    expect(run.exitCode).toBe(1);
    expect(JSON.parse(run.stderr).code).toBe(code);
  });
});
