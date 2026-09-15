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
import {
  VOICE_NUMBERS_PATH,
  formatEmergencyStatus,
  formatRates,
  formatVoiceMode,
  reportVoiceError,
  type VoiceListResponse,
  type VoiceNumber,
  type VoiceNumberEmergencyAddress,
  type VoiceNumberRates,
} from "../../../lib/voice.js";

export default class VoiceNumbersList extends AuthenticatedCommand {
  static description =
    "List the active numbers in your workspace with their voice settings: whether voice is on, who answers, the emergency address and the per-minute rates";

  static examples = [
    "<%= config.bin %> voice numbers list",
    "<%= config.bin %> voice numbers list --json",
  ];

  static flags = {
    ...AuthenticatedCommand.baseFlags,
  };

  async run(): Promise<void> {
    await this.parse(VoiceNumbersList);

    const loadSpinner = spinner("Fetching voice numbers...");
    if (!isJsonMode()) {
      loadSpinner.start();
    }

    let response: VoiceListResponse<VoiceNumber>;
    try {
      response = await apiClient.get<VoiceListResponse<VoiceNumber>>(
        VOICE_NUMBERS_PATH,
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

    const numbers = response.data ?? [];
    if (numbers.length === 0) {
      info("No active numbers in this workspace");
      console.log(
        colors.dim(`Buy one with ${colors.code("sendly numbers buy")}.`),
      );
      return;
    }

    console.log();
    table(numbers, [
      {
        header: "Number",
        key: "phoneNumber",
        formatter: (v, row) =>
          row?.isDefault
            ? `${colors.code(String(v))} ${colors.dim("(default)")}`
            : colors.code(String(v)),
      },
      {
        header: "Type",
        key: "phoneNumberType",
        formatter: (v) => (v ? String(v) : colors.dim("-")),
      },
      {
        header: "Voice",
        key: "voiceMode",
        formatter: (v, row) =>
          formatVoiceMode(String(v), row?.voiceEnabled === true),
      },
      {
        header: "Agent",
        key: "agentId",
        formatter: (v, row) =>
          row?.voiceEnabled && row?.voiceMode === "agent" && v
            ? colors.code(String(v))
            : colors.dim("-"),
      },
      {
        header: "Emergency address",
        key: "emergencyAddress",
        formatter: (v) =>
          formatEmergencyStatus(v as VoiceNumberEmergencyAddress | null),
      },
      {
        header: "Credits/min in / out / agent",
        key: "ratePerMinute",
        formatter: (v) => formatRates(v as VoiceNumberRates | null),
      },
    ]);
    console.log();
    console.log(
      colors.dim(
        `Details: ${colors.code("sendly voice numbers get <number>")}. Change one: ${colors.code("sendly voice numbers update <number> --mode ring_dashboard")}.`,
      ),
    );
  }
}
