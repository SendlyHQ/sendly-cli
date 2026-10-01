import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../../../src/lib/config.js", () => ({
  isAuthenticated: vi.fn(() => true),
  getAuthToken: vi.fn(() => "cli_v2_session.sig"),
  getStoredAccessToken: vi.fn(() => undefined),
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

import LogsTail from "../../../src/commands/logs/tail.js";
import { setOutputFormat } from "../../../src/lib/output.js";
import { respond, startCommand } from "../../helpers/run-command.js";

const NOW = new Date("2026-09-25T12:00:00.000Z");

function message(id: string, minutesAgo: number, status = "delivered") {
  return {
    id,
    to: `+1500555000${id.slice(-1)}`,
    from: "+18005550100",
    text: "hi",
    status,
    direction: "outbound",
    error: null,
    errorCode: null,
    segments: 1,
    creditsUsed: 0,
    isSandbox: true,
    createdAt: new Date(NOW.getTime() - minutesAgo * 60_000).toISOString(),
    deliveredAt: null,
    message_format: "sms",
    messageFormat: "sms",
  };
}

function page(data: unknown[]) {
  return {
    data,
    pagination: {
      total: data.length,
      limit: 50,
      offset: 0,
      page: 1,
      totalPages: 1,
      hasMore: false,
    },
    count: data.length,
  };
}

const m0 = message("msg_old0", 120);
const m1 = message("msg_one1", 30);
const m2 = message("msg_two2", 10);
const m3 = message("msg_new3", 0);
const failed = message("msg_bad4", 5, "failed");

function routeFetch(pages: unknown[]) {
  let messagesCall = 0;
  mockFetch.mockImplementation(async (url: string) => {
    const { pathname } = new URL(url);
    if (pathname === "/api/v1/messages") {
      const body = pages[Math.min(messagesCall, pages.length - 1)];
      messagesCall += 1;
      if (body === 401) {
        return respond(401, {
          error: "invalid_cli_token",
          message: "CLI session is invalid or expired. Run 'sendly login' again.",
        });
      }
      if (body === 503) {
        return respond(503, { error: "internal_error", message: "Failed to fetch messages" });
      }
      if (body === 429) {
        return respond(429, {
          error: "rate_limit_exceeded",
          message: "Rate limit exceeded. Limit: 60 requests per minute.",
          retryAfter: 30,
        });
      }
      if (body === "locked") {
        return respond(429, {
          error: "too_many_failed_key_attempts",
          message: "Too many failed API key attempts. Try again in 840 seconds.",
          retryAfter: 840,
        });
      }
      if (body === 408) {
        return respond(408, { error: "request_timeout", message: "Request timed out" });
      }
      if (body === "abort") {
        throw new DOMException("This operation was aborted", "AbortError");
      }
      return respond(200, body);
    }
    if (pathname === "/api/logs") {
      return respond(401, { error: "Not authenticated" });
    }
    return respond(401, {});
  });
}

function requestedUrls(): URL[] {
  return mockFetch.mock.calls.map(([url]) => new URL(url as string));
}

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe("sendly logs tail", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    mockFetch.mockReset();
    setOutputFormat("human");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("polls /api/v1/messages with the status filter, prints each message once, oldest first", async () => {
    routeFetch([
      page([m2, failed, m1, m0]),
      page([m3, m2, failed, m1, m0]),
    ]);

    const run = startCommand(LogsTail, ["--since", "1h", "--status", "delivered"]);
    await vi.advanceTimersByTimeAsync(0);
    const afterFirstFetch = run.stdout();
    await vi.advanceTimersByTimeAsync(2000);
    const out = run.stdout();

    const urls = requestedUrls();
    expect(urls.length).toBeGreaterThanOrEqual(2);
    for (const url of urls) {
      expect(url.pathname).toBe("/api/v1/messages");
      expect(url.searchParams.get("status")).toBe("delivered");
    }

    expect(occurrences(out, "id: msg_one1")).toBe(1);
    expect(occurrences(out, "id: msg_two2")).toBe(1);
    expect(out.indexOf("id: msg_one1")).toBeLessThan(out.indexOf("id: msg_two2"));
    expect(out).not.toContain("msg_old0");
    expect(out).not.toContain("msg_bad4");

    expect(afterFirstFetch).toContain("id: msg_two2");
    expect(afterFirstFetch).not.toContain("msg_new3");
    expect(occurrences(out, "id: msg_new3")).toBe(1);
    expect(out.indexOf("id: msg_two2")).toBeLessThan(out.indexOf("id: msg_new3"));
  });

  it("prints a message when it later reaches the requested status", async () => {
    const queued = message("msg_late5", 3, "queued");
    routeFetch([
      page([queued, m1]),
      page([{ ...queued, status: "delivered" }, m1]),
      page([{ ...queued, status: "delivered" }, m1]),
    ]);

    const run = startCommand(LogsTail, ["--status", "delivered"]);
    await vi.advanceTimersByTimeAsync(0);
    expect(run.stdout()).not.toContain("msg_late5");
    await vi.advanceTimersByTimeAsync(4000);

    expect(occurrences(run.stdout(), "id: msg_late5")).toBe(1);
    expect(occurrences(run.stdout(), "id: msg_one1")).toBe(1);
  });

  it("does not print a message again when it drops off the page and comes back", async () => {
    routeFetch([page([m2, m1]), page([m3]), page([m3, m2, m1])]);

    const run = startCommand(LogsTail, []);
    await vi.advanceTimersByTimeAsync(4000);

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(occurrences(run.stdout(), "id: msg_one1")).toBe(1);
    expect(occurrences(run.stdout(), "id: msg_two2")).toBe(1);
    expect(occurrences(run.stdout(), "id: msg_new3")).toBe(1);
  });

  it("exits 1 with the server's message when a poll is refused, instead of printing nothing", async () => {
    routeFetch([page([m1]), 401]);

    const run = startCommand(LogsTail, ["--since", "1h"]);
    await vi.advanceTimersByTimeAsync(2000);
    const finished = await Promise.race([run.done, Promise.resolve(undefined)]);

    expect(finished).toBeDefined();
    expect(finished?.exitCode).toBe(1);
    expect(finished?.stderr).toContain("CLI session is invalid or expired");
  });

  it("keeps polling through a server error", async () => {
    routeFetch([page([m1]), 503, page([m3, m1])]);

    const run = startCommand(LogsTail, []);
    await vi.advanceTimersByTimeAsync(4000);

    expect(occurrences(run.stdout(), "id: msg_new3")).toBe(1);
    const finished = await Promise.race([run.done, Promise.resolve(undefined)]);
    expect(finished).toBeUndefined();
  });

  it("stops with the key hint when keys from this address are blocked, instead of polling through the block", async () => {
    routeFetch([page([m1]), "locked", page([m3, m1])]);

    const run = startCommand(LogsTail, []);
    await vi.advanceTimersByTimeAsync(2000);
    const finished = await Promise.race([run.done, Promise.resolve(undefined)]);

    expect(finished).toBeDefined();
    expect(finished?.exitCode).toBe(1);
    expect(finished?.stderr).toContain("Too many failed API key attempts");
    expect(finished?.stderr).toContain("Check the key in SENDLY_API_KEY");
    expect(finished?.stdout).not.toContain("Could not fetch logs");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("waits the retryAfter of a rate limit before the next poll, then keeps polling", async () => {
    routeFetch([page([m1]), 429, page([m3, m1])]);

    const run = startCommand(LogsTail, []);
    await vi.advanceTimersByTimeAsync(2000);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(occurrences(run.stdout(), "Could not fetch logs")).toBe(1);

    await vi.advanceTimersByTimeAsync(29_000);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1000);
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(occurrences(run.stdout(), "id: msg_new3")).toBe(1);
    const finished = await Promise.race([run.done, Promise.resolve(undefined)]);
    expect(finished).toBeUndefined();
  });

  it.each([
    ["a 503", 503],
    ["a 408", 408],
    ["a request that timed out", "abort"],
  ])("warns once and keeps polling through %s", async (_label, failure) => {
    routeFetch([page([m1]), failure, failure, page([m3, m1])]);

    const run = startCommand(LogsTail, []);
    await vi.advanceTimersByTimeAsync(6000);

    expect(occurrences(run.stdout(), "Could not fetch logs")).toBe(1);
    expect(occurrences(run.stdout(), "id: msg_one1")).toBe(1);
    expect(occurrences(run.stdout(), "id: msg_new3")).toBe(1);
    const finished = await Promise.race([run.done, Promise.resolve(undefined)]);
    expect(finished).toBeUndefined();
  });

  it("remembers the last 1,000 printed messages, forgetting the oldest first", async () => {
    const pages = Array.from({ length: 21 }, (_, p) =>
      page(
        Array.from({ length: 50 }, (_, i) => ({
          ...message(`msg_p${p}_${i}`, 0),
          createdAt: new Date(NOW.getTime() - 30 * 60_000 + (p * 50 + i) * 1000).toISOString(),
        })).reverse(),
      ),
    );
    const oldest = (pages[0].data as ReturnType<typeof message>[]).at(-1)!;
    const newest = (pages[20].data as ReturnType<typeof message>[])[0];
    expect(oldest.id).toBe("msg_p0_0");
    expect(newest.id).toBe("msg_p20_49");
    routeFetch([...pages, page([newest, oldest])]);

    const run = startCommand(LogsTail, []);
    await vi.advanceTimersByTimeAsync(40_000);
    const beforeRepeat = run.stdout();
    await vi.advanceTimersByTimeAsync(2000);
    const out = run.stdout();

    expect(mockFetch).toHaveBeenCalledTimes(22);
    expect(occurrences(beforeRepeat, "id: msg_p0_0\n")).toBe(1);
    expect(occurrences(beforeRepeat, "id: msg_p20_49\n")).toBe(1);
    expect(occurrences(out, "id: msg_p20_49\n")).toBe(1);
    expect(occurrences(out, "id: msg_p0_0\n")).toBe(2);
  });

  it("refuses --type values that have no log source", async () => {
    routeFetch([page([m1])]);

    const run = startCommand(LogsTail, ["--type", "webhook"]);
    const finished = await run.done;

    expect(finished.exitCode).toBe(1);
    expect(finished.stderr).toMatch(/message/);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
