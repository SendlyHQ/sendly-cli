import { Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import {
  success,
  error,
  spinner,
  colors,
  json,
  isJsonMode,
} from "../../lib/output.js";
import {
  CALLS_PATH,
  formatCallStatus,
  parseMetadataFlags,
  reportCallsError,
  type Call,
} from "../../lib/calls.js";

export default class CallsCreate extends AuthenticatedCommand {
  static description =
    "Place a phone call that one of your AI agents handles. US and Canadian numbers only; needs a live API key with calls:write and a voice-enabled number";

  static examples = [
    "<%= config.bin %> calls create --to +15125550123 --agent 3c4d5e6f-7081-4293-a4b5-c6d7e8f90a1b",
    '<%= config.bin %> calls create --to +15125550123 --agent 3c4d5e6f-7081-4293-a4b5-c6d7e8f90a1b --from +15555550188 --context "Confirm the 3pm appointment on Tuesday"',
    "<%= config.bin %> calls create --to +15125550123 --agent 3c4d5e6f-7081-4293-a4b5-c6d7e8f90a1b --metadata crmId=lead_8812 --metadata source=cli",
  ];

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    to: Flags.string({
      description: "Number to call, E.164 (US or Canada)",
      required: true,
    }),
    agent: Flags.string({
      description: "Id of the AI agent that talks on the call",
      required: true,
    }),
    from: Flags.string({
      description:
        "Voice-enabled number in your workspace to call from (required when you have more than one)",
    }),
    context: Flags.string({
      description:
        "Extra instructions for the agent on this call only, up to 2000 characters",
    }),
    metadata: Flags.string({
      description:
        "key=value attached to the call and echoed in every read and webhook (repeatable, up to 20)",
      multiple: true,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(CallsCreate);

    const to = flags.to.trim();
    const agentId = flags.agent.trim();
    if (!to) {
      error("--to cannot be empty", {
        hint: "Pass the number to call in E.164, e.g. --to +15125550123",
      });
      this.exit(1);
    }
    if (!agentId) {
      error("--agent cannot be empty", {
        hint: "List your agents with `sendly voice agents list`",
      });
      this.exit(1);
    }

    const metadata = parseMetadataFlags(flags.metadata);
    if (typeof metadata === "string") {
      error(metadata);
      this.exit(1);
    }

    const body: Record<string, unknown> = { to, agentId };
    if (flags.from) body.from = flags.from.trim();
    if (flags.context !== undefined) body.context = flags.context;
    if (Object.keys(metadata).length > 0) body.metadata = metadata;

    const dialSpinner = spinner("Placing call...");
    if (!isJsonMode()) {
      dialSpinner.start();
    }

    let call: Call;
    try {
      call = await apiClient.post<Call>(CALLS_PATH, body);
      dialSpinner.stop();
    } catch (err) {
      dialSpinner.stop();
      if (reportCallsError(err)) this.exit(1);
      throw err;
    }

    if (isJsonMode()) {
      json(call);
      return;
    }

    success("Call placed", {
      id: colors.code(call.id),
      Status: formatCallStatus(call.status),
      From: call.from ?? "-",
      To: call.to ?? "-",
      Agent: call.agentId ?? "-",
    });
    console.log();
    console.log(
      colors.dim(
        `Follow it with ${colors.code(`sendly calls get ${call.id}`)}; end it early with ${colors.code(`sendly calls hangup ${call.id}`)}.`,
      ),
    );
  }
}
