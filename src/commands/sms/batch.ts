import { Flags } from "@oclif/core";
import { readFileSync, existsSync } from "fs";
import { basename } from "path";
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

interface BatchUploadResponse {
  upload: {
    id: string;
    filename: string;
    size: number;
    createdAt: string;
  };
  validation: {
    totalRows: number;
    validCount: number;
    invalidCount: number;
    duplicatesRemoved: number;
    hasHeader: boolean;
  };
  recipients: Array<{ to: string; text?: string }>;
  errors: Array<{ row: number; phone: string; error: string }>;
  hasMoreErrors: boolean;
}

interface BatchHistoryResponse {
  uploads: Array<{
    id: string;
    filename: string;
    size: number;
    createdAt: string;
    metadata: {
      totalRows: number;
      validCount: number;
      invalidCount: number;
      source?: string;
    };
  }>;
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
  compliance: {
    messageType: "marketing" | "transactional";
    shaftBlocked: number;
    quietHoursBlocked: number;
    quietHoursRescheduled: number;
    shaftBlockedMessages: Array<{
      index: number;
      to: string;
      category: string;
      matchedTerms: string[];
    }>;
    quietHoursBlockedMessages: Array<{
      index: number;
      to: string;
      recipientTimezone: string;
      recipientLocalTime: string;
      nextAllowedTime?: string;
    }>;
  };
  warnings: string[];
}

export default class SmsBatch extends AuthenticatedCommand {
  static description =
    "Send batch SMS messages (uploads CSV to cloud for audit trail)";

  static examples = [
    "<%= config.bin %> sms batch --file recipients.csv",
    '<%= config.bin %> sms batch --file phones.csv --text "Hello everyone!"',
    '<%= config.bin %> sms batch --to +15551234567,+15559876543 --text "Hello!"',
    "<%= config.bin %> sms batch --file recipients.csv --dry-run",
    '<%= config.bin %> sms batch --file phones.csv --text "Code: 123" --type transactional',
    "<%= config.bin %> sms batch --reuse abc123-def456",
    "<%= config.bin %> sms batch --history",
  ];

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    file: Flags.string({
      char: "F",
      description: "CSV file with phone numbers (and optional message text)",
      exclusive: ["to", "reuse", "history"],
    }),
    to: Flags.string({
      char: "t",
      description: "Comma-separated recipient phone numbers (E.164 format)",
      exclusive: ["file", "reuse", "history"],
    }),
    text: Flags.string({
      char: "m",
      description:
        "Message text (required with --to, optional with --file if CSV has text column)",
    }),
    from: Flags.string({
      char: "f",
      description: "Sender ID or phone number for all messages",
    }),
    type: Flags.string({
      description:
        "Message type: marketing (default) or transactional. Transactional bypasses quiet hours.",
      options: ["marketing", "transactional"],
      default: "marketing",
    }),
    "dry-run": Flags.boolean({
      char: "d",
      description:
        "Preview batch without sending (validates access, shows cost and compliance breakdown)",
      default: false,
    }),
    reuse: Flags.string({
      description: "Re-use a previous batch upload by ID (see --history)",
      exclusive: ["file", "to", "history"],
    }),
    history: Flags.boolean({
      description: "Show recent batch upload history",
      exclusive: ["file", "to", "reuse"],
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(SmsBatch);

    // Handle history subcommand
    if (flags.history) {
      return this.showHistory();
    }

    // Handle reuse subcommand
    if (flags.reuse) {
      return this.reuseBatch(flags.reuse, flags);
    }

    // Handle --to flag (inline recipients, no upload needed)
    if (flags.to) {
      return this.sendInlineRecipients(flags);
    }

    // Handle --file flag (upload to Supabase)
    if (flags.file) {
      return this.uploadAndSend(flags);
    }

    error("Either --file, --to, --reuse, or --history is required");
    this.exit(1);
  }

  /**
   * Show batch upload history
   */
  private async showHistory(): Promise<void> {
    const spin = spinner("Fetching batch history...").start();

    try {
      const response = await apiClient.get<BatchHistoryResponse>(
        "/api/cli/batch/history",
        { limit: 15 },
      );

      spin.stop();

      if (isJsonMode()) {
        json(response);
        return;
      }

      if (response.uploads.length === 0) {
        console.log(colors.dim("\nNo batch uploads found.\n"));
        console.log("Upload a CSV file with: sendly sms batch --file your.csv");
        return;
      }

      console.log(colors.bold("\n📁 Recent Batch Uploads\n"));
      console.log(colors.dim("─".repeat(80)));

      for (const upload of response.uploads) {
        const date = new Date(upload.createdAt).toLocaleString();
        const size = this.formatBytes(upload.size);
        const source = upload.metadata?.source === "cli" ? "CLI" : "Web";

        console.log(
          `${colors.info(upload.id.slice(0, 8))}  ${upload.filename}`,
        );
        console.log(
          colors.dim(
            `   ${date} | ${size} | ${upload.metadata?.validCount || 0} valid recipients | ${source}`,
          ),
        );
      }

      console.log(colors.dim("─".repeat(80)));
      console.log(
        colors.dim("\nRe-use a batch: sendly sms batch --reuse <id>"),
      );
    } catch (err) {
      spin.stop();
      throw err;
    }
  }

  /**
   * Re-use a previous batch upload
   */
  private async reuseBatch(
    uploadId: string,
    flags: { text?: string; from?: string; type?: string; "dry-run"?: boolean },
  ): Promise<void> {
    const spin = spinner("Fetching batch data...").start();

    try {
      const response = await apiClient.get<BatchUploadResponse>(
        `/api/cli/batch/reuse/${uploadId}`,
      );

      spin.stop();

      console.log(
        colors.success(`\n✓ Loaded batch: ${response.upload.filename}`),
      );
      console.log(
        colors.dim(
          `  ${response.validation.validCount} valid recipients from ${response.validation.totalRows} rows`,
        ),
      );

      // Apply shared text if provided
      let messages = response.recipients;
      if (flags.text) {
        messages = messages.map((r) => ({
          to: r.to,
          text: r.text || flags.text,
        }));
      }

      // Validate all messages have text
      const missingText = messages.filter((m) => !m.text?.trim());
      if (missingText.length > 0) {
        error(
          `${missingText.length} recipients missing message text. Use --text to provide a default.`,
        );
        this.exit(1);
      }

      // Proceed with preview or send
      await this.previewOrSend(
        messages as Array<{ to: string; text: string }>,
        flags,
        response.upload.id,
      );
    } catch (err) {
      spin.stop();
      throw err;
    }
  }

  /**
   * Send to inline recipients (--to flag)
   * This path doesn't upload to Supabase since it's just a few numbers
   */
  private async sendInlineRecipients(flags: {
    to?: string;
    text?: string;
    from?: string;
    type?: string;
    "dry-run"?: boolean;
  }): Promise<void> {
    if (!flags.text) {
      error("--text is required when using --to");
      this.exit(1);
    }

    const phones = flags.to!.split(",").map((p) => p.trim());
    const messages = phones.map((phone) => ({
      to: phone.startsWith("+") ? phone : `+${phone}`,
      text: flags.text!,
    }));

    // Validate phone numbers
    for (const msg of messages) {
      if (!/^\+[1-9]\d{1,14}$/.test(msg.to)) {
        error(`Invalid phone number: ${msg.to}`, {
          hint: "Use E.164 format: +15551234567",
        });
        this.exit(1);
      }
    }

    await this.previewOrSend(messages, flags);
  }

  /**
   * Upload CSV to Supabase and send
   */
  private async uploadAndSend(flags: {
    file?: string;
    text?: string;
    from?: string;
    type?: string;
    "dry-run"?: boolean;
  }): Promise<void> {
    const filePath = flags.file!;

    // Check file exists
    if (!existsSync(filePath)) {
      error(`File not found: ${filePath}`);
      this.exit(1);
    }

    // Validate file extension
    if (!filePath.endsWith(".csv")) {
      error("Only CSV files are supported", {
        hint: "Convert your file to CSV format with columns: phone,message",
      });
      this.exit(1);
    }

    // Read file
    const buffer = readFileSync(filePath);
    const filename = basename(filePath);

    // Check file size (5MB limit)
    if (buffer.length > 5 * 1024 * 1024) {
      error("File too large (max 5MB)", {
        hint: "Split your CSV into smaller files",
      });
      this.exit(1);
    }

    const spin = spinner(`Uploading ${filename}...`).start();

    try {
      // Upload to Supabase via CLI endpoint
      const response = await apiClient.uploadFile<BatchUploadResponse>(
        "/api/cli/batch/upload",
        { buffer, filename, mimetype: "text/csv" },
      );

      spin.stop();

      // Show upload summary
      console.log(colors.success(`\n✓ Uploaded: ${response.upload.filename}`));
      console.log(colors.dim(`  Upload ID: ${response.upload.id}`));
      console.log(
        colors.dim(
          `  ${response.validation.validCount} valid / ${response.validation.invalidCount} invalid / ${response.validation.duplicatesRemoved} duplicates removed`,
        ),
      );

      // Show validation errors if any
      if (response.errors.length > 0) {
        console.log(colors.warning(`\n⚠️  Validation errors:`));
        for (const err of response.errors.slice(0, 5)) {
          console.log(
            colors.dim(`   Row ${err.row}: ${err.phone} - ${err.error}`),
          );
        }
        if (response.hasMoreErrors) {
          console.log(
            colors.dim(
              `   ... and ${response.validation.invalidCount - 5} more errors`,
            ),
          );
        }
      }

      if (response.recipients.length === 0) {
        error("No valid recipients found in CSV");
        this.exit(1);
      }

      // Apply shared text if provided
      let messages = response.recipients;
      if (flags.text) {
        messages = messages.map((r) => ({
          to: r.to,
          text: r.text || flags.text,
        }));
      }

      // Validate all messages have text
      const missingText = messages.filter((m) => !m.text?.trim());
      if (missingText.length > 0) {
        error(
          `${missingText.length} recipients missing message text. Use --text to provide a default.`,
        );
        console.log(
          colors.dim(
            "\nCSV should have columns: phone,message OR use --text flag",
          ),
        );
        this.exit(1);
      }

      // Proceed with preview or send
      await this.previewOrSend(
        messages as Array<{ to: string; text: string }>,
        flags,
        response.upload.id,
      );
    } catch (err) {
      spin.stop();
      throw err;
    }
  }

  /**
   * Preview or send the batch
   */
  private async previewOrSend(
    messages: Array<{ to: string; text: string }>,
    flags: { from?: string; type?: string; "dry-run"?: boolean },
    uploadId?: string,
  ): Promise<void> {
    // Check batch size
    if (messages.length > 1000) {
      error("Batch size cannot exceed 1000 messages", {
        hint: "Split your messages into smaller batches",
      });
      this.exit(1);
    }

    // Handle dry-run mode
    if (flags["dry-run"]) {
      return this.showPreview(messages, flags);
    }

    // Send the batch
    const spin = spinner(`Sending ${messages.length} messages...`);
    spin.start();

    try {
      const response = await apiClient.post<BatchResponse>(
        "/api/v1/messages/batch",
        {
          messages,
          messageType: flags.type,
          ...(flags.from && { from: flags.from }),
          ...(uploadId && { uploadId }), // Link to file upload for audit trail
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

  /**
   * Show batch preview (dry-run mode)
   */
  private async showPreview(
    messages: Array<{ to: string; text: string }>,
    flags: { type?: string },
  ): Promise<void> {
    const spin = spinner("Analyzing batch...").start();

    try {
      const preview = await apiClient.post<BatchPreviewResponse>(
        "/api/v1/messages/batch/preview",
        { messages, messageType: flags.type },
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
          const status = data.allowed ? colors.success("✓") : colors.error("✗");
          console.log(
            `  ${status} ${country}: ${data.count} msgs, ${data.credits} credits (${data.tier})`,
          );
          if (!data.allowed && data.blockedReason) {
            console.log(colors.dim(`     └─ ${data.blockedReason}`));
          }
        }
      }

      // Compliance check results
      if (preview.compliance) {
        console.log(colors.bold("\n🛡️  Compliance Check:\n"));
        console.log(
          `  Message Type:      ${preview.compliance.messageType.toUpperCase()}`,
        );

        if (preview.compliance.shaftBlocked > 0) {
          console.log(
            colors.error(
              `  SHAFT Blocked:     ${preview.compliance.shaftBlocked} messages`,
            ),
          );
          for (const msg of preview.compliance.shaftBlockedMessages.slice(
            0,
            3,
          )) {
            console.log(
              colors.dim(
                `     └─ ${msg.to}: ${msg.category} (${msg.matchedTerms.join(", ")})`,
              ),
            );
          }
          if (preview.compliance.shaftBlockedMessages.length > 3) {
            console.log(
              colors.dim(
                `     ... and ${preview.compliance.shaftBlockedMessages.length - 3} more`,
              ),
            );
          }
        } else {
          console.log(
            colors.success(
              "  SHAFT Check:       ✓ All messages pass content filter",
            ),
          );
        }

        if (preview.compliance.messageType === "marketing") {
          if (preview.compliance.quietHoursRescheduled > 0) {
            console.log(
              colors.warning(
                `  Quiet Hours:       ${preview.compliance.quietHoursRescheduled} messages will be rescheduled`,
              ),
            );
            for (const msg of preview.compliance.quietHoursBlockedMessages.slice(
              0,
              3,
            )) {
              const nextTime = msg.nextAllowedTime
                ? new Date(msg.nextAllowedTime).toLocaleString()
                : "next available window";
              console.log(
                colors.dim(
                  `     └─ ${msg.to}: ${msg.recipientTimezone} → ${nextTime}`,
                ),
              );
            }
            if (preview.compliance.quietHoursBlockedMessages.length > 3) {
              console.log(
                colors.dim(
                  `     ... and ${preview.compliance.quietHoursBlockedMessages.length - 3} more`,
                ),
              );
            }
          } else {
            console.log(
              colors.success(
                "  Quiet Hours:       ✓ All recipients within allowed hours",
              ),
            );
          }
        } else {
          console.log(
            colors.dim("  Quiet Hours:       Bypassed (transactional message)"),
          );
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
            colors.dim(`   ... and ${preview.blockedMessages.length - 5} more`),
          );
        }
      }

      console.log(
        "\n" + colors.dim("No messages were sent. Remove --dry-run to send."),
      );
    } catch (err) {
      spin.stop();
      throw err;
    }
  }

  /**
   * Format bytes to human readable string
   */
  private formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}
