import { Command, Flags } from "@oclif/core";
import { spawn } from "node:child_process";
import {
  detectInstallPath,
  upgradeCommandFor,
} from "../lib/detect-install-path.js";
import {
  colors,
  success,
  error,
  info,
  spinner,
  divider,
} from "../lib/output.js";

/**
 * `sendly upgrade` — bring the CLI up to the latest version with a guided,
 * animated flow: an animated version check, a `vCURRENT → vLATEST` diff, and a
 * success panel. The noisy package-manager output is hidden behind a spinner
 * for Homebrew (which never needs sudo); for npm we keep inherited stdio so an
 * auth/sudo prompt can never hang invisibly behind a spinner.
 *
 * `--check` is a dry-run: it shows the detected install method and the command
 * that would run, without changing anything.
 *
 * The unattended banner that nudges users to run this comes from the
 * `@oclif/plugin-warn-if-update-available` plugin wired in package.json; this
 * command is the companion action for that banner.
 */

const REGISTRY_URL = "https://registry.npmjs.org/@sendly/cli";
const CHANGELOG_URL = "https://sendly.live/docs/changelog";

function bumpType(from: string, to: string): "major" | "minor" | "patch" | "" {
  const a = from.split(".").map((n) => parseInt(n, 10));
  const b = to.split(".").map((n) => parseInt(n, 10));
  if (a.length < 3 || b.length < 3 || [...a, ...b].some(Number.isNaN)) return "";
  if (b[0] > a[0]) return "major";
  if (b[1] > a[1]) return "minor";
  if (b[2] > a[2]) return "patch";
  return "";
}

async function fetchLatest(): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(REGISTRY_URL, {
      headers: { accept: "application/vnd.npm.install-v1+json" },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const body = (await res.json()) as {
      "dist-tags"?: { latest?: string };
    };
    return body["dist-tags"]?.latest ?? null;
  } catch {
    return null;
  }
}

function runCaptured(
  command: string,
): Promise<{ code: number; output: string }> {
  return new Promise((resolve) => {
    const [bin, ...args] = command.split(" ");
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout?.on("data", (d) => (output += d.toString()));
    child.stderr?.on("data", (d) => (output += d.toString()));
    child.on("error", (err) => resolve({ code: 1, output: err.message }));
    child.on("exit", (code) => resolve({ code: code ?? 1, output }));
  });
}

function runInherited(command: string): Promise<number> {
  return new Promise((resolve) => {
    const [bin, ...args] = command.split(" ");
    const child = spawn(bin, args, { stdio: "inherit" });
    child.on("error", () => resolve(1));
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

export default class Upgrade extends Command {
  static description =
    "Upgrade the Sendly CLI to the latest version with a guided, animated flow.";

  static examples = [
    "<%= config.bin %> upgrade",
    "<%= config.bin %> upgrade --check",
  ];

  static flags = {
    check: Flags.boolean({
      description: "Show what would happen without changing anything",
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Upgrade);
    const current = this.config.version;

    divider();
    console.log(
      `  ${colors.highlight("⚡ Sendly CLI")}  ${colors.dim("upgrade")}`,
    );
    divider();

    const spin = spinner("Checking for the latest version...").start();
    const latest = await fetchLatest();

    if (latest && latest === current) {
      spin.succeed(
        `You're on the latest version ${colors.success.bold("v" + current)}`,
      );
      divider();
      return;
    }

    if (latest) {
      const kind = bumpType(current, latest);
      spin.succeed(
        `Update available${kind ? " " + colors.dim(`(${kind})`) : ""}`,
      );
      console.log(
        `  ${colors.dim("v" + current)}  ${colors.primary("→")}  ${colors.success.bold("v" + latest)}`,
      );
      divider();
    } else {
      spin.succeed("Ready to upgrade");
    }

    const installPath = detectInstallPath();
    const command = upgradeCommandFor(installPath);

    if (installPath === "unknown") {
      info(
        "Can't detect how the CLI was installed. Run whichever matches:\n" +
          `  ${colors.code("brew upgrade sendly")}                ${colors.dim("(Homebrew)")}\n` +
          `  ${colors.code("npm install -g @sendly/cli@latest")}  ${colors.dim("(npm)")}`,
      );
      return;
    }

    if (flags.check) {
      info(
        `Install method: ${colors.bold(installPath)}\n` +
          `Would run:      ${colors.code(command)}`,
      );
      return;
    }

    const via = installPath === "homebrew" ? "Homebrew" : "npm";
    const target = latest ? ` to ${colors.success("v" + latest)}` : "";

    if (installPath === "homebrew") {
      // Homebrew never needs sudo, so it's safe to hide its output behind a
      // spinner for a clean, animated upgrade.
      const upSpin = spinner(`Upgrading via ${via}${target}...`).start();
      const { code, output } = await runCaptured(command);
      if (code === 0) {
        upSpin.stop();
        this.renderSuccess(via, latest);
      } else {
        upSpin.fail(`Upgrade failed via ${via}`);
        const tail = output.trim().split("\n").slice(-6).join("\n");
        if (tail) console.log(colors.dim(tail));
        error(`Try running it yourself: ${colors.code(command)}`);
      }
      return;
    }

    // npm: keep inherited stdio so any auth/sudo prompt stays visible.
    info(`Upgrading via ${via}${target}`);
    console.log(colors.dim(`  ${command}`));
    divider();
    const code = await runInherited(command);
    if (code === 0) {
      this.renderSuccess(via, latest);
    } else {
      error(
        `Upgrade command exited with code ${code}. Try running it yourself: ${colors.code(command)}`,
      );
    }
  }

  private renderSuccess(via: string, latest: string | null): void {
    success(
      latest
        ? `Upgraded to ${colors.success.bold("v" + latest)} via ${via}`
        : `Upgrade complete via ${via}`,
    );
    divider();
    info(`What's new: ${colors.code(CHANGELOG_URL)}`);
    info("Run `sendly --version` to confirm.");
    divider();
  }
}
