import { Args } from "@oclif/core";
import { AuthenticatedCommand } from "../../../lib/base-command.js";
import { apiClient } from "../../../lib/api-client.js";
import {
  json,
  error,
  colors,
  spinner,
  keyValue,
  isJsonMode,
} from "../../../lib/output.js";
import { formatDuration } from "../../../lib/calls.js";
import {
  formatTexting,
  reportVoiceError,
  voiceAgentPath,
  type VoiceAgent,
} from "../../../lib/voice.js";

function when(value: string | null): string {
  return value ? new Date(value).toLocaleString() : colors.dim("-");
}

export default class VoiceAgentsGet extends AuthenticatedCommand {
  static description =
    "Show an AI agent: its voice, language, greeting, instructions, texting, and the calls it has handled";

  static examples = [
    "<%= config.bin %> voice agents get 3c4d5e6f-7081-4293-a4b5-c6d7e8f90a1b",
    "<%= config.bin %> voice agents get 3c4d5e6f-7081-4293-a4b5-c6d7e8f90a1b --json",
  ];

  static args = {
    id: Args.string({
      description: "Agent ID",
      required: true,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
  };

  async run(): Promise<void> {
    const { args } = await this.parse(VoiceAgentsGet);

    const id = args.id.trim();
    if (!id) {
      error("Pass an agent id", {
        hint: "List your agents with `sendly voice agents list`",
      });
      this.exit(1);
    }

    const loadSpinner = spinner("Fetching agent...");
    if (!isJsonMode()) {
      loadSpinner.start();
    }

    let agent: VoiceAgent;
    try {
      agent = await apiClient.get<VoiceAgent>(voiceAgentPath(id));
      loadSpinner.stop();
    } catch (err) {
      loadSpinner.stop();
      if (reportVoiceError(err, { agentId: id })) this.exit(1);
      throw err;
    }

    if (isJsonMode()) {
      json(agent);
      return;
    }

    const rows: Array<[string, string]> = [
      ["ID", agent.id],
      ["Status", agent.enabled ? colors.success("on") : colors.dim("off")],
      ["Voice", `${agent.voiceLabel} ${colors.dim(`(${agent.voice})`)}`],
      ["Language", agent.language],
      ["Texting", formatTexting(agent)],
    ];
    if (agent.tools?.transferTo) {
      rows.push([
        "Transfer number",
        `${agent.tools.transferTo} ${colors.dim("(calls are not transferred yet; the agent takes a message instead)")}`,
      ]);
    }
    rows.push(
      ["Calls handled", String(agent.callsHandled ?? 0)],
      ["Average call", formatDuration(agent.avgDurationSecs)],
      ["Created", when(agent.createdAt)],
      ["Updated", when(agent.updatedAt)],
    );

    console.log();
    console.log(colors.bold(agent.name));
    console.log();
    keyValue(rows);

    console.log();
    console.log(colors.dim("Greeting:"));
    console.log(agent.greeting ? `  ${agent.greeting}` : colors.dim("  none"));
    console.log();
    console.log(colors.dim("Instructions:"));
    if (agent.instructions) {
      for (const line of agent.instructions.split("\n")) {
        console.log(`  ${line}`);
      }
    } else {
      console.log(colors.dim("  none"));
    }

    if (agent.tools?.sendSms && !agent.canSendSms) {
      console.log();
      console.log(
        colors.dim(
          `This agent has no sending key, so it cannot text callers. Issue one with ${colors.code(`sendly voice agents update ${agent.id}`)}.`,
        ),
      );
    }
  }
}
