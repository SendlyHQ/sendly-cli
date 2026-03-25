import { Args, Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import {
  json,
  header,
  colors,
  isJsonMode,
} from "../../lib/output.js";

interface ContextResponse {
  context: string;
  conversation: {
    id: string;
    phoneNumber: string;
    status: string;
    messageCount: number;
    unreadCount: number;
  };
  tokenEstimate: number;
  business?: {
    name: string;
    useCase?: string;
  };
}

export default class ConversationsContext extends AuthenticatedCommand {
  static description =
    "Get LLM-ready conversation context. Returns pre-formatted text with timestamped messages, AI classification, and business context.";

  static examples = [
    "<%= config.bin %> conversations context conv_abc123",
    "<%= config.bin %> conversations context conv_abc123 --max-messages 10",
    "<%= config.bin %> conversations context conv_abc123 --json",
    "<%= config.bin %> conversations context conv_abc123 --raw",
  ];

  static args = {
    id: Args.string({
      description: "Conversation ID",
      required: true,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    "max-messages": Flags.integer({
      char: "m",
      description: "Maximum number of messages to include",
      default: 20,
    }),
    raw: Flags.boolean({
      description: "Output only the context text (for piping to LLMs)",
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ConversationsContext);

    const result = await apiClient.get<ContextResponse>(
      `/api/v1/conversations/${encodeURIComponent(args.id)}/context`,
      { max_messages: flags["max-messages"] },
    );

    if (flags.raw) {
      process.stdout.write(result.context);
      return;
    }

    if (isJsonMode()) {
      json(result);
      return;
    }

    header("Conversation Context");

    if (result.business) {
      console.log(colors.bold(result.business.name));
      if (result.business.useCase) {
        console.log(colors.dim(result.business.useCase));
      }
      console.log();
    }

    console.log(result.context);
    console.log();
    console.log(
      colors.dim(
        `${result.conversation.messageCount} messages · ${result.tokenEstimate} tokens · ${result.conversation.status}`,
      ),
    );
  }
}
