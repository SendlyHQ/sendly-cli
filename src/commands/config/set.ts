import { Args } from "@oclif/core";
import { BaseCommand } from "../../lib/base-command.js";
import {
  setConfig,
  resolveBaseUrl,
  type SendlyConfig,
} from "../../lib/config.js";
import { success, error, warn, colors } from "../../lib/output.js";

const ALLOWED_KEYS: (keyof SendlyConfig)[] = [
  "environment",
  "baseUrl",
  "defaultFormat",
  "colorEnabled",
];

export default class ConfigSet extends BaseCommand {
  static description = "Set a configuration value";

  static examples = [
    "<%= config.bin %> config set environment live",
    "<%= config.bin %> config set defaultFormat json",
    "<%= config.bin %> config set baseUrl https://api.sendly.live",
  ];

  static args = {
    key: Args.string({
      description: "Configuration key",
      required: true,
      options: ALLOWED_KEYS as string[],
    }),
    value: Args.string({
      description: "Configuration value",
      required: true,
    }),
  };

  static flags = {
    ...BaseCommand.baseFlags,
  };

  async run(): Promise<void> {
    const { args } = await this.parse(ConfigSet);

    const key = args.key as keyof SendlyConfig;

    // Validate and transform value
    let value: any = args.value;

    switch (key) {
      case "environment":
        if (!["test", "live"].includes(value)) {
          error("Invalid environment. Use 'test' or 'live'");
          this.exit(1);
        }
        break;
      case "defaultFormat":
        if (!["human", "json"].includes(value)) {
          error("Invalid format. Use 'human' or 'json'");
          this.exit(1);
        }
        break;
      case "colorEnabled":
        value = value === "true" || value === "1";
        break;
      case "baseUrl":
        try {
          new URL(value);
        } catch {
          error("Invalid URL format");
          this.exit(1);
        }
        break;
    }

    setConfig(key, value);
    success(`Set ${colors.code(key)} = ${colors.primary(String(value))}`);

    if (key === "baseUrl") {
      // The environment outranks the config file, so say so rather than
      // letting the user believe this value is the one in use.
      try {
        const effective = resolveBaseUrl();
        if (effective !== value) {
          warn(
            `SENDLY_BASE_URL (or SENDLY_API_URL) is set, so commands will use ${effective} until it is unset`,
          );
        }
      } catch (err) {
        warn((err as Error).message);
      }
    }
  }
}
