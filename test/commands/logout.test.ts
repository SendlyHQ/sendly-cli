/**
 * Logout tests
 * `sendly logout` must sign the stored session out on the server whether or
 * not it has expired and whether or not an API key is set. It clears local
 * credentials when the server cannot confirm the sign-out, but keeps them
 * when the session was never sent because the host was refused.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Errors } from "@oclif/core";

const { state } = vi.hoisted(() => ({
  state: {
    authenticated: true,
    storedAccessToken: undefined as string | undefined,
    activeToken: undefined as string | undefined,
    baseUrl: "https://sendly.live",
    baseUrlError: undefined as string | undefined,
  },
}));

vi.mock("../../src/lib/config.js", () => ({
  isAuthenticated: vi.fn(() => state.authenticated),
  getStoredAccessToken: vi.fn(() => state.storedAccessToken),
  getAuthToken: vi.fn(() => state.activeToken),
  clearAuth: vi.fn(),
  setAuthTokens: vi.fn(),
  setApiKey: vi.fn(),
  getConfigValue: vi.fn(() => undefined),
  resolveBaseUrl: vi.fn(() => {
    if (state.baseUrlError) throw new Error(state.baseUrlError);
    return state.baseUrl;
  }),
  isProductionBaseUrl: vi.fn((url: string) => url === "https://sendly.live"),
  getEffectiveValue: vi.fn((key: string) => {
    if (key === "maxRetries") return 0;
    if (key === "timeout") return 30000;
    return undefined;
  }),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

import Logout from "../../src/commands/logout.js";
import { clearAuth, resolveBaseUrl } from "../../src/lib/config.js";
import { setOutputFormat } from "../../src/lib/output.js";

const LOGOUT_URL = "https://sendly.live/api/cli/auth/logout";
const REFUSED =
  "SENDLY_BASE_URL points at https://attacker.example.com. Refusing to send your sendly login session to any host other than https://sendly.live or a loopback address. Unset SENDLY_BASE_URL, or point it at https://sendly.live (or http://localhost:PORT for a local server)";

function respond(status: number, body: unknown = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    headers: new Map(),
  };
}

type Run = { stdout: string; stderr: string; exitCode?: number };

async function runLogout(): Promise<Run> {
  const out: string[] = [];
  const err: string[] = [];
  const log = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    out.push(args.join(" "));
  });
  const logError = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    err.push(args.join(" "));
  });
  let exitCode: number | undefined;
  try {
    await new Logout([], {} as never).run();
  } catch (thrown) {
    if (!(thrown instanceof Errors.ExitError)) throw thrown;
    exitCode = thrown.oclif.exit;
  } finally {
    log.mockRestore();
    logError.mockRestore();
  }
  return { stdout: out.join("\n"), stderr: err.join("\n"), exitCode };
}

function sentBody(): Record<string, unknown> {
  const [, init] = mockFetch.mock.calls[0];
  return JSON.parse(init.body);
}

function sentHeaders(): Record<string, string> {
  const [, init] = mockFetch.mock.calls[0];
  return init.headers;
}

describe("sendly logout", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.mocked(clearAuth).mockClear();
    vi.mocked(resolveBaseUrl).mockClear();
    state.authenticated = true;
    state.storedAccessToken = undefined;
    state.activeToken = undefined;
    state.baseUrl = "https://sendly.live";
    state.baseUrlError = undefined;
    setOutputFormat("human");
  });

  afterEach(() => {
    setOutputFormat("human");
  });

  describe("revoking the session", () => {
    it("revokes an expired session token on the server, then clears local credentials", async () => {
      state.storedAccessToken = "cli_v2_expired.sig";
      mockFetch.mockResolvedValueOnce(respond(200, { success: true }));

      const { stdout, exitCode } = await runLogout();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch.mock.calls[0][0]).toBe(LOGOUT_URL);
      expect(sentBody()).toEqual({ accessToken: "cli_v2_expired.sig" });
      expect(sentHeaders().Authorization).toBeUndefined();
      expect(clearAuth).toHaveBeenCalledTimes(1);
      expect(stdout).toContain("Logged out successfully");
      expect(stdout).not.toContain("Could not confirm");
      expect(exitCode).toBeUndefined();
    });

    it("revokes a live session token", async () => {
      state.storedAccessToken = "cli_v2_live.sig";
      state.activeToken = "cli_v2_live.sig";
      mockFetch.mockResolvedValueOnce(respond(200, { success: true }));

      await runLogout();

      expect(sentBody()).toEqual({ accessToken: "cli_v2_live.sig" });
      expect(clearAuth).toHaveBeenCalledTimes(1);
    });

    it("still revokes the stored session when an API key is set, and never sends the key", async () => {
      state.storedAccessToken = "cli_v2_session.sig";
      state.activeToken = "sk_live_v1_key";
      mockFetch.mockResolvedValueOnce(respond(200, { success: true }));

      const { stdout } = await runLogout();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(sentBody()).toEqual({ accessToken: "cli_v2_session.sig" });
      expect(JSON.stringify(mockFetch.mock.calls[0])).not.toContain("sk_live_v1_key");
      expect(clearAuth).toHaveBeenCalledTimes(1);
      expect(stdout).toContain("Logged out successfully");
    });

    it("resolves the host as for a live credential before sending the session token", async () => {
      state.storedAccessToken = "cli_v2_session.sig";
      mockFetch.mockResolvedValueOnce(respond(200, { success: true }));

      await runLogout();

      expect(resolveBaseUrl).toHaveBeenCalledWith(undefined, { sessionToken: true });
    });

    it("clears an API-key-only login without calling the server", async () => {
      state.activeToken = "sk_test_v1_key";

      const { stdout } = await runLogout();

      expect(mockFetch).not.toHaveBeenCalled();
      expect(clearAuth).toHaveBeenCalledTimes(1);
      expect(stdout).toContain("Logged out successfully");
    });

    it("does nothing when not logged in", async () => {
      state.authenticated = false;

      const { stdout } = await runLogout();

      expect(mockFetch).not.toHaveBeenCalled();
      expect(clearAuth).not.toHaveBeenCalled();
      expect(stdout).toContain("Not currently logged in");
    });
  });

  describe("when the server cannot confirm the sign-out", () => {
    it("clears local credentials and warns when the server cannot be reached", async () => {
      state.storedAccessToken = "cli_v2_session.sig";
      mockFetch.mockRejectedValueOnce(new TypeError("fetch failed"));

      const { stdout, exitCode } = await runLogout();

      expect(clearAuth).toHaveBeenCalledTimes(1);
      expect(exitCode).toBeUndefined();
      expect(stdout).toContain("Logged out locally");
      expect(stdout).toContain(
        "Could not confirm the sign-out with the Sendly server: the server could not be reached",
      );
      expect(stdout).toContain("may stay valid on the server until it expires");
      expect(stdout).not.toContain("Logged out successfully");
    });

    it("clears local credentials and warns when the server cannot record the revocation", async () => {
      state.storedAccessToken = "cli_v2_session.sig";
      mockFetch.mockResolvedValueOnce(respond(503, { error: "revocation_unavailable" }));

      const { stdout } = await runLogout();

      expect(clearAuth).toHaveBeenCalledTimes(1);
      expect(stdout).toContain("Logged out locally");
      expect(stdout).toContain("the server responded with HTTP 503");
    });

    it("does not count another 401 as a confirmed sign-out", async () => {
      state.storedAccessToken = "cli_v2_session.sig";
      mockFetch.mockResolvedValueOnce(respond(401, { error: "unauthorized" }));

      const { stdout } = await runLogout();

      expect(clearAuth).toHaveBeenCalledTimes(1);
      expect(stdout).toContain("Logged out locally");
      expect(stdout).toContain("HTTP 401");
    });
  });

  describe("a 401 invalid_token", () => {
    it("counts as signed out when it comes from the production host", async () => {
      state.storedAccessToken = "cli_v2_old.sig";
      mockFetch.mockResolvedValueOnce(respond(401, { error: "invalid_token" }));

      const { stdout } = await runLogout();

      expect(clearAuth).toHaveBeenCalledTimes(1);
      expect(stdout).toContain("Logged out successfully");
      expect(stdout).not.toContain("Could not confirm");
    });

    it("is unconfirmed when it comes from any other host", async () => {
      state.storedAccessToken = "cli_v2_old.sig";
      state.baseUrl = "http://localhost:5001";
      mockFetch.mockResolvedValueOnce(respond(401, { error: "invalid_token" }));

      const { stdout } = await runLogout();

      expect(mockFetch.mock.calls[0][0]).toBe("http://localhost:5001/api/cli/auth/logout");
      expect(clearAuth).toHaveBeenCalledTimes(1);
      expect(stdout).toContain("Logged out locally");
      expect(stdout).toContain("Could not confirm");
      expect(stdout).not.toContain("Logged out successfully");
    });
  });

  describe("when the host is refused", () => {
    it("keeps local credentials, sends nothing and exits 1 with how to sign out", async () => {
      state.storedAccessToken = "cli_v2_session.sig";
      state.baseUrlError = REFUSED;

      const { stdout, stderr, exitCode } = await runLogout();

      expect(mockFetch).not.toHaveBeenCalled();
      expect(clearAuth).not.toHaveBeenCalled();
      expect(exitCode).toBe(1);
      expect(stdout).not.toContain("Logged out");
      expect(stderr).toContain("Not logged out.");
      expect(stderr).toContain("Unset SENDLY_BASE_URL, or point it at https://sendly.live");
      expect(stderr).toContain("Your local credentials were kept");
    });
  });

  describe("--json", () => {
    beforeEach(() => {
      setOutputFormat("json");
    });

    it("reports a confirmed sign-out", async () => {
      state.storedAccessToken = "cli_v2_session.sig";
      mockFetch.mockResolvedValueOnce(respond(200, { success: true }));

      const { stdout } = await runLogout();

      expect(JSON.parse(stdout)).toEqual({
        success: true,
        message: "Logged out successfully",
        serverSignOut: "confirmed",
      });
    });

    it("reports an unconfirmed sign-out with its reason", async () => {
      state.storedAccessToken = "cli_v2_session.sig";
      mockFetch.mockRejectedValueOnce(new TypeError("fetch failed"));

      const { stdout } = await runLogout();

      expect(clearAuth).toHaveBeenCalledTimes(1);
      expect(JSON.parse(stdout)).toEqual({
        success: true,
        message: "Logged out locally",
        serverSignOut: "unconfirmed",
        reason: "the server could not be reached",
      });
    });

    it("reports none when there was no stored session", async () => {
      state.activeToken = "sk_test_v1_key";

      const { stdout } = await runLogout();

      expect(JSON.parse(stdout)).toEqual({
        success: true,
        message: "Logged out successfully",
        serverSignOut: "none",
      });
    });

    it("reports a refused host with its reason, as an error", async () => {
      state.storedAccessToken = "cli_v2_session.sig";
      state.baseUrlError = REFUSED;

      const { stdout, stderr, exitCode } = await runLogout();

      expect(stdout).toBe("");
      expect(exitCode).toBe(1);
      expect(JSON.parse(stderr)).toEqual({
        error: true,
        message: `Not logged out. ${REFUSED}`,
        serverSignOut: "refused",
        reason: REFUSED,
        hint: expect.stringContaining("Your local credentials were kept"),
      });
    });
  });
});
