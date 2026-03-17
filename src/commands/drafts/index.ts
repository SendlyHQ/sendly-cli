import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import {
  table,
  json,
  info,
  formatStatus,
  formatRelativeTime,
  colors,
  isJsonMode,
} from "../../lib/output.js";

interface Draft {
  id: string;
  conversationId: string;
  text: string;
  status: string;
  createdAt: string;
}

interface ListDraftsResponse {
  data: Draft[];
}

export default class Drafts extends AuthenticatedCommand {
  static description = "List pending drafts (default subcommand)";

  static examples = [
    "<%= config.bin %> drafts",
    "<%= config.bin %> drafts --json",
  ];

  static flags = {
    ...AuthenticatedCommand.baseFlags,
  };

  async run(): Promise<void> {
    await this.parse(Drafts);

    const response = await apiClient.get<ListDraftsResponse>(
      "/api/v1/drafts",
      { status: "pending" },
    );

    if (isJsonMode()) {
      json(response);
      return;
    }

    if (response.data.length === 0) {
      info("No pending drafts found");
      return;
    }

    console.log();
    console.log(
      colors.dim(`Showing ${response.data.length} pending drafts`),
    );
    console.log();

    table(response.data, [
      {
        header: "ID",
        key: "id",
        width: 20,
        formatter: (v) => colors.dim(String(v)),
      },
      {
        header: "Conversation",
        key: "conversationId",
        width: 20,
        formatter: (v) => colors.dim(String(v)),
      },
      {
        header: "Text",
        key: "text",
        width: 30,
        formatter: (v) => {
          if (!v) return colors.dim("-");
          const text = String(v);
          return text.length > 27 ? text.slice(0, 27) + "..." : text;
        },
      },
      {
        header: "Status",
        key: "status",
        width: 12,
        formatter: (v) => formatStatus(String(v)),
      },
      {
        header: "Created",
        key: "createdAt",
        width: 14,
        formatter: (v) => (v ? formatRelativeTime(String(v)) : colors.dim("-")),
      },
    ]);
  }
}
