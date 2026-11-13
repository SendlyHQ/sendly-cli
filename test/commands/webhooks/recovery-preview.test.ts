import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../../../src/lib/config.js", () => ({
  isAuthenticated: vi.fn(() => true),
  getAuthToken: vi.fn(() => "sk_live_v1_mock"),
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

import WebhooksRecoveryPreview from "../../../src/commands/webhooks/recovery-preview.js";
import { setOutputFormat } from "../../../src/lib/output.js";
import { respond, runCommand } from "../../helpers/run-command.js";

const PREVIEW = {
  circuitState: "open",
  circuitOpenedAt: "2026-09-25T08:00:00.000Z",
  failureCount: 12,
  auditFailures: {
    total: 3,
    byStatus: { failed: 2, cancelled: 1 },
    byEventType: { "message.delivered": 2, "message.opt_out": 1 },
  },
  missingFromMessages: { total: 4, byEventType: { "message.sent": 4 } },
  histogram: [{ bucket: "2026-09-25T08:00:00.000Z", missing: 4, failed: 3 }],
  samples: [
    {
      id: "msg_1",
      toMasked: "+1555***4567",
      eventType: "message.delivered",
      occurredAt: "2026-09-25T08:30:00.000Z",
    },
  ],
  windowSuggestion: {
    since: "2026-09-25T08:00:00.000Z",
    until: "2026-09-25T10:00:00.000Z",
  },
  since: "2026-09-24T10:00:00.000Z",
  until: "2026-09-25T10:00:00.000Z",
};

describe("sendly webhooks recovery-preview", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    setOutputFormat("human");
    mockFetch.mockImplementation(async () => respond(200, PREVIEW));
  });

  afterEach(() => {
    setOutputFormat("human");
  });

  it("sends a GET with the window and comma-separated event_types", async () => {
    const run = await runCommand(WebhooksRecoveryPreview, [
      "whk_1",
      "--since",
      "2026-09-24T10:00:00.000Z",
      "--until",
      "2026-09-25T10:00:00.000Z",
      "--event-types",
      "message.delivered, message.failed",
    ]);

    expect(run.exitCode).toBeUndefined();
    const [calledUrl, init] = mockFetch.mock.calls[0];
    const url = new URL(calledUrl);
    expect(init.method).toBe("GET");
    expect(url.pathname).toBe("/api/v1/webhooks/whk_1/recovery-preview");
    expect(url.searchParams.get("since")).toBe("2026-09-24T10:00:00.000Z");
    expect(url.searchParams.get("until")).toBe("2026-09-25T10:00:00.000Z");
    expect(url.searchParams.get("event_types")).toBe("message.delivered,message.failed");
    expect(run.stdout).toContain("failed=2, cancelled=1");
    expect(run.stdout).toContain("message.sent=4");
    expect(run.stdout).toContain("+1555***4567");
  });

  it("sends no query without flags and prints the API's body with --json", async () => {
    setOutputFormat("json");
    const run = await runCommand(WebhooksRecoveryPreview, ["whk_1", "--json"]);

    expect(run.exitCode).toBeUndefined();
    const url = new URL(mockFetch.mock.calls[0][0]);
    expect(url.search).toBe("");
    expect(JSON.parse(run.stdout)).toEqual(PREVIEW);
  });
});
