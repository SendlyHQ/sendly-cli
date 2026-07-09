import { Args, Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import { success, spinner, json, isJsonMode } from "../../lib/output.js";

interface ShortLinkDisabledResponse {
  code: string;
  disabled: boolean;
}

/**
 * `sendly links disable <code>` — the per-link kill switch. A disabled link's
 * redirect returns 404 until it is re-enabled. Pass `--enable` to re-enable.
 *
 * Wraps `PATCH /api/v1/links/:code`. Gated behind the `url_shortener` rollout
 * flag — until it's enabled the server returns `404 not_found`.
 */
export default class LinksDisable extends AuthenticatedCommand {
  static description =
    "Disable a short link so its redirect returns 404 (use --enable to re-enable)";

  static examples = [
    "<%= config.bin %> links disable Ab3xY7",
    "<%= config.bin %> links disable Ab3xY7 --enable",
    "<%= config.bin %> links disable Ab3xY7 --json",
  ];

  static args = {
    code: Args.string({
      description: "Short link code (the segment after the domain)",
      required: true,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    enable: Flags.boolean({
      description: "Re-enable the link instead of disabling it",
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(LinksDisable);
    const disabled = !flags.enable;

    const spin = spinner(disabled ? "Disabling link..." : "Re-enabling link...");
    spin.start();

    try {
      const response = await apiClient.patch<ShortLinkDisabledResponse>(
        `/api/v1/links/${encodeURIComponent(args.code)}`,
        { disabled },
      );

      spin.stop();

      if (isJsonMode()) {
        json(response);
        return;
      }

      success(response.disabled ? "Link disabled" : "Link re-enabled", {
        Code: response.code,
        State: response.disabled ? "disabled" : "active",
      });
    } catch (err) {
      spin.stop();
      throw err;
    }
  }
}
