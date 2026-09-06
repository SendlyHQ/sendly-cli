import { Args, Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../../../lib/base-command.js";
import { apiClient } from "../../../../lib/api-client.js";
import {
  json,
  success,
  error,
  colors,
  spinner,
  isJsonMode,
} from "../../../../lib/output.js";
import {
  idempotencyKeyFlag,
  parseDeviceFlags,
  printDevices,
  reportRcsError,
  type PublicRcsTestDevice,
} from "../../../../lib/rcs-registration.js";

interface SetDevicesResponse {
  devices: PublicRcsTestDevice[];
}

export default class RcsAgentsDevicesSet extends AuthenticatedCommand {
  static description =
    "Set the test devices invited to an RCS agent — the list you pass replaces the current one (up to 20)";

  static examples = [
    "<%= config.bin %> rcs agents devices set 3f6a1c9e-0000-0000-0000-000000000000 --phone +13125550100 --phone +13125550101",
    '<%= config.bin %> rcs agents devices set 3f6a1c9e-0000-0000-0000-000000000000 --phone "+13125550100=Front desk Pixel"',
    "<%= config.bin %> rcs agents devices set 3f6a1c9e-0000-0000-0000-000000000000 --clear",
  ];

  static args = {
    id: Args.string({
      description: "Agent ID",
      required: true,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    phone: Flags.string({
      char: "p",
      description:
        'Device phone number (E.164), optionally labelled as "+13125550100=Label". Repeatable.',
      multiple: true,
      exclusive: ["clear"],
    }),
    clear: Flags.boolean({
      description: "Remove every invited device",
      default: false,
    }),
    "idempotency-key": idempotencyKeyFlag,
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(RcsAgentsDevicesSet);

    const parsed = parseDeviceFlags(flags.phone);
    if (typeof parsed === "string") {
      error(parsed);
      this.exit(1);
    }
    const devices = parsed as Array<{ phoneNumber: string; label?: string }>;
    if (devices.length === 0 && !flags.clear) {
      error("Provide at least one --phone, or --clear to remove every device", {
        hint: 'Example: --phone +13125550100 --phone "+13125550101=Jane\'s Pixel"',
      });
      this.exit(1);
    }

    const saveSpinner = spinner("Updating test devices...");
    if (!isJsonMode()) {
      saveSpinner.start();
    }

    let response: SetDevicesResponse;
    try {
      response = await apiClient.put<SetDevicesResponse>(
        `/api/v1/rcs/agents/${encodeURIComponent(args.id)}/test-devices`,
        { devices },
        true,
        { idempotencyKey: flags["idempotency-key"] },
      );
      saveSpinner.stop();
    } catch (err) {
      saveSpinner.stop();
      if (reportRcsError(err)) this.exit(1);
      throw err;
    }

    if (isJsonMode()) {
      json(response);
      return;
    }

    const list = response.devices ?? [];
    success(
      list.length === 0
        ? "Test devices cleared"
        : `Test devices set: ${list.length}`,
    );
    printDevices(list);
    if (list.length > 0) {
      console.log();
      console.log(
        colors.dim(
          "Invites go out once the agent is in testing. Each device gets a prompt from the carrier network to accept; send a test message with `sendly rcs send` after it accepts.",
        ),
      );
    }
  }
}
