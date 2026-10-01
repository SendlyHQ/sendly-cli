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

import CampaignsCreate from "../../../src/commands/campaigns/create.js";
import { setOutputFormat } from "../../../src/lib/output.js";
import { respond, runCommand } from "../../helpers/run-command.js";

describe("sendly campaigns create --list", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockImplementation(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body ?? "{}"));
      return respond(201, {
        id: "cmp_1",
        name: body.name,
        messageText: body.messageText,
        targetListId: body.targetListId,
        status: "draft",
        totalRecipients: 1,
        estimatedCredits: 2,
      });
    });
    setOutputFormat("json");
  });

  afterEach(() => {
    setOutputFormat("human");
  });

  it("sends the one list it is given", async () => {
    const run = await runCommand(CampaignsCreate, ["--name", "Welcome", "--text", "Hi", "--list", "lst_a"]);

    expect(run.exitCode).toBeUndefined();
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(mockFetch.mock.calls[0][1].body).targetListId).toBe("lst_a");
  });

  it("uses the first list and warns that the others are ignored, as 4.2.0 created it", async () => {
    setOutputFormat("human");
    const run = await runCommand(CampaignsCreate, [
      "--name",
      "Sale",
      "--text",
      "Hi",
      "--list",
      "lst_a",
      "--list",
      "lst_b",
    ]);

    expect(run.exitCode).toBeUndefined();
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(mockFetch.mock.calls[0][1].body).targetListId).toBe("lst_a");
    expect(run.stdout).toContain("only the first --list (lst_a) is used");
    expect(run.stdout).toContain("Campaign created: cmp_1");
  });
});
