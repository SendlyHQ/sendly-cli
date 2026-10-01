import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../../../src/lib/config.js", () => ({
  isAuthenticated: vi.fn(() => true),
  getAuthToken: vi.fn(() => "sk_live_v1_enterprise"),
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

import EnterpriseCredits from "../../../src/commands/enterprise/credits.js";
import { setOutputFormat } from "../../../src/lib/output.js";
import { respond, runCommand } from "../../helpers/run-command.js";

describe("sendly enterprise credits", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    setOutputFormat("human");
  });

  afterEach(() => {
    setOutputFormat("human");
  });

  it("shows the balance and lifetime credits the API returns", async () => {
    mockFetch.mockResolvedValueOnce(respond(200, { balance: 750, lifetimeCredits: 2000 }));

    const run = await runCommand(EnterpriseCredits, ["org_one"]);

    expect(run.exitCode).toBeUndefined();
    expect(run.stdout).toContain("750 credits");
    expect(run.stdout).toContain("2,000 credits");
    expect(run.stdout).not.toContain("—");
  });
});
