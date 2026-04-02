import { Args, Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import {
  success,
  json,
  spinner,
  isJsonMode,
} from "../../lib/output.js";

interface UpdateConversationResponse {
  id: string;
  phoneNumber: string;
  status: string;
  metadata?: Record<string, unknown>;
  tags?: string[];
}

export default class ConversationsUpdate extends AuthenticatedCommand {
  static description = "Update a conversation";

  static examples = [
    '<%= config.bin %> conversations update conv_abc123 --metadata \'{"priority":"high"}\'',
    "<%= config.bin %> conversations update conv_abc123 --tags vip,urgent",
    '<%= config.bin %> conversations update conv_abc123 --metadata \'{"note":"follow up"}\' --tags support',
  ];

  static args = {
    id: Args.string({
      description: "Conversation ID",
      required: true,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    metadata: Flags.string({
      char: "m",
      description: "Metadata as JSON string",
    }),
    tags: Flags.string({
      char: "t",
      description: "Comma-separated list of tags",
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ConversationsUpdate);

    const spin = spinner("Updating conversation...");
    spin.start();

    try {
      const body: Record<string, unknown> = {};
      if (flags.metadata) body.metadata = JSON.parse(flags.metadata);
      if (flags.tags) body.tags = flags.tags.split(",").map((t) => t.trim());

      const response = await apiClient.put<UpdateConversationResponse>(
        `/api/v1/conversations/${encodeURIComponent(args.id)}`,
        body,
      );

      spin.stop();

      if (isJsonMode()) {
        json(response);
        return;
      }

      success("Conversation updated", {
        ID: response.id,
        Status: response.status,
      });
    } catch (err) {
      spin.stop();
      throw err;
    }
  }
}
