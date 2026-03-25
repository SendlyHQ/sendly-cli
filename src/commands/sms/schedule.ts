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
  info,
} from "../../lib/output.js";
import * as chrono from "chrono-node";
import inquirer from "inquirer";

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
  static description = "Schedule an SMS message for future delivery. Supports natural language dates like 'tomorrow at 9am' or 'in 2 hours'.";

  static examples = [
    '<%= config.bin %> sms schedule --to +15551234567 --text "Reminder!" --at "tomorrow at 9am"',
    '<%= config.bin %> sms schedule --to +15551234567 --text "Meeting soon" --at "in 2 hours"',
    '<%= config.bin %> sms schedule --to +15551234567 --text "Hello!" --at "next Monday 3pm"',
    '<%= config.bin %> sms schedule --to +15551234567 --text "Sale!" --at "2026-04-01T10:00:00Z"',
    '<%= config.bin %> sms schedule --to +15551234567 --text "Code: 123" --at "friday 5pm" --type transactional',
  ];

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    to: Flags.string({
      char: "t",
      description: "Recipient phone number (E.164 format)",
    }),
    text: Flags.string({
      char: "m",
      description: "Message text",
    }),
    at: Flags.string({
      char: "a",
      description: 'Scheduled time — ISO 8601 or natural language ("tomorrow at 9am", "in 2 hours", "next Monday 3pm")',
    }),
    from: Flags.string({
      char: "f",
      description: "Sender ID or phone number",
    }),
    type: Flags.string({
      description:
        "Message type: marketing (default) or transactional. Transactional messages bypass quiet hours.",
      options: ["marketing", "transactional"],
      default: "marketing",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(SmsSchedule);

    let to = flags.to;
    let text = flags.text;
    let at = flags.at;

    if (!to) {
      if (process.stdin.isTTY) {
        const answers = await inquirer.prompt([
          {
            type: "input",
            name: "to",
            message: "Recipient phone number (E.164):",
            validate: (input: string) => {
              if (!input) return "Phone number is required";
              if (!/^\+[1-9]\d{1,14}$/.test(input)) {
                return "Invalid format. Use E.164: +15551234567";
              }
              return true;
            },
          },
        ]);
        to = answers.to;
      } else {
        error("Missing required flag: --to", {
          hint: "Use --to +15551234567",
        });
        this.exit(1);
      }
    }

    if (!text) {
      if (process.stdin.isTTY) {
        const answers = await inquirer.prompt([
          {
            type: "input",
            name: "text",
            message: "Message text:",
            validate: (input: string) => {
              if (!input.trim()) return "Message text cannot be empty";
              return true;
            },
          },
        ]);
        text = answers.text;
      } else {
        error("Missing required flag: --text", {
          hint: 'Use --text "Your message"',
        });
        this.exit(1);
      }
    }

    if (!at) {
      if (process.stdin.isTTY) {
        const answers = await inquirer.prompt([
          {
            type: "input",
            name: "at",
            message: 'Schedule time (e.g. "tomorrow at 9am", "in 2 hours"):',
            validate: (input: string) => {
              if (!input.trim()) return "Scheduled time is required";
              return true;
            },
          },
        ]);
        at = answers.at;
      } else {
        error("Missing required flag: --at", {
          hint: 'Use --at "tomorrow at 9am"',
        });
        this.exit(1);
      }
    }

    if (!/^\+[1-9]\d{1,14}$/.test(to!)) {
      error("Invalid phone number format", {
        hint: "Use E.164 format: +15551234567",
      });
      this.exit(1);
    }

    if (!text!.trim()) {
      error("Message text cannot be empty");
      this.exit(1);
    }

    let scheduledDate = new Date(at!);

    if (isNaN(scheduledDate.getTime())) {
      const parsed = chrono.parseDate(at!, new Date(), { forwardDate: true });
      if (!parsed) {
        error("Could not understand the scheduled time", {
          hint: 'Try: "tomorrow at 9am", "in 2 hours", "next Monday 3pm", or ISO 8601: 2026-04-01T10:00:00Z',
        });
        this.exit(1);
      }
      scheduledDate = parsed;

      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (!isJsonMode()) {
        info(`Interpreted "${at}" as ${scheduledDate.toLocaleString()} (${tz})`);
      }
    }

    const timeUntilSend = scheduledDate.getTime() - Date.now();

    if (timeUntilSend < 0) {
      error("That time is in the past", {
        hint: 'Did you mean a future time? Try: "tomorrow at 9am" or "in 2 hours"',
      });
      this.exit(1);
    }

    const FIVE_MINUTES = 5 * 60 * 1000;
    if (timeUntilSend < FIVE_MINUTES) {
      const mins = Math.ceil(timeUntilSend / 60000);
      error(`Too soon — that's only ${mins} minute${mins !== 1 ? "s" : ""} from now`, {
        hint: "Messages must be scheduled at least 5 minutes in the future",
      });
      this.exit(1);
    }

    const FIVE_DAYS = 5 * 24 * 60 * 60 * 1000;
    if (timeUntilSend > FIVE_DAYS) {
      error("Too far — must be within 5 days", {
        hint: `That's ${Math.ceil(timeUntilSend / 86400000)} days from now. Maximum is 5 days.`,
      });
      this.exit(1);
    }

    const spin = spinner("Scheduling message...");
    spin.start();

    try {
      const response = await apiClient.post<ScheduledMessageResponse>(
        "/api/v1/messages/schedule",
        {
          to,
          text,
          scheduledAt: scheduledDate.toISOString(),
          messageType: flags.type,
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
