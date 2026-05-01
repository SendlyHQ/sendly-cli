import { Args, Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import { success, error, spinner, json, isJsonMode } from "../../lib/output.js";

interface BackfillResponse {
  message: string;
  synthesized: number;
  by_type: Record<string, number>;
  truncated: boolean;
  candidates_scanned: number;
  delivery_ids: string[];
  since: string;
  until: string;
  limit: number;
}

export default class WebhooksBackfill extends AuthenticatedCommand {
  static description =
    "Synthesize missed webhook events from the message log. Use when an outage left events with no audit row.";

  static examples = [
    "<%= config.bin %> webhooks backfill whk_abc123",
    "<%= config.bin %> webhooks backfill whk_abc123 --since 2026-05-01T00:00:00Z --limit 5000",
    "<%= config.bin %> webhooks backfill whk_abc123 --event-types message.delivered,message.failed",
  ];

  static args = {
    id: Args.string({ description: "Webhook ID", required: true }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    since: Flags.string({
      description: "Earliest message time (ISO-8601). Default: now − 24h.",
    }),
    until: Flags.string({
      description: "Latest message time (ISO-8601). Default: now.",
    }),
    "event-types": Flags.string({
      description:
        "Comma-separated event types to backfill (message.sent, message.delivered, message.failed)",
    }),
    limit: Flags.integer({
      description: "Maximum events to synthesize (max 10000)",
      default: 1000,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(WebhooksBackfill);

    const body: Record<string, unknown> = {};
    if (flags.since) body.since = flags.since;
    if (flags.until) body.until = flags.until;
    if (flags["event-types"])
      body.event_types = flags["event-types"]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    if (flags.limit !== undefined) body.limit = flags.limit;

    const sp = spinner("Synthesizing missed deliveries...");
    sp.start();

    try {
      const result = await apiClient.post<BackfillResponse>(
        `/api/v1/webhooks/${args.id}/backfill`,
        body,
      );

      sp.stop();

      if (isJsonMode()) {
        json(result);
        return;
      }

      const byType = Object.entries(result.by_type ?? {})
        .map(([k, v]) => `${k}=${v}`)
        .join(", ");

      success(result.message || "Backfill complete", {
        Synthesized: String(result.synthesized),
        "By Type": byType || "(none)",
        "Candidates Scanned": String(result.candidates_scanned),
        Truncated: result.truncated ? "yes (more eligible than limit)" : "no",
        Window: `${result.since} → ${result.until}`,
        Limit: String(result.limit),
      });
    } catch (err) {
      sp.stop();
      error(
        `Failed to backfill: ${err instanceof Error ? err.message : String(err)}`,
      );
      this.exit(1);
    }
  }
}
