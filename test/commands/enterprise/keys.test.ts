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

import EnterpriseKeysList from "../../../src/commands/enterprise/keys/list.js";
import EnterpriseKeysRevoke from "../../../src/commands/enterprise/keys/revoke.js";
import { setOutputFormat } from "../../../src/lib/output.js";
import { respond, runCommand } from "../../helpers/run-command.js";

const KEYS = [
  {
    id: "key_live_one",
    name: "Production",
    keyPrefix: "sk_live_v1_ab",
    type: "live",
    scopes: ["sms:send", "sms:read"],
    lastUsedAt: null,
    createdAt: "2026-09-20T10:00:00.000Z",
  },
  {
    id: "key_test_two",
    name: "CI",
    keyPrefix: "sk_test_v1_cd",
    type: "test",
    scopes: ["sms:send"],
    lastUsedAt: "2026-09-24T10:00:00.000Z",
    createdAt: "2026-09-21T10:00:00.000Z",
  },
];

describe("sendly enterprise keys list", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    setOutputFormat("human");
  });

  it("--json prints the keys the API returns", async () => {
    setOutputFormat("json");
    mockFetch.mockResolvedValueOnce(respond(200, KEYS));

    const run = await runCommand(EnterpriseKeysList, ["org_ws123"]);

    expect(run.exitCode).toBeUndefined();
    const printed = JSON.parse(run.stdout);
    expect(printed).toHaveLength(2);
    expect(printed[0].id).toBe("key_live_one");
  });

  it("lists each key with its prefix, as active", async () => {
    setOutputFormat("human");
    mockFetch.mockResolvedValueOnce(respond(200, KEYS));

    const run = await runCommand(EnterpriseKeysList, ["org_ws123"]);

    expect(run.exitCode).toBeUndefined();
    expect(run.error).toBeUndefined();
    expect(run.stdout).toContain("sk_live_v1_ab");
    expect(run.stdout).toContain("sk_test_v1_cd");
    expect(run.stdout).toContain("active");
    expect(run.stdout).not.toContain("revoked");
    expect(run.stdout).not.toContain("undefined");
  });

  it("says there are no keys when the workspace has none", async () => {
    setOutputFormat("human");
    mockFetch.mockResolvedValueOnce(respond(200, []));

    const run = await runCommand(EnterpriseKeysList, ["org_ws123"]);

    expect(run.exitCode).toBeUndefined();
    expect(run.stdout).toContain("sendly enterprise keys create org_ws123");
  });
});

describe("sendly enterprise keys revoke", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    setOutputFormat("human");
  });

  it("refuses a key id of .. before anything is sent, which would delete the workspace", async () => {
    const run = await runCommand(EnterpriseKeysRevoke, ["org_ws123", "..", "--yes"]);

    expect(run.exitCode).toBe(1);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(run.stderr).toContain("..");
  });

  it("revokes an ordinary key id", async () => {
    mockFetch.mockResolvedValueOnce(respond(200, { success: true }));

    const run = await runCommand(EnterpriseKeysRevoke, ["org_ws123", "key_live_one", "--yes"]);

    expect(run.exitCode).toBeUndefined();
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://sendly.live/api/v1/enterprise/workspaces/org_ws123/keys/key_live_one");
    expect(init.method).toBe("DELETE");
  });
});
