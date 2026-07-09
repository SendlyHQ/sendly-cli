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
import inquirer from "inquirer";

interface GroupMessageResponse {
  id: string;
  status: string;
  to: string[];
  group_message_id?: string;
  simulated?: boolean;
}

/**
 * `sendly sms group` — send a group MMS to 2-8 recipients (US/Canada only).
 *
 * Wraps `POST /api/v1/messages/group`. Every recipient sees the others and
 * replies fan out to the whole group. Group messaging is an A2P 10DLC
 * capability, so the sending number must be an MMS-enabled, 10DLC-registered
 * number you own — omit `--from` to use your workspace's default sender.
 * Gated behind `group_mms` / `enable_mms` on the server; without the flag the
 * server returns 403 and this command surfaces it.
 */
export default class SmsGroup extends AuthenticatedCommand {
  static description =
    "Send a group MMS to 2-8 recipients (US/Canada only). Everyone sees the group and replies fan out to all participants.";

  static examples = [
    '<%= config.bin %> sms group --to +14155551234,+14155555678 --text "Team sync at noon?"',
    '<%= config.bin %> sms group --to +14155551234,+14155555678 --media-url https://example.com/flyer.jpg',
    '<%= config.bin %> sms group --to +14155551234,+14155555678 --text "Hi all" --from "+15551234567"',
    '<%= config.bin %> sms group --to +14155551234,+14155555678 --text "Sale!" --type marketing',
    '<%= config.bin %> sms group --to +14155551234,+14155555678 --text "Hi all" --json',
  ];

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    to: Flags.string({
      char: "t",
      description:
        "Comma-separated recipient phone numbers (2-8, E.164 format, US/CA only)",
    }),
    text: Flags.string({
      char: "m",
      description: "Message text (optional when --media-url is provided)",
    }),
    from: Flags.string({
      char: "f",
      description: "Sender ID or phone number (MMS-enabled 10DLC number you own)",
    }),
    type: Flags.string({
      description:
        "Message type: transactional (default) or marketing. Marketing applies quiet-hours rules.",
      options: ["marketing", "transactional"],
    }),
    "media-url": Flags.string({
      description: "Media URL to attach (MMS). Can be specified multiple times.",
      multiple: true,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(SmsGroup);
    const mediaUrls = flags["media-url"];
    const hasMedia = mediaUrls && mediaUrls.length > 0;

    let rawTo = flags.to;
    let text = flags.text;

    if (!rawTo) {
      if (process.stdin.isTTY) {
        const answers = await inquirer.prompt([
          {
            type: "input",
            name: "to",
            message: "Recipient phone numbers (comma-separated, 2-8):",
            validate: (input: string) => {
              if (!input.trim()) return "At least 2 recipients are required";
              return true;
            },
          },
        ]);
        rawTo = answers.to;
      } else {
        error("Missing required flag: --to", {
          hint: "Use --to +14155551234,+14155555678",
        });
        this.exit(1);
      }
    }

    const to = rawTo!
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p.length > 0)
      .map((p) => (p.startsWith("+") ? p : `+${p}`));

    if (to.length < 2) {
      error("Group messaging requires at least 2 recipients", {
        hint: "Pass 2-8 numbers: --to +14155551234,+14155555678",
      });
      this.exit(1);
    }

    if (to.length > 8) {
      error("Group messaging supports at most 8 recipients");
      this.exit(1);
    }

    for (const recipient of to) {
      if (!/^\+[1-9]\d{1,14}$/.test(recipient)) {
        error(`Invalid phone number: ${recipient}`, {
          hint: "Use E.164 format: +14155551234",
        });
        this.exit(1);
      }
    }

    if (!text && !hasMedia) {
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
        error("Either --text or --media-url is required");
        this.exit(1);
      }
    }

    if (text && !text.trim()) {
      error("Message text cannot be empty");
      this.exit(1);
    }

    const spin = spinner(`Sending group MMS to ${to.length} recipients...`);
    spin.start();

    try {
      const response = await apiClient.post<GroupMessageResponse>(
        "/api/v1/messages/group",
        {
          to,
          ...(text && { text }),
          ...(flags.from && { from: flags.from }),
          ...(hasMedia && { mediaUrls }),
          ...(flags.type && { messageType: flags.type }),
        },
      );

      spin.stop();

      if (isJsonMode()) {
        json(response);
        return;
      }

      success("Group MMS sent", {
        ID: response.id,
        Recipients: response.to.length,
        Status: formatStatus(response.status),
        ...(response.group_message_id && {
          "Group ID": response.group_message_id,
        }),
        ...(hasMedia && {
          Media: `${mediaUrls.length} attachment${mediaUrls.length > 1 ? "s" : ""}`,
        }),
        ...(response.simulated && { Simulated: "yes" }),
      });

      if (!isJsonMode()) {
        for (const recipient of response.to) {
          console.log(`  ${colors.dim("To:")} ${colors.code(recipient)}`);
        }
      }
    } catch (err) {
      spin.stop();
      throw err;
    }
  }
}
