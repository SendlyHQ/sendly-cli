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

import WhatsappSenders from "../../../src/commands/whatsapp/senders.js";
import { setOutputFormat } from "../../../src/lib/output.js";
import { respond, runCommand } from "../../helpers/run-command.js";

const SENDERS = {
  senders: [
    {
      phoneNumber: "+14155550142",
      displayName: null,
      status: "pending",
      qualityRating: null,
      businessAccountId: null,
      businessName: null,
      callingEnabled: false,
      outboundCallingAllowed: false,
      createdAt: "2026-10-01T14:02:55.120Z",
    },
    {
      phoneNumber: "+14155550123",
      displayName: "Acme Plumbing",
      status: "active",
      qualityRating: "GREEN",
      businessAccountId: "104996582519384",
      businessName: "Acme Plumbing LLC",
      callingEnabled: true,
      outboundCallingAllowed: false,
      createdAt: "2026-09-12T09:41:07.004Z",
    },
    {
      phoneNumber: "+442079460123",
      displayName: "Acme UK",
      status: "active",
      qualityRating: "GREEN",
      businessAccountId: "104996582519384",
      businessName: "Acme Plumbing LLC",
      callingEnabled: true,
      outboundCallingAllowed: true,
      createdAt: "2026-09-10T09:41:07.004Z",
    },
  ],
};

describe("sendly whatsapp senders", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    setOutputFormat("human");
  });

  afterEach(() => {
    setOutputFormat("human");
  });

  it("shows each sender's business account, business name and calling", async () => {
    mockFetch.mockResolvedValueOnce(respond(200, SENDERS));

    const run = await runCommand(WhatsappSenders, []);

    expect(run.stdout).toContain("Business account");
    expect(run.stdout).toContain("104996582519384");
    expect(run.stdout).toContain("Acme Plumbing LLC");
    expect(run.stdout).toContain("Calling");
    const usLine = run.stdout
      .split("\n")
      .find((l) => l.includes("+14155550123"));
    const ukLine = run.stdout
      .split("\n")
      .find((l) => l.includes("+442079460123"));
    const pendingLine = run.stdout
      .split("\n")
      .find((l) => l.includes("+14155550142"));
    expect(usLine).toContain("on (inbound only)");
    expect(ukLine).toMatch(/\bon\b/);
    expect(ukLine).not.toContain("inbound only");
    expect(pendingLine).toContain("off");
  });

  it("says how to add another number to a connected business account", async () => {
    mockFetch.mockResolvedValueOnce(respond(200, SENDERS));

    const run = await runCommand(WhatsappSenders, []);

    expect(run.stdout).toContain("--business-account 104996582519384");
  });

  it("passes the new fields through in --json", async () => {
    setOutputFormat("json");
    mockFetch.mockResolvedValueOnce(respond(200, SENDERS));

    const run = await runCommand(WhatsappSenders, []);

    expect(JSON.parse(run.stdout)).toEqual(SENDERS);
  });
});
