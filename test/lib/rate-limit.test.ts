import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../../src/lib/config.js", () => ({
  getAuthToken: vi.fn(() => "sk_live_v1_mock"),
  getStoredAccessToken: vi.fn(() => undefined),
  setAuthTokens: vi.fn(),
  getConfigValue: vi.fn(() => undefined),
  resolveBaseUrl: vi.fn(() => "https://sendly.live"),
  getEffectiveValue: vi.fn((key: string) => {
    if (key === "maxRetries") return 3;
    if (key === "timeout") return 30000;
    return undefined;
  }),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

import { apiClient, RateLimitError } from "../../src/lib/api-client.js";

function tooMany(error: string, message: string, retryAfter: number) {
  return {
    ok: false,
    status: 429,
    json: () => Promise.resolve({ error, message, retryAfter }),
    headers: new Map([["Retry-After", String(retryAfter)]]),
  };
}

function ok(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
    headers: new Map(),
  };
}

const CONCURRENT = [
  "too_many_concurrent_verifications",
  "Too many API key checks are already running for this account from this address. Try again in 1 second.",
  1,
] as const;

function keyOf(call: number): string | undefined {
  return (mockFetch.mock.calls[call][1].headers as Record<string, string>)["Idempotency-Key"];
}

describe("429s from the API-key checks", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("retries too_many_concurrent_verifications after its Retry-After, with the same key", async () => {
    mockFetch
      .mockResolvedValueOnce(tooMany(...CONCURRENT))
      .mockResolvedValueOnce(ok({ id: "msg_1" }));

    const request = apiClient.post<{ id: string }>("/api/v1/messages", {
      to: "+15555550123",
      text: "hi",
    });
    await vi.advanceTimersByTimeAsync(999);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);

    await expect(request).resolves.toEqual({ id: "msg_1" });
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(keyOf(1)).toBe(keyOf(0));
  });

  it("still waits out a busy 429 of exactly a minute", async () => {
    mockFetch
      .mockResolvedValueOnce(tooMany("too_many_concurrent_verifications", "Too many API key checks are already running.", 60))
      .mockResolvedValueOnce(ok({ id: "msg_1" }));

    const request = apiClient.get("/api/v1/account");
    await vi.advanceTimersByTimeAsync(59999);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);

    await expect(request).resolves.toEqual({ id: "msg_1" });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("does not wait out a busy 429 whose Retry-After is over a minute", async () => {
    mockFetch.mockResolvedValue(
      tooMany("too_many_concurrent_verifications", "Too many API key checks are already running.", 120),
    );

    const request = apiClient.get("/api/v1/account");
    const outcome = request.then(
      () => null,
      (error: unknown) => error,
    );
    await vi.advanceTimersByTimeAsync(0);

    const error = await outcome;
    expect(error).toBeInstanceOf(RateLimitError);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("keeps a caller's idempotency key on that retry", async () => {
    mockFetch
      .mockResolvedValueOnce(tooMany(...CONCURRENT))
      .mockResolvedValueOnce(ok({ id: "msg_1" }));

    const request = apiClient.post(
      "/api/v1/messages",
      { to: "+15555550123", text: "hi" },
      true,
      { idempotencyKey: "order-42" },
    );
    await vi.advanceTimersByTimeAsync(1000);

    await expect(request).resolves.toEqual({ id: "msg_1" });
    expect(keyOf(0)).toBe("order-42");
    expect(keyOf(1)).toBe("order-42");
  });

  it("retries a busy key check on a file upload too, with the same key", async () => {
    const uploaded = {
      id: "file_1",
      url: "https://media.example.com/mms/file_1.png",
      contentType: "image/png",
      sizeBytes: 3,
    };
    mockFetch
      .mockResolvedValueOnce(tooMany(...CONCURRENT))
      .mockResolvedValueOnce({ ...ok(uploaded), status: 201 });

    const upload = apiClient.uploadFile("/api/v1/media", {
      buffer: Buffer.from("png"),
      filename: "file_1.png",
      mimetype: "image/png",
    });
    await vi.advanceTimersByTimeAsync(999);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);

    await expect(upload).resolves.toEqual(uploaded);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(keyOf(1)).toBe(keyOf(0));
  });

  it("stops at the retry budget and surfaces the code", async () => {
    mockFetch.mockResolvedValue(tooMany(...CONCURRENT));

    const request = apiClient.get("/api/v1/messages").catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(10_000);
    const err = await request;

    expect(mockFetch).toHaveBeenCalledTimes(4);
    expect(err).toBeInstanceOf(RateLimitError);
    expect((err as RateLimitError).code).toBe("too_many_concurrent_verifications");
    expect((err as RateLimitError).retryAfter).toBe(1);
  });

  it("never retries too_many_failed_key_attempts and keeps its code, message and retry-after", async () => {
    mockFetch.mockResolvedValue(
      tooMany(
        "too_many_failed_key_attempts",
        "Too many failed API key attempts. Try again in 300 seconds.",
        300,
      ),
    );

    const request = apiClient.get("/api/v1/messages").catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(600_000);
    const err = await request;

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(err).toBeInstanceOf(RateLimitError);
    expect((err as RateLimitError).code).toBe("too_many_failed_key_attempts");
    expect((err as RateLimitError).message).toBe(
      "Too many failed API key attempts. Try again in 300 seconds.",
    );
    expect((err as RateLimitError).retryAfter).toBe(300);
    expect((err as RateLimitError).hint).not.toMatch(/upgrade your plan/);
  });

  it("does not retry an ordinary rate_limit_exceeded, as before", async () => {
    mockFetch.mockResolvedValue(
      tooMany("rate_limit_exceeded", "Rate limit exceeded. Limit: 60 requests per minute.", 30),
    );

    const request = apiClient.get("/api/v1/messages").catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(120_000);
    const err = await request;

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(err).toBeInstanceOf(RateLimitError);
    expect((err as RateLimitError).code).toBe("rate_limit_exceeded");
    expect((err as RateLimitError).retryAfter).toBe(30);
  });

  it("does not retry the lockout the API reported as rate_limit_exceeded before it had its own code", async () => {
    mockFetch.mockResolvedValue(
      tooMany(
        "rate_limit_exceeded",
        "Too many failed API key attempts. Try again in 120 seconds.",
        120,
      ),
    );

    const request = apiClient.get("/api/v1/messages").catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(600_000);
    const err = await request;

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect((err as RateLimitError).code).toBe("rate_limit_exceeded");
  });

  it("keeps RateLimitError's two-argument form", () => {
    const err = new RateLimitError(45, "Too many requests");
    expect(err.code).toBe("rate_limit_exceeded");
    expect(err.retryAfter).toBe(45);
    expect(err.statusCode).toBe(429);
  });
});
