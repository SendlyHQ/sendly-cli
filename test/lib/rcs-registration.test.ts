/**
 * RCS registration helper tests
 * Covers the flag-to-body builders, the JSON-file merge, and the error
 * reporting the `sendly rcs` registration commands share.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("../../src/lib/config.js", () => ({
  isAuthenticated: vi.fn(() => true),
  getAuthToken: vi.fn(() => "sk_live_v1_mock"),
  getStoredAccessToken: vi.fn(() => undefined),
  setAuthTokens: vi.fn(),
  resolveBaseUrl: vi.fn(() => "https://sendly.live"),
  getConfigValue: vi.fn(() => undefined),
  getEffectiveValue: vi.fn((key: string) => {
    if (key === "baseUrl") return "https://sendly.live";
    if (key === "maxRetries") return 0;
    if (key === "timeout") return 30000;
    return undefined;
  }),
}));

import {
  ApiError,
  AuthenticationError,
  NotFoundError,
  ValidationError,
} from "../../src/lib/api-client.js";
import { setOutputFormat } from "../../src/lib/output.js";
import {
  buildAgentBody,
  buildBrandBody,
  nextStepFor,
  parseDeviceFlags,
  parseTypedList,
  readJsonBody,
  reportRcsError,
  setPath,
  stageLabel,
  STAGE_LABELS,
} from "../../src/lib/rcs-registration.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "sendly-rcs-"));
  setOutputFormat("human");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function file(name: string, content: unknown): string {
  const path = join(dir, name);
  writeFileSync(path, typeof content === "string" ? content : JSON.stringify(content));
  return path;
}

describe("setPath", () => {
  it("creates nested objects on the way down", () => {
    const body: Record<string, unknown> = {};
    setPath(body, ["address", "city"], "Austin");
    setPath(body, ["address", "state"], "TX");
    expect(body).toEqual({ address: { city: "Austin", state: "TX" } });
  });

  it("replaces a non-object intermediate instead of throwing", () => {
    const body: Record<string, unknown> = { address: null };
    setPath(body, ["address", "line1"], "1 Main St");
    expect(body).toEqual({ address: { line1: "1 Main St" } });
  });
});

describe("readJsonBody", () => {
  it("reads a JSON object", () => {
    expect(readJsonBody(file("b.json", { legalName: "Acme Inc" }))).toEqual({
      legalName: "Acme Inc",
    });
  });

  it("rejects a missing file, bad JSON, and a non-object", () => {
    expect(() => readJsonBody(join(dir, "nope.json"))).toThrow(ValidationError);
    expect(() => readJsonBody(file("bad.json", "{ not json"))).toThrow(
      /Invalid JSON/,
    );
    expect(() => readJsonBody(file("arr.json", [1, 2]))).toThrow(
      /Expected a JSON object/,
    );
  });
});

describe("buildBrandBody", () => {
  it("maps flat flags onto the nested brand shape", () => {
    const body = buildBrandBody(
      {
        "display-name": "Acme",
        "legal-name": "Acme Inc",
        "legal-entity-type": "CORPORATION",
        ein: "12-3456789",
        website: "https://acme.com",
        "address-line1": "1 Main St",
        city: "Austin",
        state: "TX",
        "postal-code": "78701",
        country: "US",
        "contact-first-name": "Jane",
        "contact-email": "jane@acme.com",
        "contact-phone": "+15125550100",
      },
      { clearEmpty: false },
    );
    expect(body).toEqual({
      displayName: "Acme",
      legalName: "Acme Inc",
      legalEntityType: "CORPORATION",
      ein: "12-3456789",
      websiteUrl: "https://acme.com",
      address: {
        line1: "1 Main St",
        city: "Austin",
        state: "TX",
        postalCode: "78701",
        countryCode: "US",
      },
      contact: {
        firstName: "Jane",
        email: "jane@acme.com",
        phoneNumber: "+15125550100",
      },
    });
  });

  it("merges flags over --from-json and unwraps a dossier wrapper", () => {
    const path = file("dossier.json", {
      brand: {
        legalName: "Acme Inc",
        websiteUrl: "https://acme.com",
        address: { line1: "1 Main St", countryCode: "US" },
      },
      usEligible: true,
      source: "tendlc",
    });
    const body = buildBrandBody(
      { "from-json": path, "legal-name": "Acme Incorporated", city: "Austin" },
      { clearEmpty: false },
    );
    expect(body).toEqual({
      legalName: "Acme Incorporated",
      websiteUrl: "https://acme.com",
      address: { line1: "1 Main St", countryCode: "US", city: "Austin" },
    });
  });

  it("accepts a plain brand object in --from-json", () => {
    const path = file("brand.json", { ein: "123456789" });
    expect(buildBrandBody({ "from-json": path }, { clearEmpty: false })).toEqual(
      { ein: "123456789" },
    );
  });

  it("skips empty flags on create and sends null on update", () => {
    expect(
      buildBrandBody({ "stock-symbol": "" }, { clearEmpty: false }),
    ).toEqual({});
    expect(
      buildBrandBody(
        { "stock-symbol": "", "address-line2": "" },
        { clearEmpty: true },
      ),
    ).toEqual({ stockSymbol: null, address: { line2: null } });
  });
});

describe("parseTypedList", () => {
  it("parses TYPE and TYPE=description entries", () => {
    expect(
      parseTypedList(
        ["TRANSACTIONAL_UPDATES", "other=Reminders"],
        "interactionType",
        ["TRANSACTIONAL_UPDATES", "OTHER"],
        "interaction",
      ),
    ).toEqual([
      { interactionType: "TRANSACTIONAL_UPDATES" },
      { interactionType: "OTHER", description: "Reminders" },
    ]);
  });

  it("returns an error string naming the valid values", () => {
    const result = parseTypedList(
      ["EMAIL"],
      "methodType",
      ["WEBSITE", "SMS"],
      "opt-in-method",
    );
    expect(typeof result).toBe("string");
    expect(result).toMatch(/--opt-in-method "EMAIL"/);
    expect(result).toMatch(/WEBSITE, SMS/);
  });
});

describe("buildAgentBody", () => {
  it("groups basics, campaign and testing flags", () => {
    const body = buildAgentBody(
      {
        "display-name": "Acme",
        "use-case": "TRANSACTIONAL",
        "logo-url": "https://acme.com/logo.png",
        phone: "+15125550100",
        "phone-label": "Support",
        "company-overview": "Acme sells widgets",
        interaction: ["TRANSACTIONAL_UPDATES"],
        "message-example": ["Shipped. Reply STOP to opt out.", "Delivered."],
        "opt-in-method": ["WEBSITE=Checkout checkbox"],
        "call-to-action": "Get updates",
        "double-opt-in": false,
        "test-url": "https://acme.com/test.mp4",
      },
      { clearEmpty: false },
    );
    expect(body).toEqual({
      basics: {
        displayName: "Acme",
        useCase: "TRANSACTIONAL",
        logoUrl: "https://acme.com/logo.png",
        phoneNumber: { number: "+15125550100", label: "Support" },
      },
      campaign: {
        companyOverview: "Acme sells widgets",
        interactions: [{ interactionType: "TRANSACTIONAL_UPDATES" }],
        messageExamples: ["Shipped. Reply STOP to opt out.", "Delivered."],
        consentSettings: {
          optInMethods: [
            { methodType: "WEBSITE", description: "Checkout checkbox" },
          ],
          callToAction: "Get updates",
          doubleOptIn: false,
        },
      },
      testing: { testUrl: "https://acme.com/test.mp4" },
    });
  });

  it("only includes the groups that were touched", () => {
    expect(
      buildAgentBody({ description: "Order updates" }, { clearEmpty: true }),
    ).toEqual({ basics: { description: "Order updates" } });
    expect(buildAgentBody({}, { clearEmpty: true })).toEqual({});
  });

  it("clears whole sections and unwraps `agents get --json` output", () => {
    const path = file("agent.json", {
      agent: {
        id: "agt_1",
        brandId: "brd_1",
        basics: { displayName: "Acme", hostingRegion: "NORTH_AMERICA" },
        campaign: { agentOverview: "Updates" },
      },
      devices: [],
      stage: "draft",
    });
    const body = buildAgentBody(
      { "from-json": path, "clear-testing": true },
      { clearEmpty: true },
    );
    expect(body).toEqual({
      id: "agt_1",
      brandId: "brd_1",
      basics: { displayName: "Acme", hostingRegion: "NORTH_AMERICA" },
      campaign: { agentOverview: "Updates" },
      testing: null,
    });
    expect(
      buildAgentBody({ "clear-campaign": true }, { clearEmpty: true }),
    ).toEqual({ campaign: null });
  });

  it("surfaces an invalid typed list as an error string", () => {
    expect(
      buildAgentBody({ interaction: ["CHAT"] }, { clearEmpty: false }),
    ).toMatch(/--interaction "CHAT"/);
  });
});

describe("parseDeviceFlags", () => {
  it("parses numbers with optional labels", () => {
    expect(
      parseDeviceFlags(["+13125550100", "+13125550101=Front desk"]),
    ).toEqual([
      { phoneNumber: "+13125550100" },
      { phoneNumber: "+13125550101", label: "Front desk" },
    ]);
    expect(parseDeviceFlags(undefined)).toEqual([]);
  });

  it("rejects an empty number", () => {
    expect(parseDeviceFlags(["=Label"])).toMatch(/Invalid --phone/);
  });
});

describe("stage helpers", () => {
  it("labels every stage and falls back to the raw value", () => {
    for (const [stage, label] of Object.entries(STAGE_LABELS)) {
      expect(stageLabel(stage)).toBe(label);
    }
    expect(stageLabel("something_new")).toBe("something_new");
  });

  it("points a fresh workspace at the dossier, then the agent, then submit", () => {
    expect(nextStepFor("draft", {}).join("\n")).toMatch(/rcs dossier --json/);
    expect(nextStepFor("draft", { brandId: "brd_1" }).join("\n")).toMatch(
      /rcs agents create --brand brd_1/,
    );
    expect(
      nextStepFor("draft", { brandId: "brd_1", agentId: "agt_1" }).join("\n"),
    ).toMatch(/rcs agents submit agt_1/);
    expect(nextStepFor("testing", { agentId: "agt_1" }).join("\n")).toMatch(
      /devices set agt_1/,
    );
    expect(nextStepFor("live", {}).join("\n")).toMatch(/rcs send/);
  });

  it("never promises a review duration", () => {
    for (const stage of Object.keys(STAGE_LABELS)) {
      const text = nextStepFor(stage, { brandId: "b", agentId: "a" }).join(" ");
      expect(text).not.toMatch(/\b\d+\s*(hours?|days?|weeks?|minutes?)\b/i);
    }
  });
});

describe("reportRcsError", () => {
  let stderr: string[];

  beforeEach(() => {
    stderr = [];
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      stderr.push(args.map(String).join(" "));
    });
  });

  it("explains the dark flag and leaves other 404s to the base handler", () => {
    expect(
      reportRcsError(
        new NotFoundError("RCS registration isn't enabled for this account yet."),
      ),
    ).toBe(true);
    expect(stderr.join("\n")).toMatch(/isn't enabled/);
    expect(stderr.join("\n")).toMatch(/early access/);
    expect(reportRcsError(new NotFoundError("Agent not found"))).toBe(false);
  });

  it("prints field errors as path/message pairs", () => {
    const err = new ApiError(
      "rcs_invalid_content",
      "Some registration fields need attention before this can continue.",
      422,
    );
    err.fieldErrors = [
      { path: "brand.ein", message: "Enter a 9-digit EIN" },
      { path: "agent.logoUrl", message: "Must be a public https:// URL" },
    ];
    expect(reportRcsError(err)).toBe(true);
    const out = stderr.join("\n");
    expect(out).toMatch(/brand\.ein\s+Enter a 9-digit EIN/);
    expect(out).toMatch(/agent\.logoUrl\s+Must be a public https:\/\/ URL/);
  });

  it("emits the errors array in JSON mode", () => {
    setOutputFormat("json");
    const err = new ApiError("rcs_invalid_content", "Fields need attention", 422);
    err.fieldErrors = [{ path: "devices", message: "devices must be a list" }];
    expect(reportRcsError(err)).toBe(true);
    const parsed = JSON.parse(stderr[0]);
    expect(parsed).toMatchObject({
      error: true,
      code: "rcs_invalid_content",
      errors: [{ path: "devices", message: "devices must be a list" }],
    });
  });

  it("adds a hint for the scope and lock errors and ignores the rest", () => {
    expect(
      reportRcsError(
        new AuthenticationError("Missing required scopes: rcs:write"),
      ),
    ).toBe(true);
    expect(stderr.join("\n")).toMatch(/rcs:write/);
    expect(
      reportRcsError(new ApiError("rcs_launch_not_ready", "Not ready", 409)),
    ).toBe(true);
    expect(stderr.join("\n")).toMatch(/devices set/);
    expect(
      reportRcsError(new ApiError("something_else", "Unknown", 418)),
    ).toBe(false);
    expect(reportRcsError(new Error("boom"))).toBe(false);
  });
});
