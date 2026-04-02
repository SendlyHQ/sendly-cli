import { Args } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import {
  success,
  json,
  spinner,
  isJsonMode,
} from "../../lib/output.js";

interface AddLabelResponse {
  conversationId: string;
  labelId: string;
}

export default class LabelsAdd extends AuthenticatedCommand {
  static description = "Add a label to a conversation";

  static examples = [
    "<%= config.bin %> labels add conv_abc123 lbl_def456",
    "<%= config.bin %> labels add conv_abc123 lbl_def456 --json",
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
    const { args } = await this.parse(LabelsAdd);

    const spin = spinner("Adding label...");
    spin.start();

    try {
      const response = await apiClient.post<AddLabelResponse>(
        `/api/v1/conversations/${encodeURIComponent(args.conversationId)}/labels`,
        { labelIds: [args.labelId] },
      );

      spin.stop();

      if (isJsonMode()) {
        json(response);
        return;
      }

      success("Label added to conversation", {
        "Conversation ID": args.conversationId,
        "Label ID": args.labelId,
      });
    } catch (err) {
      spin.stop();
      throw err;
    }
  }
}
