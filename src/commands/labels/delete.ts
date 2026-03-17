import { Args } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import {
  success,
  json,
  spinner,
  isJsonMode,
} from "../../lib/output.js";

export default class LabelsDelete extends AuthenticatedCommand {
  static description = "Delete a label";

  static examples = [
    "<%= config.bin %> labels delete lbl_abc123",
    "<%= config.bin %> labels delete lbl_abc123 --json",
  ];

  static args = {
    id: Args.string({
      description: "Label ID",
      required: true,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
  };

  async run(): Promise<void> {
    const { args } = await this.parse(LabelsDelete);

    const spin = spinner("Deleting label...");
    spin.start();

    try {
      await apiClient.delete(
        `/api/v1/labels/${encodeURIComponent(args.id)}`,
      );

      spin.stop();

      if (isJsonMode()) {
        json({ success: true, id: args.id });
        return;
      }

      success("Label deleted", {
        ID: args.id,
      });
    } catch (err) {
      spin.stop();
      throw err;
    }
  }
}
