import { describe, it, expect, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

vi.mock("../../src/lib/config.js", () => ({
  PRODUCTION_BASE_URL: "https://sendly.live",
  config: { get: vi.fn(), set: vi.fn(), delete: vi.fn(), store: {} },
  isCI: vi.fn(() => false),
  isColorDisabled: vi.fn(() => false),
  isProductionBaseUrl: vi.fn(() => true),
  resolveBaseUrlSafe: vi.fn(() => ({ url: "https://sendly.live", source: "default" })),
  resolveBaseUrl: vi.fn(() => "https://sendly.live"),
  getEffectiveValue: vi.fn(() => undefined),
  getConfig: vi.fn(() => ({})),
  setConfig: vi.fn(),
  getConfigValue: vi.fn(() => undefined),
  clearConfig: vi.fn(),
  clearAuth: vi.fn(),
  isAuthenticated: vi.fn(() => true),
  getAuthToken: vi.fn(() => "sk_test_v1_mock"),
  getStoredAccessToken: vi.fn(() => undefined),
  setApiKey: vi.fn(),
  setAuthTokens: vi.fn(),
  getConfigPath: vi.fn(() => "/nonexistent/config.json"),
  getConfigDir: vi.fn(() => "/nonexistent"),
  setCurrentOrg: vi.fn(),
  getCurrentOrg: vi.fn(() => null),
  clearCurrentOrg: vi.fn(),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

import { TEST_CONFIG } from "../helpers/run-command.js";

const COMMANDS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../src/commands",
);

function commandFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return commandFiles(full);
    return entry.name.endsWith(".ts") ? [full] : [];
  });
}

function commandId(file: string): string[] {
  const parts = path.relative(COMMANDS_DIR, file).replace(/\.ts$/, "").split(path.sep);
  if (parts[parts.length - 1] === "index") parts.pop();
  return parts;
}

function argvOf(line: string): string[] {
  const words = line.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
  return words.map((w) =>
    (w.startsWith('"') && w.endsWith('"')) || (w.startsWith("'") && w.endsWith("'"))
      ? w.slice(1, -1)
      : w,
  );
}

const SHELL_OPERATORS = new Set(["|", ">", ">>", "<", "&&", "||", ";"]);

function sendlyInvocation(line: string): string[] | undefined {
  const words = argvOf(line);
  const start = words.indexOf("sendly");
  if (start === -1) return undefined;
  const rest = words.slice(start);
  const end = rest.findIndex((w) => SHELL_OPERATORS.has(w));
  return end === -1 ? rest : rest.slice(0, end);
}

describe("command examples", () => {
  it("every example parses with the flags and arguments of the command it runs", async () => {
    const commands = new Map<string, any>();
    const examples: Array<{ owner: string; text: string }> = [];
    for (const file of commandFiles(COMMANDS_DIR)) {
      const mod = await import(pathToFileURL(file).href);
      const Command = mod.default;
      if (!Command) continue;
      const id = commandId(file).join(" ");
      commands.set(id, Command);
      for (const example of (Command.examples ?? []) as Array<string | { command: string }>) {
        examples.push({
          owner: id,
          text: typeof example === "string" ? example : example.command,
        });
      }
    }

    const failures: string[] = [];
    let checked = 0;
    for (const { owner, text } of examples) {
      let line = text.replaceAll("<%= config.bin %>", "sendly").trim();
      if (line.startsWith("$ ")) line = line.slice(2);
      if (/(^|\s)--help(\s|$)/.test(line)) continue;
      const words = sendlyInvocation(line);
      if (!words) {
        failures.push(`${owner}: \`${text}\` does not run sendly`);
        continue;
      }
      let id: string | undefined;
      for (let n = words.length - 1; n >= 1; n--) {
        const candidate = words.slice(1, n + 1).join(" ");
        if (commands.has(candidate)) {
          id = candidate;
          break;
        }
      }
      if (!id) {
        failures.push(`${owner}: \`${line}\` names no command`);
        continue;
      }
      const Command = commands.get(id);
      const argv = words.slice(1 + id.split(" ").length);
      checked += 1;
      try {
        await (new Command(argv, TEST_CONFIG) as { parse(c: unknown, a: string[]): Promise<unknown> }).parse(
          Command,
          argv,
        );
      } catch (err) {
        const reason = String((err as Error).message)
          .split("\n")
          .find((l) => l.trim() && !/following error/.test(l))
          ?.trim();
        failures.push(`${owner}: \`${line}\` fails: ${reason}`);
      }
    }

    expect(checked).toBeGreaterThan(300);
    expect(failures).toEqual([]);
  }, 60_000);
});
