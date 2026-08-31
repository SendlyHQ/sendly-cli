/**
 * Idempotency key tests
 * Tests automatic key generation, retry reuse, rotation, and caller-supplied keys
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock config module
vi.mock("../../src/lib/config.js", () => ({
  getAuthToken: vi.fn(() => "sk_test_v1_mock_token"),
  getStoredAccessToken: vi.fn(() => undefined),
  setAuthTokens: vi.fn(),
  getConfigValue: vi.fn((key: string) => {
    if (key === "baseUrl") return "https://sendly.live";
    return undefined;
  }),
  resolveBaseUrl: vi.fn(() => "https://sendly.live"),
  getEffectiveValue: vi.fn((key: string) => {
    if (key === "baseUrl") return "https://sendly.live";
    if (key === "maxRetries") return 3;
    if (key === "timeout") return 30000;
    return undefined;
  }),
}));

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

import { apiClient, ValidationError } from "../../src/lib/api-client.js";

const KEY_PATTERN =
  /^sendly-cli-retry-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function mockResponse(data: unknown, status: number = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
    headers: new Map(),
  };
}

function keyOfCall(index: number): string | undefined {
  const headers = mockFetch.mock.calls[index][1].headers as Record<
    string,
    string
  >;
  return headers["Idempotency-Key"];
}

describe("Idempotency keys", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe("automatic key generation", () => {
    it("attaches an auto-generated key to POST requests", async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ id: "msg_123" }));

      await apiClient.post("/api/v1/messages", { to: "+1555", text: "Hello" });

      const key = keyOfCall(0);
      expect(key).toMatch(KEY_PATTERN);
      expect(key!.length).toBeLessThanOrEqual(255);
    });

    it("does not attach a key to GET requests", async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ data: [] }));

      await apiClient.get("/api/v1/messages");

      expect(keyOfCall(0)).toBeUndefined();
    });

    it("does not attach a key to DELETE requests", async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ success: true }));

      await apiClient.delete("/api/keys/key_123");

      expect(keyOfCall(0)).toBeUndefined();
    });

    it("does not auto-attach a key when autoIdempotencyKey is false (batch sends)", async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ batchId: "batch_x" }));

      await apiClient.post(
        "/api/v1/messages/batch",
        { messages: [{ to: "+1555", text: "Hi!" }] },
        true,
        { autoIdempotencyKey: false },
      );

      expect(keyOfCall(0)).toBeUndefined();
    });

    it("attaches an auto-generated key to file uploads", async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({ id: "med_x", url: "https://cdn.example/x.jpg" }),
      );

      await apiClient.uploadFile("/api/v1/media", {
        buffer: Buffer.from("fake-image-bytes"),
        filename: "x.jpg",
        mimetype: "image/jpeg",
      });

      expect(keyOfCall(0)).toMatch(KEY_PATTERN);
    });

    it("generates a distinct key for each logical request", async () => {
      mockFetch.mockResolvedValue(mockResponse({ id: "msg_123" }));

      await apiClient.post("/api/v1/messages", { to: "+1555", text: "First" });
      await apiClient.post("/api/v1/messages", { to: "+1555", text: "Second" });

      const first = keyOfCall(0);
      const second = keyOfCall(1);
      expect(first).toBeDefined();
      expect(second).toBeDefined();
      expect(first).not.toEqual(second);
    });
  });

  describe("retry behavior", () => {
    it("reuses the same key when retrying after a network error", async () => {
      mockFetch
        .mockRejectedValueOnce(new TypeError("fetch failed"))
        .mockResolvedValueOnce(mockResponse({ id: "msg_123" }));

      const result = await apiClient.post("/api/v1/messages", {
        to: "+1555",
        text: "Hello",
      });

      expect(result).toEqual({ id: "msg_123" });
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(keyOfCall(0)).toEqual(keyOfCall(1));
    });

    it("rotates the auto-generated key when retrying after a 5xx response", async () => {
      mockFetch
        .mockResolvedValueOnce(
          mockResponse(
            { error: "internal_error", message: "Internal server error" },
            500,
          ),
        )
        .mockResolvedValueOnce(mockResponse({ id: "msg_123" }));

      const result = await apiClient.post("/api/v1/messages", {
        to: "+1555",
        text: "Hello",
      });

      expect(result).toEqual({ id: "msg_123" });
      expect(mockFetch).toHaveBeenCalledTimes(2);
      const first = keyOfCall(0);
      const second = keyOfCall(1);
      expect(first).toMatch(KEY_PATTERN);
      expect(second).toMatch(KEY_PATTERN);
      expect(first).not.toEqual(second);
    });

    it("keeps the rotated key across a subsequent network error (5xx then network error)", async () => {
      mockFetch
        .mockResolvedValueOnce(
          mockResponse(
            { error: "internal_error", message: "Internal server error" },
            500,
          ),
        )
        .mockRejectedValueOnce(new TypeError("fetch failed"))
        .mockResolvedValueOnce(mockResponse({ id: "msg_123" }));

      const result = await apiClient.post("/api/v1/messages", {
        to: "+1555",
        text: "Hello",
      });

      expect(result).toEqual({ id: "msg_123" });
      expect(mockFetch).toHaveBeenCalledTimes(3);
      const first = keyOfCall(0);
      const second = keyOfCall(1);
      const third = keyOfCall(2);
      expect(second).not.toEqual(first);
      expect(third).toEqual(second);
    });

    it("rotates the auto key on 5xx for file uploads too", async () => {
      mockFetch
        .mockResolvedValueOnce(
          mockResponse(
            { error: "internal_error", message: "Internal server error" },
            502,
          ),
        )
        .mockResolvedValueOnce(
          mockResponse({ id: "med_x", url: "https://cdn.example/x.jpg" }),
        );

      await apiClient.uploadFile("/api/v1/media", {
        buffer: Buffer.from("fake-image-bytes"),
        filename: "x.jpg",
        mimetype: "image/jpeg",
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      const first = keyOfCall(0);
      const second = keyOfCall(1);
      expect(first).toMatch(KEY_PATTERN);
      expect(second).toMatch(KEY_PATTERN);
      expect(first).not.toEqual(second);
    });
  });

  describe("caller-supplied keys", () => {
    it("sends the caller's key verbatim", async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ id: "msg_123" }));

      await apiClient.post(
        "/api/v1/messages",
        { to: "+1555", text: "Hello" },
        true,
        { idempotencyKey: "order-4821-shipped" },
      );

      expect(keyOfCall(0)).toEqual("order-4821-shipped");
    });

    it("never rotates the caller's key, even across a 5xx retry", async () => {
      mockFetch
        .mockResolvedValueOnce(
          mockResponse(
            { error: "internal_error", message: "Internal server error" },
            500,
          ),
        )
        .mockResolvedValueOnce(mockResponse({ id: "msg_123" }));

      await apiClient.post(
        "/api/v1/messages",
        { to: "+1555", text: "Hello" },
        true,
        { idempotencyKey: "order-4821-shipped" },
      );

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(keyOfCall(0)).toEqual("order-4821-shipped");
      expect(keyOfCall(1)).toEqual("order-4821-shipped");
    });

    it("reuses the caller's key across a network-error retry", async () => {
      mockFetch
        .mockRejectedValueOnce(new TypeError("fetch failed"))
        .mockResolvedValueOnce(mockResponse({ id: "msg_123" }));

      await apiClient.post(
        "/api/v1/messages",
        { to: "+1555", text: "Hello" },
        true,
        { idempotencyKey: "signup-otp-user-99" },
      );

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(keyOfCall(0)).toEqual("signup-otp-user-99");
      expect(keyOfCall(1)).toEqual("signup-otp-user-99");
    });

    it("sends the caller's key on batch even with auto keys suppressed", async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ batchId: "batch_x" }));

      await apiClient.post(
        "/api/v1/messages/batch",
        { messages: [{ to: "+1555", text: "Hi!" }] },
        true,
        { idempotencyKey: "campaign-77-wave-1", autoIdempotencyKey: false },
      );

      expect(keyOfCall(0)).toEqual("campaign-77-wave-1");
    });

    it("ignores an empty-string key and still auto-generates", async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ id: "msg_123" }));

      await apiClient.post(
        "/api/v1/messages",
        { to: "+1555", text: "Hello" },
        true,
        { idempotencyKey: "" },
      );

      expect(keyOfCall(0)).toMatch(KEY_PATTERN);
    });

    it("ignores a whitespace-only key and still auto-generates", async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ id: "msg_123" }));

      await apiClient.post(
        "/api/v1/messages",
        { to: "+1555", text: "Hello" },
        true,
        { idempotencyKey: "   " },
      );

      expect(keyOfCall(0)).toMatch(KEY_PATTERN);
    });

    it("rejects a non-ASCII key immediately without a network call", async () => {
      await expect(
        apiClient.post(
          "/api/v1/messages",
          { to: "+1555", text: "Hello" },
          true,
          { idempotencyKey: "Заказ-42" },
        ),
      ).rejects.toThrow(ValidationError);

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("rejects a key longer than 255 characters immediately", async () => {
      await expect(
        apiClient.post(
          "/api/v1/messages",
          { to: "+1555", text: "Hello" },
          true,
          { idempotencyKey: "k".repeat(256) },
        ),
      ).rejects.toThrow(ValidationError);

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
