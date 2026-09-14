import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient, NotFoundError } from "../../lib/api-client.js";
import {
  table,
  json,
  info,
  warn,
  colors,
  spinner,
  isJsonMode,
} from "../../lib/output.js";

interface ShortCodeRow {
  id: string;
  shortCode: string | null;
  countryCode: string;
  status: string;
  useCase: string;
  createdAt: string;
}

export default class ShortCodesList extends AuthenticatedCommand {
  static description =
    "List the short codes leased to the workspace, including ones still being certified";

  static examples = [
    "<%= config.bin %> short-codes list",
    "<%= config.bin %> short-codes list --json",
  ];

  static flags = {
    ...AuthenticatedCommand.baseFlags,
  };

  async run(): Promise<void> {
    await this.parse(ShortCodesList);

    const listSpinner = spinner("Fetching short codes...");
    if (!isJsonMode()) listSpinner.start();

    let shortCodes: ShortCodeRow[];
    try {
      const response = await apiClient.get<{ shortCodes: ShortCodeRow[] }>(
        "/api/v1/short_codes",
      );
      shortCodes = response.shortCodes ?? [];
      listSpinner.stop();
    } catch (error) {
      listSpinner.stop();
      if (error instanceof NotFoundError) {
        warn("Short codes aren't enabled for this account yet. Ask Sendly support.");
        this.exit(1);
      }
      throw error;
    }

    if (isJsonMode()) {
      json({ shortCodes });
      return;
    }

    if (shortCodes.length === 0) {
      info("No short codes yet");
      console.log(
        colors.dim(
          `Apply for one with ${colors.code("sendly short-codes update")}, then ${colors.code("sendly short-codes submit")}.`,
        ),
      );
      return;
    }

    table(shortCodes, [
      {
        header: "Code",
        key: "shortCode",
        formatter: (v) => (v ? colors.code(String(v)) : colors.dim("not assigned")),
      },
      { header: "Status", key: "status", formatter: (v) => String(v) },
      { header: "Country", key: "countryCode", formatter: (v) => String(v) },
      {
        header: "Use case",
        key: "useCase",
        formatter: (v) => {
          const text = String(v ?? "");
          return text.length > 48 ? `${text.slice(0, 47)}…` : text;
        },
      },
      {
        header: "Created",
        key: "createdAt",
        formatter: (v) => (v ? new Date(String(v)).toLocaleDateString() : ""),
      },
    ]);
  }
}
