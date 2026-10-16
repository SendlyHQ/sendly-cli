/**
 * Idempotency key tests
 * Tests automatic key generation, retry reuse, and caller-supplied keys
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

import {
  apiClient,
  ApiError,
  ValidationError,
} from "../../src/lib/api-client.js";

const KEY_PATTERN =
  /^sendly-cli-retry-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function mockResponse(
  data: unknown,
  status: number = 200,
  headers: Record<string, string> = {},
) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
    headers: new Map(Object.entries(headers)),
  };
}

function unparsableResponse(status: number) {
  return {
    ok: false,
    status,
    json: () => Promise.reject(new SyntaxError("Unexpected token '<'")),
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

    it("keeps the auto-generated key when retrying after a 503, which the API never records", async () => {
      mockFetch
        .mockResolvedValueOnce(mockResponse({}, 503))
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
      expect(second).toEqual(first);
    });

    it("keeps one key across a 503 and then a network error", async () => {
      mockFetch
        .mockResolvedValueOnce(mockResponse({}, 503))
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
      expect(second).toEqual(first);
      expect(third).toEqual(second);
    });

    it("keeps the auto key on a 503 for file uploads too", async () => {
      mockFetch
        .mockResolvedValueOnce(mockResponse({}, 503))
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
      expect(second).toEqual(first);
    });

    it("does not retry a send the API refused with a 502 error body, and keeps its code and message", async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse(
          {
            error: "rcs_send_failed",
            errorCode: "E099",
            message: "The message couldn't be delivered.",
          },
          502,
        ),
      );

      const err = await apiClient
        .post("/api/v1/messages", {
          channel: "rcs",
          to: "+15125550190",
          text: "Hello",
        })
        .catch((e) => e);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(err).toBeInstanceOf(ApiError);
      expect(err.code).toBe("rcs_send_failed");
      expect(err.message).toBe("The message couldn't be delivered.");
      expect(err.statusCode).toBe(502);
    });

    it("does not retry a send whose 503 the API sent in place of a 502, and keeps its code and message", async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse(
          {
            error: "short_code_send_failed",
            message: "The short code carrier did not take the message.",
          },
          503,
          { "Sendly-Upstream-Status": "502" },
        ),
      );

      const err = await apiClient
        .post("/api/v1/messages", {
          channel: "short_code",
          to: "+15125550190",
          text: "Hello",
        })
        .catch((e) => e);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(err).toBeInstanceOf(ApiError);
      expect(err.code).toBe("short_code_send_failed");
      expect(err.message).toBe("The short code carrier did not take the message.");
      expect(err.statusCode).toBe(503);
      expect(err.upstreamStatus).toBe(502);
    });

    it("still retries a GET whose 503 the API sent in place of a 504", async () => {
      mockFetch
        .mockResolvedValueOnce(
          mockResponse(
            { error: "whatsapp_profile_fetch_failed", message: "Try again." },
            503,
            { "Sendly-Upstream-Status": "504" },
          ),
        )
        .mockResolvedValueOnce(mockResponse({ about: "Hi" }));

      const result = await apiClient.get("/api/v1/whatsapp/senders/+15125550190/profile");

      expect(result).toEqual({ about: "Hi" });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("does not retry a POST the API answered with a 500, even with a caller key", async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse(
          { error: "internal_error", message: "Internal server error" },
          500,
        ),
      );

      const err = await apiClient
        .post(
          "/api/v1/messages",
          { to: "+1555", text: "Hello" },
          true,
          { idempotencyKey: "order-4821-shipped" },
        )
        .catch((e) => e);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(err.code).toBe("internal_error");
    });

    it("does not retry a 5xx with a sentence body on a POST", async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({ error: "Failed to purchase number" }, 502),
      );

      const err = await apiClient
        .post("/api/v1/numbers", { phoneNumber: "+15125550190" })
        .catch((e) => e);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(err.message).toBe("Failed to purchase number");
    });

    it("does not retry an upload the API answered with a 5xx", async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse(
          { error: "upload_failed", message: "The upload failed" },
          500,
        ),
      );

      await expect(
        apiClient.uploadFile("/api/v1/media", {
          buffer: Buffer.from("fake-image-bytes"),
          filename: "x.jpg",
          mimetype: "image/jpeg",
        }),
      ).rejects.toThrow("The upload failed");
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("does not retry a send whose 502 body was empty", async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({}, 502));

      const err = await apiClient
        .post("/api/v1/messages", {
          channel: "rcs",
          to: "+15125550190",
          text: "Hello",
        })
        .catch((e) => e);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(err).toBeInstanceOf(ApiError);
      expect(err.statusCode).toBe(502);
    });

    it.each([502, 504])(
      "does not retry a send whose %i body was not JSON",
      async (status) => {
        mockFetch.mockResolvedValueOnce(unparsableResponse(status));

        const err = await apiClient
          .post("/api/v1/messages", {
            channel: "rcs",
            to: "+15125550190",
            text: "Hello",
          })
          .catch((e) => e);

        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(err).toBeInstanceOf(ApiError);
        expect(err.statusCode).toBe(status);
      },
    );

    it("does not retry a PATCH answered with a 502", async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({}, 502));

      await expect(
        apiClient.patch("/api/v1/webhooks/whk_1", { url: "https://x.example" }),
      ).rejects.toBeInstanceOf(ApiError);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("retries a POST answered with a 503 that is not the maintenance hold", async () => {
      mockFetch
        .mockResolvedValueOnce(
          mockResponse(
            {
              error: "service_unavailable",
              message: "Sending is temporarily unavailable.",
            },
            503,
          ),
        )
        .mockResolvedValueOnce(mockResponse({ id: "msg_123" }));

      const result = await apiClient.post("/api/v1/messages", {
        to: "+1555",
        text: "Hello",
      });

      expect(result).toEqual({ id: "msg_123" });
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(keyOfCall(1)).toEqual(keyOfCall(0));
    });

    it("does not retry a gateway 5xx on a POST sent without an idempotency key", async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({}, 502));

      await expect(
        apiClient.post(
          "/api/v1/messages/batch",
          { messages: [{ to: "+1555", text: "Hello" }] },
          true,
          { autoIdempotencyKey: false },
        ),
      ).rejects.toBeInstanceOf(ApiError);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("retries a POST the edge held for maintenance and never forwarded", async () => {
      mockFetch
        .mockResolvedValueOnce(
          mockResponse(
            {
              error: "maintenance",
              message:
                "Sendly is completing scheduled maintenance. Please retry in a few seconds.",
            },
            503,
          ),
        )
        .mockResolvedValueOnce(mockResponse({ id: "msg_123" }));

      const result = await apiClient.post("/api/v1/messages", {
        to: "+1555",
        text: "Hello",
      });

      expect(result).toEqual({ id: "msg_123" });
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(keyOfCall(1)).toEqual(keyOfCall(0));
    });

    it("still retries a GET whose 502 body was not JSON", async () => {
      mockFetch
        .mockResolvedValueOnce(unparsableResponse(502))
        .mockResolvedValueOnce(mockResponse({ data: [] }));

      const result = await apiClient.get("/api/v1/messages");

      expect(result).toEqual({ data: [] });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("still retries a GET the API answered with a 5xx", async () => {
      mockFetch
        .mockResolvedValueOnce(
          mockResponse(
            { error: "internal_error", message: "Internal server error" },
            500,
          ),
        )
        .mockResolvedValueOnce(mockResponse({ data: [] }));

      const result = await apiClient.get("/api/v1/messages");

      expect(result).toEqual({ data: [] });
      expect(mockFetch).toHaveBeenCalledTimes(2);
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

    it("never rotates the caller's key, even across a 503 retry", async () => {
      mockFetch
        .mockResolvedValueOnce(mockResponse({}, 503))
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
