/**
 * Shared interactive-terminal helpers: press-[c]-to-copy a URL to the
 * clipboard and [q]/Ctrl-C to cancel while the CLI polls a remote action
 * (browser login, hosted document upload / payment for number purchases).
 *
 * Both helpers were originally private to auth.ts; they now live here so
 * the numbers buy flow can reuse the exact same UX without duplicating it.
 */

import { colors } from "./output.js";

/**
 * Wire up the copy-URL / cancel keybindings while polling a remote
 * action. Only active on a real interactive TTY — in CI, piped stdin, or
 * when stdin.setRawMode is missing we no-op and return a cleanup that
 * also no-ops.
 *
 * Returns a cleanup function that the caller MUST invoke on every exit
 * path (success, timeout, error) so the terminal doesn't stay in raw
 * mode. Calling cleanup twice is safe.
 */
export function attachLoginKeypressHandler(urlToCopy: string): () => void {
  const stdin = process.stdin;
  if (!stdin.isTTY || typeof stdin.setRawMode !== "function") {
    return () => {};
  }

  let cleaned = false;
  const previousRawMode = stdin.isRaw;

  console.log(
    colors.dim(
      "Press [c] to copy URL to clipboard · [q] or Ctrl-C to cancel",
    ),
  );

  const onData = (key: Buffer | string): void => {
    const k = typeof key === "string" ? key : key.toString("utf8");
    if (k === "c" || k === "C") {
      copyToClipboard(urlToCopy)
        .then((ok) => {
          if (ok) {
            // Overwrite the hint line with a transient confirmation.
            process.stdout.write(
              "\r" + " ".repeat(70) + "\r" + colors.success("  ✓ URL copied to clipboard\n"),
            );
          } else {
            process.stdout.write(
              "\r" + colors.warning("  ✗ Could not copy — copy the URL manually\n"),
            );
          }
        })
        .catch(() => {});
      return;
    }
    if (k === "q" || k === "Q" || k === "\u0003") {
      cleanup();
      console.log(colors.warning("\n  Cancelled."));
      process.exit(130);
    }
  };

  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");
  stdin.on("data", onData);

  const cleanup = (): void => {
    if (cleaned) return;
    cleaned = true;
    try {
      stdin.removeListener("data", onData);
      stdin.setRawMode(previousRawMode);
      stdin.pause();
    } catch {
      /* no-op */
    }
  };

  return cleanup;
}

/**
 * Copy text to the system clipboard via the OS's native tool. Returns
 * true if the write succeeded. Does not throw. Shells out rather than
 * adding a native clipboard dep — the three commands (pbcopy / clip /
 * xclip / wl-copy) cover every platform the CLI runs on.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  const { spawn } = await import("node:child_process");
  const candidates: Array<[string, string[]]> =
    process.platform === "darwin"
      ? [["pbcopy", []]]
      : process.platform === "win32"
        ? [["clip", []]]
        : [
            ["wl-copy", []],
            ["xclip", ["-selection", "clipboard"]],
            ["xsel", ["--clipboard", "--input"]],
          ];

  for (const [cmd, args] of candidates) {
    try {
      const ok = await new Promise<boolean>((resolve) => {
        const child = spawn(cmd, args, { stdio: ["pipe", "ignore", "ignore"] });
        child.on("error", () => resolve(false));
        child.on("exit", (code) => resolve(code === 0));
        child.stdin.end(text);
      });
      if (ok) return true;
    } catch {
      // try next candidate
    }
  }
  return false;
}
