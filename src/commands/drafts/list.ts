import { Flags } from "@oclif/core";
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

export default class DraftsList extends AuthenticatedCommand {
  static description = "List drafts";

  static examples = [
    "<%= config.bin %> drafts list",
    "<%= config.bin %> drafts list --status pending",
    "<%= config.bin %> drafts list --conversation-id conv_abc123",
    "<%= config.bin %> drafts list --json",
  ];

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    "conversation-id": Flags.string({
      description: "Filter by conversation ID",
    }),
    status: Flags.string({
      char: "s",
      description: "Filter by status (pending, approved, rejected)",
      options: ["pending", "approved", "rejected"],
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(DraftsList);

    const response = await apiClient.get<ListDraftsResponse>(
      "/api/v1/drafts",
      {
        ...(flags["conversation-id"] && { conversation_id: flags["conversation-id"] }),
        ...(flags.status && { status: flags.status }),
      },
    );

    if (isJsonMode()) {
      json(response);
      return;
    }

    if (response.data.length === 0) {
      info("No drafts found");
      return;
    }

    console.log();
    console.log(
      colors.dim(`Showing ${response.data.length} drafts`),
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
