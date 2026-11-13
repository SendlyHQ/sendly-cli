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
  VOICE_AGENT_KINDS,
  VOICE_AGENTS_PATH,
  buildAgentBody,
  canPlaceCalls,
  formatAgentKind,
  formatTexting,
  parseConnectionFlag,
  printSigningSecret,
  reportVoiceError,
  type VoiceAgent,
} from "../../../lib/voice.js";

export default class VoiceAgentsCreate extends AuthenticatedCommand {
  static description =
    "Create an AI agent that talks on phone calls. It answers real callers on the numbers you point at it and handles the calls you place with `sendly calls create`. With --kind custom_llm, sip or websocket it is your own agent, reached through --connection, and the response prints its signing secret once. Up to 20 agents per workspace. Needs a live API key with calls:write (owner or admin in a team workspace)";

  static examples = [
    '<%= config.bin %> voice agents create --name "Front desk"',
    '<%= config.bin %> voice agents create --name "Front desk" --voice olivia --greeting "Thanks for calling Acme, how can I help?" --instructions "Answer questions about opening hours and take messages."',
    '<%= config.bin %> voice agents create --name "After hours" --no-sms --disabled --json',
    '<%= config.bin %> voice agents create --name "Front desk" --transfer-to +15125550100 --background-audio',
    '<%= config.bin %> voice agents create --name "Own model" --kind custom_llm --connection \'{"baseUrl":"https://llm.example.com/v1","model":"support-v2","apiKey":"sk-example"}\'',
    '<%= config.bin %> voice agents create --name "Desk phones" --kind sip --connection \'{"uri":"sip:+15125550100@sip.example.com","transport":"tls"}\'',
    '<%= config.bin %> voice agents create --name "Stream" --kind websocket --connection @connection.json',
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
    "transfer-to": Flags.string({
      description:
        'A number in E.164 format the agent transfers a phone caller to when they ask for a person, once they confirm ("" turns transfers off)',
    }),
    "background-audio": Flags.boolean({
      description:
        "Play quiet office ambience under the call (--no-background-audio turns it off)",
      allowNo: true,
    }),
    kind: Flags.string({
      description:
        "Who writes the replies: sendly (default, from --instructions), custom_llm (your chat completions endpoint), sip (callers are connected to your SIP address) or websocket (call audio is streamed to your server). Your own kinds need --connection",
      options: [...VOICE_AGENT_KINDS],
    }),
    connection: Flags.string({
      description:
        'How Sendly reaches your own agent, as a JSON object (or @file to read it from a file). custom_llm: {"baseUrl":"https://...","model":"...","apiKey":"...","headers":{...}}. sip: {"uri":"sip:+15125550100@sip.example.com","transport":"auto|udp|tcp|tls","mediaEncryption":"disable|allow|require","username":"...","password":"...","headers":{"X-...":"..."}}. websocket: {"url":"wss://...","audioFormat":"pcm16_16000|pcm16_24000|pcm16_8000|mulaw_8000","authToken":"...","customParameters":{...}}. Secrets (apiKey, header values, password, authToken) are never shown back',
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

    let connection: Record<string, unknown> | undefined;
    if (flags.connection !== undefined) {
      const parsed = parseConnectionFlag(flags.connection);
      if (typeof parsed === "string") {
        error(parsed, {
          hint: "See `sendly voice agents create --help` for the fields each --kind takes",
        });
        this.exit(1);
      }
      connection = parsed as Record<string, unknown>;
    }

    const body = buildAgentBody({
      name: flags.name,
      disable: flags.disabled,
      voice: flags.voice,
      language: flags.language,
      greeting: flags.greeting,
      instructions: flags.instructions,
      sms: flags.sms,
      "transfer-to": flags["transfer-to"],
      "background-audio": flags["background-audio"],
      kind: flags.kind,
      connection,
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
      Kind: formatAgentKind(agent.kind),
      Status: agent.enabled ? colors.success("on") : colors.dim("off"),
      Voice: agent.voiceLabel,
      Texting: formatTexting(agent),
    });

    if (agent.signingSecret) {
      printSigningSecret(agent.signingSecret);
    }

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
    if (canPlaceCalls(agent.kind)) {
      console.log(
        colors.dim(
          `Or place a call with it: ${colors.code(`sendly calls create --to +15125550123 --agent ${agent.id}`)}`,
        ),
      );
    }
  }
}
