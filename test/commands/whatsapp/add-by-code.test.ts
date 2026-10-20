import os from "node:os";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const settings = vi.hoisted(() => ({ maxRetries: 0 }));

vi.mock("../../../src/lib/config.js", () => ({
  isAuthenticated: vi.fn(() => true),
  getAuthToken: vi.fn(() => "sk_live_v1_mock"),
  getStoredAccessToken: vi.fn(() => undefined),
  setAuthTokens: vi.fn(),
  resolveBaseUrl: vi.fn(() => "https://sendly.live"),
  getConfigValue: vi.fn(() => undefined),
  getConfigDir: vi.fn(() => os.tmpdir()),
  getEffectiveValue: vi.fn((key: string) => {
    if (key === "maxRetries") return settings.maxRetries;
    if (key === "timeout") return 30000;
    return undefined;
  }),
}));

vi.mock("open", () => ({
  default: vi.fn(() => Promise.resolve()),
}));

vi.mock("../../../src/lib/keypress.js", () => ({
  attachLoginKeypressHandler: vi.fn(() => () => {}),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

import open from "open";
import WhatsappConnect from "../../../src/commands/whatsapp/connect.js";
import WhatsappStatus from "../../../src/commands/whatsapp/status.js";
import WhatsappVerify from "../../../src/commands/whatsapp/verify.js";
import WhatsappResendCode from "../../../src/commands/whatsapp/resend-code.js";
import { setOutputFormat } from "../../../src/lib/output.js";
import { respond, runCommand } from "../../helpers/run-command.js";

const SIGNUP_ID = "6f1d2c7e-3a4b-4c5d-9e8f-0a1b2c3d4e5f";
const NUMBER = "+14155550142";
const WABA = "104996582519384";

const VERIFYING = {
  id: SIGNUP_ID,
  status: "verifying",
  phoneNumber: NUMBER,
  businessAccountId: WABA,
  failureReasons: null,
  verificationMethod: "sms",
  verificationAttemptsRemaining: 5,
  updatedAt: "2026-10-01T14:02:55.311Z",
};

const ACTIVE = {
  id: SIGNUP_ID,
  status: "active",
  phoneNumber: NUMBER,
  businessAccountId: WABA,
  failureReasons: null,
  updatedAt: "2026-10-01T14:04:12.880Z",
};

function call(n: number) {
  const [url, init] = mockFetch.mock.calls[n] as [string, RequestInit];
  return {
    url,
    method: init.method,
    body: init.body ? JSON.parse(String(init.body)) : undefined,
  };
}

beforeEach(() => {
  mockFetch.mockReset();
  vi.mocked(open).mockClear();
  settings.maxRetries = 0;
  setOutputFormat("human");
});

afterEach(() => {
  setOutputFormat("human");
});

describe("sendly whatsapp connect --business-account", () => {
  it("asks for a verification code with the account id, method and display name instead of a Facebook link", async () => {
    mockFetch.mockResolvedValueOnce(
      respond(201, { ...VERIFYING, verificationMethod: "voice" }),
    );

    const run = await runCommand(WhatsappConnect, [
      "--number",
      NUMBER,
      "--business-account",
      WABA,
      "--verification-method",
      "voice",
      "--display-name",
      "Acme Plumbing",
    ]);

    expect(run.exitCode).toBeUndefined();
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(call(0)).toEqual({
      url: "https://sendly.live/api/v1/whatsapp/signup",
      method: "POST",
      body: {
        phoneNumber: NUMBER,
        businessAccountId: WABA,
        verificationMethod: "voice",
        displayName: "Acme Plumbing",
      },
    });
    expect(open).not.toHaveBeenCalled();
    expect(run.stdout).not.toContain("Facebook");
    expect(run.stdout).toContain(SIGNUP_ID);
    expect(run.stdout).toContain("voice");
    expect(run.stdout).toContain(`sendly whatsapp verify ${SIGNUP_ID}`);
  });

  it("says no new code was sent when the number was already being added", async () => {
    mockFetch.mockResolvedValueOnce(respond(200, VERIFYING));

    const run = await runCommand(WhatsappConnect, [
      "--number",
      NUMBER,
      "--business-account",
      WABA,
    ]);

    expect(run.exitCode).toBeUndefined();
    expect(run.stdout).toContain("No new code was sent");
    expect(run.stdout).not.toContain("WhatsApp is texting");
    expect(run.stdout).toContain(`sendly whatsapp verify ${SIGNUP_ID}`);
    expect(run.stdout).toContain(`sendly whatsapp resend-code ${SIGNUP_ID}`);
  });

  it("says the code is on its way when the attempt is new", async () => {
    mockFetch.mockResolvedValueOnce(respond(201, VERIFYING));

    const run = await runCommand(WhatsappConnect, [
      "--number",
      NUMBER,
      "--business-account",
      WABA,
    ]);

    expect(run.stdout).toContain(`WhatsApp is texting a 6-digit code to ${NUMBER}`);
    expect(run.stdout).not.toContain("No new code was sent");
  });

  it("leaves out verificationMethod and displayName when they are not given", async () => {
    mockFetch.mockResolvedValueOnce(respond(201, VERIFYING));

    await runCommand(WhatsappConnect, [
      "--number",
      NUMBER,
      "--business-account",
      WABA,
    ]);

    expect(call(0).body).toEqual({
      phoneNumber: NUMBER,
      businessAccountId: WABA,
    });
  });

  it("prints the signup object in --json", async () => {
    setOutputFormat("json");
    mockFetch.mockResolvedValueOnce(respond(201, VERIFYING));

    const run = await runCommand(WhatsappConnect, [
      "--number",
      NUMBER,
      "--business-account",
      WABA,
    ]);

    expect(JSON.parse(run.stdout)).toEqual(VERIFYING);
  });

  it("refuses --verification-method and --display-name without --business-account", async () => {
    const method = await runCommand(WhatsappConnect, [
      "--number",
      NUMBER,
      "--verification-method",
      "voice",
    ]);
    const name = await runCommand(WhatsappConnect, [
      "--number",
      NUMBER,
      "--display-name",
      "Acme",
    ]);

    expect(method.exitCode).toBe(1);
    expect(name.exitCode).toBe(1);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("refuses an empty --business-account, which the API would read as the Facebook flow", async () => {
    const run = await runCommand(WhatsappConnect, [
      "--number",
      NUMBER,
      "--business-account",
      " ",
    ]);

    expect(run.exitCode).toBe(1);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(run.stderr).toContain("--business-account");
  });

  it("does not retry a failed start, which would charge the fee again", async () => {
    settings.maxRetries = 1;
    mockFetch.mockResolvedValue(
      respond(502, {
        error: "whatsapp_verification_start_failed",
        message:
          "WhatsApp couldn't start verifying this number. Any setup fee is refunded automatically. Please try again shortly.",
      }),
    );

    const run = await runCommand(WhatsappConnect, [
      "--number",
      NUMBER,
      "--business-account",
      WABA,
    ]);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(run.exitCode).toBe(1);
    expect(run.stderr).toContain("whatsapp_verification_start_failed");
    expect(run.stderr).not.toContain("status.sendly.live");
  });

  it("does not retry a dropped connection on the start", async () => {
    settings.maxRetries = 1;
    mockFetch.mockRejectedValue(new TypeError("fetch failed"));

    const run = await runCommand(WhatsappConnect, [
      "--number",
      NUMBER,
      "--business-account",
      WABA,
    ]);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(run.exitCode).toBe(1);
  });

  it("points an unknown business account at the senders list", async () => {
    setOutputFormat("json");
    mockFetch.mockResolvedValueOnce(
      respond(404, {
        error: "whatsapp_business_account_not_found",
        message:
          "There's no connected WhatsApp Business account with this id in your workspace. Connect a number with the Facebook step first.",
      }),
    );

    const run = await runCommand(WhatsappConnect, [
      "--number",
      NUMBER,
      "--business-account",
      WABA,
    ]);

    expect(run.exitCode).toBe(1);
    const out = JSON.parse(run.stderr);
    expect(out.code).toBe("whatsapp_business_account_not_found");
    expect(out.message).toContain("no connected WhatsApp Business account");
    expect(out.hint).toContain("sendly whatsapp senders");
  });

  it("asks for --display-name when the account has none to reuse", async () => {
    setOutputFormat("json");
    mockFetch.mockResolvedValueOnce(
      respond(400, {
        error: "display_name_required",
        message:
          "Provide displayName: the business name WhatsApp shows for this number.",
      }),
    );

    const run = await runCommand(WhatsappConnect, [
      "--number",
      NUMBER,
      "--business-account",
      WABA,
    ]);

    const out = JSON.parse(run.stderr);
    expect(out.code).toBe("display_name_required");
    expect(out.hint).toContain("--display-name");
  });

  it("names the Facebook connection already in flight for the number", async () => {
    setOutputFormat("json");
    mockFetch.mockResolvedValueOnce(
      respond(409, {
        error: "whatsapp_signup_in_progress",
        message:
          "A WhatsApp connection for this number is already in progress. Finish it, or wait for it to expire.",
        id: "9a8b7c6d-0000-4000-8000-000000000001",
      }),
    );

    const run = await runCommand(WhatsappConnect, [
      "--number",
      NUMBER,
      "--business-account",
      WABA,
    ]);

    const out = JSON.parse(run.stderr);
    expect(out.code).toBe("whatsapp_signup_in_progress");
    expect(out.id).toBe("9a8b7c6d-0000-4000-8000-000000000001");
    expect(out.hint).toContain(
      "sendly whatsapp status 9a8b7c6d-0000-4000-8000-000000000001",
    );
  });
});

describe("sendly whatsapp connect (Facebook) while the number is being added by code", () => {
  it("points at the code to enter for that attempt", async () => {
    mockFetch.mockResolvedValueOnce(
      respond(409, {
        error: "whatsapp_verification_in_progress",
        message:
          "This number is already being added to a connected WhatsApp Business account. Enter its verification code, or wait for that attempt to expire.",
        id: SIGNUP_ID,
      }),
    );

    const run = await runCommand(WhatsappConnect, ["--number", NUMBER]);

    expect(run.exitCode).toBe(1);
    expect(run.stderr).toContain("whatsapp_verification_in_progress");
    expect(run.stderr).toContain(`sendly whatsapp verify ${SIGNUP_ID}`);
  });
});

describe("sendly whatsapp status while verifying", () => {
  it("shows the method, attempts left and the code that arrived on the number", async () => {
    mockFetch.mockResolvedValueOnce(
      respond(200, { ...VERIFYING, verificationCode: "482913" }),
    );

    const run = await runCommand(WhatsappStatus, [SIGNUP_ID]);

    expect(run.stdout).toContain("verifying");
    expect(run.stdout).toContain("482913");
    expect(run.stdout).toMatch(/Attempts left:.*5/);
    expect(run.stdout).toMatch(/Code sent by:.*sms/);
    expect(run.stdout).toContain(`sendly whatsapp verify ${SIGNUP_ID}`);
    expect(run.stdout).not.toContain("sign in with Facebook");
  });

  it("says the code hasn't arrived yet and how to get another", async () => {
    mockFetch.mockResolvedValueOnce(
      respond(200, { ...VERIFYING, verificationCode: null }),
    );

    const run = await runCommand(WhatsappStatus, [SIGNUP_ID]);

    expect(run.stdout).toContain("hasn't arrived");
    expect(run.stdout).toContain(`sendly whatsapp resend-code ${SIGNUP_ID}`);
  });

  it("passes verificationCode through in --json", async () => {
    setOutputFormat("json");
    const body = { ...VERIFYING, verificationCode: "482913" };
    mockFetch.mockResolvedValueOnce(respond(200, body));

    const run = await runCommand(WhatsappStatus, [SIGNUP_ID]);

    expect(JSON.parse(run.stdout)).toEqual(body);
  });
});

describe("sendly whatsapp verify", () => {
  it("POSTs the code and reports the connected sender", async () => {
    mockFetch.mockResolvedValueOnce(respond(200, ACTIVE));

    const run = await runCommand(WhatsappVerify, [
      SIGNUP_ID,
      "--code",
      "482913",
    ]);

    expect(run.exitCode).toBeUndefined();
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(call(0)).toEqual({
      url: `https://sendly.live/api/v1/whatsapp/signup/${SIGNUP_ID}/verify`,
      method: "POST",
      body: { code: "482913" },
    });
    expect(run.stdout).toContain("connected");
    expect(run.stdout).toContain(NUMBER);
  });

  it("submits the code that arrived on the number when --code is left out", async () => {
    mockFetch
      .mockResolvedValueOnce(
        respond(200, { ...VERIFYING, verificationCode: "482913" }),
      )
      .mockResolvedValueOnce(respond(200, ACTIVE));

    const run = await runCommand(WhatsappVerify, [SIGNUP_ID]);

    expect(run.exitCode).toBeUndefined();
    expect(call(0)).toMatchObject({
      url: `https://sendly.live/api/v1/whatsapp/signup/${SIGNUP_ID}`,
      method: "GET",
    });
    expect(call(1).body).toEqual({ code: "482913" });
  });

  it("says in its help that right after resend-code the code found can still be the earlier one", () => {
    expect(WhatsappVerify.description).toContain("resend-code");
    expect(WhatsappVerify.description).toContain("earlier code");
  });

  it("suggests a first send to a fictional 555-01xx number", async () => {
    mockFetch.mockResolvedValueOnce(respond(200, ACTIVE));

    const run = await runCommand(WhatsappVerify, [
      SIGNUP_ID,
      "--code",
      "482913",
    ]);

    expect(run.stdout).toMatch(/--to \+1\d{3}55501\d{2} /);
  });

  it("sends nothing when --code is left out and no code has arrived", async () => {
    mockFetch.mockResolvedValueOnce(
      respond(200, { ...VERIFYING, verificationCode: null }),
    );

    const run = await runCommand(WhatsappVerify, [SIGNUP_ID]);

    expect(run.exitCode).toBe(1);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(run.stderr).toContain("--code");
  });

  it("shows the attempts left after a wrong code", async () => {
    setOutputFormat("json");
    mockFetch.mockResolvedValueOnce(
      respond(422, {
        error: "whatsapp_verification_code_invalid",
        message: "That code wasn't accepted. Check it, or request a new one.",
        attemptsRemaining: 3,
      }),
    );

    const run = await runCommand(WhatsappVerify, [
      SIGNUP_ID,
      "--code",
      "111111",
    ]);

    expect(run.exitCode).toBe(1);
    const out = JSON.parse(run.stderr);
    expect(out.code).toBe("whatsapp_verification_code_invalid");
    expect(out.attemptsRemaining).toBe(3);
    expect(out.hint).toContain(`sendly whatsapp resend-code ${SIGNUP_ID}`);
  });

  it("keeps invalid_verification_code for a malformed code", async () => {
    setOutputFormat("json");
    mockFetch.mockResolvedValueOnce(
      respond(400, {
        error: "invalid_verification_code",
        message: "code must be the 6-digit code WhatsApp sent to the number.",
      }),
    );

    const run = await runCommand(WhatsappVerify, [SIGNUP_ID, "--code", "12"]);

    expect(JSON.parse(run.stderr).code).toBe("invalid_verification_code");
  });

  it("does not retry a 502, which would spend another attempt", async () => {
    settings.maxRetries = 1;
    mockFetch.mockResolvedValue(
      respond(502, {
        error: "whatsapp_activation_pending",
        message:
          "WhatsApp accepted the code, but we couldn't finish connecting the number. Our team has been alerted; check back shortly.",
      }),
    );

    const run = await runCommand(WhatsappVerify, [
      SIGNUP_ID,
      "--code",
      "482913",
    ]);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(run.exitCode).toBe(1);
    expect(run.stderr).toContain("whatsapp_activation_pending");
    expect(run.stderr).toContain(`sendly whatsapp status ${SIGNUP_ID}`);
  });

  it("does not retry a dropped connection", async () => {
    settings.maxRetries = 1;
    mockFetch.mockRejectedValue(new TypeError("fetch failed"));

    const run = await runCommand(WhatsappVerify, [
      SIGNUP_ID,
      "--code",
      "482913",
    ]);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(run.exitCode).toBe(1);
  });

  it("says to start again after too many wrong codes", async () => {
    mockFetch.mockResolvedValueOnce(
      respond(409, {
        error: "whatsapp_verification_failed",
        message:
          "Too many wrong codes. Any setup fee is refunded automatically. Start again to retry.",
      }),
    );

    const run = await runCommand(WhatsappVerify, [
      SIGNUP_ID,
      "--code",
      "482913",
    ]);

    expect(run.exitCode).toBe(1);
    expect(run.stderr).toContain("whatsapp_verification_failed");
    expect(run.stderr).toContain("--business-account");
  });
});

describe("sendly whatsapp resend-code", () => {
  it("POSTs the chosen method", async () => {
    mockFetch.mockResolvedValueOnce(
      respond(200, {
        ...VERIFYING,
        verificationMethod: "voice",
        verificationAttemptsRemaining: 4,
      }),
    );

    const run = await runCommand(WhatsappResendCode, [
      SIGNUP_ID,
      "--verification-method",
      "voice",
    ]);

    expect(run.exitCode).toBeUndefined();
    expect(call(0)).toEqual({
      url: `https://sendly.live/api/v1/whatsapp/signup/${SIGNUP_ID}/resend`,
      method: "POST",
      body: { verificationMethod: "voice" },
    });
    expect(run.stdout).toContain("voice");
    expect(run.stdout).toMatch(/Attempts left:.*4/);
  });

  it("warns that status can still show the earlier code until the new one arrives", async () => {
    mockFetch.mockResolvedValueOnce(respond(200, VERIFYING));

    const run = await runCommand(WhatsappResendCode, [SIGNUP_ID]);

    expect(run.exitCode).toBeUndefined();
    expect(run.stdout).toContain("earlier code");
    expect(run.stdout).toContain(`sendly whatsapp status ${SIGNUP_ID}`);
  });

  it("sends an empty body without --verification-method", async () => {
    mockFetch.mockResolvedValueOnce(respond(200, VERIFYING));

    await runCommand(WhatsappResendCode, [SIGNUP_ID]);

    expect(call(0).body).toEqual({});
  });

  it("says how long to wait instead of the plan-upgrade hint", async () => {
    setOutputFormat("json");
    mockFetch.mockResolvedValueOnce(
      respond(429, {
        error: "whatsapp_verification_resend_too_soon",
        message: "Wait 18 seconds before requesting another code.",
        retryAfter: 18,
      }),
    );

    const run = await runCommand(WhatsappResendCode, [SIGNUP_ID]);

    expect(run.exitCode).toBe(1);
    const out = JSON.parse(run.stderr);
    expect(out.code).toBe("whatsapp_verification_resend_too_soon");
    expect(out.retryAfter).toBe(18);
    expect(out.message).toContain("Wait 18 seconds");
    expect(JSON.stringify(out)).not.toMatch(/upgrade your plan/);
  });
});
