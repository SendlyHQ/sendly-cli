import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import { json, table, isJsonMode, header, colors } from "../../lib/output.js";

interface Rule {
  id: string;
  name: string;
  conditions: Record<string, unknown>;
  actions: Record<string, unknown>;
  enabled: boolean;
  priority: number;
  createdAt: string;
}

export default class RulesList extends AuthenticatedCommand {
  static description = "List auto-labeling rules";

  static examples = [
    "<%= config.bin %> rules",
    "<%= config.bin %> rules --json",
  ];

  static flags = {
    ...AuthenticatedCommand.baseFlags,
  };

  async run(): Promise<void> {
    await this.parse(RulesList);

    const result = await apiClient.get<{ data: Rule[] }>("/api/v1/rules");

    if (isJsonMode()) {
      json(result.data);
      return;
    }

    header("Auto-Label Rules");

    if (result.data.length === 0) {
      console.log(colors.dim("No rules configured. Create one with: sendly rules create"));
      return;
    }

    table(
      result.data.map((r) => ({
        name: r.name,
        enabled: r.enabled,
        conditions: formatConditions(r.conditions),
        actions: formatActions(r.actions),
        priority: r.priority,
      })),
      [
        { header: "Name", key: "name", width: 20 },
        { header: "Status", key: "enabled", width: 10, formatter: (v: unknown) => v ? colors.success("enabled") : colors.dim("disabled") },
        { header: "Conditions", key: "conditions", width: 30 },
        { header: "Actions", key: "actions", width: 20 },
        { header: "Priority", key: "priority", width: 8 },
      ],
    );
  }
}

function formatConditions(c: Record<string, unknown>): string {
  const parts: string[] = [];
  if (c.intent) parts.push(`intent=${Array.isArray(c.intent) ? (c.intent as string[]).join("|") : c.intent}`);
  if (c.sentiment) parts.push(`sentiment=${Array.isArray(c.sentiment) ? (c.sentiment as string[]).join("|") : c.sentiment}`);
  return parts.join(", ") || "any";
}

function formatActions(a: Record<string, unknown>): string {
  const parts: string[] = [];
  if (Array.isArray(a.addLabels) && a.addLabels.length > 0) parts.push(`${a.addLabels.length} label(s)`);
  if (a.closeConversation) parts.push("auto-close");
  return parts.join(", ") || "none";
}
