import { Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient, ApiError, RateLimitError } from "../../lib/api-client.js";
import { colors, info, warn } from "../../lib/output.js";

interface LogEntry {
  id: string;
  type: "message" | "api_call" | "webhook";
  status: string;
  endpoint?: string;
  method?: string;
  statusCode?: number;
  to?: string;
  messageId?: string;
  error?: string;
  timestamp: string;
}

interface ApiMessage {
  id: string;
  to: string;
  status: string;
  error?: string | null;
  createdAt: string;
}

interface MessagesPage {
  data: ApiMessage[];
}

const POLL_INTERVAL_MS = 2000;
const PAGE_SIZE = 50;
const SEEN_LIMIT = 1000;
const MAX_RATE_LIMIT_WAIT_MS = 60_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransient(err: unknown): boolean {
  if (
    err instanceof RateLimitError &&
    err.code === "too_many_failed_key_attempts"
  ) {
    return false;
  }
  if (err instanceof ApiError) {
    return (
      err.statusCode >= 500 || err.statusCode === 408 || err.statusCode === 429
    );
  }
  return (
    err instanceof TypeError ||
    (err instanceof Error && err.name === "AbortError")
  );
}

function toLogEntry(message: ApiMessage): LogEntry {
  return {
    id: message.id,
    type: "message",
    status: message.status,
    to: message.to,
    messageId: message.id,
    error: message.error ?? undefined,
    timestamp: message.createdAt,
  };
}

export default class LogsTail extends AuthenticatedCommand {
  static description =
    "Tail your message log in real time. A `sendly login` session is a test credential, so it shows sandbox messages only; set SENDLY_API_KEY to a live key to tail live traffic.";

  static examples = [
    "<%= config.bin %> logs tail",
    "<%= config.bin %> logs tail --status failed",
    "<%= config.bin %> logs tail --since 1h",
  ];

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    status: Flags.string({
      char: "s",
      description: "Filter by status (queued, sent, delivered, failed)",
    }),
    since: Flags.string({
      description: "Show logs since (e.g., 1h, 30m, 1d)",
      default: "1h",
    }),
    type: Flags.string({
      char: "t",
      description: "Log type to show. Only message logs are available",
    }),
  };

  private seen = new Set<string>();

  async run(): Promise<void> {
    const { flags } = await this.parse(LogsTail);

    if (flags.type && flags.type !== "message") {
      this.error(
        `There are no ${flags.type} logs to tail. Only message logs are available: use --type message or leave --type out.`,
      );
    }

    console.log();
    console.log(colors.bold(colors.primary("Sendly Logs")));
    console.log(colors.dim("─".repeat(60)));
    console.log();
    console.log(colors.dim("Streaming logs in real-time. Press Ctrl+C to stop."));
    console.log();

    const since = this.parseSince(flags.since).getTime();

    const onSigint = () => {
      console.log();
      info("Log streaming stopped");
      process.exit(0);
    };
    process.on("SIGINT", onSigint);

    try {
      let failing = false;
      let first = true;
      let wait = POLL_INTERVAL_MS;
      for (;;) {
        if (!first) await sleep(wait);
        wait = POLL_INTERVAL_MS;

        let page: MessagesPage;
        try {
          page = await apiClient.get<MessagesPage>("/api/v1/messages", {
            limit: PAGE_SIZE,
            status: flags.status,
          });
        } catch (err) {
          if (!isTransient(err)) throw err;
          if (err instanceof RateLimitError) {
            wait = Math.min(
              Math.max(POLL_INTERVAL_MS, err.retryAfter * 1000),
              MAX_RATE_LIMIT_WAIT_MS,
            );
          }
          if (!failing) {
            warn(
              `Could not fetch logs (${(err as Error).message}). Still trying.`,
            );
            failing = true;
          }
          first = false;
          continue;
        }
        failing = false;

        const printed = this.printNew(page.data ?? [], flags.status, since);
        if (first && printed === 0) {
          info("No recent logs found");
          console.log();
        }
        first = false;
      }
    } finally {
      process.removeListener("SIGINT", onSigint);
    }
  }

  private printNew(
    rows: ApiMessage[],
    status: string | undefined,
    since: number,
  ): number {
    const fresh = rows
      .filter(
        (row) =>
          !this.seen.has(row.id) &&
          (!status || row.status === status) &&
          Date.parse(row.createdAt) >= since,
      )
      .reverse()
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));

    for (const row of fresh) {
      this.displayLog(toLogEntry(row));
      this.seen.add(row.id);
    }
    for (const id of this.seen) {
      if (this.seen.size <= SEEN_LIMIT) break;
      this.seen.delete(id);
    }
    return fresh.length;
  }

  private displayLog(log: LogEntry): void {
    const timestamp = new Date(log.timestamp).toLocaleTimeString();

    let icon = "•";
    let statusColor = colors.dim;

    switch (log.status) {
      case "delivered":
      case "success":
        icon = "✓";
        statusColor = colors.success;
        break;
      case "failed":
      case "error":
        icon = "✗";
        statusColor = colors.error;
        break;
      case "queued":
      case "pending":
        icon = "○";
        statusColor = colors.warning;
        break;
      case "sent":
        icon = "→";
        statusColor = colors.info;
        break;
    }

    const typeLabel = this.getTypeLabel(log.type);

    console.log(
      `${colors.dim(timestamp)} ${statusColor(icon)} ${typeLabel} ${statusColor(log.status)}`
    );

    // Additional details
    if (log.to) {
      console.log(`  ${colors.dim("to:")} ${log.to}`);
    }
    if (log.endpoint) {
      console.log(
        `  ${colors.dim("endpoint:")} ${log.method || "GET"} ${log.endpoint}`
      );
    }
    if (log.messageId) {
      console.log(`  ${colors.dim("id:")} ${log.messageId}`);
    }
    if (log.error) {
      console.log(`  ${colors.error("error:")} ${log.error}`);
    }
    console.log();
  }

  private getTypeLabel(type: string): string {
    switch (type) {
      case "message":
        return colors.primary("[SMS]");
      case "api_call":
        return colors.code("[API]");
      case "webhook":
        return colors.warning("[HOOK]");
      default:
        return colors.dim(`[${type.toUpperCase()}]`);
    }
  }

  private parseSince(since: string): Date {
    const match = since.match(/^(\d+)([hdm])$/);
    if (!match) {
      return new Date(Date.now() - 60 * 60 * 1000); // Default 1 hour
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    const now = Date.now();
    switch (unit) {
      case "h":
        return new Date(now - value * 60 * 60 * 1000);
      case "d":
        return new Date(now - value * 24 * 60 * 60 * 1000);
      case "m":
        return new Date(now - value * 60 * 1000);
      default:
        return new Date(now - 60 * 60 * 1000);
    }
  }
}
