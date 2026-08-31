import { Flags, Args } from "@oclif/core";
import { AuthenticatedCommand } from "../lib/base-command.js";
import { apiClient } from "../lib/api-client.js";
import {
  success,
  error,
  json,
  colors,
  spinner,
  isJsonMode,
} from "../lib/output.js";

interface SendMessageResponse {
  id: string;
  to: string;
  from: string;
  text: string;
  status: string;
  segments: number;
  creditsUsed: number;
  createdAt: string;
}

export default class Send extends AuthenticatedCommand {
  static description = "Send an SMS message (shortcut for 'sms send')";

  static examples = [
    '<%= config.bin %> send --to "+1234567890" --text "Hello!"',
    '<%= config.bin %> send -t "+1234567890" -m "Meeting at 3pm"',
    '<%= config.bin %> send --to "+1234567890" --text "Hello!" --json',
  ];

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    to: Flags.string({
      char: "t",
      description: "Recipient phone number (E.164 format)",
      required: true,
    }),
    text: Flags.string({
      char: "m",
      description: "Message text",
      required: true,
    }),
    from: Flags.string({
      char: "f",
      description: "Sender phone number (optional, uses default if not set)",
    }),
    "idempotency-key": Flags.string({
      description:
        "Idempotency key (1-255 printable ASCII characters). Re-running with the same key within 24 hours returns the original result instead of sending again.",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Send);

    const sendSpinner = spinner("Sending message...");

    if (!isJsonMode()) {
      sendSpinner.start();
    }

    try {
      const response = await apiClient.post<SendMessageResponse>(
        "/api/v1/messages",
        {
          to: flags.to,
          text: flags.text,
          ...(flags.from && { from: flags.from }),
        },
        true,
        { idempotencyKey: flags["idempotency-key"] },
      );

      sendSpinner.stop();

      if (isJsonMode()) {
        json(response);
        return;
      }

      success("Message sent", {
        "Message ID": colors.code(response.id),
        To: response.to,
        Status: response.status === "sent"
          ? colors.success(response.status)
          : colors.primary(response.status),
        Segments: String(response.segments),
        Credits: String(response.creditsUsed),
      });

    } catch (err: any) {
      sendSpinner.stop();

      if (err.message?.includes("insufficient_credits")) {
        error("Insufficient credits", {
          hint: `Run ${colors.code("sendly credits balance")} to check your balance`,
        });
      } else if (err.message?.includes("invalid_phone")) {
        error("Invalid phone number format", {
          hint: "Use E.164 format: +1234567890",
        });
      } else {
        throw err;
      }
      this.exit(1);
    }
  }
}
