import { Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import {
  apiClient,
  ApiError,
  AuthenticationError,
  NotFoundError,
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

interface WhatsappSendResponse {
  id: string;
  channel: string;
  message_format: string;
  to: string;
  from: string;
  text: string | null;
  status: string;
  segments: number;
  creditsUsed: number;
  whatsapp: {
    kind: string;
    template?: { name: string; language: string; category: string };
    messageId: string | null;
  };
  createdAt: string;
  metadata: Record<string, unknown>;
}

/** Parse repeatable n=value pairs into a template-variables record. */
function parseVariables(
  raw: string[] | undefined,
): Record<string, string> | string | undefined {
  if (!raw || raw.length === 0) return undefined;
  const out: Record<string, string> = {};
  for (const item of raw) {
    const idx = item.indexOf("=");
    if (idx <= 0) {
      return `Invalid --var "${item}" — use n=value (e.g. 1=TinyFat)`;
    }
    out[item.slice(0, idx).trim()] = item.slice(idx + 1);
  }
  return out;
}

export default class WhatsappSend extends AuthenticatedCommand {
  static description =
    "Send a WhatsApp message — free-form text inside the 24-hour reply window, or an approved template any time";

  static examples = [
    '<%= config.bin %> whatsapp send --to +15551234567 --from +15559876543 --text "Your table is ready!"',
    "<%= config.bin %> whatsapp send --to +447700900123 --from +15559876543 --template order_shipped --language en_US --var 1=TinyFat --var 2=4821",
    '<%= config.bin %> whatsapp send --to +15551234567 --from +15559876543 --text "Hello!" --json',
  ];

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    to: Flags.string({
      char: "t",
      description: "Recipient phone number (E.164 format)",
      required: true,
    }),
    from: Flags.string({
      char: "f",
      description: "Your WhatsApp-connected sender number (E.164 format)",
      required: true,
    }),
    text: Flags.string({
      char: "m",
      description:
        "Free-form message text (only inside the 24-hour reply window)",
      exclusive: ["template", "language", "var"],
    }),
    template: Flags.string({
      description: "Approved template name (reaches contacts any time)",
    }),
    language: Flags.string({
      char: "l",
      description: "Template language code (e.g. en_US); required with --template",
      dependsOn: ["template"],
    }),
    var: Flags.string({
      description:
        "Template variable as n=value (e.g. --var 1=TinyFat). Repeatable.",
      multiple: true,
      dependsOn: ["template"],
    }),
    "idempotency-key": Flags.string({
      description:
        "Idempotency key (1-255 printable ASCII characters). Re-running with the same key within 24 hours returns the original result instead of sending again.",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(WhatsappSend);

    if (!flags.text && !flags.template) {
      error("Provide either --text or --template", {
        hint: 'Free-form: --text "Hello!" · Template: --template order_shipped --language en_US',
      });
      this.exit(1);
    }
    if (flags.template && !flags.language) {
      error("Missing --language for the template", {
        hint: "Templates are per-language — e.g. --language en_US",
      });
      this.exit(1);
    }

    const variables = parseVariables(flags.var);
    if (typeof variables === "string") {
      error(variables);
      this.exit(1);
    }

    const sendSpinner = spinner("Sending WhatsApp message...");
    if (!isJsonMode()) {
      sendSpinner.start();
    }

    try {
      const response = await apiClient.post<WhatsappSendResponse>(
        "/api/v1/messages",
        {
          channel: "whatsapp",
          to: flags.to,
          from: flags.from,
          ...(flags.text
            ? { text: flags.text }
            : {
                template: {
                  name: flags.template,
                  language: flags.language,
                  ...(variables && { variables }),
                },
              }),
        },
        true,
        { idempotencyKey: flags["idempotency-key"] },
      );

      sendSpinner.stop();

      if (isJsonMode()) {
        json(response);
        return;
      }

      success("WhatsApp message queued", {
        "Message ID": colors.code(response.id),
        To: response.to,
        From: response.from,
        Kind: response.whatsapp?.kind ?? (flags.text ? "text" : "template"),
        ...(response.whatsapp?.template && {
          Template: `${response.whatsapp.template.name} (${response.whatsapp.template.language}, ${response.whatsapp.template.category})`,
        }),
        Status: formatStatus(response.status),
        Credits: formatCredits(response.creditsUsed),
      });
    } catch (err: any) {
      sendSpinner.stop();

      if (err instanceof ApiError && err.code === "whatsapp_window_closed") {
        error(err.message, {
          hint: "outside the 24-hour reply window — send an approved template instead",
        });
        console.error(
          colors.dim(
            `  e.g. ${colors.code(`sendly whatsapp send --to ${flags.to} --from ${flags.from} --template <name> --language en_US`)}`,
          ),
        );
      } else if (
        err instanceof ApiError &&
        err.code === "whatsapp_template_not_approved"
      ) {
        error(err.message, {
          hint: "Check its review status with `sendly whatsapp templates list`",
        });
      } else if (err instanceof NotFoundError) {
        error(err.message, {
          hint: "Run `sendly whatsapp templates list` to see your templates and their exact names/languages",
        });
      } else if (
        err instanceof AuthenticationError &&
        err.message?.includes("connected to WhatsApp")
      ) {
        error(err.message, {
          hint: `Connect it first: sendly whatsapp connect --number ${flags.from}`,
        });
      } else if (
        err instanceof AuthenticationError &&
        /whatsapp/i.test(err.message ?? "")
      ) {
        error(err.message);
      } else {
        throw err;
      }
      this.exit(1);
    }
  }
}
