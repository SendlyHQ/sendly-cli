import { Args, Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import { success, error, spinner, json, isJsonMode } from "../../lib/output.js";

interface RedeliverResponse {
  message: string;
  requeued: number;
  skipped: number;
  truncated: boolean;
  window_size: number;
  delivery_ids: string[];
  since: string;
  until: string;
  limit: number;
}

export default class WebhooksRedeliver extends AuthenticatedCommand {
  static description =
    "Replay failed or cancelled webhook deliveries from the audit log. Reset the circuit first if it's open.";

  static examples = [
    "<%= config.bin %> webhooks redeliver whk_abc123",
    "<%= config.bin %> webhooks redeliver whk_abc123 --since 2026-05-01T00:00:00Z --limit 5000",
    "<%= config.bin %> webhooks redeliver whk_abc123 --event-types message.delivered,message.failed",
  ];

  static args = {
    id: Args.string({ description: "Webhook ID", required: true }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    since: Flags.string({
      description: "Earliest delivery time (ISO-8601). Default: now − 24h.",
    }),
    until: Flags.string({
      description: "Latest delivery time (ISO-8601). Default: now.",
    }),
    "event-types": Flags.string({
      description: "Comma-separated event types to filter on",
    }),
    statuses: Flags.string({
      description:
        "Comma-separated delivery statuses to replay. Default: failed,cancelled",
    }),
    limit: Flags.integer({
      description: "Maximum deliveries to requeue (max 10000)",
      default: 1000,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(WebhooksRedeliver);

    const body: Record<string, unknown> = {};
    if (flags.since) body.since = flags.since;
    if (flags.until) body.until = flags.until;
    if (flags["event-types"])
      body.event_types = flags["event-types"]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    if (flags.statuses)
      body.statuses = flags.statuses
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    if (flags.limit !== undefined) body.limit = flags.limit;

    const sp = spinner("Requeuing deliveries...");
    sp.start();

    try {
      const result = await apiClient.post<RedeliverResponse>(
        `/api/v1/webhooks/${args.id}/redeliver`,
        body,
      );

      sp.stop();

      if (isJsonMode()) {
        json(result);
        return;
      }

      success(result.message || "Redeliver complete", {
        Requeued: String(result.requeued),
        Skipped: String(result.skipped),
        Truncated: result.truncated ? "yes (window larger than limit)" : "no",
        "Window Size": String(result.window_size),
        Window: `${result.since} → ${result.until}`,
        Limit: String(result.limit),
      });
    } catch (err) {
      sp.stop();
      error(
        `Failed to redeliver: ${err instanceof Error ? err.message : String(err)}`,
      );
      this.exit(1);
    }
  }
}
