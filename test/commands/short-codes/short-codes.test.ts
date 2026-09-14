import { describe, it, expect, vi } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

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

import { updateBody } from "../../../src/commands/short-codes/update.js";

const COMMANDS_DIR = fileURLToPath(new URL("../../../src/commands", import.meta.url));

function commandFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return commandFiles(path);
    return path.endsWith(".ts") ? [path] : [];
  });
}

describe("API paths used by CLI commands", () => {
  it("always include the /api/ prefix, because the client base URL has none", () => {
    const call = /apiClient\.(?:get|post|put|patch|delete)\b[^(]*\(\s*["'`]([^"'`]+)/g;
    const checked: string[] = [];
    const offenders: string[] = [];
    for (const file of commandFiles(COMMANDS_DIR)) {
      for (const match of readFileSync(file, "utf8").matchAll(call)) {
        checked.push(match[1]);
        if (!match[1].startsWith("/api/")) {
          offenders.push(`${relative(COMMANDS_DIR, file)}: ${match[1]}`);
        }
      }
    }
    expect(offenders).toEqual([]);
    expect(checked.filter((path) => path.includes("/short_codes")).length).toBeGreaterThanOrEqual(5);
  });
});

describe("short-codes update", () => {
  it("sends only the fields that were passed", () => {
    expect(updateBody({ "use-case": "Delivery alerts for Acme orders", json: false })).toEqual({
      useCase: "Delivery alerts for Acme orders",
    });
  });

  it("leaves contentProviderSameAsBrand out when the flag is not given", () => {
    expect(updateBody({ "message-frequency": "4 messages per month" })).not.toHaveProperty(
      "contentProviderSameAsBrand",
    );
  });

  it("sends a separate content provider with its registry details", () => {
    expect(
      updateBody({
        "content-provider-same-as-brand": false,
        "content-provider-legal-name": "Relay Messaging LLC",
        "content-provider-ein": "12-3456789",
        "content-provider-contact-name": "Grace Hopper",
        "content-provider-contact-email": "grace@relay.example",
        "content-provider-contact-phone": "+15555550142",
      }),
    ).toEqual({
      contentProviderSameAsBrand: false,
      contentProviderLegalName: "Relay Messaging LLC",
      contentProviderEin: "12-3456789",
      contentProviderContactName: "Grace Hopper",
      contentProviderContactEmail: "grace@relay.example",
      contentProviderContactPhone: "+15555550142",
    });
  });

  it("sends repeated sample messages as a list", () => {
    expect(
      updateBody({ "sample-message": ["Acme: your order shipped.", "Acme: your order arrived."] }),
    ).toEqual({ sampleMessages: ["Acme: your order shipped.", "Acme: your order arrived."] });
  });

  it("sends the brand contact phone and daily volume", () => {
    expect(
      updateBody({ "brand-contact-phone": "+15555550123", "expected-daily-volume": "300" }),
    ).toEqual({ brandContactPhone: "+15555550123", expectedDailyVolume: "300" });
  });
});
