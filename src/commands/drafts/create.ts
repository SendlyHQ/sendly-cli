import { Args } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import {
  success,
  json,
  spinner,
  isJsonMode,
} from "../../lib/output.js";

interface DraftResponse {
  id: string;
  conversationId: string;
  text: string;
  status: string;
  createdAt: string;
}

export default class DraftsCreate extends AuthenticatedCommand {
  static description = "Create a draft reply in a conversation";

  static examples = [
    '<%= config.bin %> drafts create conv_abc123 "Thanks for reaching out!"',
    '<%= config.bin %> drafts create conv_abc123 "We will look into this" --json',
  ];

  static args = {
    "conversation-id": Args.string({
      description: "Conversation ID",
      required: true,
    }),
    text: Args.string({
      description: "Draft message text",
      required: true,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
  };

  async run(): Promise<void> {
    const { args } = await this.parse(DraftsCreate);

    const spin = spinner("Creating draft...");
    spin.start();

    try {
      const response = await apiClient.post<DraftResponse>(
        "/api/v1/drafts",
        {
          conversationId: args["conversation-id"],
          text: args.text,
        },
      );

      spin.stop();

      if (isJsonMode()) {
        json(response);
        return;
      }

      success("Draft created", {
        ID: response.id,
        Conversation: response.conversationId,
        Status: response.status,
      });
    } catch (err) {
      spin.stop();
      throw err;
    }
  }
}
