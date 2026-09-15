import { Flags } from "@oclif/core";
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
  VOICE_AGENTS_PATH,
  buildAgentBody,
  formatTexting,
  reportVoiceError,
  type VoiceAgent,
} from "../../../lib/voice.js";

export default class VoiceAgentsCreate extends AuthenticatedCommand {
  static description =
    "Create an AI agent that talks on phone calls. It answers real callers on the numbers you point at it and handles the calls you place with `sendly calls create`. Up to 20 agents per workspace. Needs a live API key with calls:write (owner or admin in a team workspace)";

  static examples = [
    '<%= config.bin %> voice agents create --name "Front desk"',
    '<%= config.bin %> voice agents create --name "Front desk" --voice olivia --greeting "Thanks for calling Acme, how can I help?" --instructions "Answer questions about opening hours and take messages."',
    '<%= config.bin %> voice agents create --name "After hours" --no-sms --disabled --json',
  ];

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    name: Flags.string({
      description: "Name of the agent, up to 80 characters",
      required: true,
    }),
    voice: Flags.string({
      description:
        "Voice id from `sendly voice voices` (an unknown id uses the default voice)",
    }),
    language: Flags.string({
      description: "Language tag, e.g. en-US or es-MX (default en-US)",
    }),
    greeting: Flags.string({
      description: "What the agent says when it answers, up to 500 characters",
    }),
    instructions: Flags.string({
      description:
        "What the agent should do and know on calls, up to 4000 characters",
    }),
    sms: Flags.boolean({
      description:
        "Let the agent text the caller during a call (on unless you pass --no-sms)",
      allowNo: true,
    }),
    disabled: Flags.boolean({
      description: "Create the agent switched off",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(VoiceAgentsCreate);

    if (!flags.name.trim()) {
      error("--name cannot be empty", {
        hint: 'Give the agent a name, e.g. --name "Front desk"',
      });
      this.exit(1);
    }

    const body = buildAgentBody({
      name: flags.name,
      disable: flags.disabled,
      voice: flags.voice,
      language: flags.language,
      greeting: flags.greeting,
      instructions: flags.instructions,
      sms: flags.sms,
    });

    const createSpinner = spinner("Creating agent...");
    if (!isJsonMode()) {
      createSpinner.start();
    }

    let agent: VoiceAgent;
    try {
      agent = await apiClient.post<VoiceAgent>(VOICE_AGENTS_PATH, body);
      createSpinner.stop();
    } catch (err) {
      createSpinner.stop();
      if (reportVoiceError(err, { forbiddenHint: AGENT_ROLE_HINT })) {
        this.exit(1);
      }
      throw err;
    }

    if (isJsonMode()) {
      json(agent);
      return;
    }

    success("Agent created", {
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

    console.log();
    console.log(
      colors.dim(
        `Have it answer a number: ${colors.code(`sendly voice numbers update <number> --mode agent --agent ${agent.id}`)}`,
      ),
    );
    console.log(
      colors.dim(
        `Or place a call with it: ${colors.code(`sendly calls create --to +15125550123 --agent ${agent.id}`)}`,
      ),
    );
  }
}
