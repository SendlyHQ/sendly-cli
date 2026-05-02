import * as fs from "node:fs";

/**
 * Detect how the `@sendly/cli` binary was installed so `sendly upgrade`
 * can shell out to the correct package manager.
 *
 * We support two install paths explicitly:
 *   - Homebrew — from the SendlyHQ/homebrew-tap formula
 *     (`brew install sendly-live/tap/sendly`). Detected by the resolved
 *     binary path living under a Homebrew-owned prefix.
 *   - npm global — `npm install -g @sendly/cli`. Detected by the
 *     resolved binary path living under `node_modules`.
 *
 * The `HOMEBREW_CELLAR` env var is NOT a reliable signal on its own —
 * it's set in every shell where Homebrew is on PATH, even when the CLI
 * was installed via npm. Path-based detection is authoritative; the env
 * var only acts as a tiebreaker for unusual layouts.
 *
 * Returns `"unknown"` only when we can't determine either. That's rare in
 * practice; the `upgrade` command handles it by printing both options.
 */
export type InstallPath = "homebrew" | "npm" | "unknown";

const HOMEBREW_PREFIX_MARKERS = [
  "/opt/homebrew/",
  "/usr/local/Cellar/",
  "/home/linuxbrew/",
  "/Cellar/",
];

export function detectInstallPath(): InstallPath {
  // The resolved binary path is the only authoritative signal of how
  // this CLI was installed. `process.argv[1]` is the entry script — npm
  // globals live under `node_modules`, Homebrew installs live under a
  // Cellar/brew prefix.
  //
  // Resolve symlinks so an `npm install -g` that drops a symlink in
  // `~/.nvm/.../bin/sendly -> ../lib/node_modules/...` is correctly
  // classified as "npm" via the resolved target, not "unknown" via the
  // unresolved symlink.
  const argv1 = process.argv[1] ?? "";
  let binPath = argv1;
  try {
    if (argv1) binPath = fs.realpathSync(argv1);
  } catch {
    // realpath can fail on broken symlinks or weird FS layouts —
    // fall back to the unresolved argv[1].
    binPath = argv1;
  }

  for (const marker of HOMEBREW_PREFIX_MARKERS) {
    if (binPath.includes(marker)) return "homebrew";
  }

  if (binPath.includes("/node_modules/")) return "npm";

  // Path was inconclusive (e.g. running from a source checkout). Don't
  // guess from `HOMEBREW_CELLAR` — its presence only proves brew exists
  // on the machine, not that this CLI was installed by it. Return
  // "unknown" so the upgrade command prints both options for the user.
  return "unknown";
}

/**
 * Human-readable upgrade command for the detected install path.
 */
export function upgradeCommandFor(path: InstallPath): string {
  switch (path) {
    case "homebrew":
      return "brew upgrade sendly";
    case "npm":
      return "npm install -g @sendly/cli@latest";
    default:
      return "npm install -g @sendly/cli@latest  # or: brew upgrade sendly";
  }
}
