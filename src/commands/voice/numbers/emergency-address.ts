import { Args, Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../../lib/base-command.js";
import { apiClient } from "../../../lib/api-client.js";
import {
  success,
  error,
  spinner,
  colors,
  json,
  isJsonMode,
} from "../../../lib/output.js";
import {
  NUMBER_ROLE_HINT,
  buildEmergencyAddressBody,
  formatAddress,
  formatEmergencyStatus,
  reportVoiceError,
  voiceNumberEmergencyAddressPath,
  type VoiceNumber,
} from "../../../lib/voice.js";

export default class VoiceNumbersEmergencyAddress extends AuthenticatedCommand {
  static description =
    "Register the emergency address for a US or Canadian number: where emergency services are sent when someone dials 911 from it. A number needs one before it can place calls. It adds $1.50 a month to the number the first time; registering again replaces the address at no extra cost. Needs a live API key with calls:write (owner or admin in a team workspace)";

  static examples = [
    '<%= config.bin %> voice numbers emergency-address +15555550188 --street "500 Example Ave" --unit "Suite 2" --city Austin --state TX --zip 78701',
    '<%= config.bin %> voice numbers emergency-address +15555550199 --street "100 Sample St" --city Toronto --state ON --zip "M5V 2T6" --country CA',
  ];

  static args = {
    number: Args.string({
      description: "Number id, or the phone number in E.164 (+15555550188)",
      required: true,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    street: Flags.string({
      description: "Street address, e.g. 500 Example Ave",
      required: true,
    }),
    unit: Flags.string({
      description: "Suite, floor or apartment",
    }),
    city: Flags.string({
      description: "City",
      required: true,
    }),
    state: Flags.string({
      description: "Two-letter state or province code, e.g. TX or ON",
      required: true,
    }),
    zip: Flags.string({
      description: "Five-digit ZIP code, or a Canadian postal code like A1A 1A1",
      required: true,
    }),
    country: Flags.string({
      description: "US or CA (default US)",
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(VoiceNumbersEmergencyAddress);

    const ref = args.number.trim();
    if (!ref) {
      error("Pass a number id or an E.164 phone number, e.g. +15555550188");
      this.exit(1);
    }

    const body = buildEmergencyAddressBody(flags);
    if (typeof body === "string") {
      error(body);
      this.exit(1);
    }

    const registerSpinner = spinner("Registering emergency address...");
    if (!isJsonMode()) {
      registerSpinner.start();
    }

    let number: VoiceNumber;
    try {
      number = await apiClient.post<VoiceNumber>(
        voiceNumberEmergencyAddressPath(ref),
        body,
      );
      registerSpinner.stop();
    } catch (err) {
      registerSpinner.stop();
      if (
        reportVoiceError(err, {
          number: ref,
          address: body,
          forbiddenHint: NUMBER_ROLE_HINT,
        })
      ) {
        this.exit(1);
      }
      throw err;
    }

    if (isJsonMode()) {
      json(number);
      return;
    }

    success("Emergency address registered", {
      Number: colors.code(number.phoneNumber),
      Status: formatEmergencyStatus(number.emergencyAddress),
      Address: formatAddress(number.emergencyAddress?.address),
    });

    if (number.emergencyAddress?.status === "provisioning") {
      console.log();
      console.log(
        colors.dim(
          `It becomes active shortly. Check with ${colors.code(`sendly voice numbers get ${number.phoneNumber}`)}.`,
        ),
      );
    }
  }
}
