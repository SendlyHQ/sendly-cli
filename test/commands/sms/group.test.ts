import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

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

import SmsGroup from "../../../src/commands/sms/group.js";
import { setOutputFormat } from "../../../src/lib/output.js";
import { respond, runCommand } from "../../helpers/run-command.js";

const ARGS = ["--to", "+14155551234,+14155555678", "--text", "Team sync at noon?"];

describe("sendly sms group", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    setOutputFormat("human");
  });

  afterEach(() => {
    setOutputFormat("human");
  });

  it("prints each recipient's number from a live send, which lists recipients as objects", async () => {
    mockFetch.mockResolvedValue(
      respond(201, {
        id: "msg_grp1",
        status: "sent",
        to: [
          { phoneNumber: "+14155551234", status: "queued" },
          { phoneNumber: "+14155555678", status: "queued" },
        ],
        group_message_id: "grp_1",
      }),
    );

    const run = await runCommand(SmsGroup, ARGS);

    expect(run.exitCode).toBeUndefined();
    expect(run.error).toBeUndefined();
    expect(run.stdout).not.toContain("[object Object]");
    expect(run.stdout).toContain("+14155551234");
    expect(run.stdout).toContain("+14155555678");
    expect(run.stdout).toContain("queued");
  });

  it("prints each recipient of a simulated send, which lists them as numbers", async () => {
    mockFetch.mockResolvedValue(
      respond(201, {
        id: "msg_grp2",
        status: "delivered",
        to: ["+14155551234", "+14155555678"],
        simulated: true,
      }),
    );

    const run = await runCommand(SmsGroup, ARGS);

    expect(run.exitCode).toBeUndefined();
    expect(run.stdout).toContain("+14155551234");
    expect(run.stdout).toContain("+14155555678");
  });

  it("prints the API's response unchanged with --json", async () => {
    const body = {
      id: "msg_grp1",
      status: "sent",
      to: [
        { phoneNumber: "+14155551234", status: "queued" },
        { phoneNumber: "+14155555678", status: "queued" },
      ],
      group_message_id: "grp_1",
    };
    mockFetch.mockResolvedValue(respond(201, body));
    setOutputFormat("json");

    const run = await runCommand(SmsGroup, ARGS);

    expect(JSON.parse(run.stdout)).toEqual(body);
  });
});
