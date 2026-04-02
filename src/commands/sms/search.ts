import { Args, Flags } from "@oclif/core";
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

interface Message {
  id: string;
  to: string;
  from: string;
  text: string;
  status: string;
  segments: number;
  creditsUsed: number;
  isSandbox: boolean;
  createdAt: string;
  deliveredAt?: string;
}

interface Pagination {
  total: number;
  limit: number;
  offset: number;
  page: number;
  totalPages: number;
  hasMore: boolean;
}

interface ListMessagesResponse {
  data: Message[];
  pagination: Pagination;
  count: number;
}

export default class SmsSearch extends AuthenticatedCommand {
  static description = "Search messages by text content";

  static examples = [
    '<%= config.bin %> sms search "verification code"',
    '<%= config.bin %> sms search "hello" --limit 10',
    '<%= config.bin %> sms search "order" --json',
  ];

  static args = {
    query: Args.string({
      description: "Search query",
      required: true,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    limit: Flags.integer({
      char: "l",
      description: "Number of results per page",
      default: 20,
    }),
    page: Flags.integer({
      char: "p",
      description: "Page number (starts at 1)",
    }),
    offset: Flags.integer({
      description: "Offset from start (alternative to --page)",
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(SmsSearch);

    const response = await apiClient.get<ListMessagesResponse>(
      "/api/v1/messages",
      {
        q: args.query,
        limit: flags.limit,
        ...(flags.page && { page: flags.page }),
        ...(flags.offset && { offset: flags.offset }),
      },
    );

    if (isJsonMode()) {
      json(response);
      return;
    }

    if (response.data.length === 0) {
      info(`No messages matching "${args.query}"`);
      return;
    }

    const pagination = response.pagination || {
      total: response.count,
      page: 1,
      totalPages: 1,
      hasMore: false,
    };

    console.log();
    console.log(
      colors.dim(
        `Showing ${response.data.length} results for "${args.query}" (page ${pagination.page} of ${pagination.totalPages}, ${pagination.total} total)`,
      ),
    );
    console.log();

    table(response.data, [
      {
        header: "ID",
        key: "id",
        width: 18,
        formatter: (v) => colors.dim(String(v).slice(0, 15) + "..."),
      },
      {
        header: "To",
        key: "to",
        width: 16,
        formatter: (v) => formatPhone(String(v)),
      },
      {
        header: "Status",
        key: "status",
        width: 11,
        formatter: (v) => formatStatus(String(v)),
      },
      {
        header: "Mode",
        key: "isSandbox",
        width: 6,
        formatter: (v) => (v ? colors.warning("test") : colors.success("live")),
      },
      {
        header: "Text",
        key: "text",
        width: 25,
        formatter: (v) => {
          const text = String(v);
          return text.length > 22 ? text.slice(0, 22) + "..." : text;
        },
      },
      {
        header: "Sent",
        key: "createdAt",
        width: 12,
        formatter: (v) => formatRelativeTime(String(v)),
      },
    ]);

    if (pagination.hasMore) {
      console.log();
      console.log(
        colors.dim(
          `  Use ${colors.code(`--page ${pagination.page + 1}`)} to see more`,
        ),
      );
    }
  }
}
