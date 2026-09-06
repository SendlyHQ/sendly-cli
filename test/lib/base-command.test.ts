/**
 * BaseCommand error-handling tests
 * A command that has already reported its own failure and called
 * `this.exit(1)` must not have that exit reported a second time.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Errors } from "@oclif/core";

vi.mock("../../src/lib/config.js", () => ({
  isAuthenticated: vi.fn(() => true),
  getAuthToken: vi.fn(() => "sk_live_v1_mock"),
  getStoredAccessToken: vi.fn(() => undefined),
  setAuthTokens: vi.fn(),
  resolveBaseUrl: vi.fn(() => "https://sendly.live"),
  getConfigValue: vi.fn(() => undefined),
  getEffectiveValue: vi.fn((key: string) => {
    if (key === "baseUrl") return "https://sendly.live";
    if (key === "maxRetries") return 0;
    if (key === "timeout") return 30000;
    return undefined;
  }),
}));

import { BaseCommand } from "../../src/lib/base-command.js";
import { ApiError, NotFoundError } from "../../src/lib/api-client.js";
import { setOutputFormat } from "../../src/lib/output.js";

class Probe extends BaseCommand {
  async run(): Promise<void> {}

  async handle(err: Error): Promise<void> {
    return this.catch(err);
  }
}

function probe(): Probe {
  return new Probe([], {} as never);
}

describe("BaseCommand.catch", () => {
  let stderr: string[];

  beforeEach(() => {
    stderr = [];
    setOutputFormat("human");
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      stderr.push(args.map(String).join(" "));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rethrows an ExitError untouched without printing anything", async () => {
    const exit = new Errors.ExitError(1);
    await expect(probe().handle(exit)).rejects.toBe(exit);
    expect(stderr).toEqual([]);
  });

  it("reports a typed API error once, then exits 1", async () => {
    const attempt = probe().handle(new NotFoundError("Agent not found"));
    await expect(attempt).rejects.toBeInstanceOf(Errors.ExitError);
    await expect(attempt).rejects.toMatchObject({ oclif: { exit: 1 } });
    expect(stderr.join("\n")).toMatch(/Agent not found/);
    expect(stderr.join("\n")).toMatch(/not_found/);
    expect(stderr.join("\n")).not.toMatch(/EEXIT/);
  });

  it("includes the machine-readable code and hint in JSON mode", async () => {
    setOutputFormat("json");
    const err = new ApiError("rcs_field_locked", "Locked", 409, undefined, "Wait");
    await expect(probe().handle(err)).rejects.toBeInstanceOf(Errors.ExitError);
    expect(JSON.parse(stderr[0])).toMatchObject({
      error: true,
      message: "Locked",
      code: "rcs_field_locked",
      hint: "Wait",
    });
    expect(stderr).toHaveLength(1);
  });
});
