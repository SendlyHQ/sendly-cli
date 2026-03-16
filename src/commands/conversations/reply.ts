import { Args } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import {
  success,
  json,
  spinner,
  isJsonMode,
} from "../../lib/output.js";

interface ReplyResponse {
  id: string;
  to: string;
  from: string;
  text: string;
  status: string;
  createdAt: string;
}

export default class ConversationsReply extends AuthenticatedCommand {
  static description = "Send a reply in a conversation";

  static examples = [
    '<%= config.bin %> conversations reply conv_abc123 "Thanks for reaching out!"',
    '<%= config.bin %> conversations reply conv_abc123 "Got it" --json',
  ];

  static args = {
    id: Args.string({
      description: "Conversation ID",
      required: true,
    }),
    text: Args.string({
      description: "Reply message text",
      required: true,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
  };

  async run(): Promise<void> {
    const { args } = await this.parse(ConversationsReply);

    const spin = spinner("Sending reply...");
    spin.start();

    try {
      const response = await apiClient.post<ReplyResponse>(
        `/api/v1/conversations/${encodeURIComponent(args.id)}/messages`,
        { text: args.text },
      );

      spin.stop();

      if (isJsonMode()) {
        json(response);
        return;
      }

      success("Reply sent", {
        ID: response.id,
        To: response.to,
        Status: response.status,
      });
    } catch (err) {
      spin.stop();
      throw err;
    }
  }
}
