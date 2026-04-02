import { Args } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import {
  success,
  json,
  spinner,
  isJsonMode,
} from "../../lib/output.js";

export default class LabelsRemove extends AuthenticatedCommand {
  static description = "Remove a label from a conversation";

  static examples = [
    "<%= config.bin %> labels remove conv_abc123 lbl_def456",
    "<%= config.bin %> labels remove conv_abc123 lbl_def456 --json",
  ];

  static args = {
    conversationId: Args.string({
      description: "Conversation ID",
      required: true,
    }),
    labelId: Args.string({
      description: "Label ID",
      required: true,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
  };

  async run(): Promise<void> {
    const { args } = await this.parse(LabelsRemove);

    const spin = spinner("Removing label...");
    spin.start();

    try {
      const response = await apiClient.delete<Record<string, unknown>>(
        `/api/v1/conversations/${encodeURIComponent(args.conversationId)}/labels/${encodeURIComponent(args.labelId)}`,
      );

      spin.stop();

      if (isJsonMode()) {
        json(response);
        return;
      }

      success("Label removed from conversation", {
        "Conversation ID": args.conversationId,
        "Label ID": args.labelId,
      });
    } catch (err) {
      spin.stop();
      throw err;
    }
  }
}
