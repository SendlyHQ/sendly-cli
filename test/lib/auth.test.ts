/**
 * Auth module tests
 * Tests authentication flows and credential management
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// Store for mock config
const mockStore: Record<string, any> = {};

// Mock config module
vi.mock("../../src/lib/config.js", () => ({
  setAuthTokens: vi.fn((access, refresh, expires, userId, email) => {
    mockStore.accessToken = access;
    mockStore.refreshToken = refresh;
    mockStore.tokenExpiresAt = Date.now() + expires * 1000;
    mockStore.userId = userId;
    mockStore.email = email;
  }),
  setApiKey: vi.fn((key) => {
    if (!/^sk_(test|live)_v1_[a-zA-Z0-9_-]+$/.test(key)) {
      throw new Error("Invalid API key format");
    }
    mockStore.apiKey = key;
    mockStore.environment = key.startsWith("sk_test_") ? "test" : "live";
  }),
  clearAuth: vi.fn(() => {
    delete mockStore.apiKey;
    delete mockStore.accessToken;
    delete mockStore.refreshToken;
    delete mockStore.tokenExpiresAt;
    delete mockStore.userId;
    delete mockStore.email;
  }),
  getConfigValue: vi.fn((key) => mockStore[key]),
  isAuthenticated: vi.fn(() => !!(mockStore.apiKey || mockStore.accessToken)),
  getAuthToken: vi.fn(() => mockStore.apiKey || mockStore.accessToken),
}));

// Mock output module
vi.mock("../../src/lib/output.js", () => ({
  colors: {
    bold: (s: string) => s,
    primary: (s: string) => s,
    dim: (s: string) => s,
  },
  spinner: () => ({
    start: vi.fn(),
    stop: vi.fn(),
    succeed: vi.fn(),
    fail: vi.fn(),
  }),
}));

// Mock open module
vi.mock("open", () => ({
  default: vi.fn(),
}));

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

import {
  generateDeviceCode,
  generateUserCode,
  apiKeyLogin,
  logout,
  checkAuth,
  getAuthInfo,
} from "../../src/lib/auth.js";
import {
  setApiKey,
  clearAuth,
  isAuthenticated,
  getConfigValue,
} from "../../src/lib/config.js";

describe("Auth Module", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
    // Clear mock store
    Object.keys(mockStore).forEach((key) => delete mockStore[key]);
  });

  describe("generateDeviceCode", () => {
    it("generates 32-char hex code", () => {
      const code = generateDeviceCode();
      expect(code).toHaveLength(32);
      expect(/^[a-f0-9]{32}$/.test(code)).toBe(true);
    });

    it("generates unique codes", () => {
      const codes = new Set<string>();
      for (let i = 0; i < 100; i++) {
        codes.add(generateDeviceCode());
      }
      expect(codes.size).toBe(100);
    });
  });

  describe("generateUserCode", () => {
    it("generates code of correct length", () => {
      const code = generateUserCode();
      expect(code).toHaveLength(8);
    });

    it("generates unique codes", () => {
      const codes = new Set<string>();
      for (let i = 0; i < 100; i++) {
        codes.add(generateUserCode());
      }
      // All 100 codes should be unique
      expect(codes.size).toBe(100);
    });

    it("only contains allowed characters", () => {
      const allowedChars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      for (let i = 0; i < 50; i++) {
        const code = generateUserCode();
        for (const char of code) {
          expect(allowedChars).toContain(char);
        }
      }
    });

    it("excludes confusing characters (0, O, 1, I)", () => {
      // The implementation excludes: 0, O, 1, I (easily confused)
      // L is allowed since codes are uppercase-only
      const confusingChars = "0O1I";
      for (let i = 0; i < 100; i++) {
        const code = generateUserCode();
        for (const char of code) {
          expect(confusingChars).not.toContain(char);
        }
      }
    });
  });

  describe("apiKeyLogin", () => {
    it("validates and stores valid API key", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ valid: true }),
      });

      await apiKeyLogin("sk_test_v1_validkey123");

      expect(setApiKey).toHaveBeenCalledWith("sk_test_v1_validkey123");
    });

    it("sets correct environment for test key", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ valid: true }),
      });

      await apiKeyLogin("sk_test_v1_validkey123");

      expect(mockStore.environment).toBe("test");
    });

    it("sets correct environment for live key", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ valid: true }),
      });

      await apiKeyLogin("sk_live_v1_validkey123");

      expect(mockStore.environment).toBe("live");
    });

    it("throws on invalid API key from server", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ message: "Invalid API key" }),
      });

      await expect(apiKeyLogin("sk_test_v1_invalid")).rejects.toThrow(
        "Invalid API key",
      );
    });

    it("sends correct authorization header", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ valid: true }),
      });

      await apiKeyLogin("sk_test_v1_mykey");

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/cli/auth/verify-key"),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer sk_test_v1_mykey",
          }),
        }),
      );
    });
  });

  describe("logout", () => {
    it("clears all credentials", () => {
      mockStore.apiKey = "sk_test_v1_key";
      mockStore.accessToken = "token";

      logout();

      expect(clearAuth).toHaveBeenCalled();
    });
  });

  describe("checkAuth", () => {
    it("returns false when not authenticated", () => {
      expect(checkAuth()).toBe(false);
    });

    it("returns true when authenticated with API key", () => {
      mockStore.apiKey = "sk_test_v1_key";
      expect(checkAuth()).toBe(true);
    });

    it("returns true when authenticated with access token", () => {
      mockStore.accessToken = "access_token";
      expect(checkAuth()).toBe(true);
    });
  });

  describe("getAuthInfo", () => {
    it("returns unauthenticated state when no credentials", async () => {
      const info = await getAuthInfo();

      expect(info.authenticated).toBe(false);
    });

    it("returns full info when authenticated with API key", async () => {
      mockStore.apiKey = "sk_test_v1_key";
      mockStore.environment = "test";

      const info = await getAuthInfo();

      expect(info.authenticated).toBe(true);
      expect(info.keyType).toBe("test");
      expect(info.environment).toBe("test");
    });

    it("returns email when authenticated with browser login", async () => {
      mockStore.accessToken = "token";
      mockStore.email = "user@example.com";
      mockStore.userId = "user_123";
      mockStore.environment = "test";

      const info = await getAuthInfo();

      expect(info.authenticated).toBe(true);
      expect(info.email).toBe("user@example.com");
      expect(info.userId).toBe("user_123");
    });

    it("identifies live key type", async () => {
      mockStore.apiKey = "sk_live_v1_key";
      mockStore.environment = "live";

      const info = await getAuthInfo();

      expect(info.keyType).toBe("live");
    });
  });
});
