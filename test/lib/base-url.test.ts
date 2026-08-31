/**
 * Base URL resolution tests
 * Tests the precedence order: flag > SENDLY_BASE_URL > SENDLY_API_URL >
 * config file > production default, and that the API client honours it.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const { mockStore } = vi.hoisted(() => ({
  mockStore: {} as Record<string, any>,
}));

// Mock the conf module so the real config module runs against an in-memory
// store instead of ~/.sendly/config.json
vi.mock("conf", () => {
  return {
    default: class MockConf {
      store = mockStore;
      get(key: string) {
        return mockStore[key];
      }
      set(key: string, value: any) {
        mockStore[key] = value;
      }
      delete(key: string) {
        delete mockStore[key];
      }
      clear() {
        Object.keys(mockStore).forEach((key) => delete mockStore[key]);
      }
    },
  };
});

const mockFetch = vi.fn();
global.fetch = mockFetch;

import {
  resolveBaseUrl,
  resolveBaseUrlSafe,
  getEffectiveValue,
  PRODUCTION_BASE_URL,
} from "../../src/lib/config.js";
import { apiClient } from "../../src/lib/api-client.js";

const ENV_KEYS = [
  "SENDLY_BASE_URL",
  "SENDLY_API_URL",
  "SENDLY_API_BASE",
  "SENDLY_API_KEY",
] as const;

const savedEnv: Record<string, string | undefined> = {};

function resetStore(): void {
  Object.keys(mockStore).forEach((key) => delete mockStore[key]);
  mockStore.environment = "test";
  mockStore.baseUrl = PRODUCTION_BASE_URL;
  mockStore.defaultFormat = "human";
  mockStore.colorEnabled = true;
  mockStore.timeout = 30000;
  mockStore.maxRetries = 3;
  mockStore.apiKey = "sk_test_v1_mock_token";
}

describe("Base URL resolution", () => {
  beforeEach(() => {
    for (const key of ENV_KEYS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
    resetStore();
    mockFetch.mockReset();
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (savedEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = savedEnv[key];
      }
    }
  });

  describe("precedence", () => {
    it("uses the config file value when no environment variable is set", () => {
      mockStore.baseUrl = "https://stored.example.com";

      expect(resolveBaseUrl()).toBe("https://stored.example.com");
    });

    it("falls back to production when nothing is configured", () => {
      delete mockStore.baseUrl;

      expect(resolveBaseUrl()).toBe(PRODUCTION_BASE_URL);
      expect(PRODUCTION_BASE_URL).toBe("https://sendly.live");
    });

    it("prefers SENDLY_BASE_URL over the config file", () => {
      mockStore.baseUrl = "https://stored.example.com";
      process.env.SENDLY_BASE_URL = "http://localhost:5001";

      expect(resolveBaseUrl()).toBe("http://localhost:5001");
    });

    it("accepts SENDLY_API_URL when SENDLY_BASE_URL is unset", () => {
      mockStore.baseUrl = "https://stored.example.com";
      process.env.SENDLY_API_URL = "http://localhost:5002";

      expect(resolveBaseUrl()).toBe("http://localhost:5002");
    });

    it("prefers SENDLY_BASE_URL over SENDLY_API_URL", () => {
      process.env.SENDLY_BASE_URL = "http://localhost:5001";
      process.env.SENDLY_API_URL = "http://localhost:5002";

      expect(resolveBaseUrl()).toBe("http://localhost:5001");
    });

    it("prefers an explicit per-command value over the environment", () => {
      process.env.SENDLY_BASE_URL = "http://localhost:5001";
      mockStore.baseUrl = "https://stored.example.com";

      expect(resolveBaseUrl("https://flag.example.com")).toBe(
        "https://flag.example.com",
      );
    });

    it("ignores SENDLY_API_BASE, which carries a version-suffixed base", () => {
      mockStore.baseUrl = "https://stored.example.com";
      process.env.SENDLY_API_BASE = "http://localhost:5001/api/v1";

      expect(resolveBaseUrl()).toBe("https://stored.example.com");
    });
  });

  describe("normalization", () => {
    it("treats an empty or whitespace-only variable as unset", () => {
      mockStore.baseUrl = "https://stored.example.com";
      process.env.SENDLY_BASE_URL = "";
      process.env.SENDLY_API_URL = "   ";

      expect(resolveBaseUrl()).toBe("https://stored.example.com");
    });

    it("trims whitespace and trailing slashes from the variable", () => {
      process.env.SENDLY_BASE_URL = "  http://localhost:5001//  ";

      expect(resolveBaseUrl()).toBe("http://localhost:5001");
    });

    it("returns the stored config value verbatim", () => {
      mockStore.baseUrl = "https://stored.example.com/";

      expect(resolveBaseUrl()).toBe("https://stored.example.com/");
    });
  });

  describe("validation", () => {
    it("rejects a variable that is not a URL, naming the variable", () => {
      process.env.SENDLY_BASE_URL = "not a url";

      expect(() => resolveBaseUrl()).toThrow(/SENDLY_BASE_URL/);
    });

    it("rejects a variable without an http(s) scheme", () => {
      process.env.SENDLY_BASE_URL = "localhost:5001";

      expect(() => resolveBaseUrl()).toThrow(/http:\/\/ or https:\/\//);
    });

    it("does not silently fall back to production on a bad value", () => {
      mockStore.baseUrl = "https://stored.example.com";
      process.env.SENDLY_BASE_URL = "ftp://localhost:5001";

      expect(() => resolveBaseUrl()).toThrow();
    });
  });

  describe("path handling", () => {
    it("rejects a base URL carrying a path, which would double the API path", () => {
      process.env.SENDLY_BASE_URL = "https://staging.example.com/api/v1";

      expect(() => resolveBaseUrl()).toThrow(
        /must be an origin with no path.*https:\/\/staging\.example\.com/s,
      );
    });

    it("rejects a path even on a host that would otherwise be allowed", () => {
      process.env.SENDLY_BASE_URL = "http://localhost:5001/api/v1";

      expect(() => resolveBaseUrl()).toThrow(/no path/);
    });

    it("rejects a query string or fragment", () => {
      process.env.SENDLY_BASE_URL = "https://staging.example.com?debug=1";
      expect(() => resolveBaseUrl()).toThrow(/no path/);

      process.env.SENDLY_BASE_URL = "https://staging.example.com#frag";
      expect(() => resolveBaseUrl()).toThrow(/no path/);
    });

    it("still accepts a bare origin with a trailing slash", () => {
      process.env.SENDLY_BASE_URL = "https://staging.example.com/";

      expect(resolveBaseUrl()).toBe("https://staging.example.com");
    });
  });

  describe("credential safety", () => {
    it("refuses a cleartext host that is not loopback, even with a test key", () => {
      process.env.SENDLY_BASE_URL = "http://attacker.example.com";

      expect(() => resolveBaseUrl()).toThrow(/cleartext http/);
    });

    it("refuses any non-production host when a live key is in play", () => {
      mockStore.apiKey = "sk_live_v1_mock_token";
      process.env.SENDLY_BASE_URL = "http://attacker.example.com";

      expect(() => resolveBaseUrl()).toThrow(/live API key/);
    });

    it("refuses a live key over https to a non-production host", () => {
      mockStore.apiKey = "sk_live_v1_mock_token";
      process.env.SENDLY_BASE_URL = "https://attacker.example.com";

      expect(() => resolveBaseUrl()).toThrow(/live API key/);
    });

    it("treats a stored session token as a live credential", () => {
      delete mockStore.apiKey;
      mockStore.accessToken = "cli_mock_access_token";
      mockStore.tokenExpiresAt = Date.now() + 60_000;
      process.env.SENDLY_BASE_URL = "https://attacker.example.com";

      expect(() => resolveBaseUrl()).toThrow(/live API key/);
    });

    it("honours a live SENDLY_API_KEY over the stored test key", () => {
      process.env.SENDLY_API_KEY = "sk_live_v1_env_token";
      process.env.SENDLY_BASE_URL = "https://staging.example.com";

      expect(() => resolveBaseUrl()).toThrow(/live API key/);
    });

    it("allows loopback over http even with a live key", () => {
      mockStore.apiKey = "sk_live_v1_mock_token";

      for (const host of [
        "http://localhost:5001",
        "http://127.0.0.1:5001",
        "http://[::1]:5001",
        "http://api.localhost:5001",
      ]) {
        process.env.SENDLY_BASE_URL = host;
        expect(resolveBaseUrl()).toBe(host);
      }
    });

    it("allows the production host and its subdomains over https", () => {
      mockStore.apiKey = "sk_live_v1_mock_token";

      process.env.SENDLY_BASE_URL = PRODUCTION_BASE_URL;
      expect(resolveBaseUrl()).toBe(PRODUCTION_BASE_URL);

      process.env.SENDLY_BASE_URL = "https://api.sendly.live";
      expect(resolveBaseUrl()).toBe("https://api.sendly.live");
    });

    it("refuses the production host over cleartext http, pointing at https", () => {
      mockStore.apiKey = "sk_live_v1_mock_token";
      process.env.SENDLY_BASE_URL = "http://sendly.live";

      expect(() => resolveBaseUrl()).toThrow(/live API key/);
      expect(() => resolveBaseUrl()).toThrow(/https:\/\/sendly\.live/);
    });

    it("refuses a lookalike of the production host", () => {
      process.env.SENDLY_BASE_URL = "https://sendly.live.attacker.example.com";
      mockStore.apiKey = "sk_live_v1_mock_token";

      expect(() => resolveBaseUrl()).toThrow(/live API key/);
    });

    it("allows a non-production https host with a test key", () => {
      process.env.SENDLY_BASE_URL = "https://staging.example.com";

      expect(resolveBaseUrl()).toBe("https://staging.example.com");
    });

    it("leaves the stored config value alone", () => {
      mockStore.apiKey = "sk_live_v1_mock_token";
      mockStore.baseUrl = "http://internal.example.com";

      expect(resolveBaseUrl()).toBe("http://internal.example.com");
    });
  });

  describe("read path", () => {
    it("does not throw on a malformed value and returns it verbatim", () => {
      process.env.SENDLY_BASE_URL = "not a url";

      expect(() => getEffectiveValue("baseUrl")).not.toThrow();
      expect(getEffectiveValue("baseUrl")).toBe("not a url");
    });

    it("does not throw on a refused value", () => {
      mockStore.apiKey = "sk_live_v1_mock_token";
      process.env.SENDLY_BASE_URL = "http://attacker.example.com";

      expect(() => getEffectiveValue("baseUrl")).not.toThrow();
      expect(getEffectiveValue("baseUrl")).toBe("http://attacker.example.com");
    });

    it("reports the value, its source and the problem", () => {
      mockStore.apiKey = "sk_live_v1_mock_token";
      process.env.SENDLY_BASE_URL = "http://attacker.example.com";

      const resolved = resolveBaseUrlSafe();

      expect(resolved.url).toBe("http://attacker.example.com");
      expect(resolved.source).toBe("SENDLY_BASE_URL");
      expect(resolved.error).toMatch(/live API key/);
    });

    it("reports no error and names the source for a usable value", () => {
      process.env.SENDLY_BASE_URL = "http://localhost:5001";

      expect(resolveBaseUrlSafe()).toEqual({
        url: "http://localhost:5001",
        source: "SENDLY_BASE_URL",
      });
    });

    it("names the config file and the built-in default", () => {
      mockStore.baseUrl = "https://stored.example.com";
      expect(resolveBaseUrlSafe().source).toBe("the config file");

      delete mockStore.baseUrl;
      expect(resolveBaseUrlSafe()).toEqual({
        url: PRODUCTION_BASE_URL,
        source: "the built-in default",
      });
    });
  });

  describe("getEffectiveValue", () => {
    it("agrees with resolveBaseUrl when the environment overrides", () => {
      mockStore.baseUrl = "https://stored.example.com";
      process.env.SENDLY_BASE_URL = "http://localhost:5001";

      expect(getEffectiveValue("baseUrl")).toBe("http://localhost:5001");
      expect(getEffectiveValue("baseUrl")).toBe(resolveBaseUrl());
    });

    it("returns the stored value when no variable is set", () => {
      mockStore.baseUrl = "https://stored.example.com";

      expect(getEffectiveValue("baseUrl")).toBe("https://stored.example.com");
    });
  });

  describe("api client", () => {
    function okResponse() {
      return {
        ok: true,
        status: 200,
        json: () => Promise.resolve({ ok: true }),
        headers: new Map(),
      };
    }

    it("sends the request to SENDLY_BASE_URL", async () => {
      process.env.SENDLY_BASE_URL = "http://localhost:5001";
      mockFetch.mockResolvedValueOnce(okResponse());

      await apiClient.get("/api/v1/account");

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:5001/api/v1/account",
        expect.anything(),
      );
    });

    it("sends the request to the config file host when no variable is set", async () => {
      mockStore.baseUrl = "https://stored.example.com";
      mockFetch.mockResolvedValueOnce(okResponse());

      await apiClient.get("/api/v1/account");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://stored.example.com/api/v1/account",
        expect.anything(),
      );
    });

    it("sends nothing at all when the host is refused", async () => {
      mockStore.apiKey = "sk_live_v1_mock_token";
      process.env.SENDLY_BASE_URL = "http://attacker.example.com";

      await expect(apiClient.get("/api/v1/account")).rejects.toThrow(
        /live API key/,
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("sends nothing at all when the host carries a path", async () => {
      process.env.SENDLY_BASE_URL = "https://staging.example.com/api/v1";

      await expect(apiClient.get("/api/v1/messages")).rejects.toThrow(
        /no path/,
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("appends the API path exactly once to an accepted origin", async () => {
      process.env.SENDLY_BASE_URL = "https://staging.example.com/";
      mockFetch.mockResolvedValueOnce(okResponse());

      await apiClient.get("/api/v1/messages");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://staging.example.com/api/v1/messages",
        expect.anything(),
      );
    });
  });
});
