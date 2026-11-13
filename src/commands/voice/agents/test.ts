import { Args, Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../../lib/base-command.js";
import { ApiError, RateLimitError, apiClient } from "../../../lib/api-client.js";
import {
  error,
  spinner,
  json,
  isJsonMode,
} from "../../../lib/output.js";
import {
  AGENT_ROLE_HINT,
  VOICE_AGENT_TEST_KINDS,
  agentTestLines,
  apiErrorCode,
  buildAgentTestBody,
  parseConnectionFlag,
  reportVoiceError,
  voiceAgentTestPath,
  type VoiceAgentTest,
} from "../../../lib/voice.js";

export default class VoiceAgentsTest extends AuthenticatedCommand {
  static description =
    "Test your own agent's connection the way a call would reach it, without placing one. custom_llm gets a signed, streamed chat completion with a test message; websocket gets a signed connection with a start marked as a test, about half a second of silence and a stop; sip gets an OPTIONS request, answered with the saved credentials if the server asks. Pass --connection (and --kind for another kind) to test settings before saving them; nothing is saved. Prints what happened at each step and exits with 1 when the test fails. A workspace can run 10 tests a minute. Needs a live API key with calls:write (owner or admin in a team workspace)";

  static examples = [
    "<%= config.bin %> voice agents test 3c4d5e6f-7081-4293-a4b5-c6d7e8f90a1b",
    "<%= config.bin %> voice agents test 3c4d5e6f-7081-4293-a4b5-c6d7e8f90a1b --json",
    '<%= config.bin %> voice agents test 3c4d5e6f-7081-4293-a4b5-c6d7e8f90a1b --connection \'{"uri":"sip:+15125550100@sip.example.com","transport":"tls"}\'',
    '<%= config.bin %> voice agents test 3c4d5e6f-7081-4293-a4b5-c6d7e8f90a1b --kind websocket --connection \'{"url":"wss://agent.example.com/calls","authToken":"example-token"}\'',
    '<%= config.bin %> voice agents test 3c4d5e6f-7081-4293-a4b5-c6d7e8f90a1b --instructions "You are the front desk at Acme."',
  ];

  static args = {
    id: Args.string({
      description: "Agent ID",
      required: true,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    kind: Flags.string({
      description:
        "The kind of the settings in --connection: custom_llm, sip or websocket (default: the agent's own kind). Needed to test settings of another kind, such as on a sendly agent before switching it",
      options: [...VOICE_AGENT_TEST_KINDS],
    }),
    connection: Flags.string({
      description:
        'Settings to test instead of the saved ones, as a JSON object (or @file to read it from a file), in the same shape as on `sendly voice agents update`. custom_llm: {"baseUrl":"https://...","model":"...","apiKey":"..."}. sip: {"uri":"sip:+15125550100@sip.example.com","transport":"auto|udp|tcp|tls","username":"...","password":"..."}. websocket: {"url":"wss://...","audioFormat":"pcm16_16000|pcm16_24000|pcm16_8000|mulaw_8000","authToken":"..."}. Nothing is saved. For the agent\'s own kind, a secret you leave out is taken from the saved connection while the host stays the same',
    }),
    instructions: Flags.string({
      description:
        "For custom_llm: the system prompt to send, up to 4000 characters (default: the agent's instructions)",
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(VoiceAgentsTest);

    const id = args.id.trim();
    if (!id) {
      error("Pass an agent id", {
        hint: "List your agents with `sendly voice agents list`",
      });
      this.exit(1);
    }

    let connection: Record<string, unknown> | undefined;
    if (flags.connection !== undefined) {
      const parsed = parseConnectionFlag(flags.connection);
      if (typeof parsed === "string") {
        error(parsed, {
          hint: "See `sendly voice agents test --help` for the fields each --kind takes",
        });
        this.exit(1);
      }
      connection = parsed as Record<string, unknown>;
    }

    const body = buildAgentTestBody({
      kind: flags.kind,
      connection,
      instructions: flags.instructions,
    });

    const testSpinner = spinner("Testing agent...");
    if (!isJsonMode()) {
      testSpinner.start();
    }

    let result: VoiceAgentTest;
    try {
      result = await apiClient.post<VoiceAgentTest>(
        voiceAgentTestPath(id),
        body,
        true,
        { autoIdempotencyKey: false },
      );
      testSpinner.stop();
    } catch (err) {
      testSpinner.stop();
      if (err instanceof RateLimitError && err.code === "rate_limit_exceeded") {
        error(err.message, {
          code: err.code,
          hint: "A workspace can run 10 tests a minute. Wait a minute and try again",
        });
        this.exit(1);
      }
      if (
        err instanceof ApiError &&
        apiErrorCode(err) === "invalid_request" &&
        /^kind\b/.test(err.message)
      ) {
        error(err.message, {
          code: "invalid_request",
          hint: "Pass --kind and --connection to test settings for your own agent",
        });
        this.exit(1);
      }
      if (
        reportVoiceError(err, { agentId: id, forbiddenHint: AGENT_ROLE_HINT })
      ) {
        this.exit(1);
      }
      throw err;
    }

    if (isJsonMode()) {
      json(result);
    } else {
      for (const line of agentTestLines(result)) {
        console.log(line);
      }
    }

    if (!result.ok) {
      this.exit(1);
    }
  }
}
