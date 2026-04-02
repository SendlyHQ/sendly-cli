import { Args } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import {
  json,
  spinner,
  isJsonMode,
  colors,
} from "../../lib/output.js";

interface SuggestedReply {
  text: string;
  tone: string;
}

interface SuggestRepliesResponse {
  suggestions: SuggestedReply[];
  conversationId: string;
}

export default class ConversationsSuggestReplies extends AuthenticatedCommand {
  static description = "Get AI-suggested replies for a conversation";

  static examples = [
    "<%= config.bin %> conversations suggest-replies conv_abc123",
    "<%= config.bin %> conversations suggest-replies conv_abc123 --json",
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
    const { args } = await this.parse(ConversationsSuggestReplies);

    const spin = spinner("Generating suggestions...");
    spin.start();

    try {
      const response = await apiClient.post<SuggestRepliesResponse>(
        `/api/v1/conversations/${encodeURIComponent(args.id)}/suggest-replies`,
      );

      spin.stop();

      if (isJsonMode()) {
        json(response);
        return;
      }

      if (!response.suggestions || response.suggestions.length === 0) {
        console.log(colors.dim("No suggestions available for this conversation."));
        return;
      }

      console.log();
      console.log(colors.bold("Suggested Replies"));
      console.log();

      response.suggestions.forEach((suggestion, index) => {
        const toneLabel = colors.dim(`[${suggestion.tone}]`);
        console.log(`  ${colors.primary(`${index + 1}.`)} ${suggestion.text} ${toneLabel}`);
        console.log();
      });
    } catch (err) {
      spin.stop();
      throw err;
    }
  }
}
