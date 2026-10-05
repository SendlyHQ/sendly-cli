import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../../../src/lib/config.js", () => ({
  isAuthenticated: vi.fn(() => true),
  getAuthToken: vi.fn(() => "sk_test_v1_mock"),
  getStoredAccessToken: vi.fn(() => undefined),
  getSessionToken: vi.fn(() => undefined),
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

import {
  apiClient,
  ApiKeyRequiredError,
} from "../../../src/lib/api-client.js";
import { reportCallsError } from "../../../src/lib/calls.js";
import { reportVoiceError } from "../../../src/lib/voice.js";
import { setOutputFormat } from "../../../src/lib/output.js";
import KeysCreate from "../../../src/commands/keys/create.js";
import KeysList from "../../../src/commands/keys/list.js";
import EnterpriseKeysCreate from "../../../src/commands/enterprise/keys/create.js";
import EnterpriseKeysList from "../../../src/commands/enterprise/keys/list.js";
import RcsCapability from "../../../src/commands/rcs/capability.js";
import RcsSend from "../../../src/commands/rcs/send.js";
import { respond, runCommand, TEST_CONFIG } from "../../helpers/run-command.js";

const WORKSPACE = "org_ws123";

async function refusal(status: number, body: Record<string, unknown>) {
  mockFetch.mockResolvedValueOnce(respond(status, body));
  try {
    await apiClient.get("/api/v1/anything");
  } catch (err) {
    return err as ApiKeyRequiredError;
  }
  throw new Error("expected the request to be refused");
}

function reportedHint(report: () => void): string {
  const lines: string[] = [];
  const spy = vi
    .spyOn(console, "error")
    .mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    });
  try {
    report();
  } finally {
    spy.mockRestore();
  }
  return lines.join("\n");
}

async function gatherHints(): Promise<Record<string, string>> {
  const hints: Record<string, string> = {};

  hints["ApiKeyRequiredError default"] = new ApiKeyRequiredError().hint;
  hints["401 api_key_required"] = (
    await refusal(401, {
      error: "api_key_required",
      message: "API key required for sending messages",
    })
  ).hint!;
  hints["403 live_key_required"] = (
    await refusal(403, {
      error: "live_key_required",
      message: "Phone calls need a live API key.",
    })
  ).hint!;
  hints["403 invalid_api_key"] = (
    await refusal(403, {
      error: "invalid_api_key",
      message: "Invalid or expired API key",
    })
  ).hint!;

  setOutputFormat("human");
  hints["calls live key"] = reportedHint(() =>
    reportCallsError(new ApiKeyRequiredError("Phone calls need a live API key.")),
  );
  const voiceRefusal = new ApiKeyRequiredError("Phone calls need a live API key.");
  voiceRefusal.code = "live_key_required";
  voiceRefusal.body = { error: "live_key_required" };
  hints["voice live key"] = reportedHint(() => reportVoiceError(voiceRefusal));

  mockFetch.mockResolvedValueOnce(
    respond(403, {
      error: "rcs_requires_live_key",
      message: "RCS messages require a live API key.",
    }),
  );
  hints["rcs capability"] = (
    await runCommand(RcsCapability, ["--to", "+15125550190"])
  ).stderr;

  mockFetch.mockResolvedValueOnce(
    respond(403, {
      error: "rcs_requires_live_key",
      message: "RCS messages require a live API key.",
    }),
  );
  hints["rcs send"] = (
    await runCommand(RcsSend, ["--to", "+15125550190", "--text", "hi"])
  ).stderr;

  mockFetch.mockResolvedValueOnce(respond(200, { keys: [] }));
  hints["keys list empty"] = (await runCommand(KeysList, [])).stdout;

  mockFetch.mockResolvedValueOnce(respond(200, []));
  hints["enterprise keys list empty"] = (
    await runCommand(EnterpriseKeysList, [WORKSPACE])
  ).stdout;

  return hints;
}

function createCommand(hint: string): string {
  const match = hint.match(/sendly (?:enterprise )?keys create[^`\n]*/);
  if (!match) throw new Error(`no key-creation command in: ${hint}`);
  return match[0].trim();
}

function argvOf(command: string): string[] {
  const words = command.match(/"[^"]*"|\S+/g) ?? [];
  return words.map((w) => (w.startsWith('"') ? w.slice(1, -1) : w));
}

describe("key-creation hints", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    setOutputFormat("human");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    setOutputFormat("human");
  });

  it("print a command that parses and creates the key", async () => {
    const hints = await gatherHints();
    expect(Object.keys(hints)).toHaveLength(10);

    const failures: string[] = [];
    for (const [where, hint] of Object.entries(hints)) {
      const command = createCommand(hint);
      const argv = argvOf(command);
      const enterprise = argv[1] === "enterprise";
      const Command = enterprise ? EnterpriseKeysCreate : KeysCreate;
      const rest = argv.slice(enterprise ? 4 : 3);

      mockFetch.mockReset();
      mockFetch.mockResolvedValueOnce(
        respond(201, {
          id: "key_1",
          name: "k",
          key: "sk_test_v1_new",
          keyPrefix: "sk_test_v1_ne",
          type: "test",
          createdAt: "2026-09-25T12:00:00.000Z",
        }),
      );
      setOutputFormat("json");

      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      try {
        await new Command(rest, TEST_CONFIG).run();
      } catch (err) {
        failures.push(`${where}: \`${command}\` fails: ${(err as Error).message.split("\n").find((l) => l.trim() && !/following error/.test(l))?.trim()}`);
        continue;
      } finally {
        log.mockRestore();
      }

      if (mockFetch.mock.calls.length !== 1) {
        failures.push(`${where}: \`${command}\` sent no request`);
        continue;
      }
      const [url, init] = mockFetch.mock.calls[0];
      const expectedPath = enterprise
        ? `/api/v1/enterprise/workspaces/${WORKSPACE}/keys`
        : "/api/v1/account/keys";
      const body = JSON.parse(init.body);
      if (
        new URL(url).pathname !== expectedPath ||
        typeof body.name !== "string" ||
        !body.name ||
        !["test", "live"].includes(body.type)
      ) {
        failures.push(`${where}: \`${command}\` sent ${url} ${init.body}`);
      }
    }

    expect(failures).toEqual([]);
  });

  it("ask for the key type the refusal needs", async () => {
    const hints = await gatherHints();
    for (const where of [
      "403 live_key_required",
      "calls live key",
      "voice live key",
      "rcs capability",
      "rcs send",
    ]) {
      expect(createCommand(hints[where]), where).toContain("--type live");
    }
    for (const where of [
      "ApiKeyRequiredError default",
      "401 api_key_required",
      "403 invalid_api_key",
    ]) {
      expect(createCommand(hints[where]), where).toContain("--type test");
    }
  });
});
