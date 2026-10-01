import { Errors } from "@oclif/core";
import { vi } from "vitest";

export const TEST_CONFIG = {
  bin: "sendly",
  runHook: async () => ({ successes: [], failures: [] }),
} as never;

type CommandClass = new (
  argv: string[],
  config: never,
) => { run(): Promise<unknown> };

export interface CommandRun {
  stdout: string;
  stderr: string;
  exitCode?: number;
  error?: unknown;
}

export interface StartedCommand {
  done: Promise<CommandRun>;
  stdout(): string;
  stderr(): string;
}

export function startCommand(
  Command: CommandClass,
  argv: string[],
): StartedCommand {
  const out: string[] = [];
  const err: string[] = [];
  const log = vi
    .spyOn(console, "log")
    .mockImplementation((...args: unknown[]) => {
      out.push(args.map(String).join(" "));
    });
  const logError = vi
    .spyOn(console, "error")
    .mockImplementation((...args: unknown[]) => {
      err.push(args.map(String).join(" "));
    });

  const cmd = new Command(argv, TEST_CONFIG);
  const done = (async (): Promise<CommandRun> => {
    let exitCode: number | undefined;
    let error: unknown;
    try {
      try {
        await cmd.run();
      } catch (thrown) {
        await (cmd as unknown as { catch(e: unknown): Promise<void> }).catch(
          thrown,
        );
      }
    } catch (thrown) {
      if (thrown instanceof Errors.ExitError) exitCode = thrown.oclif.exit;
      else error = thrown;
    } finally {
      log.mockRestore();
      logError.mockRestore();
    }
    return {
      stdout: out.join("\n"),
      stderr: err.join("\n"),
      exitCode,
      error,
    };
  })();

  return {
    done,
    stdout: () => out.join("\n"),
    stderr: () => err.join("\n"),
  };
}

export function runCommand(
  Command: CommandClass,
  argv: string[],
): Promise<CommandRun> {
  return startCommand(Command, argv).done;
}

export function respond(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    headers: new Map<string, string>(),
  };
}
