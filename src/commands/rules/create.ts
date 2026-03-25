import { Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import { json, isJsonMode, success, keyValue, header } from "../../lib/output.js";

export default class RulesCreate extends AuthenticatedCommand {
  static description = "Create an auto-labeling rule";

  static examples = [
    '<%= config.bin %> rules create --name "Flag complaints" --intent complaint --label label_abc',
    '<%= config.bin %> rules create --name "Close opt-outs" --intent opt_out --close',
    '<%= config.bin %> rules create --name "Negative" --sentiment negative --label label_xyz --priority 1',
  ];

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    name: Flags.string({
      description: "Rule name",
      required: true,
    }),
    intent: Flags.string({
      description: "Match intent (question, appointment, complaint, order_status, feedback, opt_out, greeting, confirmation, other)",
      multiple: true,
    }),
    sentiment: Flags.string({
      description: "Match sentiment (positive, neutral, negative)",
      multiple: true,
    }),
    label: Flags.string({
      description: "Label ID to apply when rule matches",
      multiple: true,
    }),
    close: Flags.boolean({
      description: "Close the conversation when rule matches",
      default: false,
    }),
    priority: Flags.integer({
      description: "Priority (lower runs first)",
      default: 0,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(RulesCreate);

    const conditions: Record<string, unknown> = {};
    if (flags.intent?.length) conditions.intent = flags.intent.length === 1 ? flags.intent[0] : flags.intent;
    if (flags.sentiment?.length) conditions.sentiment = flags.sentiment.length === 1 ? flags.sentiment[0] : flags.sentiment;

    const actions: Record<string, unknown> = {};
    if (flags.label?.length) actions.addLabels = flags.label;
    if (flags.close) actions.closeConversation = true;

    const rule = await apiClient.post<Record<string, unknown>>("/api/v1/rules", {
      name: flags.name,
      conditions,
      actions,
      priority: flags.priority,
    });

    if (isJsonMode()) {
      json(rule);
      return;
    }

    success(`Rule "${flags.name}" created`);
    header("Rule Details");
    keyValue({
      ID: rule.id as string,
      Name: rule.name as string,
      Priority: rule.priority as number,
    });
  }
}
