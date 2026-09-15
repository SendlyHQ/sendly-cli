import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import {
  table,
  json,
  info,
  colors,
  spinner,
  isJsonMode,
} from "../../lib/output.js";
import {
  VOICE_VOICES_PATH,
  reportVoiceError,
  type Voice,
  type VoiceListResponse,
} from "../../lib/voice.js";

export default class VoiceVoices extends AuthenticatedCommand {
  static description = "List the voices an AI agent can speak with";

  static examples = [
    "<%= config.bin %> voice voices",
    "<%= config.bin %> voice voices --json",
  ];

  static flags = {
    ...AuthenticatedCommand.baseFlags,
  };

  async run(): Promise<void> {
    await this.parse(VoiceVoices);

    const loadSpinner = spinner("Fetching voices...");
    if (!isJsonMode()) {
      loadSpinner.start();
    }

    let response: VoiceListResponse<Voice>;
    try {
      response = await apiClient.get<VoiceListResponse<Voice>>(VOICE_VOICES_PATH);
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

    const voices = response.data ?? [];
    if (voices.length === 0) {
      info("No voices available");
      return;
    }

    console.log();
    table(voices, [
      {
        header: "ID",
        key: "id",
        formatter: (v) => colors.code(String(v)),
      },
      {
        header: "Voice",
        key: "label",
      },
      {
        header: "Language",
        key: "language",
      },
    ]);
    console.log();
    console.log(
      colors.dim(
        `Use one with ${colors.code('sendly voice agents create --name "Front desk" --voice <id>')}.`,
      ),
    );
  }
}
