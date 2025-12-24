import { Flags } from "@oclif/core";
import { readFileSync } from "fs";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import {
  success,
  error,
  spinner,
  colors,
  json,
  isJsonMode,
} from "../../lib/output.js";

interface BatchMessage {
  to: string;
  text: string;
}

interface BatchResponse {
  batchId: string;
  total: number;
  queued: number;
  failed: number;
  creditsUsed: number;
  status: string;
}

export default class SmsBatch extends AuthenticatedCommand {
  static description = "Send batch SMS messages";

  static examples = [
    "<%= config.bin %> sms batch --file recipients.json",
    '<%= config.bin %> sms batch --to +15551234567,+15559876543 --text "Hello everyone!"',
    '<%= config.bin %> sms batch --file recipients.csv --from "Sendly"',
    "<%= config.bin %> sms batch --file messages.json --json",
  ];

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    file: Flags.string({
      char: "F",
      description: "JSON file with messages array [{to, text}, ...]",
      exclusive: ["to"],
    }),
    to: Flags.string({
      char: "t",
      description: "Comma-separated recipient phone numbers (E.164 format)",
      exclusive: ["file"],
    }),
    text: Flags.string({
      char: "m",
      description: "Message text (used with --to flag)",
    }),
    from: Flags.string({
      char: "f",
      description: "Sender ID or phone number for all messages",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(SmsBatch);

    let messages: BatchMessage[] = [];

    // Parse messages from file or flags
    if (flags.file) {
      messages = this.parseMessagesFromFile(flags.file);
    } else if (flags.to) {
      if (!flags.text) {
        error("--text is required when using --to");
        this.exit(1);
      }
      messages = this.parseMessagesFromFlags(flags.to, flags.text);
    } else {
      error("Either --file or --to is required");
      this.exit(1);
    }

    // Validate messages
    if (messages.length === 0) {
      error("No messages to send");
      this.exit(1);
    }

    if (messages.length > 1000) {
      error("Batch size cannot exceed 1000 messages", {
        hint: "Split your messages into smaller batches",
      });
      this.exit(1);
    }

    // Validate each message
    for (const msg of messages) {
      if (!/^\+[1-9]\d{1,14}$/.test(msg.to)) {
        error(`Invalid phone number: ${msg.to}`, {
          hint: "Use E.164 format: +15551234567",
        });
        this.exit(1);
      }
      if (!msg.text?.trim()) {
        error(`Empty message text for ${msg.to}`);
        this.exit(1);
      }
    }

    const spin = spinner(`Sending ${messages.length} messages...`);
    spin.start();

    try {
      const response = await apiClient.post<BatchResponse>(
        "/api/v1/messages/batch",
        {
          messages,
          ...(flags.from && { from: flags.from }),
        },
      );

      spin.stop();

      if (isJsonMode()) {
        json(response);
        return;
      }

      success("Batch sent", {
        "Batch ID": response.batchId,
        Total: response.total,
        Queued: colors.success(String(response.queued ?? 0)),
        Failed:
          response.failed > 0 ? colors.error(String(response.failed)) : "0",
        "Credits Used": response.creditsUsed,
        Status: response.status,
      });
    } catch (err) {
      spin.stop();
      throw err;
    }
  }

  private parseMessagesFromFile(filePath: string): BatchMessage[] {
    try {
      const content = readFileSync(filePath, "utf-8");

      // Try JSON first
      if (filePath.endsWith(".json")) {
        const data = JSON.parse(content);
        if (Array.isArray(data)) {
          return data.map((item) => ({
            to: item.to,
            text: item.text,
          }));
        }
        if (data.messages && Array.isArray(data.messages)) {
          return data.messages;
        }
        error("Invalid JSON format", {
          hint: "Expected array of {to, text} objects or {messages: [...]}",
        });
        this.exit(1);
      }

      // Try CSV
      if (filePath.endsWith(".csv")) {
        const lines = content.trim().split("\n");
        const messages: BatchMessage[] = [];

        // Skip header if present
        const startIndex = lines[0].toLowerCase().includes("to") ? 1 : 0;

        for (let i = startIndex; i < lines.length; i++) {
          const parts = lines[i].split(",");
          if (parts.length >= 2) {
            messages.push({
              to: parts[0].trim().replace(/"/g, ""),
              text: parts.slice(1).join(",").trim().replace(/"/g, ""),
            });
          }
        }
        return messages;
      }

      error("Unsupported file format", {
        hint: "Use .json or .csv file",
      });
      this.exit(1);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        error(`File not found: ${filePath}`);
      } else if (err instanceof SyntaxError) {
        error("Invalid JSON in file", { hint: err.message });
      } else {
        throw err;
      }
      this.exit(1);
    }
  }

  private parseMessagesFromFlags(to: string, text: string): BatchMessage[] {
    const phones = to.split(",").map((p) => p.trim());
    return phones.map((phone) => ({ to: phone, text }));
  }
}
