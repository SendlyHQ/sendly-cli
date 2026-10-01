import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../../../src/lib/config.js", () => ({
  isAuthenticated: vi.fn(() => true),
  getAuthToken: vi.fn(() => "sk_live_v1_mock"),
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

import BusinessUpgradeStart from "../../../src/commands/business-upgrade/start.js";
import BusinessUpgradeResubmit from "../../../src/commands/business-upgrade/resubmit.js";
import { respond, runCommand } from "../../helpers/run-command.js";

const START = ["--business-name", "Acme LLC", "--brn", "12-3456789"];

describe("sendly business-upgrade --workspace", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it.each([
    ["start", BusinessUpgradeStart, START],
    ["resubmit", BusinessUpgradeResubmit, []],
  ] as const)("%s refuses a workspace id of .. before anything is sent", async (_label, Command, rest) => {
    const run = await runCommand(Command, ["--workspace", "..", ...rest]);

    expect(run.exitCode).toBe(1);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("start sends an ordinary workspace id", async () => {
    mockFetch.mockResolvedValueOnce(respond(202, { status: "pending" }));

    await runCommand(BusinessUpgradeStart, ["--workspace", "org_ws1", ...START]);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toBe("https://sendly.live/api/v1/workspaces/org_ws1/upgrade");
  });
});
