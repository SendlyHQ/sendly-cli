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
  status: string;
}

export default class ConversationsReopen extends AuthenticatedCommand {
  static description = "Reopen a closed conversation";

  static examples = [
    "<%= config.bin %> conversations reopen conv_abc123",
    "<%= config.bin %> conversations reopen conv_abc123 --json",
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
    const { args } = await this.parse(ConversationsReopen);

    const spin = spinner("Reopening conversation...");
    spin.start();

    try {
      const response = await apiClient.post<ConversationResponse>(
        `/api/v1/conversations/${encodeURIComponent(args.id)}/reopen`,
      );

      spin.stop();

      if (isJsonMode()) {
        json(response);
        return;
      }

      success("Conversation reopened", {
        ID: response.id,
        "Phone Number": response.phoneNumber,
        Status: response.status,
      });
    } catch (err) {
      spin.stop();
      throw err;
    }
  }
}
