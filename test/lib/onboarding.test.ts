import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../../src/lib/config.js", () => ({
  isAuthenticated: vi.fn(() => true),
  getAuthToken: vi.fn(() => "cli_x"),
  getStoredAccessToken: vi.fn(() => undefined),
  setAuthTokens: vi.fn(),
  setApiKey: vi.fn(),
  resolveBaseUrl: vi.fn(() => "https://sendly.live"),
  getConfigValue: vi.fn(() => undefined),
  getEffectiveValue: vi.fn((key: string) => {
    if (key === "maxRetries") return 0;
    if (key === "timeout") return 30000;
    return undefined;
  }),
}));

vi.mock("inquirer", () => ({
  default: { prompt: vi.fn(async () => ({ choice: "development" })) },
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

import { offerQuickStart } from "../../src/lib/onboarding.js";
import { setApiKey } from "../../src/lib/config.js";
import { setOutputFormat } from "../../src/lib/output.js";
import { respond } from "../helpers/run-command.js";

describe("onboarding quick-start", () => {
  let stdout: string[];

  beforeEach(() => {
    mockFetch.mockReset();
    vi.mocked(setApiKey).mockClear();
    setOutputFormat("human");
    stdout = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      stdout.push(args.map(String).join(" "));
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockFetch.mockImplementation(async (url: string) => {
      const { pathname } = new URL(url);
      if (pathname === "/api/v1/account/keys") {
        return respond(200, {
          id: "key_dev",
          name: "CLI Development Key",
          key: "sk_test_v1_abc",
          keyPrefix: "sk_test_v1_ab",
          type: "test",
          createdAt: "2026-09-25T12:00:00.000Z",
          expiresAt: null,
          apiKey: {
            id: "key_dev",
            name: "CLI Development Key",
            type: "test",
            prefix: "sk_test_v1_ab...",
            scopes: ["sms:send", "sms:read"],
            permissions: ["sms:send", "sms:read"],
            isActive: true,
            isRevoked: false,
            createdAt: "2026-09-25T12:00:00.000Z",
            lastUsedAt: null,
            expiresAt: null,
          },
        });
      }
      if (pathname === "/api/cli/quick-start") {
        return respond(401, { error: "Not authenticated" });
      }
      return respond(404, { error: "not_found" });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a test key with the login session and stores it", async () => {
    const completed = await offerQuickStart();

    expect(completed).toBe(true);
    const [url, init] = mockFetch.mock.calls[0];
    expect(new URL(url).pathname).toBe("/api/v1/account/keys");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer cli_x");
    expect(JSON.parse(init.body)).toEqual({
      name: "CLI Development Key",
      type: "test",
    });
    expect(
      mockFetch.mock.calls.some(([u]) => String(u).includes("/api/cli/quick-start")),
    ).toBe(false);
    expect(setApiKey).toHaveBeenCalledWith("sk_test_v1_abc");

    const out = stdout.join("\n");
    expect(out).toContain("CLI Development Key");
    expect(out).toContain("+15005550000");
    expect(out).toContain("sendly sms send");
  });
});
