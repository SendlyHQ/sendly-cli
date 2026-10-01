import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../../../src/lib/config.js", () => ({
  isAuthenticated: vi.fn(() => true),
  getAuthToken: vi.fn(() => "sk_test_v1_mock"),
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

import VerifyCheck from "../../../src/commands/verify/check.js";
import { setOutputFormat } from "../../../src/lib/output.js";
import { respond, runCommand } from "../../helpers/run-command.js";

async function check(status: number, body: Record<string, unknown>) {
  mockFetch.mockResolvedValueOnce(respond(status, body));
  return runCommand(VerifyCheck, ["ver_1", "--code", "123456"]);
}

describe("sendly verify check", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    setOutputFormat("human");
  });

  afterEach(() => {
    setOutputFormat("human");
  });

  it("says how many attempts are left after a wrong code", async () => {
    const run = await check(400, {
      error: "invalid_code",
      message: "Invalid verification code",
      remaining_attempts: 2,
    });

    expect(run.exitCode).toBe(1);
    expect(run.stderr).toContain("Invalid code");
    expect(run.stderr).toContain("2 attempt(s) remaining");
  });

  it("asks for a new code once the attempts are used up, instead of a 60-second wait", async () => {
    const run = await check(429, {
      error: "max_attempts_exceeded",
      message: "Maximum verification attempts exceeded",
    });

    expect(run.exitCode).toBe(1);
    expect(run.stderr).toContain("Maximum attempts exceeded");
    expect(run.stderr).toContain("Request a new verification code");
    expect(run.stderr).not.toMatch(/60 seconds|upgrade your plan/);
  });

  it("reports an expired code", async () => {
    const run = await check(410, {
      error: "expired",
      message: "Verification code has expired",
    });

    expect(run.exitCode).toBe(1);
    expect(run.stderr).toContain("Verification expired");
  });

  it("reports an unknown verification", async () => {
    const run = await check(404, {
      error: "not_found",
      message: "Verification not found",
    });

    expect(run.exitCode).toBe(1);
    expect(run.stderr).toContain("Verification not found");
    expect(run.stderr).toContain("Check the verification ID is correct");
  });

  it("reports a revoked or expired API key as a key problem, not an expired code", async () => {
    const run = await check(401, {
      error: "invalid_api_key",
      message: "Invalid or expired API key",
    });

    expect(run.exitCode).toBe(1);
    expect(run.stderr).toContain("Invalid or expired API key");
    expect(run.stderr).toContain("SENDLY_API_KEY");
    expect(run.stderr).not.toContain("Verification expired");
  });

  it("reports an expired login session as a sign-in problem, not an expired code", async () => {
    const run = await check(401, {
      error: "invalid_cli_token",
      message: "CLI session is invalid or expired. Run 'sendly login' again.",
    });

    expect(run.exitCode).toBe(1);
    expect(run.stderr).toContain("CLI session is invalid or expired");
    expect(run.stderr).toContain("sendly login");
    expect(run.stderr).not.toContain("Verification expired");
  });

  describe("--json", () => {
    beforeEach(() => {
      setOutputFormat("json");
    });

    it.each([
      [
        400,
        { error: "invalid_code", message: "Invalid verification code", remaining_attempts: 2 },
        "invalid_code",
      ],
      [410, { error: "expired", message: "Verification code has expired" }, "expired"],
      [
        429,
        { error: "max_attempts_exceeded", message: "Maximum verification attempts exceeded" },
        "max_attempts_exceeded",
      ],
      [404, { error: "not_found", message: "Verification not found" }, "not_found"],
    ])("keeps the API's code for a %i", async (status, body, code) => {
      const run = await check(status, body);

      expect(run.exitCode).toBe(1);
      expect(JSON.parse(run.stderr).code).toBe(code);
    });

    it("includes the attempts left after a wrong code", async () => {
      const run = await check(400, {
        error: "invalid_code",
        message: "Invalid verification code",
        remaining_attempts: 2,
      });

      expect(JSON.parse(run.stderr).remaining_attempts).toBe(2);
    });
  });
});
