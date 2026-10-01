import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../../../src/lib/config.js", () => ({
  isAuthenticated: vi.fn(() => true),
  getAuthToken: vi.fn(() => "sk_test_v1_mock"),
  getStoredAccessToken: vi.fn(() => undefined),
  setAuthTokens: vi.fn(),
  resolveBaseUrl: vi.fn(() => "https://sendly.live"),
  getConfigValue: vi.fn(() => undefined),
  getCurrentOrg: vi.fn(() => null),
  getEffectiveValue: vi.fn((key: string) => {
    if (key === "maxRetries") return 0;
    if (key === "timeout") return 30000;
    return undefined;
  }),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

import SmsBatch from "../../../src/commands/sms/batch.js";
import { setOutputFormat } from "../../../src/lib/output.js";
import { respond, runCommand } from "../../helpers/run-command.js";

function numbers(count: number): string {
  return Array.from({ length: count }, (_, i) => `+1555${String(i).padStart(7, "0")}`).join(",");
}

function previewPosts() {
  return mockFetch.mock.calls.filter(
    ([url, init]) => init.method === "POST" && new URL(url).pathname === "/api/v1/messages/batch/preview",
  );
}

describe("sendly sms batch size", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockImplementation(async (url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body ?? "{}"));
      return respond(200, {
        total: body.messages.length,
        sendable: body.messages.length,
        blocked: 0,
        duplicates: 0,
        creditsNeeded: body.messages.length * 2,
        creditBalance: 100000,
        hasSufficientCredits: true,
        keyType: "test",
        keyScopes: [],
        hasWriteScope: true,
        byCountry: {},
        blockedMessages: [],
      });
    });
    setOutputFormat("json");
  });

  afterEach(() => {
    setOutputFormat("human");
  });

  it("previews a batch of more than 1,000 messages, which the API accepts", async () => {
    const run = await runCommand(SmsBatch, ["--to", numbers(1001), "--text", "Hello", "--dry-run"]);

    expect(run.exitCode).toBeUndefined();
    const sent = previewPosts();
    expect(sent).toHaveLength(1);
    expect(JSON.parse(sent[0][1].body).messages).toHaveLength(1001);
  });

  it("previews exactly 10,000 messages", async () => {
    const run = await runCommand(SmsBatch, ["--to", numbers(10000), "--text", "Hello", "--dry-run"]);

    expect(run.exitCode).toBeUndefined();
    expect(previewPosts()).toHaveLength(1);
  });

  it("refuses more than 10,000 messages before any request", async () => {
    const run = await runCommand(SmsBatch, ["--to", numbers(10001), "--text", "Hello", "--dry-run"]);

    expect(run.exitCode).toBe(1);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
