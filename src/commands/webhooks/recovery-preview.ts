import { Args, Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import {
  error,
  spinner,
  json,
  isJsonMode,
  header,
  keyValue,
  divider,
  table,
} from "../../lib/output.js";

interface RecoveryPreviewResponse {
  circuitState: string;
  circuitOpenedAt: string | null;
  failureCount: number;
  auditFailures: {
    total: number;
    byStatus: Record<string, number>;
    byEventType: Record<string, number>;
  };
  missingFromMessages: {
    total: number;
    byEventType: Record<string, number>;
  };
  histogram: Array<{ bucket: string; missing: number; failed: number }>;
  samples: Array<{
    id: string;
    toMasked: string;
    eventType: string;
    occurredAt: string;
  }>;
  windowSuggestion: { since: string; until: string } | null;
  since: string;
  until: string;
}

function counts(map: Record<string, number> | undefined): string {
  const text = Object.entries(map ?? {})
    .map(([k, v]) => `${k}=${v}`)
    .join(", ");
  return text || "(none)";
}

export default class WebhooksRecoveryPreview extends AuthenticatedCommand {
  static description =
    "Preview a recovery: count what redeliver and backfill would send for a window, without sending anything.";

  static examples = [
    "<%= config.bin %> webhooks recovery-preview whk_abc123",
    "<%= config.bin %> webhooks recovery-preview whk_abc123 --since 2026-05-01T00:00:00Z",
    "<%= config.bin %> webhooks recovery-preview whk_abc123 --event-types message.delivered,message.failed --json",
  ];

  static args = {
    id: Args.string({ description: "Webhook ID", required: true }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    since: Flags.string({
      description: "Window start (ISO-8601). Default: now − 24h.",
    }),
    until: Flags.string({
      description: "Window end (ISO-8601). Default: now. The window can be at most 7 days.",
    }),
    "event-types": Flags.string({
      description: "Comma-separated event types to count. Default: all.",
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(WebhooksRecoveryPreview);

    const eventTypes = flags["event-types"]
      ?.split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .join(",");

    const sp = spinner("Counting what a recovery would send...");
    sp.start();

    try {
      const result = await apiClient.get<RecoveryPreviewResponse>(
        `/api/v1/webhooks/${encodeURIComponent(args.id)}/recovery-preview`,
        {
          since: flags.since,
          until: flags.until,
          event_types: eventTypes || undefined,
        },
      );

      sp.stop();

      if (isJsonMode()) {
        json(result);
        return;
      }

      header("Recovery preview");
      keyValue({
        Window: `${result.since} → ${result.until}`,
        Circuit: result.circuitOpenedAt
          ? `${result.circuitState} (opened ${result.circuitOpenedAt})`
          : result.circuitState,
        "Failure Count": String(result.failureCount),
        "Redeliver Would Send": String(result.auditFailures?.total ?? 0),
        "Redeliver By Status": counts(result.auditFailures?.byStatus),
        "Redeliver By Event": counts(result.auditFailures?.byEventType),
        "Backfill Would Send": String(result.missingFromMessages?.total ?? 0),
        "Backfill By Event": counts(result.missingFromMessages?.byEventType),
        ...(result.windowSuggestion
          ? {
              "Suggested Window": `${result.windowSuggestion.since} → ${result.windowSuggestion.until}`,
            }
          : {}),
      });

      if (result.samples?.length) {
        divider();
        table(result.samples, [
          { header: "ID", key: "id" },
          { header: "To", key: "toMasked" },
          { header: "Event", key: "eventType" },
          { header: "Occurred At", key: "occurredAt" },
        ]);
      }
    } catch (err) {
      sp.stop();
      error(
        `Failed to preview recovery: ${err instanceof Error ? err.message : String(err)}`,
      );
      this.exit(1);
    }
  }
}
