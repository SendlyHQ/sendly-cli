import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../../src/lib/config.js", () => ({
  isAuthenticated: vi.fn(() => true),
  getAuthToken: vi.fn(() => "cli_x"),
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

import Status from "../../src/commands/status.js";
import { setOutputFormat } from "../../src/lib/output.js";
import { respond, runCommand } from "../helpers/run-command.js";

let nextSteps: string[] = [];

describe("sendly status", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    setOutputFormat("human");
    nextSteps = [];
    mockFetch.mockImplementation(async (url: string) => {
      const { pathname } = new URL(url);
      switch (pathname) {
        case "/api/cli/account/status":
          return respond(200, {
            account: { email: "dev@example.com", tier: "sandbox", onboardingCompleted: false },
            verification: null,
            capabilities: { canSendSandbox: true, canSendInternational: false, canSendDomestic: false, regions: ["sandbox"] },
            credits: { balance: 0, canSendLive: false },
            keys: { hasTestKey: true, hasLiveKey: false, totalActive: 1 },
            nextSteps,
          });
        case "/api/v1/account/credits":
          return respond(200, { balance: 0, reservedBalance: 0, availableBalance: 0, billingMode: "prepaid", recentTransactions: [] });
        case "/api/v1/messages":
          return respond(200, {
            data: [
              {
                id: "m1",
                to: "+15005550000",
                from: "+18005550100",
                text: "hi",
                status: "delivered",
                direction: "outbound",
                error: null,
                createdAt: new Date().toISOString(),
              },
            ],
            pagination: { total: 1, limit: 5, offset: 0, page: 1, totalPages: 1, hasMore: false },
            count: 1,
          });
        case "/api/v1/webhooks":
          return respond(200, []);
        case "/api/v1/account/keys":
          return respond(200, { keys: [] });
        default:
          return respond(404, { error: "not_found" });
      }
    });
  });

  afterEach(() => {
    setOutputFormat("human");
  });

  it("shows the recent messages the API returns", async () => {
    const run = await runCommand(Status, []);

    expect(run.exitCode).toBeUndefined();
    expect(run.stdout).toContain("Recent Messages");
    expect(run.stdout).toContain("0000");
    expect(run.stdout).toContain("delivered");
  });

  it("prints a key-creation next step as a command that runs", async () => {
    nextSteps = ["Create a live API key with 'sendly keys create'"];

    const run = await runCommand(Status, []);

    expect(run.exitCode).toBeUndefined();
    expect(run.stdout).toContain(
      `Create a live API key with 'sendly keys create --name "Live key" --type live'`,
    );
  });

  it("prints the other next steps as the API sends them", async () => {
    nextSteps = [
      "Run 'sendly onboarding' to set up your account",
      "Add credits at https://sendly.live/credits",
    ];

    const run = await runCommand(Status, []);

    expect(run.stdout).toContain("1. Run 'sendly onboarding' to set up your account");
    expect(run.stdout).toContain("2. Add credits at https://sendly.live/credits");
  });
});
