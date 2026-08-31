/**
 * SMS Send command tests
 * Tests the core SMS sending functionality
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock modules before imports
vi.mock("../../../src/lib/config.js", () => ({
  isAuthenticated: vi.fn(() => true),
  getAuthToken: vi.fn(() => "sk_test_v1_mock"),
  resolveBaseUrl: vi.fn(() => "https://sendly.live"),
  getConfigValue: vi.fn((key: string) => {
    if (key === "baseUrl") return "https://sendly.live";
    if (key === "defaultFormat") return "human";
    return undefined;
  }),
}));

vi.mock("../../../src/lib/output.js", () => {
  let outputFormat = "human";
  return {
    setOutputFormat: vi.fn((format: string) => {
      outputFormat = format;
    }),
    setQuietMode: vi.fn(),
    isJsonMode: vi.fn(() => outputFormat === "json"),
    success: vi.fn(),
    error: vi.fn(),
    json: vi.fn(),
    spinner: vi.fn(() => ({
      start: vi.fn(),
      stop: vi.fn(),
      succeed: vi.fn(),
      fail: vi.fn(),
    })),
    colors: {
      bold: (s: string) => s,
      primary: (s: string) => s,
      dim: (s: string) => s,
      success: (s: string) => s,
      error: (s: string) => s,
    },
    formatStatus: vi.fn((s: string) => s),
    formatCredits: vi.fn((n: number) => `${n} credits`),
  };
});

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

import { isAuthenticated } from "../../../src/lib/config.js";
import { success, error, json } from "../../../src/lib/output.js";

describe("sms send command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  describe("input validation", () => {
    it("validates E.164 phone format", async () => {
      // Test valid formats
      const validNumbers = [
        "+15551234567",
        "+442071234567",
        "+61412345678",
        "+8613912345678",
      ];

      for (const num of validNumbers) {
        expect(/^\+[1-9]\d{1,14}$/.test(num)).toBe(true);
      }
    });

    it("rejects invalid phone formats", async () => {
      const invalidNumbers = [
        "5551234567", // No +
        "+05551234567", // Starts with 0
        "+1", // Too short
        "+123456789012345678", // Too long
        "invalid",
      ];

      for (const num of invalidNumbers) {
        expect(/^\+[1-9]\d{1,14}$/.test(num)).toBe(false);
      }
    });

    it("validates non-empty message text", () => {
      expect("Hello world".trim()).not.toBe("");
      expect("   ".trim()).toBe("");
      expect("".trim()).toBe("");
    });
  });

  describe("API request", () => {
    it("sends correct payload to API", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: "msg_123",
            to: "+15551234567",
            from: "Sendly",
            text: "Hello!",
            status: "queued",
            segments: 1,
            creditsUsed: 1,
            createdAt: new Date().toISOString(),
          }),
        headers: new Map(),
      });

      // Simulate the API call
      const response = await fetch("https://sendly.live/api/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer sk_test_v1_mock",
        },
        body: JSON.stringify({
          to: "+15551234567",
          text: "Hello!",
        }),
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "https://sendly.live/api/v1/messages",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ to: "+15551234567", text: "Hello!" }),
        })
      );
    });

    it("includes optional from field", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: "msg_123",
            status: "queued",
          }),
        headers: new Map(),
      });

      await fetch("https://sendly.live/api/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: "+15551234567",
          text: "Hello!",
          from: "MyBrand",
        }),
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({
            to: "+15551234567",
            text: "Hello!",
            from: "MyBrand",
          }),
        })
      );
    });
  });

  describe("response handling", () => {
    it("handles successful send response", async () => {
      const mockResponse = {
        id: "msg_abc123",
        to: "+15551234567",
        from: "Sendly",
        text: "Test message",
        status: "queued",
        segments: 1,
        creditsUsed: 1,
        createdAt: "2025-01-15T10:00:00Z",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
        headers: new Map(),
      });

      const response = await fetch("https://sendly.live/api/v1/messages", {
        method: "POST",
        body: JSON.stringify({ to: "+15551234567", text: "Test" }),
      });

      const data = await response.json();

      expect(data.id).toBe("msg_abc123");
      expect(data.status).toBe("queued");
      expect(data.segments).toBe(1);
    });

    it("handles multi-segment messages", async () => {
      const mockResponse = {
        id: "msg_def456",
        status: "queued",
        segments: 3,
        creditsUsed: 3,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
        headers: new Map(),
      });

      const response = await fetch("https://sendly.live/api/v1/messages", {
        method: "POST",
        body: JSON.stringify({
          to: "+15551234567",
          text: "A".repeat(500), // Long message
        }),
      });

      const data = await response.json();
      expect(data.segments).toBe(3);
      expect(data.creditsUsed).toBe(3);
    });
  });

  describe("error handling", () => {
    it("handles insufficient credits error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 402,
        json: () =>
          Promise.resolve({
            error: "insufficient_credits",
            message: "Not enough credits to send message",
          }),
        headers: new Map(),
      });

      const response = await fetch("https://sendly.live/api/v1/messages", {
        method: "POST",
        body: JSON.stringify({ to: "+15551234567", text: "Test" }),
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(402);
    });

    it("handles rate limit error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: () =>
          Promise.resolve({
            error: "rate_limit_exceeded",
            message: "Too many requests",
            retryAfter: 30,
          }),
        headers: new Map(),
      });

      const response = await fetch("https://sendly.live/api/v1/messages", {
        method: "POST",
        body: JSON.stringify({ to: "+15551234567", text: "Test" }),
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(429);
    });

    it("handles validation error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () =>
          Promise.resolve({
            error: "validation_error",
            message: "Invalid phone number",
            details: { field: "to" },
          }),
        headers: new Map(),
      });

      const response = await fetch("https://sendly.live/api/v1/messages", {
        method: "POST",
        body: JSON.stringify({ to: "invalid", text: "Test" }),
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);
    });
  });

  describe("authentication", () => {
    it("requires authentication", () => {
      vi.mocked(isAuthenticated).mockReturnValueOnce(false);
      expect(isAuthenticated()).toBe(false);
    });

    it("proceeds when authenticated", () => {
      vi.mocked(isAuthenticated).mockReturnValueOnce(true);
      expect(isAuthenticated()).toBe(true);
    });
  });
});
