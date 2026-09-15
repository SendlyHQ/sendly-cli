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
import {
  describeAnswering,
  emergencyAddressCommand,
  formatAddress,
  formatEmergencyStatus,
  needsEmergencyAddress,
  reportVoiceError,
  voiceNumberPath,
  type VoiceNumber,
} from "../../../lib/voice.js";

export default class VoiceNumbersGet extends AuthenticatedCommand {
  static description =
    "Show a number's voice settings: whether voice is on, who answers, its emergency address and what calls on it cost";

  static examples = [
    "<%= config.bin %> voice numbers get +15555550188",
    "<%= config.bin %> voice numbers get 5f0c1c2e-2a44-4d4b-9d51-0a9b0f6f4a11 --json",
  ];

  static args = {
    number: Args.string({
      description: "Number id, or the phone number in E.164 (+15555550188)",
      required: true,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
  };

  async run(): Promise<void> {
    const { args } = await this.parse(VoiceNumbersGet);

    const ref = args.number.trim();
    if (!ref) {
      error("Pass a number id or an E.164 phone number, e.g. +15555550188");
      this.exit(1);
    }

    const loadSpinner = spinner("Fetching number...");
    if (!isJsonMode()) {
      loadSpinner.start();
    }

    let number: VoiceNumber;
    try {
      number = await apiClient.get<VoiceNumber>(voiceNumberPath(ref));
      loadSpinner.stop();
    } catch (err) {
      loadSpinner.stop();
      if (reportVoiceError(err, { number: ref })) this.exit(1);
      throw err;
    }

    if (isJsonMode()) {
      json(number);
      return;
    }

    const rates = number.ratePerMinute;
    console.log();
    console.log(colors.bold(`Voice settings for ${number.phoneNumber}`));
    console.log();
    keyValue([
      ["ID", number.id],
      ["Number", colors.code(number.phoneNumber)],
      ["Type", number.phoneNumberType ?? colors.dim("-")],
      ["Country", number.countryCode ?? colors.dim("-")],
      ["Default", number.isDefault ? "yes" : "no"],
      ["Voice", number.voiceEnabled ? colors.success("on") : colors.dim("off")],
      ["Answered by", describeAnswering(number)],
      ["Emergency address", formatEmergencyStatus(number.emergencyAddress)],
      ["Address", formatAddress(number.emergencyAddress?.address)],
      ["Inbound", `${rates?.inbound ?? "-"} credits a minute`],
      ["Outbound", `${rates?.outbound ?? "-"} credits a minute`],
      ["Answered by an agent", `${rates?.agent ?? "-"} credits a minute`],
    ]);

    const nextSteps: string[] = [];
    if (!number.voiceEnabled) {
      nextSteps.push(
        `Switch voice on: ${colors.code(`sendly voice numbers update ${number.phoneNumber} --enable`)}`,
      );
    }
    if (needsEmergencyAddress(number)) {
      nextSteps.push(
        `Register an emergency address before placing calls: ${colors.code(
          emergencyAddressCommand(number.phoneNumber, {
            street: "...",
            city: "...",
            state: "...",
            zip: "...",
          }),
        )}`,
      );
    }
    if (nextSteps.length > 0) {
      console.log();
      for (const step of nextSteps) {
        console.log(colors.dim(step));
      }
    }
  }
}
