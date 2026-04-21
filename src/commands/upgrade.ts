import { Command, Flags } from "@oclif/core";
import { spawn } from "node:child_process";
import {
  detectInstallPath,
  upgradeCommandFor,
} from "../lib/detect-install-path.js";
import { success, error, info } from "../lib/output.js";

/**
 * `sendly upgrade` — bring the CLI up to the latest version.
 *
 * Detects the install path (Homebrew vs npm-global vs unknown) and
 * executes the matching package-manager upgrade command. If the install
 * path is unknown we print both options for the user to pick.
 *
 * The `--check` flag does a dry-run: prints what would happen without
 * executing anything. Useful in restricted shells where we don't want
 * to trigger a brew/npm run accidentally.
 *
 * The unattended in-band update banner that prompts users to run this
 * comes from the `@oclif/plugin-warn-if-update-available` plugin wired
 * in package.json; this command is the companion action for that
 * banner.
 */
export default class Upgrade extends Command {
  static description =
    "Upgrade Sendly CLI to the latest version using the package manager that installed it (Homebrew or npm).";

  static examples = [
    "<%= config.bin %> upgrade",
    "<%= config.bin %> upgrade --check",
  ];

  static flags = {
    check: Flags.boolean({
      description:
        "Print the upgrade command for your install path without executing it",
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Upgrade);

    const installPath = detectInstallPath();
    const command = upgradeCommandFor(installPath);

    if (installPath === "unknown") {
      info(
        "Can't detect how you installed the Sendly CLI. Pick the matching command:\n" +
          "  • Homebrew: brew upgrade sendly\n" +
          "  • npm:      npm install -g @sendly/cli@latest",
      );
      return;
    }

    if (flags.check) {
      info(
        `Detected install path: ${installPath}\nWould run: ${command}`,
      );
      return;
    }

    info(`Upgrading via ${installPath}: ${command}`);

    const [bin, ...args] = command.split(" ");
    const child = spawn(bin, args, { stdio: "inherit" });

    await new Promise<void>((resolve) => {
      child.on("exit", (code) => {
        if (code === 0) {
          success(
            "Upgrade complete. Run `sendly --version` to confirm the new version.",
          );
        } else {
          error(
            `Upgrade command exited with code ${code}. Try running \`${command}\` manually.`,
          );
        }
        resolve();
      });
      child.on("error", (err) => {
        error(
          `Failed to execute upgrade command: ${err.message}. Try running \`${command}\` manually.`,
        );
        resolve();
      });
    });
  }
}
