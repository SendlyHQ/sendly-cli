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
  text?: string; // Optional - can be provided via --text flag
}

interface BatchResponse {
  batchId: string;
  total: number;
  sent: number;
  queued: number;
  failed: number;
  creditsUsed: number;
  creditsRefunded: number;
  status: string;
  messages?: Array<{
    index: number;
    id: string;
    to: string;
    status: string;
    error?: string;
  }>;
}

interface BatchPreviewResponse {
  total: number;
  sendable: number;
  blocked: number;
  duplicates: number;
  creditsNeeded: number;
  creditBalance: number;
  hasSufficientCredits: boolean;
  keyType: "test" | "live";
  keyScopes: string[];
  hasWriteScope: boolean;
  messagingProfile: {
    id: string | null;
    canSendDomestic: boolean;
    canSendInternational: boolean;
    verificationStatus: string | null;
    verificationType: string | null;
  };
  byCountry: Record<
    string,
    {
      count: number;
      credits: number;
      tier: string;
      allowed: boolean;
      blockedReason?: string;
    }
  >;
  blockedMessages: Array<{
    index: number;
    to: string;
    reason: string;
  }>;
  warnings: string[];
}

export default class SmsBatch extends AuthenticatedCommand {
  static description = "Send batch SMS messages";

  static examples = [
    "<%= config.bin %> sms batch --file recipients.json",
    '<%= config.bin %> sms batch --to +15551234567,+15559876543 --text "Hello everyone!"',
    '<%= config.bin %> sms batch --file phones.csv --text "Your order is ready!"',
    '<%= config.bin %> sms batch --file recipients.csv --from "Sendly"',
    "<%= config.bin %> sms batch --file messages.json --json",
    '<%= config.bin %> sms batch --file phones.csv --text "Hi" --dry-run',
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
      description:
        "Message text (works with --to or --file for phone-only lists)",
    }),
    from: Flags.string({
      char: "f",
      description: "Sender ID or phone number for all messages",
    }),
    "dry-run": Flags.boolean({
      char: "d",
      description:
        "Preview batch without sending (validates access, shows cost breakdown)",
      default: false,
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

    // Apply shared text from --text flag to messages without text
    if (flags.text) {
      messages = messages.map((msg) => ({
        to: msg.to,
        text: msg.text || flags.text,
      }));
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
        error(`Empty message text for ${msg.to}`, {
          hint: "Use --text to provide a shared message for all recipients",
        });
        this.exit(1);
      }
    }

    // Handle dry-run mode
    if (flags["dry-run"]) {
      const spin = spinner("Analyzing batch...").start();

      try {
        const preview = await apiClient.post<BatchPreviewResponse>(
          "/api/v1/messages/batch/preview",
          { messages, text: flags.text },
        );

        spin.stop();

        if (isJsonMode()) {
          json(preview);
          return;
        }

        // Show comprehensive preview
        console.log(colors.bold("\n📊 Batch Preview (Dry Run)\n"));

        // Summary table
        console.log(colors.dim("─".repeat(50)));
        console.log(`Total messages:     ${preview.total}`);
        console.log(
          `Sendable:           ${colors.success(String(preview.sendable))}`,
        );
        console.log(
          `Blocked:            ${preview.blocked > 0 ? colors.error(String(preview.blocked)) : "0"}`,
        );
        console.log(`Duplicates removed: ${preview.duplicates}`);
        console.log(colors.dim("─".repeat(50)));

        // Credits
        console.log(`\nCredits needed:     ${preview.creditsNeeded}`);
        console.log(`Your balance:       ${preview.creditBalance}`);
        if (!preview.hasSufficientCredits) {
          console.log(
            colors.error(
              `⚠️  Insufficient credits! Need ${preview.creditsNeeded - preview.creditBalance} more.`,
            ),
          );
        }

        // Access info
        console.log(`\nAPI Key type:       ${preview.keyType.toUpperCase()}`);
        console.log(`Write access:       ${preview.hasWriteScope ? "✓" : "✗"}`);
        console.log(
          `Domestic (US/CA):   ${preview.messagingProfile.canSendDomestic ? "✓" : "✗"}`,
        );
        console.log(
          `International:      ${preview.messagingProfile.canSendInternational ? "✓" : "✗"}`,
        );

        // Country breakdown
        const countries = Object.entries(preview.byCountry);
        if (countries.length > 0) {
          console.log(colors.bold("\n📍 By Country:\n"));
          for (const [country, data] of countries) {
            const status = data.allowed
              ? colors.success("✓")
              : colors.error("✗");
            console.log(
              `  ${status} ${country}: ${data.count} msgs, ${data.credits} credits (${data.tier})`,
            );
            if (!data.allowed && data.blockedReason) {
              console.log(colors.dim(`     └─ ${data.blockedReason}`));
            }
          }
        }

        // Warnings
        if (preview.warnings.length > 0) {
          console.log(colors.warning("\n⚠️  Warnings:"));
          for (const w of preview.warnings) {
            console.log(`   • ${w}`);
          }
        }

        // Blocked messages (first 5)
        if (preview.blockedMessages.length > 0) {
          console.log(
            colors.error(
              `\n❌ Blocked Messages (${preview.blockedMessages.length} total):`,
            ),
          );
          for (const b of preview.blockedMessages.slice(0, 5)) {
            console.log(`   ${b.to}: ${b.reason}`);
          }
          if (preview.blockedMessages.length > 5) {
            console.log(
              colors.dim(
                `   ... and ${preview.blockedMessages.length - 5} more`,
              ),
            );
          }
        }

        console.log(
          "\n" + colors.dim("No messages were sent. Remove --dry-run to send."),
        );
        return;
      } catch (err) {
        spin.stop();
        throw err;
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

      // Determine success level
      const allSucceeded = response.failed === 0;
      const allFailed = response.sent === 0 && response.failed > 0;
      const partialSuccess = response.sent > 0 && response.failed > 0;

      if (allSucceeded) {
        success("Batch sent successfully", {
          "Batch ID": response.batchId,
          Total: response.total,
          Sent: colors.success(String(response.sent)),
          "Credits Used": response.creditsUsed,
        });
      } else if (allFailed) {
        error("Batch failed", {
          hint: `All ${response.failed} messages failed to send`,
        });
        console.log(colors.dim(`  Batch ID: ${response.batchId}`));
        console.log(
          colors.dim(`  Credits Refunded: ${response.creditsRefunded}`),
        );
      } else if (partialSuccess) {
        console.log(colors.warning("\n⚠️  Batch completed with errors\n"));
        console.log(`  Batch ID:         ${response.batchId}`);
        console.log(`  Total:            ${response.total}`);
        console.log(
          `  Sent:             ${colors.success(String(response.sent))}`,
        );
        console.log(
          `  Failed:           ${colors.error(String(response.failed))}`,
        );
        console.log(`  Credits Used:     ${response.creditsUsed}`);
        console.log(`  Credits Refunded: ${response.creditsRefunded}`);

        // Show failed messages if available
        if (response.messages) {
          const failedMsgs = response.messages.filter(
            (m) => m.status === "failed",
          );
          if (failedMsgs.length > 0 && failedMsgs.length <= 5) {
            console.log(colors.dim("\n  Failed messages:"));
            for (const msg of failedMsgs) {
              console.log(
                colors.dim(`    ${msg.to}: ${msg.error || "Unknown error"}`),
              );
            }
          } else if (failedMsgs.length > 5) {
            console.log(
              colors.dim(
                `\n  ${failedMsgs.length} messages failed. Use --json for details.`,
              ),
            );
          }
        }
      }
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

        // Improved header detection - check for common header patterns
        const headerPatterns = [
          "to",
          "phone",
          "number",
          "recipient",
          "mobile",
          "cell",
        ];
        const firstLine = lines[0].toLowerCase();
        const hasHeader = headerPatterns.some((p) => firstLine.includes(p));
        const startIndex = hasHeader ? 1 : 0;

        for (let i = startIndex; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue; // Skip empty lines

          const parts = line.split(",");
          if (parts.length >= 1) {
            const phone = parts[0].trim().replace(/"/g, "");
            // Only add if phone looks valid (starts with + or digit)
            if (phone && (phone.startsWith("+") || /^\d/.test(phone))) {
              messages.push({
                to: phone.startsWith("+") ? phone : `+${phone}`,
                text:
                  parts.length >= 2
                    ? parts.slice(1).join(",").trim().replace(/"/g, "") ||
                      undefined
                    : undefined,
              });
            }
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
