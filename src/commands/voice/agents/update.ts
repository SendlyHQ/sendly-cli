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
  VOICE_AGENT_KINDS,
  buildAgentBody,
  formatAgentKind,
  formatTexting,
  parseConnectionFlag,
  printSigningSecret,
  reportVoiceError,
  voiceAgentPath,
  type VoiceAgent,
} from "../../../lib/voice.js";

export default class VoiceAgentsUpdate extends AuthenticatedCommand {
  static description =
    "Change an AI agent. Only the flags you pass change, and the next call it answers or places uses them. --kind and --connection switch it to or between your own agents; switching a sendly agent to one, or --rotate-signing-secret, prints a new signing secret once (switching between your own kinds keeps the secret). With no flags it saves the agent as it is, which issues a new sending key if the old one was revoked. Needs a live API key with calls:write (owner or admin in a team workspace)";

  static examples = [
    '<%= config.bin %> voice agents update 3c4d5e6f-7081-4293-a4b5-c6d7e8f90a1b --greeting "Thanks for calling Acme, how can I help?"',
    "<%= config.bin %> voice agents update 3c4d5e6f-7081-4293-a4b5-c6d7e8f90a1b --voice edward --no-sms",
    "<%= config.bin %> voice agents update 3c4d5e6f-7081-4293-a4b5-c6d7e8f90a1b --disable",
    "<%= config.bin %> voice agents update 3c4d5e6f-7081-4293-a4b5-c6d7e8f90a1b --enable --json",
    "<%= config.bin %> voice agents update 3c4d5e6f-7081-4293-a4b5-c6d7e8f90a1b --transfer-to +15125550100",
    '<%= config.bin %> voice agents update 3c4d5e6f-7081-4293-a4b5-c6d7e8f90a1b --transfer-to ""',
    '<%= config.bin %> voice agents update 3c4d5e6f-7081-4293-a4b5-c6d7e8f90a1b --kind websocket --connection \'{"url":"wss://agent.example.com/calls","authToken":"example-token"}\'',
    '<%= config.bin %> voice agents update 3c4d5e6f-7081-4293-a4b5-c6d7e8f90a1b --connection \'{"apiKey":null}\'',
    "<%= config.bin %> voice agents update 3c4d5e6f-7081-4293-a4b5-c6d7e8f90a1b --rotate-signing-secret",
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
        "Switch who writes the replies: sendly, custom_llm, sip or websocket. Switching to one of your own needs --connection; a sendly agent gets a signing secret, and switching between your own kinds keeps the one it has; switching to sendly removes the connection and the secret",
      options: [...VOICE_AGENT_KINDS],
    }),
    connection: Flags.string({
      description:
        'How Sendly reaches your own agent, as a JSON object (or @file to read it from a file). custom_llm: {"baseUrl":"https://...","model":"...","apiKey":"...","headers":{...}}. sip: {"uri":"sip:+15125550100@sip.example.com","transport":"auto|udp|tcp|tls","mediaEncryption":"disable|allow|require","username":"...","password":"...","headers":{"X-...":"..."}}. websocket: {"url":"wss://...","audioFormat":"pcm16_16000|pcm16_24000|pcm16_8000|mulaw_8000","authToken":"...","customParameters":{...}}. With the same --kind it is merged into the saved connection: a key you leave out keeps its value, and null removes a secret (apiKey, headers, password, authToken)',
    }),
    "rotate-signing-secret": Flags.boolean({
      description:
        "Make a new signing secret for your own agent and print it once. The old one stops working at once",
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

    let connection: Record<string, unknown> | undefined;
    if (flags.connection !== undefined) {
      const parsed = parseConnectionFlag(flags.connection);
      if (typeof parsed === "string") {
        error(parsed, {
          hint: "See `sendly voice agents update --help` for the fields each --kind takes",
        });
        this.exit(1);
      }
      connection = parsed as Record<string, unknown>;
    }

    const body = buildAgentBody({ ...flags, connection });

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
  }
}
