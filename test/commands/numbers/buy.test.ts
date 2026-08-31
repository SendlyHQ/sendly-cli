/**
 * Numbers buy flow tests
 * Validates the request shapes and the documents/payment action loop the
 * `sendly numbers buy` command relies on.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NotFoundError } from "../../../src/lib/api-client.js";

vi.mock("../../../src/lib/config.js", () => ({
  isAuthenticated: vi.fn(() => true),
  getAuthToken: vi.fn(() => "sk_test_v1_mock"),
  getStoredAccessToken: vi.fn(() => undefined),
  setAuthTokens: vi.fn(),
  resolveBaseUrl: vi.fn(() => "https://sendly.live"),
  getConfigValue: vi.fn((key: string) => {
    if (key === "baseUrl") return "https://sendly.live";
    return undefined;
  }),
  getEffectiveValue: vi.fn((key: string) => {
    if (key === "baseUrl") return "https://sendly.live";
    if (key === "maxRetries") return 0;
    if (key === "timeout") return 30000;
    return undefined;
  }),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

import { apiClient } from "../../../src/lib/api-client.js";

describe("numbers buy flow", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("buy request carries the full body (customer-priced monthlyCost)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 202,
      json: () =>
        Promise.resolve({
          status: "provisioning",
          number: { id: "num_1", phoneNumber: "+447700900123", status: "pending" },
        }),
      headers: new Map(),
    });

    await apiClient.post("/api/v1/numbers/buy", {
      phoneNumber: "+447700900123",
      countryCode: "GB",
      phoneNumberType: "mobile",
      monthlyCost: "3.50",
    });

    const [, init] = mockFetch.mock.calls[0];
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      phoneNumber: "+447700900123",
      countryCode: "GB",
      phoneNumberType: "mobile",
      monthlyCost: "3.50",
    });
  });

  it("re-POST after a completed action includes the same body plus actionCode", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 202,
      json: () => Promise.resolve({ status: "provisioning" }),
      headers: new Map(),
    });

    // The re-buy must carry the 32-hex actionCode identifier, NOT the
    // human-facing 8-char userCode.
    await apiClient.post("/api/v1/numbers/buy", {
      phoneNumber: "+447700900123",
      countryCode: "GB",
      phoneNumberType: "mobile",
      monthlyCost: "3.50",
      actionCode: "0123456789abcdef0123456789abcdef",
    });

    const [, init] = mockFetch.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.actionCode).toBe("0123456789abcdef0123456789abcdef");
    expect(body.phoneNumber).toBe("+447700900123");
  });

  it("documents_required response surfaces an action url, actionCode, and display userCode", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 202,
      json: () =>
        Promise.resolve({
          status: "documents_required",
          requirements: [{ field: "proof_of_address" }],
          action: {
            url: "https://sendly.live/action/xyz",
            actionCode: "0123456789abcdef0123456789abcdef",
            code: "WXYZ7788",
            expiresAt: 1780000000000,
          },
        }),
      headers: new Map(),
    });

    const resp = await apiClient.post<{
      status: string;
      requirements?: unknown;
      action?: {
        url: string;
        actionCode: string;
        code: string;
        expiresAt: number;
      };
    }>("/api/v1/numbers/buy", {
      phoneNumber: "+447700900123",
      countryCode: "GB",
      phoneNumberType: "mobile",
      monthlyCost: "3.50",
    });

    expect(resp.status).toBe("documents_required");
    expect(resp.action?.url).toContain("/action/");
    // actionCode is the 32-hex identifier; code is the 8-char display userCode.
    expect(resp.action?.actionCode).toBe("0123456789abcdef0123456789abcdef");
    expect(resp.action?.code).toBe("WXYZ7788");
    expect(typeof resp.action?.expiresAt).toBe("number");
    expect(Array.isArray(resp.requirements)).toBe(true);
  });

  it("action polling hits /api/cli/action/:actionCode with the 32-hex actionCode", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          status: "completed",
          actionType: "upload_docs",
          expiresAt: "2026-06-02T00:00:00Z",
        }),
      headers: new Map(),
    });

    const status = await apiClient.get<{ status: string }>(
      "/api/cli/action/0123456789abcdef0123456789abcdef",
    );

    expect(mockFetch).toHaveBeenCalledWith(
      "https://sendly.live/api/cli/action/0123456789abcdef0123456789abcdef",
      expect.objectContaining({ method: "GET" }),
    );
    expect(status.status).toBe("completed");
  });

  it("a 404 from the action-poll endpoint surfaces as a terminal NotFoundError", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ error: "not_found" }),
      headers: new Map(),
    });

    await expect(
      apiClient.get("/api/cli/action/0123456789abcdef0123456789abcdef"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
