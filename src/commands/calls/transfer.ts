import { Args, Flags } from "@oclif/core";
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
  callTransferPath,
  formatCallStatus,
  formatCallTransfer,
  reportCallsError,
  type Call,
} from "../../lib/calls.js";

export default class CallsTransfer extends AuthenticatedCommand {
  static description =
    "Transfer an incoming phone call in progress to another number, whatever kind of agent is on it. Without --to it goes to the agent's transfer number. The transfer starts in the background: follow it with `sendly calls get`, and once the caller is handed over the call ends completed with hangup class transferred. A failed transfer leaves the caller on the call. Needs a live API key with calls:write";

  static examples = [
    "<%= config.bin %> calls transfer 6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f",
    "<%= config.bin %> calls transfer 6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f --to +15125550100",
    "<%= config.bin %> calls transfer 6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f --to +15125550100 --json",
  ];

  static args = {
    id: Args.string({
      description: "Call ID",
      required: true,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    to: Flags.string({
      description:
        "US or Canadian number in E.164 format to hand the caller to (default: the agent's transfer number). A number other than the agent's needs calling out switched on for the workspace",
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(CallsTransfer);

    const body: { to?: string } = {};
    const to = flags.to?.trim();
    if (to) body.to = to;

    const transferSpinner = spinner("Starting transfer...");
    if (!isJsonMode()) {
      transferSpinner.start();
    }

    let call: Call;
    try {
      call = await apiClient.post<Call>(callTransferPath(args.id), body);
      transferSpinner.stop();
    } catch (err) {
      transferSpinner.stop();
      if (reportCallsError(err, { callId: args.id })) this.exit(1);
      throw err;
    }

    if (isJsonMode()) {
      json(call);
      return;
    }

    success("Transfer started", {
      id: colors.code(call.id),
      Status: formatCallStatus(call.status),
      Transfer: formatCallTransfer(call.transfer),
    });

    console.log();
    console.log(
      colors.dim(
        `Follow it with ${colors.code(`sendly calls get ${call.id}`)}`,
      ),
    );
  }
}
