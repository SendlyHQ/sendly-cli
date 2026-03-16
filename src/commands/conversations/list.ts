import { Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import {
  table,
  json,
  info,
  formatStatus,
  formatRelativeTime,
  formatPhone,
  colors,
  isJsonMode,
} from "../../lib/output.js";

interface Conversation {
  id: string;
  phoneNumber: string;
  status: string;
  messageCount: number;
  unreadCount: number;
  lastMessageText?: string;
  lastMessageAt?: string;
}

interface Pagination {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

interface ListConversationsResponse {
  data: Conversation[];
  pagination: Pagination;
}

export default class ConversationsList extends AuthenticatedCommand {
  static description = "List conversations";

  static examples = [
    "<%= config.bin %> conversations list",
    "<%= config.bin %> conversations list --status active",
    "<%= config.bin %> conversations list --limit 10",
    "<%= config.bin %> conversations list --json",
  ];

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    limit: Flags.integer({
      char: "l",
      description: "Number of conversations per page",
      default: 20,
    }),
    offset: Flags.integer({
      description: "Offset from start",
    }),
    status: Flags.string({
      char: "s",
      description: "Filter by status (active, closed)",
      options: ["active", "closed"],
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(ConversationsList);

    const response = await apiClient.get<ListConversationsResponse>(
      "/api/v1/conversations",
      {
        limit: flags.limit,
        ...(flags.offset != null && { offset: flags.offset }),
        ...(flags.status && { status: flags.status }),
      },
    );

    if (isJsonMode()) {
      json(response);
      return;
    }

    if (response.data.length === 0) {
      info("No conversations found");
      return;
    }

    const pagination = response.pagination;

    console.log();
    console.log(
      colors.dim(
        `Showing ${response.data.length} conversations (${pagination.total} total)`,
      ),
    );
    console.log();

    table(response.data, [
      {
        header: "Phone Number",
        key: "phoneNumber",
        width: 16,
        formatter: (v) => formatPhone(String(v)),
      },
      {
        header: "Status",
        key: "status",
        width: 10,
        formatter: (v) => formatStatus(String(v)),
      },
      {
        header: "Messages",
        key: "messageCount",
        width: 10,
      },
      {
        header: "Unread",
        key: "unreadCount",
        width: 8,
        formatter: (v) => {
          const count = Number(v);
          return count > 0 ? colors.warning(String(count)) : String(count);
        },
      },
      {
        header: "Last Message",
        key: "lastMessageText",
        width: 25,
        formatter: (v) => {
          if (!v) return colors.dim("-");
          const text = String(v);
          return text.length > 22 ? text.slice(0, 22) + "..." : text;
        },
      },
      {
        header: "Last Activity",
        key: "lastMessageAt",
        width: 14,
        formatter: (v) => (v ? formatRelativeTime(String(v)) : colors.dim("-")),
      },
    ]);

    if (pagination.hasMore) {
      console.log();
      console.log(
        colors.dim(
          `  Use ${colors.code(`--offset ${(flags.offset || 0) + flags.limit}`)} to see more`,
        ),
      );
    }
  }
}
