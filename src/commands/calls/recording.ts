import { Args } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import {
  info,
  spinner,
  colors,
  json,
  keyValue,
  isJsonMode,
} from "../../lib/output.js";
import {
  callRecordingPath,
  formatRecordingStatus,
  reportCallsError,
  type CallRecording,
} from "../../lib/calls.js";

export default class CallsRecording extends AuthenticatedCommand {
  static description =
    "Get the recording of a call: its status and, when ready, a download URL that is valid for 5 minutes";

  static examples = [
    "<%= config.bin %> calls recording 6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f",
    "<%= config.bin %> calls recording 6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f --json",
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
    const { args } = await this.parse(CallsRecording);

    const loadSpinner = spinner("Fetching recording...");
    if (!isJsonMode()) {
      loadSpinner.start();
    }

    let recording: CallRecording;
    try {
      recording = await apiClient.get<CallRecording>(
        callRecordingPath(args.id),
      );
      loadSpinner.stop();
    } catch (err) {
      loadSpinner.stop();
      if (reportCallsError(err)) this.exit(1);
      throw err;
    }

    if (isJsonMode()) {
      json(recording);
      return;
    }

    switch (recording.status) {
      case "none":
        info("This call has no recording (recording was off, or the call was never answered)");
        return;
      case "recording":
        info("The call is still being recorded. Run this again once it has ended.");
        return;
      case "failed":
        info("The recording for this call failed and cannot be downloaded.");
        return;
      default:
        break;
    }

    console.log();
    keyValue([
      ["Call", recording.callId],
      ["Status", formatRecordingStatus(recording.status)],
      ["Format", recording.contentType ?? colors.dim("-")],
      ["URL", recording.url ? colors.code(recording.url) : colors.dim("-")],
      [
        "Expires",
        recording.expiresAt
          ? new Date(recording.expiresAt).toLocaleString()
          : colors.dim("-"),
      ],
    ]);
    console.log();
    console.log(
      colors.dim(
        "The URL is signed and stops working after 5 minutes; run this command again for a fresh one.",
      ),
    );
  }
}
