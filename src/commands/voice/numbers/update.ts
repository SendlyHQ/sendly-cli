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
  VOICE_MODES,
  buildNumberUpdateBody,
  describeAnswering,
  needsEmergencyAddress,
  reportVoiceError,
  voiceNumberPath,
  type VoiceNumber,
} from "../../../lib/voice.js";

export default class VoiceNumbersUpdate extends AuthenticatedCommand {
  static description =
    "Change how a number answers phone calls: switch voice on or off, ring your team in the dashboard, or have an AI agent answer. Real callers get the new behaviour straight away. Needs a live API key with calls:write (owner or admin in a team workspace)";

  static examples = [
    "<%= config.bin %> voice numbers update +15555550188 --enable",
    "<%= config.bin %> voice numbers update +15555550188 --mode agent --agent 3c4d5e6f-7081-4293-a4b5-c6d7e8f90a1b",
    "<%= config.bin %> voice numbers update +15555550188 --mode ring_dashboard",
    "<%= config.bin %> voice numbers update 5f0c1c2e-2a44-4d4b-9d51-0a9b0f6f4a11 --disable --json",
  ];

  static args = {
    number: Args.string({
      description: "Number id, or the phone number in E.164 (+15555550188)",
      required: true,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    enable: Flags.boolean({
      description:
        "Switch voice on for this number (it rings your team unless you pass --mode agent)",
      exclusive: ["disable"],
    }),
    disable: Flags.boolean({
      description: "Switch voice off for this number, whatever --mode says",
      exclusive: ["enable"],
    }),
    mode: Flags.string({
      description:
        "Who answers: none (voice off; with --enable it rings your team), ring_dashboard (your team in the dashboard) or agent (an AI agent). ring_dashboard and agent switch voice on without --enable",
      options: [...VOICE_MODES],
    }),
    agent: Flags.string({
      description:
        "Id of the AI agent that answers when the mode is agent (see `sendly voice agents list`)",
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(VoiceNumbersUpdate);

    const ref = args.number.trim();
    if (!ref) {
      error("Pass a number id or an E.164 phone number, e.g. +15555550188");
      this.exit(1);
    }

    const body = buildNumberUpdateBody(flags);
    if (Object.keys(body).length === 0) {
      error("Nothing to update", {
        hint: "Pass --enable, --disable, --mode or --agent",
      });
      this.exit(1);
    }

    const saveSpinner = spinner("Saving voice settings...");
    if (!isJsonMode()) {
      saveSpinner.start();
    }

    let number: VoiceNumber;
    try {
      number = await apiClient.patch<VoiceNumber>(voiceNumberPath(ref), body);
      saveSpinner.stop();
    } catch (err) {
      saveSpinner.stop();
      if (
        reportVoiceError(err, {
          number: ref,
          agentId: flags.agent?.trim() || undefined,
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

    success("Voice settings saved", {
      Number: colors.code(number.phoneNumber),
      Voice: number.voiceEnabled ? colors.success("on") : colors.dim("off"),
      "Answered by": describeAnswering(number),
    });

    if (number.voiceEnabled && needsEmergencyAddress(number)) {
      console.log();
      console.log(
        colors.dim(
          `Before this number can place calls, register its emergency address: ${colors.code(`sendly voice numbers emergency-address ${number.phoneNumber} --street ... --city ... --state ... --zip ...`)}`,
        ),
      );
    }
  }
}
