import { Args, Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import {
  success,
  error,
  spinner,
  colors,
  json,
  isJsonMode,
} from "../../lib/output.js";

interface ShortLink {
  code: string;
  shortUrl: string;
  destinationUrl: string;
}

/**
 * `sendly links create <url>` — mint a branded short link.
 *
 * Wraps `POST /api/v1/links`. Uses your workspace's brand slug when one is
 * configured. Branded, owned-domain short links improve deliverability
 * (carriers filter public shorteners) and give you click analytics.
 *
 * Gated behind the `url_shortener` rollout flag — until it's enabled for your
 * account the server returns `404 not_found` and this command surfaces it.
 *
 * Creating needs a live API key (set SENDLY_API_KEY); a CLI login counts as a
 * test key and gets `live_key_required`. The workspace needs an approved
 * business verification, and can make 1,000 links per UTC day.
 */
export default class LinksCreate extends AuthenticatedCommand {
  static description =
    "Shorten a URL into a branded short link. Needs the url_shortener feature, a live API key (SENDLY_API_KEY; a CLI login cannot create links) and an approved business verification.";

  static examples = [
    "<%= config.bin %> links create https://example.com/spring-sale",
    '<%= config.bin %> links create --url "https://example.com/welcome?utm_source=sms"',
    "<%= config.bin %> links create https://example.com/welcome --json",
  ];

  static args = {
    url: Args.string({
      description: "Destination URL to shorten (http/https, alternative to --url)",
      required: false,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    url: Flags.string({
      char: "u",
      description: "Destination URL to shorten (http/https)",
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(LinksCreate);

    const url = flags.url ?? args.url;
    if (!url) {
      error("A destination URL is required", {
        hint: "Pass a URL: sendly links create https://example.com",
      });
      this.exit(1);
    }

    if (!/^https?:\/\//i.test(url!)) {
      error("URL must start with http:// or https://");
      this.exit(1);
    }

    const spin = spinner("Shortening URL...");
    spin.start();

    try {
      const response = await apiClient.post<ShortLink>("/api/v1/links", {
        url,
      });

      spin.stop();

      if (isJsonMode()) {
        json(response);
        return;
      }

      success("Short link created", {
        Code: response.code,
        "Short URL": colors.code(response.shortUrl),
        Destination: response.destinationUrl,
      });
    } catch (err) {
      spin.stop();
      throw err;
    }
  }
}
