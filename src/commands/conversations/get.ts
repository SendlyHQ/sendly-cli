import { Args, Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import {
  keyValue,
  json,
  header,
  formatStatus,
  formatDate,
  formatPhone,
  formatRelativeTime,
  colors,
  divider,
  isJsonMode,
} from "../../lib/output.js";

interface ConversationMessage {
  id: string;
  to: string;
  from: string;
  text: string;
  status: string;
  direction: string;
  createdAt: string;
}

interface ConversationResponse {
  id: string;
  phoneNumber: string;
  status: string;
  messageCount: number;
  unreadCount: number;
  lastMessageText?: string;
  lastMessageAt?: string;
  lastMessageDirection?: string;
  metadata?: Record<string, unknown>;
  tags?: string[];
  createdAt: string;
  messages?: {
    data: ConversationMessage[];
    pagination: { total: number; limit: number; offset: number; hasMore: boolean };
  };
}

export default class ConversationsGet extends AuthenticatedCommand {
  static description = "Get details of a conversation";

  static examples = [
    "<%= config.bin %> conversations get conv_abc123",
    "<%= config.bin %> conversations get conv_abc123 --messages",
    "<%= config.bin %> conversations get conv_abc123 --messages --limit 10",
    "<%= config.bin %> conversations get conv_abc123 --json",
  ];

  static args = {
    id: Args.string({
      description: "Conversation ID",
      required: true,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    messages: Flags.boolean({
      char: "m",
      description: "Include message thread",
      default: false,
    }),
    limit: Flags.integer({
      char: "l",
      description: "Number of messages to include (requires --messages)",
      default: 50,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ConversationsGet);

    const conversation = await apiClient.get<ConversationResponse>(
      `/api/v1/conversations/${encodeURIComponent(args.id)}`,
      {
        ...(flags.messages && { include_messages: "true" }),
        ...(flags.messages && { message_limit: flags.limit }),
      },
    );

    if (isJsonMode()) {
      json(conversation);
      return;
    }

    header("Conversation Details");

    keyValue({
      ID: conversation.id,
      "Phone Number": formatPhone(conversation.phoneNumber),
      Status: formatStatus(conversation.status),
      Messages: conversation.messageCount,
      Unread: conversation.unreadCount > 0
        ? colors.warning(String(conversation.unreadCount))
        : "0",
      "Last Message": conversation.lastMessageAt
        ? formatRelativeTime(conversation.lastMessageAt)
        : colors.dim("None"),
      ...(conversation.lastMessageDirection && {
        Direction: conversation.lastMessageDirection,
      }),
      ...(conversation.tags && conversation.tags.length > 0 && {
        Tags: conversation.tags.join(", "),
      }),
      Created: formatDate(conversation.createdAt),
    });

    if (flags.messages && conversation.messages) {
      divider();
      console.log(colors.bold("Message Thread:"));
      console.log(colors.dim("─".repeat(40)));

      if (conversation.messages.data.length === 0) {
        console.log(colors.dim("  No messages"));
      } else {
        for (const msg of conversation.messages.data) {
          const direction = msg.direction === "inbound"
            ? colors.info("←")
            : colors.success("→");
          const time = formatRelativeTime(msg.createdAt);
          const text = msg.text || colors.dim("(no text)");
          console.log(`  ${direction} ${colors.dim(time)}  ${text}`);
        }

        if (conversation.messages.pagination.hasMore) {
          console.log();
          console.log(
            colors.dim(`  ${conversation.messages.pagination.total - conversation.messages.data.length} more messages...`),
          );
        }
      }
      console.log();
    }
  }
}
