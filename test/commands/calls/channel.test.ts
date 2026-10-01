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

import CallsGet from "../../../src/commands/calls/get.js";
import { setOutputFormat } from "../../../src/lib/output.js";
import { respond, runCommand } from "../../helpers/run-command.js";

const CALL = {
  id: "c0a8012e-5b7d-4e1f-a2c3-9d8e7f6a5b4c",
  object: "call",
  kind: "pstn",
  channel: "whatsapp",
  direction: "inbound",
  status: "completed",
  handledBy: "dashboard",
  agentId: null,
  from: "+14155550177",
  to: "+14155550123",
  callerName: null,
  calleeName: null,
  startedAt: "2026-10-01T15:10:02.114Z",
  answeredAt: "2026-10-01T15:10:09.870Z",
  endedAt: "2026-10-01T15:13:41.002Z",
  durationSecs: 211,
  creditsCharged: 8,
  billing: "settled",
  hangupClass: "caller_hung_up",
  recordingStatus: null,
  metadata: {},
};

describe("sendly calls get channel", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    setOutputFormat("human");
  });

  afterEach(() => {
    setOutputFormat("human");
  });

  it("shows the channel the call came in on", async () => {
    mockFetch.mockResolvedValueOnce(respond(200, CALL));

    const run = await runCommand(CallsGet, [CALL.id]);

    expect(run.stdout).toMatch(/Channel\s.*whatsapp/);
  });

  it("shows a channel it doesn't know as sent", async () => {
    mockFetch.mockResolvedValueOnce(respond(200, { ...CALL, channel: "carrier_pigeon" }));

    const run = await runCommand(CallsGet, [CALL.id]);

    expect(run.stdout).toMatch(/Channel\s.*carrier_pigeon/);
  });
});
