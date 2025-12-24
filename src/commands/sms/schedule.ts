import { Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import {
  success,
  error,
  spinner,
  colors,
  formatStatus,
  json,
  isJsonMode,
} from "../../lib/output.js";

interface ScheduledMessageResponse {
  id: string;
  to: string;
  from?: string;
  text: string;
  status: string;
  scheduledAt: string;
  createdAt: string;
}

export default class SmsSchedule extends AuthenticatedCommand {
  static description = "Schedule an SMS message for future delivery";

  static examples = [
    '<%= config.bin %> sms schedule --to +15551234567 --text "Reminder!" --at "2025-01-20T10:00:00Z"',
    '<%= config.bin %> sms schedule --to +15551234567 --text "Meeting in 1 hour" --at "2025-01-15T14:00:00Z" --from "Sendly"',
    '<%= config.bin %> sms schedule --to +15551234567 --text "Hello!" --at "2025-01-20T10:00:00Z" --json',
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
    at: Flags.string({
      char: "a",
      description:
        "Scheduled time (ISO 8601 format, e.g., 2025-01-20T10:00:00Z)",
      required: true,
    }),
    from: Flags.string({
      char: "f",
      description: "Sender ID or phone number",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(SmsSchedule);

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

    // Validate scheduled time
    const scheduledDate = new Date(flags.at);
    if (isNaN(scheduledDate.getTime())) {
      error("Invalid scheduled time format", {
        hint: "Use ISO 8601 format: 2025-01-20T10:00:00Z",
      });
      this.exit(1);
    }

    // Check scheduling time constraints (Telnyx requires 5 min - 5 days)
    const FIVE_MINUTES = 5 * 60 * 1000;
    const FIVE_DAYS = 5 * 24 * 60 * 60 * 1000;
    const timeUntilSend = scheduledDate.getTime() - Date.now();

    if (timeUntilSend < FIVE_MINUTES) {
      error("Scheduled time must be at least 5 minutes from now");
      this.exit(1);
    }

    if (timeUntilSend > FIVE_DAYS) {
      error("Scheduled time must be within 5 days");
      this.exit(1);
    }

    const spin = spinner("Scheduling message...");
    spin.start();

    try {
      const response = await apiClient.post<ScheduledMessageResponse>(
        "/api/v1/messages/schedule",
        {
          to: flags.to,
          text: flags.text,
          scheduledAt: flags.at,
          ...(flags.from && { from: flags.from }),
        },
      );

      spin.stop();

      if (isJsonMode()) {
        json(response);
        return;
      }

      const formattedTime = new Date(response.scheduledAt).toLocaleString();

      success("Message scheduled", {
        ID: response.id,
        To: response.to,
        Status: formatStatus(response.status),
        "Scheduled For": colors.code(formattedTime),
      });
    } catch (err) {
      spin.stop();
      throw err;
    }
  }
}
