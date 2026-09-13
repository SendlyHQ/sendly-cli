import { Args } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import {
  success,
  spinner,
  colors,
  json,
  isJsonMode,
} from "../../lib/output.js";
import {
  callHangupPath,
  formatCallStatus,
  formatDuration,
  formatHangupClass,
  reportCallsError,
  type Call,
} from "../../lib/calls.js";

export default class CallsHangup extends AuthenticatedCommand {
  static description =
    "End a call. A ringing call is cancelled, an active call is completed; a call that has already ended is returned unchanged";

  static examples = [
    "<%= config.bin %> calls hangup 6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f",
    "<%= config.bin %> calls hangup 6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f --json",
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
    const { args } = await this.parse(CallsHangup);

    const hangupSpinner = spinner("Ending call...");
    if (!isJsonMode()) {
      hangupSpinner.start();
    }

    let call: Call;
    try {
      call = await apiClient.post<Call>(callHangupPath(args.id), {});
      hangupSpinner.stop();
    } catch (err) {
      hangupSpinner.stop();
      if (reportCallsError(err)) this.exit(1);
      throw err;
    }

    if (isJsonMode()) {
      json(call);
      return;
    }

    success(call.status === "cancelled" ? "Call cancelled" : "Call ended", {
      id: colors.code(call.id),
      Status: formatCallStatus(call.status),
      "Hangup class": formatHangupClass(call.hangupClass),
      Duration: formatDuration(call.durationSecs),
      Credits: String(call.creditsCharged ?? 0),
    });
  }
}
