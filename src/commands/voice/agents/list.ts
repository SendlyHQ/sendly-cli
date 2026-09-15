import { AuthenticatedCommand } from "../../../lib/base-command.js";
import { apiClient } from "../../../lib/api-client.js";
import {
  table,
  json,
  info,
  colors,
  spinner,
  isJsonMode,
} from "../../../lib/output.js";
import { formatDuration } from "../../../lib/calls.js";
import {
  VOICE_AGENTS_PATH,
  formatTexting,
  reportVoiceError,
  type VoiceAgent,
  type VoiceListResponse,
} from "../../../lib/voice.js";

export default class VoiceAgentsList extends AuthenticatedCommand {
  static description =
    "List the AI agents in your workspace with their voice, texting, and how many calls they have handled";

  static examples = [
    "<%= config.bin %> voice agents list",
    "<%= config.bin %> voice agents list --json",
  ];

  static flags = {
    ...AuthenticatedCommand.baseFlags,
  };

  async run(): Promise<void> {
    await this.parse(VoiceAgentsList);

    const loadSpinner = spinner("Fetching agents...");
    if (!isJsonMode()) {
      loadSpinner.start();
    }

    let response: VoiceListResponse<VoiceAgent>;
    try {
      response = await apiClient.get<VoiceListResponse<VoiceAgent>>(
        VOICE_AGENTS_PATH,
      );
      loadSpinner.stop();
    } catch (err) {
      loadSpinner.stop();
      if (reportVoiceError(err)) this.exit(1);
      throw err;
    }

    if (isJsonMode()) {
      json(response);
      return;
    }

    const agents = response.data ?? [];
    if (agents.length === 0) {
      info("No agents yet");
      console.log(
        colors.dim(
          `Create one with ${colors.code('sendly voice agents create --name "Front desk"')}.`,
        ),
      );
      return;
    }

    console.log();
    table(agents, [
      {
        header: "ID",
        key: "id",
        formatter: (v) => colors.code(String(v)),
      },
      {
        header: "Name",
        key: "name",
      },
      {
        header: "Status",
        key: "enabled",
        formatter: (v) => (v ? colors.success("on") : colors.dim("off")),
      },
      {
        header: "Voice",
        key: "voiceLabel",
      },
      {
        header: "Language",
        key: "language",
      },
      {
        header: "Texting",
        key: "tools",
        formatter: (_v, row) => formatTexting(row as VoiceAgent),
      },
      {
        header: "Calls",
        key: "callsHandled",
        formatter: (v) => String(v ?? 0),
      },
      {
        header: "Avg call",
        key: "avgDurationSecs",
        formatter: (v) => formatDuration(Number(v)),
      },
    ]);
  }
}
