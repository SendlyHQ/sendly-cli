import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../../../src/lib/config.js", () => ({
  isAuthenticated: vi.fn(() => true),
  getAuthToken: vi.fn(() => "sk_test_v1_stored_quickstart_key"),
  getSessionToken: vi.fn(() => "cli_session_token_valid"),
  getStoredAccessToken: vi.fn(() => "cli_session_token_valid"),
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

import {
  getSessionToken,
  getStoredAccessToken,
} from "../../../src/lib/config.js";
import { setOutputFormat } from "../../../src/lib/output.js";
import KeysCreate from "../../../src/commands/keys/create.js";
import { respond, runCommand } from "../../helpers/run-command.js";

function created(type: "test" | "live") {
  return respond(200, {
    id: "key_1",
    name: "Production",
    key: `sk_${type}_v1_new`,
    keyPrefix: `sk_${type}_v1_ne`,
    type,
    createdAt: "2026-10-03T12:00:00.000Z",
  });
}

function sentBearer(): string {
  const [, init] = mockFetch.mock.calls[0];
  return init.headers.Authorization;
}

describe("sendly keys create", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.mocked(getSessionToken).mockReturnValue("cli_session_token_valid");
    vi.mocked(getStoredAccessToken).mockReturnValue("cli_session_token_valid");
    setOutputFormat("json");
  });

  afterEach(() => {
    setOutputFormat("human");
  });

  it("creates a live key with the signed-in session, not the stored test key", async () => {
    mockFetch.mockResolvedValueOnce(created("live"));

    const run = await runCommand(KeysCreate, ["--name", "Production", "--type", "live"]);

    expect(run.error).toBeUndefined();
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(sentBearer()).toBe("Bearer cli_session_token_valid");
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({ name: "Production", type: "live" });
  });

  it("still creates a test key with the stored key", async () => {
    mockFetch.mockResolvedValueOnce(created("test"));

    await runCommand(KeysCreate, ["--name", "CI", "--type", "test"]);

    expect(sentBearer()).toBe("Bearer sk_test_v1_stored_quickstart_key");
  });

  it("falls back to the stored key for a live key when nobody is signed in", async () => {
    vi.mocked(getSessionToken).mockReturnValue(undefined);
    vi.mocked(getStoredAccessToken).mockReturnValue(undefined);
    mockFetch.mockResolvedValueOnce(created("live"));

    await runCommand(KeysCreate, ["--name", "Production", "--type", "live"]);

    expect(sentBearer()).toBe("Bearer sk_test_v1_stored_quickstart_key");
  });

  it("shows the server's way forward when a test key is refused a live key", async () => {
    vi.mocked(getSessionToken).mockReturnValue(undefined);
    vi.mocked(getStoredAccessToken).mockReturnValue(undefined);
    setOutputFormat("human");
    mockFetch.mockResolvedValueOnce(
      respond(403, {
        error: "insufficient_permissions",
        message: "A test key cannot create a live key. Use a live key or the dashboard.",
        hint: "Create a live key in the dashboard, or sign in with `sendly login` and run `sendly keys create --type live`.",
      }),
    );

    const run = await runCommand(KeysCreate, ["--name", "Production", "--type", "live"]);

    expect(run.stderr).toContain("A test key cannot create a live key");
    expect(run.stderr).toContain("sendly login");
  });
});
