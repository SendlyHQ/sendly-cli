/**
 * Detect how the `@sendly/cli` binary was installed so `sendly upgrade`
 * can shell out to the correct package manager.
 *
 * We support two install paths explicitly:
 *   - Homebrew — from the SendlyHQ/homebrew-tap formula (`brew install sendly`).
 *     Detected via the `HOMEBREW_CELLAR` env var (set by every brew-managed
 *     shell) OR by the binary path living under a Homebrew-owned prefix.
 *   - npm global — `npm install -g @sendly/cli`. This is the default and
 *     what we fall back to when we can't identify Homebrew.
 *
 * Returns `"unknown"` only when we can't determine either. That's rare in
 * practice (npm installs into predictable paths) but we handle it
 * gracefully in the `upgrade` command by printing both options.
 */
export type InstallPath = "homebrew" | "npm" | "unknown";

const HOMEBREW_PREFIX_MARKERS = [
  "/opt/homebrew/",
  "/usr/local/Cellar/",
  "/home/linuxbrew/",
  "/Cellar/",
];

export function detectInstallPath(): InstallPath {
  // Strongest signal — the env var that `brew shellenv` sets.
  if (process.env.HOMEBREW_CELLAR) {
    return "homebrew";
  }

  // Fallback — look at the bin path. `process.argv[1]` is the entry
  // script; for Homebrew installs it lives under Cellar/libexec. For npm
  // globals it lives under the npm prefix (e.g. /usr/local/lib/node_modules).
  const binPath = process.argv[1] ?? "";
  for (const marker of HOMEBREW_PREFIX_MARKERS) {
    if (binPath.includes(marker)) return "homebrew";
  }

  // `node_modules` is the tell-tale for any npm install (global or local).
  if (binPath.includes("/node_modules/")) return "npm";

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
