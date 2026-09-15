import { Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import {
  table,
  json,
  info,
  colors,
  spinner,
  isJsonMode,
} from "../../lib/output.js";
import {
  CALLS_PATH,
  CALL_DIRECTIONS,
  CALL_STATUSES,
  formatCallStatus,
  formatDirection,
  formatDuration,
  formatStartedAt,
  reportCallsError,
  shortId,
  type CallListResponse,
} from "../../lib/calls.js";

export function nextPageCommand(
  flags: {
    status?: string;
    direction?: string;
    agent?: string;
    limit: number;
  },
  nextOffset: number,
): string {
  const parts = ["sendly calls list"];
  if (flags.status) parts.push(`--status ${flags.status}`);
  if (flags.direction) parts.push(`--direction ${flags.direction}`);
  if (flags.agent) parts.push(`--agent ${flags.agent}`);
  parts.push(`--limit ${flags.limit}`, `--offset ${nextOffset}`);
  return parts.join(" ");
}

export default class CallsList extends AuthenticatedCommand {
  static description = "List phone calls on your workspace, newest first";

  static examples = [
    "<%= config.bin %> calls list",
    "<%= config.bin %> calls list --status active",
    "<%= config.bin %> calls list --direction outbound --agent 3c4d5e6f-7081-4293-a4b5-c6d7e8f90a1b",
    "<%= config.bin %> calls list --limit 20 --offset 20 --json",
  ];

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    status: Flags.string({
      description: "Only calls in this status",
      options: [...CALL_STATUSES],
    }),
    direction: Flags.string({
      description: "Only inbound or outbound calls",
      options: [...CALL_DIRECTIONS],
    }),
    agent: Flags.string({
      description: "Only calls handled by this AI agent id",
    }),
    limit: Flags.integer({
      char: "l",
      description: "Maximum number of calls to return (1-100)",
      default: 50,
    }),
    offset: Flags.integer({
      description: "Number of calls to skip for pagination",
      default: 0,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(CallsList);

    const listSpinner = spinner("Fetching calls...");
    if (!isJsonMode()) {
      listSpinner.start();
    }

    let response: CallListResponse;
    try {
      response = await apiClient.get<CallListResponse>(CALLS_PATH, {
        limit: flags.limit,
        offset: flags.offset,
        status: flags.status,
        direction: flags.direction,
        agentId: flags.agent,
      });
      listSpinner.stop();
    } catch (err) {
      listSpinner.stop();
      if (reportCallsError(err)) this.exit(1);
      throw err;
    }

    if (isJsonMode()) {
      json(response);
      return;
    }

    const calls = response.data ?? [];
    if (calls.length === 0) {
      info("No calls yet");
      console.log(
        colors.dim(
          `Place one with ${colors.code("sendly calls create --to +15125550123 --agent <agentId>")}.`,
        ),
      );
      return;
    }

    const total = response.pagination?.total ?? calls.length;
    console.log();
    console.log(colors.dim(`Showing ${calls.length} of ${total} calls`));
    console.log();

    table(calls, [
      {
        header: "ID",
        key: "id",
        formatter: (v) => colors.code(shortId(String(v))),
      },
      {
        header: "Dir",
        key: "direction",
        formatter: (v) => formatDirection(String(v)),
      },
      {
        header: "Status",
        key: "status",
        formatter: (v) => formatCallStatus(String(v)),
      },
      {
        header: "From",
        key: "from",
        formatter: (v) => (v ? String(v) : colors.dim("-")),
      },
      {
        header: "To",
        key: "to",
        formatter: (v) => (v ? String(v) : colors.dim("-")),
      },
      {
        header: "Duration",
        key: "durationSecs",
        formatter: (v) => formatDuration(Number(v)),
      },
      {
        header: "Credits",
        key: "creditsCharged",
        formatter: (v) => String(v ?? 0),
      },
      {
        header: "Started",
        key: "startedAt",
        formatter: (v) => formatStartedAt(v ? String(v) : null),
      },
    ]);

    if (response.pagination?.hasMore) {
      console.log();
      console.log(
        colors.dim(
          `More calls: ${colors.code(
            nextPageCommand(flags, flags.offset + calls.length),
          )}`,
        ),
      );
    }
  }
}
