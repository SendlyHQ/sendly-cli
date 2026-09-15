import { Args, Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../../lib/base-command.js";
import { apiClient } from "../../../lib/api-client.js";
import {
  success,
  error,
  warn,
  spinner,
  colors,
  json,
  isJsonMode,
} from "../../../lib/output.js";
import {
  AGENT_ROLE_HINT,
  buildAgentBody,
  formatTexting,
  reportVoiceError,
  voiceAgentPath,
  type VoiceAgent,
} from "../../../lib/voice.js";

export default class VoiceAgentsUpdate extends AuthenticatedCommand {
  static description =
    "Change an AI agent. Only the flags you pass change, and the next call it answers or places uses them. With no flags it saves the agent as it is, which issues a new sending key if the old one was revoked. Needs a live API key with calls:write (owner or admin in a team workspace)";

  static examples = [
    '<%= config.bin %> voice agents update 3c4d5e6f-7081-4293-a4b5-c6d7e8f90a1b --greeting "Thanks for calling Acme, how can I help?"',
    "<%= config.bin %> voice agents update 3c4d5e6f-7081-4293-a4b5-c6d7e8f90a1b --voice edward --no-sms",
    "<%= config.bin %> voice agents update 3c4d5e6f-7081-4293-a4b5-c6d7e8f90a1b --disable",
    "<%= config.bin %> voice agents update 3c4d5e6f-7081-4293-a4b5-c6d7e8f90a1b --enable --json",
  ];

  static args = {
    id: Args.string({
      description: "Agent ID",
      required: true,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    name: Flags.string({
      description: "New name, up to 80 characters",
    }),
    voice: Flags.string({
      description:
        "Voice id from `sendly voice voices` (an unknown id uses the default voice)",
    }),
    language: Flags.string({
      description: "Language tag, e.g. en-US or es-MX",
    }),
    greeting: Flags.string({
      description:
        'What the agent says when it answers, up to 500 characters ("" clears it)',
    }),
    instructions: Flags.string({
      description:
        'What the agent should do and know on calls, up to 4000 characters ("" clears them)',
    }),
    sms: Flags.boolean({
      description: "Let the agent text the caller during a call (--no-sms turns it off)",
      allowNo: true,
    }),
    enable: Flags.boolean({
      description: "Switch the agent on",
      exclusive: ["disable"],
    }),
    disable: Flags.boolean({
      description: "Switch the agent off",
      aliases: ["disabled"],
      exclusive: ["enable"],
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(VoiceAgentsUpdate);

    const id = args.id.trim();
    if (!id) {
      error("Pass an agent id", {
        hint: "List your agents with `sendly voice agents list`",
      });
      this.exit(1);
    }
    if (flags.name !== undefined && !flags.name.trim()) {
      error("--name cannot be empty");
      this.exit(1);
    }

    const body = buildAgentBody(flags);

    const saveSpinner = spinner("Saving agent...");
    if (!isJsonMode()) {
      saveSpinner.start();
    }

    let agent: VoiceAgent;
    try {
      agent = await apiClient.patch<VoiceAgent>(voiceAgentPath(id), body);
      saveSpinner.stop();
    } catch (err) {
      saveSpinner.stop();
      if (
        reportVoiceError(err, { agentId: id, forbiddenHint: AGENT_ROLE_HINT })
      ) {
        this.exit(1);
      }
      throw err;
    }

    if (isJsonMode()) {
      json(agent);
      return;
    }

    success("Agent saved", {
      id: colors.code(agent.id),
      Name: agent.name,
      Status: agent.enabled ? colors.success("on") : colors.dim("off"),
      Voice: agent.voiceLabel,
      Texting: formatTexting(agent),
    });

    const requestedVoice = flags.voice?.trim();
    if (requestedVoice && requestedVoice !== agent.voice) {
      warn(
        `There is no voice "${requestedVoice}", so the agent uses ${agent.voiceLabel}. See ${colors.code("sendly voice voices")}.`,
      );
    }
  }
}
