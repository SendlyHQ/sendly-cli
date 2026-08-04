import { Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import {
  apiClient,
  ApiKeyRequiredError,
  NotFoundError,
  ValidationError,
} from "../../lib/api-client.js";
import {
  success,
  error,
  json,
  colors,
  spinner,
  isJsonMode,
} from "../../lib/output.js";

interface CapabilityResponse {
  to: string;
  agentId: string;
  capable: boolean;
  features: string[];
}

export default class RcsCapability extends AuthenticatedCommand {
  static description =
    "Check whether a recipient's device can receive RCS before you send";

  static examples = [
    "<%= config.bin %> rcs capability --to +15125550190",
    "<%= config.bin %> rcs capability --to +15125550190 --agent 3f6a1c9e-0000-0000-0000-000000000000",
    "<%= config.bin %> rcs capability --to +15125550190 --json",
  ];

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    to: Flags.string({
      char: "t",
      description: "Recipient phone number to check (E.164 format)",
      required: true,
    }),
    agent: Flags.string({
      description:
        "RCS agent id to check with (only needed when your workspace has more than one — see `rcs agents`)",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(RcsCapability);

    const checkSpinner = spinner("Checking RCS capability...");
    if (!isJsonMode()) {
      checkSpinner.start();
    }

    let response: CapabilityResponse;
    try {
      response = await apiClient.get<CapabilityResponse>(
        "/api/v1/rcs/capability",
        {
          to: flags.to,
          ...(flags.agent && { agentId: flags.agent }),
        },
      );
      checkSpinner.stop();
    } catch (err: any) {
      checkSpinner.stop();
      if (err instanceof NotFoundError) {
        error(
          err.message === "Resource not found"
            ? "RCS isn't available on your workspace yet."
            : err.message,
          {
            hint: "RCS is rolling out gradually — contact support@sendly.live for early access.",
          },
        );
        this.exit(1);
      }
      if (err instanceof ApiKeyRequiredError) {
        error("RCS capability checks require a live API key.", {
          hint: "The check reaches the carrier network, so test keys can't run it — create one with `sendly keys create --type live`",
        });
        this.exit(1);
      }
      if (
        err instanceof ValidationError &&
        /more than one RCS agent/i.test(err.message ?? "")
      ) {
        error(err.message, {
          hint: "Pass --agent <id> — list them with `sendly rcs agents`",
        });
        this.exit(1);
      }
      throw err;
    }

    if (isJsonMode()) {
      json(response);
      return;
    }

    success("RCS capability check", {
      To: response.to,
      Agent: colors.code(response.agentId),
      Capable: response.capable
        ? colors.success("yes")
        : colors.error("no"),
      Features: response.features?.length
        ? response.features.join(", ")
        : colors.dim("—"),
    });

    console.log();
    if (response.capable) {
      console.log(
        colors.dim(
          `Send with: ${colors.code(`sendly rcs send --to ${response.to} --text "Hello!"`)}`,
        ),
      );
    } else {
      console.log(
        colors.dim(
          "Sends to this recipient will deliver as plain SMS (unless you pass --no-fallback).",
        ),
      );
    }
  }
}
