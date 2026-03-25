import { Args } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import { json, isJsonMode, success } from "../../lib/output.js";

export default class RulesDelete extends AuthenticatedCommand {
  static description = "Delete an auto-labeling rule";

  static examples = [
    "<%= config.bin %> rules delete rule_abc123",
  ];

  static args = {
    id: Args.string({
      description: "Rule ID",
      required: true,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
  };

  async run(): Promise<void> {
    const { args } = await this.parse(RulesDelete);

    await apiClient.delete(`/api/v1/rules/${encodeURIComponent(args.id)}`);

    if (isJsonMode()) {
      json({ success: true, id: args.id });
      return;
    }

    success("Rule deleted");
  }
}
