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
}

export default class DraftsApprove extends AuthenticatedCommand {
  static description = "Approve a draft and send it";

  static examples = [
    "<%= config.bin %> drafts approve draft_abc123",
    "<%= config.bin %> drafts approve draft_abc123 --json",
  ];

  static args = {
    id: Args.string({
      description: "Draft ID",
      required: true,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
  };

  async run(): Promise<void> {
    const { args } = await this.parse(DraftsApprove);

    const spin = spinner("Approving draft...");
    spin.start();

    try {
      const response = await apiClient.post<DraftResponse>(
        `/api/v1/drafts/${encodeURIComponent(args.id)}/approve`,
      );

      spin.stop();

      if (isJsonMode()) {
        json(response);
        return;
      }

      success("Draft approved", {
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
