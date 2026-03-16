import { Args } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import {
  success,
  json,
  spinner,
  isJsonMode,
} from "../../lib/output.js";

interface ConversationResponse {
  id: string;
  phoneNumber: string;
  unreadCount: number;
}

export default class ConversationsMarkRead extends AuthenticatedCommand {
  static description = "Mark a conversation as read";

  static examples = [
    "<%= config.bin %> conversations mark-read conv_abc123",
    "<%= config.bin %> conversations mark-read conv_abc123 --json",
  ];

  static args = {
    id: Args.string({
      description: "Conversation ID",
      required: true,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
  };

  async run(): Promise<void> {
    const { args } = await this.parse(ConversationsMarkRead);

    const spin = spinner("Marking conversation as read...");
    spin.start();

    try {
      const response = await apiClient.post<ConversationResponse>(
        `/api/v1/conversations/${encodeURIComponent(args.id)}/mark-read`,
      );

      spin.stop();

      if (isJsonMode()) {
        json(response);
        return;
      }

      success("Conversation marked as read", {
        ID: response.id,
        "Phone Number": response.phoneNumber,
      });
    } catch (err) {
      spin.stop();
      throw err;
    }
  }
}
