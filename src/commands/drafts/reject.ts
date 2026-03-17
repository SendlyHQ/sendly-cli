import { Args, Flags } from "@oclif/core";
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

export default class DraftsReject extends AuthenticatedCommand {
  static description = "Reject a draft";

  static examples = [
    "<%= config.bin %> drafts reject draft_abc123",
    '<%= config.bin %> drafts reject draft_abc123 --reason "Tone is too informal"',
    "<%= config.bin %> drafts reject draft_abc123 --json",
  ];

  static args = {
    id: Args.string({
      description: "Draft ID",
      required: true,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    reason: Flags.string({
      char: "r",
      description: "Reason for rejection",
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(DraftsReject);

    const spin = spinner("Rejecting draft...");
    spin.start();

    try {
      const body: Record<string, unknown> = {};
      if (flags.reason) body.reason = flags.reason;

      const response = await apiClient.post<DraftResponse>(
        `/api/v1/drafts/${encodeURIComponent(args.id)}/reject`,
        body,
      );

      spin.stop();

      if (isJsonMode()) {
        json(response);
        return;
      }

      success("Draft rejected", {
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
