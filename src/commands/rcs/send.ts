import { Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import {
  apiClient,
  ApiError,
  ApiKeyRequiredError,
  AuthenticationError,
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
  formatStatus,
  formatCredits,
} from "../../lib/output.js";

interface RcsSendResponse {
  id: string;
  channel: string;
  fellBackTo?: string;
  message_format: string;
  to: string;
  from: string;
  text: string | null;
  status: string;
  segments: number;
  creditsUsed: number;
  rcs: {
    kind?: string;
    agentId: string;
    agentName?: string;
    requestedChannel?: string;
    suggestionsDropped?: boolean;
  };
  createdAt: string;
  metadata: Record<string, unknown>;
}

type RcsSuggestion =
  | { reply: { text: string; postbackData: string } }
  | { action: { text: string; postbackData: string; url: string } };

/** Parse repeatable "text=postback" pairs into reply suggestions. */
function parseReplies(
  raw: string[] | undefined,
): RcsSuggestion[] | string {
  if (!raw || raw.length === 0) return [];
  const out: RcsSuggestion[] = [];
  for (const item of raw) {
    const idx = item.indexOf("=");
    if (idx <= 0 || idx === item.length - 1) {
      return `Invalid --suggest-reply "${item}" — use text=postback (e.g. "Track order=TRACK")`;
    }
    out.push({
      reply: {
        text: item.slice(0, idx).trim(),
        postbackData: item.slice(idx + 1),
      },
    });
  }
  return out;
}

/** Parse repeatable "text=postback=url" triples into open-URL suggestions. */
function parseUrlActions(
  raw: string[] | undefined,
): RcsSuggestion[] | string {
  if (!raw || raw.length === 0) return [];
  const out: RcsSuggestion[] = [];
  for (const item of raw) {
    const first = item.indexOf("=");
    const second = first === -1 ? -1 : item.indexOf("=", first + 1);
    const text = first > 0 ? item.slice(0, first).trim() : "";
    const postbackData = second > first + 1 ? item.slice(first + 1, second) : "";
    const url = second === -1 ? "" : item.slice(second + 1);
    if (!text || !postbackData || !url) {
      return `Invalid --suggest-url "${item}" — use text=postback=url (e.g. "View order=VIEW=https://example.com/o/4821")`;
    }
    out.push({ action: { text, postbackData, url } });
  }
  return out;
}

export default class RcsSend extends AuthenticatedCommand {
  static description =
    "Send an RCS message — rich text with suggestion chips or a rich card; recipients without RCS get it as plain SMS unless --no-fallback";

  static examples = [
    '<%= config.bin %> rcs send --to +15125550190 --text "Your order shipped!"',
    '<%= config.bin %> rcs send --to +15125550190 --text "Need anything else?" --suggest-reply "Track order=TRACK" --suggest-url "View receipt=RECEIPT=https://example.com/r/4821"',
    '<%= config.bin %> rcs send --to +15125550190 --card-title "Spring sale" --card-description "20% off everything this weekend" --card-media https://example.com/sale.jpg',
    '<%= config.bin %> rcs send --to +15125550190 --text "RCS only please" --no-fallback',
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
      description: "Message text (falls back to SMS for non-RCS recipients)",
      exclusive: [
        "card-title",
        "card-description",
        "card-media",
        "card-orientation",
      ],
    }),
    agent: Flags.string({
      description:
        "RCS agent id to send from (only needed when your workspace has more than one — see `rcs agents`)",
    }),
    "card-title": Flags.string({
      description: "Rich card title (cards have no SMS form — RCS-capable recipients only)",
    }),
    "card-description": Flags.string({
      description: "Rich card body text; required with --card-title",
      dependsOn: ["card-title"],
    }),
    "card-media": Flags.string({
      description: "Public JPEG, PNG, or GIF image URL for the card",
      dependsOn: ["card-title"],
    }),
    "card-orientation": Flags.string({
      description: "Card layout",
      options: ["vertical", "horizontal"],
      dependsOn: ["card-title"],
    }),
    "suggest-reply": Flags.string({
      description:
        'Reply chip as "text=postback" (e.g. --suggest-reply "Track order=TRACK"). Repeatable.',
      multiple: true,
    }),
    "suggest-url": Flags.string({
      description:
        'Open-URL chip as "text=postback=url" (e.g. --suggest-url "View order=VIEW=https://example.com/o/4821"). Repeatable.',
      multiple: true,
    }),
    "no-fallback": Flags.boolean({
      description:
        "Fail with an error instead of delivering as SMS when the recipient doesn't support RCS",
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(RcsSend);

    const hasCard = flags["card-title"] !== undefined;
    if (!flags.text && !hasCard) {
      error("Provide either --text or --card-title", {
        hint: 'Text: --text "Hello!" · Card: --card-title "Spring sale" --card-description "20% off"',
      });
      this.exit(1);
    }
    if (hasCard && flags["card-description"] === undefined) {
      error("Missing --card-description for the card", {
        hint: "Rich cards need both a title and a description",
      });
      this.exit(1);
    }

    const replies = parseReplies(flags["suggest-reply"]);
    if (typeof replies === "string") {
      error(replies);
      this.exit(1);
    }
    const urlActions = parseUrlActions(flags["suggest-url"]);
    if (typeof urlActions === "string") {
      error(urlActions);
      this.exit(1);
    }
    const suggestions = [
      ...(replies as RcsSuggestion[]),
      ...(urlActions as RcsSuggestion[]),
    ];

    const sendSpinner = spinner("Sending RCS message...");
    if (!isJsonMode()) {
      sendSpinner.start();
    }

    try {
      const response = await apiClient.post<RcsSendResponse>(
        "/api/v1/messages",
        {
          channel: "rcs",
          to: flags.to,
          ...(flags.agent && { agentId: flags.agent }),
          ...(hasCard
            ? {
                card: {
                  title: flags["card-title"],
                  description: flags["card-description"],
                  ...(flags["card-media"] && {
                    mediaUrl: flags["card-media"],
                  }),
                  ...(flags["card-orientation"] && {
                    orientation: flags["card-orientation"],
                  }),
                  ...(suggestions.length > 0 && { suggestions }),
                },
              }
            : {
                text: flags.text,
                ...(suggestions.length > 0 && { suggestions }),
              }),
          ...(flags["no-fallback"] && { fallbackToSms: false }),
        },
      );

      sendSpinner.stop();

      if (isJsonMode()) {
        json(response);
        return;
      }

      if (response.fellBackTo === "sms") {
        success("Message queued as SMS — recipient doesn't support RCS", {
          "Message ID": colors.code(response.id),
          To: response.to,
          From: response.from,
          Status: formatStatus(response.status),
          Segments: response.segments,
          Credits: formatCredits(response.creditsUsed),
        });
        if (response.rcs?.suggestionsDropped) {
          console.log();
          console.log(
            colors.dim(
              "Suggestion chips have no SMS form and were dropped from this message.",
            ),
          );
        }
        return;
      }

      success("RCS message queued", {
        "Message ID": colors.code(response.id),
        To: response.to,
        From: response.from,
        Kind: response.rcs?.kind ?? (hasCard ? "card" : "text"),
        Status: formatStatus(response.status),
        Credits: formatCredits(response.creditsUsed),
      });
    } catch (err: any) {
      sendSpinner.stop();

      if (
        err instanceof ApiError &&
        err.code === "rcs_not_supported_for_recipient"
      ) {
        error(err.message, {
          hint: hasCard
            ? "Cards have no SMS form — send a text message to reach non-RCS recipients"
            : "Drop --no-fallback to deliver to non-RCS recipients as SMS",
        });
      } else if (err instanceof NotFoundError) {
        error(
          err.message === "Resource not found"
            ? "RCS isn't available on your workspace yet."
            : err.message,
          {
            hint: "RCS is rolling out gradually — contact support@sendly.live for early access.",
          },
        );
      } else if (err instanceof ApiKeyRequiredError) {
        error("RCS messages require a live API key.", {
          hint: "RCS delivery is never simulated on a test key — create one with `sendly keys create --type live`",
        });
      } else if (
        err instanceof ValidationError &&
        /more than one RCS agent/i.test(err.message ?? "")
      ) {
        error(err.message, {
          hint: "Pass --agent <id> — list them with `sendly rcs agents`",
        });
      } else if (
        err instanceof AuthenticationError &&
        /opted out/i.test(err.message ?? "")
      ) {
        error(err.message);
      } else if (
        err instanceof AuthenticationError &&
        /agent/i.test(err.message ?? "")
      ) {
        error(err.message, {
          hint: "See which agents can send with `sendly rcs agents`",
        });
      } else if (
        err instanceof AuthenticationError &&
        /rcs|verification|not supported|registration/i.test(err.message ?? "")
      ) {
        error(err.message, {
          hint: "This recipient can't receive RCS and your account can't send SMS to this destination — complete verification, or message an RCS-capable recipient",
        });
      } else {
        throw err;
      }
      this.exit(1);
    }
  }
}
