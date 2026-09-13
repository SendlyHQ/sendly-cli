import { Args } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import {
  json,
  colors,
  spinner,
  keyValue,
  isJsonMode,
} from "../../lib/output.js";
import {
  callPath,
  formatCallStatus,
  formatDuration,
  formatHangupClass,
  formatRecordingStatus,
  formatTranscriptTime,
  reportCallsError,
  type Call,
} from "../../lib/calls.js";

function when(value: string | null): string {
  return value ? new Date(value).toLocaleString() : colors.dim("-");
}

export default class CallsGet extends AuthenticatedCommand {
  static description =
    "Show a call: status, numbers, duration, credits, hangup reason, recording status and metadata (agent calls include the transcript)";

  static examples = [
    "<%= config.bin %> calls get 6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f",
    "<%= config.bin %> calls get 6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f --json",
  ];

  static args = {
    id: Args.string({
      description: "Call ID",
      required: true,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
  };

  async run(): Promise<void> {
    const { args } = await this.parse(CallsGet);

    const loadSpinner = spinner("Fetching call...");
    if (!isJsonMode()) {
      loadSpinner.start();
    }

    let call: Call;
    try {
      call = await apiClient.get<Call>(callPath(args.id));
      loadSpinner.stop();
    } catch (err) {
      loadSpinner.stop();
      if (reportCallsError(err)) this.exit(1);
      throw err;
    }

    if (isJsonMode()) {
      json(call);
      return;
    }

    console.log();
    console.log(colors.bold(`Call ${call.id}`));
    console.log();
    keyValue([
      ["Status", formatCallStatus(call.status)],
      ["Direction", call.direction],
      ["Kind", call.kind],
      ["Handled by", call.handledBy],
      ["Agent", call.agentId ?? colors.dim("-")],
      ["From", call.from ?? colors.dim("-")],
      ["To", call.to ?? colors.dim("-")],
      ["Caller name", call.callerName ?? colors.dim("-")],
      ["Callee name", call.calleeName ?? colors.dim("-")],
      ["Started", when(call.startedAt)],
      ["Answered", when(call.answeredAt)],
      ["Ended", when(call.endedAt)],
      [
        "Duration",
        call.endedAt
          ? formatDuration(call.durationSecs)
          : call.status === "active"
            ? colors.dim("in progress")
            : colors.dim("-"),
      ],
      ["Credits", String(call.creditsCharged ?? 0)],
      ["Billing", call.billing],
      ["Hangup class", formatHangupClass(call.hangupClass)],
      ["Recording", formatRecordingStatus(call.recordingStatus)],
    ]);

    const metadata = call.metadata ?? {};
    const metadataKeys = Object.keys(metadata);
    console.log();
    console.log(colors.dim("Metadata:"));
    if (metadataKeys.length === 0) {
      console.log(colors.dim("  none"));
    } else {
      keyValue(metadataKeys.map((key) => [key, metadata[key]] as [string, string]));
    }

    if (call.handledBy === "agent" && Array.isArray(call.transcript)) {
      console.log();
      console.log(colors.dim(`Transcript (${call.transcript.length} lines)`));
      if (call.transcript.length === 0) {
        console.log(colors.dim("  nothing was said"));
      } else {
        for (const line of call.transcript) {
          const speaker =
            line.speaker === "agent"
              ? colors.primary("agent ")
              : colors.info("caller");
          console.log(
            `  ${colors.dim(formatTranscriptTime(line.atMs))}  ${speaker}  ${line.text}`,
          );
        }
      }
    }

    if (call.recordingStatus === "ready") {
      console.log();
      console.log(
        colors.dim(
          `Download link: ${colors.code(`sendly calls recording ${call.id}`)}`,
        ),
      );
    }
  }
}
