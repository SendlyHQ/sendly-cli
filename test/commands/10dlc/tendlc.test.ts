/**
 * 10DLC command wire-contract tests
 * Validates the request/response shapes the `sendly 10dlc` commands rely on
 * (brands -> qualify -> campaigns -> assign).
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NotFoundError, ValidationError } from "../../../src/lib/api-client.js";

vi.mock("../../../src/lib/config.js", () => ({
  isAuthenticated: vi.fn(() => true),
  getAuthToken: vi.fn(() => "sk_live_v1_mock"),
  getStoredAccessToken: vi.fn(() => undefined),
  setAuthTokens: vi.fn(),
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

describe("10dlc wire contract", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("brand create sends camelCase body and unwraps { data }", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: () =>
        Promise.resolve({
          data: {
            id: "brd_1",
            legalName: "Acme Inc",
            entityType: "PRIVATE_PROFIT",
            status: "pending",
          },
        }),
      headers: new Map(),
    });

    const response = await apiClient.post<{ data: { id: string; status: string } }>(
      "/api/v1/tendlc/brands",
      {
        legalName: "Acme Inc",
        entityType: "PRIVATE_PROFIT",
        ein: "12-3456789",
        website: "https://acme.com",
        country: "US",
      },
    );

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://sendly.live/api/v1/tendlc/brands");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      legalName: "Acme Inc",
      entityType: "PRIVATE_PROFIT",
      ein: "12-3456789",
      website: "https://acme.com",
      country: "US",
    });
    expect(response.data.id).toBe("brd_1");
    expect(response.data.status).toBe("pending");
  });

  it("qualify hits the nested path and returns throughput", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          data: {
            useCase: "MIXED",
            qualified: true,
            reason: null,
            throughput: { tier: "Standard", carriersReady: 3 },
          },
        }),
      headers: new Map(),
    });

    const response = await apiClient.get<{
      data: { qualified: boolean; throughput: { tier: string } | null };
    }>("/api/v1/tendlc/brands/brd_1/qualify/MIXED");

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe("https://sendly.live/api/v1/tendlc/brands/brd_1/qualify/MIXED");
    expect(response.data.qualified).toBe(true);
    expect(response.data.throughput?.tier).toBe("Standard");
  });

  it("campaign create sends required fields plus only the options set", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: () =>
        Promise.resolve({
          data: { id: "cmp_1", brandId: "brd_1", useCase: "MIXED", status: "pending" },
        }),
      headers: new Map(),
    });

    await apiClient.post("/api/v1/tendlc/campaigns", {
      brandId: "brd_1",
      useCase: "MIXED",
      description: "Order updates",
      messageFlow: "Customers opt in at checkout",
      sampleMessages: ["Your order has shipped!"],
      optOutKeywords: "STOP,UNSUBSCRIBE",
    });

    const [, init] = mockFetch.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.sampleMessages).toEqual(["Your order has shipped!"]);
    expect(body.optOutKeywords).toBe("STOP,UNSUBSCRIBE");
    expect(body).not.toHaveProperty("embeddedLink");
    expect(body).not.toHaveProperty("subUseCases");
  });

  it("assign posts the phoneNumber to the campaign's assign path", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: () =>
        Promise.resolve({
          data: {
            id: "pnc_1",
            campaignId: "cmp_1",
            phoneNumber: "+15551234567",
            status: "Under review",
            assignedAt: null,
          },
        }),
      headers: new Map(),
    });

    const response = await apiClient.post<{
      data: { phoneNumber: string; status: string };
    }>("/api/v1/tendlc/campaigns/cmp_1/assign", { phoneNumber: "+15551234567" });

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://sendly.live/api/v1/tendlc/campaigns/cmp_1/assign");
    expect(JSON.parse(init.body)).toEqual({ phoneNumber: "+15551234567" });
    expect(response.data.status).toBe("Under review");
  });

  it("a 404 (flag off or cross-workspace id) surfaces as NotFoundError", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ error: "not_found" }),
      headers: new Map(),
    });

    await expect(
      apiClient.get("/api/v1/tendlc/brands/brd_other"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("a scrubbed carrier-network rejection surfaces as ValidationError with the message", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: () =>
        Promise.resolve({
          error: "brand_not_verified",
          message: "Brand must be verified before creating a campaign",
        }),
      headers: new Map(),
    });

    const attempt = apiClient.post("/api/v1/tendlc/campaigns", {
      brandId: "brd_1",
      useCase: "MIXED",
      description: "x",
      messageFlow: "y",
      sampleMessages: ["z"],
    });

    await expect(attempt).rejects.toBeInstanceOf(ValidationError);
    await expect(attempt).rejects.toMatchObject({
      message: "Brand must be verified before creating a campaign",
    });
  });
});
