import { Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import {
  table,
  json,
  info,
  colors,
  formatRelativeTime,
  isJsonMode,
} from "../../lib/output.js";

interface ShortLinkListItem {
  code: string;
  shortUrl: string;
  destinationUrl: string;
  brandSlug: string | null;
  clickCount: number;
  disabled: boolean;
  lastCountry: string | null;
  lastClickedAt: string | null;
  createdAt: string;
  spark: number[];
}

interface ShortLinkListResponse {
  links: ShortLinkListItem[];
  total: number;
}

/**
 * `sendly links list` — list the branded short links your workspace has
 * created, newest first, with click counts.
 *
 * Wraps `GET /api/v1/links`. Gated behind the `url_shortener` rollout flag —
 * until it's enabled the server returns `404 not_found`.
 */
export default class LinksList extends AuthenticatedCommand {
  static description = "List your branded short links with click counts";

  static examples = [
    "<%= config.bin %> links list",
    "<%= config.bin %> links list --limit 20",
    "<%= config.bin %> links list --json",
  ];

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    limit: Flags.integer({
      char: "l",
      description: "Maximum number of links to return (1-200)",
      default: 50,
    }),
    offset: Flags.integer({
      description: "Number of links to skip for pagination",
      default: 0,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(LinksList);

    const response = await apiClient.get<ShortLinkListResponse>(
      "/api/v1/links",
      {
        limit: flags.limit,
        offset: flags.offset,
      },
    );

    if (isJsonMode()) {
      json(response);
      return;
    }

    if (!response.links || response.links.length === 0) {
      info("No short links yet. Create one with: sendly links create <url>");
      return;
    }

    console.log();
    console.log(
      colors.dim(`Showing ${response.links.length} of ${response.total} links`),
    );
    console.log();

    table(response.links, [
      {
        header: "Short URL",
        key: "shortUrl",
        width: 34,
        formatter: (v) => colors.code(String(v)),
      },
      {
        header: "Destination",
        key: "destinationUrl",
        width: 34,
        formatter: (v) => {
          const text = String(v ?? "-");
          return text.length > 31 ? text.slice(0, 31) + "..." : text;
        },
      },
      {
        header: "Clicks",
        key: "clickCount",
        width: 8,
        formatter: (v) => String(v ?? 0),
      },
      {
        header: "State",
        key: "disabled",
        width: 10,
        formatter: (v) => (v ? colors.error("disabled") : colors.success("active")),
      },
      {
        header: "Last click",
        key: "lastClickedAt",
        width: 14,
        formatter: (v) => (v ? formatRelativeTime(String(v)) : colors.dim("never")),
      },
    ]);
  }
}
