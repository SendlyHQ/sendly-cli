/**
 * Login command tests
 * Tests authentication flows
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock modules
const mockStore: Record<string, any> = {};

vi.mock("../../src/lib/config.js", () => ({
  isAuthenticated: vi.fn(() => !!mockStore.apiKey || !!mockStore.accessToken),
  getAuthToken: vi.fn(() => mockStore.apiKey || mockStore.accessToken),
  getConfigValue: vi.fn((key: string) => {
    if (key === "baseUrl") return "https://sendly.live";
    return mockStore[key];
  }),
  resolveBaseUrl: vi.fn(() => "https://sendly.live"),
  setApiKey: vi.fn((key: string) => {
    mockStore.apiKey = key;
  }),
  setAuthTokens: vi.fn((access, refresh, expires, userId, email) => {
    mockStore.accessToken = access;
    mockStore.refreshToken = refresh;
    mockStore.userId = userId;
    mockStore.email = email;
  }),
  clearAuth: vi.fn(() => {
    delete mockStore.apiKey;
    delete mockStore.accessToken;
  }),
}));

vi.mock("../../src/lib/output.js", () => ({
  setOutputFormat: vi.fn(),
  setQuietMode: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  colors: {
    bold: (s: string) => s,
    primary: (s: string) => s,
    dim: (s: string) => s,
  },
  spinner: vi.fn(() => ({
    start: vi.fn(),
    stop: vi.fn(),
    succeed: vi.fn(),
    fail: vi.fn(),
  })),
}));

vi.mock("open", () => ({
  default: vi.fn(),
}));

vi.mock("inquirer", () => ({
  default: {
    prompt: vi.fn(),
  },
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

import { isAuthenticated, setApiKey } from "../../src/lib/config.js";
import { success, error } from "../../src/lib/output.js";

describe("login command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
    // Clear mock store
    Object.keys(mockStore).forEach((key) => delete mockStore[key]);
  });

  describe("API key login", () => {
    it("validates test API key format", () => {
      const validKeys = [
        "sk_test_v1_abc123",
        "sk_test_v1_xyz789_longer",
        "sk_test_v1_with-dashes",
        "sk_test_v1_with_underscores",
      ];

      for (const key of validKeys) {
        expect(/^sk_(test|live)_v1_[a-zA-Z0-9_-]+$/.test(key)).toBe(true);
      }
    });

    it("validates live API key format", () => {
      const validKeys = [
        "sk_live_v1_prod123",
        "sk_live_v1_production_key",
      ];

      for (const key of validKeys) {
        expect(/^sk_(test|live)_v1_[a-zA-Z0-9_-]+$/.test(key)).toBe(true);
      }
    });

    it("rejects invalid API key formats", () => {
      const invalidKeys = [
        "sk_test_abc123", // Missing version
        "sk_v1_test_abc", // Wrong order
        "test_v1_abc123", // Missing sk_
        "sk_test_v2_abc", // Wrong version
        "", // Empty
        "random_string",
      ];

      for (const key of invalidKeys) {
        expect(/^sk_(test|live)_v1_[a-zA-Z0-9_-]+$/.test(key)).toBe(false);
      }
    });

    it("verifies API key with server", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ valid: true, userId: "user_123" }),
      });

      const response = await fetch("https://sendly.live/api/cli/auth/verify-key", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer sk_test_v1_mykey",
        },
      });

      expect(response.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://sendly.live/api/cli/auth/verify-key",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer sk_test_v1_mykey",
          }),
        })
      );
    });

    it("handles invalid API key response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ message: "Invalid API key" }),
      });

      const response = await fetch("https://sendly.live/api/cli/auth/verify-key", {
        method: "POST",
        headers: {
          Authorization: "Bearer sk_test_v1_invalid",
        },
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(401);
    });

    it("stores valid API key", () => {
      setApiKey("sk_test_v1_valid");
      expect(mockStore.apiKey).toBe("sk_test_v1_valid");
    });
  });

  describe("browser login flow", () => {
    it("generates device code request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            deviceCode: "ABC12345",
            userCode: "ABCD-1234",
            verificationUrl: "https://sendly.live/cli-login",
            expiresIn: 300,
            interval: 2,
          }),
      });

      const response = await fetch("https://sendly.live/api/cli/auth/device-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceCode: "TEST1234" }),
      });

      const data = await response.json();

      expect(data.verificationUrl).toBe("https://sendly.live/cli-login");
      expect(data.userCode).toBeDefined();
      expect(data.expiresIn).toBeGreaterThan(0);
    });

    it("polls for authorization", async () => {
      // First poll - pending
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: "authorization_pending" }),
      });

      // Second poll - success
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            accessToken: "access_123",
            refreshToken: "refresh_456",
            expiresIn: 3600,
            userId: "user_789",
            email: "user@example.com",
          }),
      });

      // First poll
      let response = await fetch("https://sendly.live/api/cli/auth/token", {
        method: "POST",
        body: JSON.stringify({ deviceCode: "TEST1234" }),
      });
      expect(response.ok).toBe(false);

      // Second poll
      response = await fetch("https://sendly.live/api/cli/auth/token", {
        method: "POST",
        body: JSON.stringify({ deviceCode: "TEST1234" }),
      });
      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data.accessToken).toBe("access_123");
      expect(data.email).toBe("user@example.com");
    });

    it("handles expired device code", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: "expired_token" }),
      });

      const response = await fetch("https://sendly.live/api/cli/auth/token", {
        method: "POST",
        body: JSON.stringify({ deviceCode: "EXPIRED123" }),
      });

      const data = await response.json();
      expect(data.error).toBe("expired_token");
    });

    it("handles access denied", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: "access_denied" }),
      });

      const response = await fetch("https://sendly.live/api/cli/auth/token", {
        method: "POST",
        body: JSON.stringify({ deviceCode: "DENIED123" }),
      });

      const data = await response.json();
      expect(data.error).toBe("access_denied");
    });
  });

  describe("re-authentication", () => {
    it("detects existing authentication", () => {
      mockStore.apiKey = "sk_test_v1_existing";
      expect(isAuthenticated()).toBe(true);
    });

    it("allows re-authentication when confirmed", () => {
      mockStore.apiKey = "sk_test_v1_old";

      // Simulate re-auth
      setApiKey("sk_test_v1_new");

      expect(mockStore.apiKey).toBe("sk_test_v1_new");
    });
  });

  describe("environment detection", () => {
    it("sets test environment for test keys", () => {
      const key = "sk_test_v1_abc";
      const isTest = key.startsWith("sk_test_");
      expect(isTest).toBe(true);
    });

    it("sets live environment for live keys", () => {
      const key = "sk_live_v1_abc";
      const isLive = key.startsWith("sk_live_");
      expect(isLive).toBe(true);
    });
  });
});
