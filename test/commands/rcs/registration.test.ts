/**
 * RCS registration wire-contract tests
 * Validates the request/response shapes the `sendly rcs` registration commands
 * rely on (registration -> dossier -> brands -> agents -> devices -> submit ->
 * request-launch), including the dark-flag 404 and field-level 422s.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  ApiError,
  AuthenticationError,
  NotFoundError,
} from "../../../src/lib/api-client.js";

vi.mock("../../../src/lib/config.js", () => ({
  isAuthenticated: vi.fn(() => true),
  getAuthToken: vi.fn(() => "sk_live_v1_mock"),
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

function ok(status: number, body: unknown) {
  return {
    ok: true,
    status,
    json: () => Promise.resolve(body),
    headers: new Map(),
  };
}

function fail(status: number, body: unknown) {
  return {
    ok: false,
    status,
    json: () => Promise.resolve(body),
    headers: new Map(),
  };
}

const BRAND = {
  id: "brd_1",
  reviewStatus: "draft",
  customerStage: "draft",
  displayName: "Acme",
  legalName: "Acme Inc",
  address: { countryCode: "US" },
  contact: {},
};

describe("rcs registration wire contract", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("registration returns brand, agent, devices and stage with no wrapper", async () => {
    mockFetch.mockResolvedValueOnce(
      ok(200, {
        brand: BRAND,
        agent: null,
        devices: [],
        stage: "draft",
        usEligible: true,
      }),
    );

    const response = await apiClient.get<{
      brand: { id: string } | null;
      agent: unknown;
      stage: string;
      usEligible: boolean;
    }>("/api/v1/rcs/registration");

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://sendly.live/api/v1/rcs/registration");
    expect(init.method).toBe("GET");
    expect(init.headers.Authorization).toBe("Bearer sk_live_v1_mock");
    expect(response.brand?.id).toBe("brd_1");
    expect(response.stage).toBe("draft");
    expect(response).not.toHaveProperty("enabled");
  });

  it("dossier reports the prefill source", async () => {
    mockFetch.mockResolvedValueOnce(
      ok(200, {
        brand: { legalName: "Acme Inc", address: { countryCode: "US" } },
        usEligible: true,
        source: "tendlc",
      }),
    );

    const response = await apiClient.get<{ source: string }>(
      "/api/v1/rcs/dossier",
    );
    expect(mockFetch.mock.calls[0][0]).toBe("https://sendly.live/api/v1/rcs/dossier");
    expect(response.source).toBe("tendlc");
  });

  it("brand create posts the nested body with an idempotency key and unwraps { brand }", async () => {
    mockFetch.mockResolvedValueOnce(ok(201, { brand: BRAND }));

    const response = await apiClient.post<{ brand: { id: string } }>(
      "/api/v1/rcs/brands",
      {
        legalName: "Acme Inc",
        address: { line1: "1 Main St", countryCode: "US" },
        contact: { email: "jane@acme.com" },
      },
      true,
      { idempotencyKey: "acme-brand-1" },
    );

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://sendly.live/api/v1/rcs/brands");
    expect(init.method).toBe("POST");
    expect(init.headers["Idempotency-Key"]).toBe("acme-brand-1");
    expect(JSON.parse(init.body)).toEqual({
      legalName: "Acme Inc",
      address: { line1: "1 Main St", countryCode: "US" },
      contact: { email: "jane@acme.com" },
    });
    expect(response.brand.id).toBe("brd_1");
  });

  it("brand update PATCHes only the changed keys and carries the idempotency key", async () => {
    mockFetch.mockResolvedValueOnce(
      ok(200, { brand: { ...BRAND, stockSymbol: null } }),
    );

    await apiClient.patch(
      "/api/v1/rcs/brands/brd_1",
      { stockSymbol: null, address: { line2: "Suite 4" } },
      true,
      { idempotencyKey: "acme-brand-2" },
    );

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://sendly.live/api/v1/rcs/brands/brd_1");
    expect(init.method).toBe("PATCH");
    expect(init.headers["Idempotency-Key"]).toBe("acme-brand-2");
    expect(JSON.parse(init.body)).toEqual({
      stockSymbol: null,
      address: { line2: "Suite 4" },
    });
  });

  it("PATCH and PUT send no automatic idempotency key", async () => {
    mockFetch.mockResolvedValueOnce(ok(200, { brand: BRAND }));
    await apiClient.patch("/api/v1/rcs/brands/brd_1", { ein: "123456789" });
    expect(mockFetch.mock.calls[0][1].headers).not.toHaveProperty(
      "Idempotency-Key",
    );

    mockFetch.mockResolvedValueOnce(ok(200, { devices: [] }));
    await apiClient.put("/api/v1/rcs/agents/agt_1/test-devices", {
      devices: [],
    });
    expect(mockFetch.mock.calls[1][1].headers).not.toHaveProperty(
      "Idempotency-Key",
    );
  });

  it("agent create sends brandId plus the grouped sections", async () => {
    mockFetch.mockResolvedValueOnce(
      ok(201, {
        agent: {
          id: "agt_1",
          brandId: "brd_1",
          status: "draft",
          reviewStatus: "draft",
          customerStage: "draft",
          testDevices: [],
        },
      }),
    );

    const response = await apiClient.post<{ agent: { id: string } }>(
      "/api/v1/rcs/agents",
      {
        brandId: "brd_1",
        basics: { displayName: "Acme", useCase: "TRANSACTIONAL" },
        campaign: { messageExamples: ["Shipped."] },
      },
    );

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://sendly.live/api/v1/rcs/agents");
    expect(init.headers["Idempotency-Key"]).toMatch(/^sendly-cli-retry-/);
    expect(JSON.parse(init.body)).toEqual({
      brandId: "brd_1",
      basics: { displayName: "Acme", useCase: "TRANSACTIONAL" },
      campaign: { messageExamples: ["Shipped."] },
    });
    expect(response.agent.id).toBe("agt_1");
  });

  it("agent get returns agent, devices and stage", async () => {
    mockFetch.mockResolvedValueOnce(
      ok(200, {
        agent: { id: "agt_1", customerStage: "testing", testDevices: [] },
        devices: [
          {
            id: "dev_1",
            phoneNumber: "+13125550100",
            label: null,
            inviteStatus: "PENDING",
          },
        ],
        stage: "testing",
      }),
    );

    const response = await apiClient.get<{
      devices: Array<{ phoneNumber: string }>;
      stage: string;
    }>("/api/v1/rcs/agents/agt_1");

    expect(mockFetch.mock.calls[0][0]).toBe(
      "https://sendly.live/api/v1/rcs/agents/agt_1",
    );
    expect(response.devices[0].phoneNumber).toBe("+13125550100");
    expect(response.stage).toBe("testing");
  });

  it("devices set PUTs the authoritative list", async () => {
    mockFetch.mockResolvedValueOnce(
      ok(200, {
        devices: [
          { id: "dev_1", phoneNumber: "+13125550100", label: "Front desk" },
        ],
      }),
    );

    await apiClient.put(
      "/api/v1/rcs/agents/agt_1/test-devices",
      { devices: [{ phoneNumber: "+13125550100", label: "Front desk" }] },
      true,
      { idempotencyKey: "devices-1" },
    );

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://sendly.live/api/v1/rcs/agents/agt_1/test-devices");
    expect(init.method).toBe("PUT");
    expect(init.headers["Idempotency-Key"]).toBe("devices-1");
    expect(JSON.parse(init.body)).toEqual({
      devices: [{ phoneNumber: "+13125550100", label: "Front desk" }],
    });
  });

  it("submit posts an empty JSON object and returns the new stage", async () => {
    mockFetch.mockResolvedValueOnce(
      ok(200, {
        agent: { id: "agt_1", reviewStatus: "awaiting_review" },
        stage: "in_review",
      }),
    );

    const response = await apiClient.post<{ stage: string }>(
      "/api/v1/rcs/agents/agt_1/submit",
      {},
      true,
      { idempotencyKey: "submit-1" },
    );

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://sendly.live/api/v1/rcs/agents/agt_1/submit");
    expect(init.method).toBe("POST");
    expect(init.body).toBe("{}");
    expect(init.headers["Idempotency-Key"]).toBe("submit-1");
    expect(response.stage).toBe("in_review");
  });

  it("request-launch posts testUrl and testingAdditionalInformation", async () => {
    mockFetch.mockResolvedValueOnce(
      ok(200, {
        agent: { id: "agt_1", reviewStatus: "launch_requested" },
        stage: "launch_review",
      }),
    );

    await apiClient.post("/api/v1/rcs/agents/agt_1/request-launch", {
      testUrl: "https://acme.com/test.mp4",
      testingAdditionalInformation: "Two devices",
    });

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe(
      "https://sendly.live/api/v1/rcs/agents/agt_1/request-launch",
    );
    expect(JSON.parse(init.body)).toEqual({
      testUrl: "https://acme.com/test.mp4",
      testingAdditionalInformation: "Two devices",
    });
  });

  it("the dark-flag 404 keeps its message so the CLI can tell it from a bad id", async () => {
    mockFetch.mockResolvedValueOnce(
      fail(404, {
        error: "rcs_not_enabled",
        message: "RCS registration isn't enabled for this account yet.",
      }),
    );

    const attempt = apiClient.get("/api/v1/rcs/registration");
    await expect(attempt).rejects.toBeInstanceOf(NotFoundError);
    await expect(attempt).rejects.toMatchObject({
      message: "RCS registration isn't enabled for this account yet.",
    });
  });

  it("a 422 rcs_invalid_content keeps the field errors", async () => {
    mockFetch.mockResolvedValueOnce(
      fail(422, {
        error: "rcs_invalid_content",
        message: "Some registration fields need attention before this can continue.",
        errors: [{ path: "brand.ein", message: "Enter a 9-digit EIN" }],
      }),
    );

    const attempt = apiClient.post("/api/v1/rcs/agents/agt_1/submit", {});
    await expect(attempt).rejects.toBeInstanceOf(ApiError);
    await expect(attempt).rejects.toMatchObject({
      code: "rcs_invalid_content",
      statusCode: 422,
      fieldErrors: [{ path: "brand.ein", message: "Enter a 9-digit EIN" }],
    });
  });

  it("a 409 lock surfaces its code and message", async () => {
    mockFetch.mockResolvedValueOnce(
      fail(409, {
        error: "rcs_field_locked",
        message:
          "This registration is being reviewed; we will email you if changes are needed.",
      }),
    );

    const attempt = apiClient.patch("/api/v1/rcs/brands/brd_1", {
      ein: "123456789",
    });
    await expect(attempt).rejects.toMatchObject({
      code: "rcs_field_locked",
      statusCode: 409,
    });
  });

  it("a missing scope surfaces as an AuthenticationError with the scope named", async () => {
    mockFetch.mockResolvedValueOnce(
      fail(403, {
        error: "insufficient_permissions",
        message: "Missing required scopes: rcs:write",
      }),
    );

    const attempt = apiClient.post("/api/v1/rcs/brands", {});
    await expect(attempt).rejects.toBeInstanceOf(AuthenticationError);
    await expect(attempt).rejects.toMatchObject({
      message: "Missing required scopes: rcs:write",
    });
  });
});
