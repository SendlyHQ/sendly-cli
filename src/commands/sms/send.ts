import { Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import {
  success,
  error,
  spinner,
  colors,
  formatStatus,
  formatCredits,
  json,
  isJsonMode,
} from "../../lib/output.js";

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

export default class SmsSend extends AuthenticatedCommand {
  static description = "Send an SMS message";

  static examples = [
    '<%= config.bin %> sms send --to +15551234567 --text "Hello!"',
    '<%= config.bin %> sms send --to +15551234567 --text "Hello!" --from "Sendly"',
    '<%= config.bin %> sms send --to +15551234567 --text "Hello!" --type transactional',
    '<%= config.bin %> sms send --to +15551234567 --text "Hello!" --json',
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
      description: "Sender ID or phone number",
    }),
    type: Flags.string({
      description: "Message type: marketing (default) or transactional",
      options: ["marketing", "transactional"],
      default: "marketing",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(SmsSend);

    // Validate phone number format
    if (!/^\+[1-9]\d{1,14}$/.test(flags.to)) {
      error("Invalid phone number format", {
        hint: "Use E.164 format: +15551234567",
      });
      this.exit(1);
    }

    // Validate message text
    if (!flags.text.trim()) {
      error("Message text cannot be empty");
      this.exit(1);
    }

    const spin = spinner("Sending message...");
    spin.start();

    try {
      const response = await apiClient.post<SendMessageResponse>(
        "/api/v1/messages",
        {
          to: flags.to,
          text: flags.text,
          messageType: flags.type,
          ...(flags.from && { from: flags.from }),
        },
      );

      spin.stop();

      if (isJsonMode()) {
        json(response);
        return;
      }

      success("Message sent", {
        ID: response.id,
        To: response.to,
        Status: formatStatus(response.status),
        ...(response.segments != null && { Segments: response.segments }),
        Credits: formatCredits(response.creditsUsed),
      });
    } catch (err) {
      spin.stop();
      throw err;
    }
  }
}
