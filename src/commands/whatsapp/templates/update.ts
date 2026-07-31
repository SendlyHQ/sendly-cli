import { Args, Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../../lib/base-command.js";
import {
  apiClient,
  ApiError,
  NotFoundError,
  ValidationError,
} from "../../../lib/api-client.js";
import {
  success,
  error,
  json,
  colors,
  spinner,
  isJsonMode,
} from "../../../lib/output.js";

interface WhatsappTemplateResponse {
  id: string;
  name: string;
  language: string;
  category: string;
  status: string;
  qualityRating: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
}

interface TemplateButton {
  type: string;
  text: string;
  url?: string;
}

const BUTTON_TYPES = ["url", "quick_reply", "otp"];

function parseButton(raw: string): TemplateButton | string {
  const firstSep = raw.indexOf(":");
  if (firstSep === -1) {
    return `Invalid --button "${raw}" — use type:text (types: ${BUTTON_TYPES.join(", ")})`;
  }
  const type = raw.slice(0, firstSep).trim().toLowerCase();
  const rest = raw.slice(firstSep + 1);
  if (!BUTTON_TYPES.includes(type)) {
    return `Invalid --button type "${type}" — must be one of: ${BUTTON_TYPES.join(", ")}`;
  }
  if (type === "url") {
    const secondSep = rest.indexOf(":");
    if (secondSep === -1) {
      return `Invalid --button "${raw}" — url buttons need url:text:https://...`;
    }
    const text = rest.slice(0, secondSep).trim();
    const url = rest.slice(secondSep + 1).trim();
    if (!text || !url) {
      return `Invalid --button "${raw}" — url buttons need url:text:https://...`;
    }
    return { type, text, url };
  }
  const text = rest.trim();
  if (!text) {
    return `Invalid --button "${raw}" — button text is required`;
  }
  return { type, text };
}

function parseKeyValuePairs(
  raw: string[] | undefined,
  flagName: string,
): Record<string, string> | string | undefined {
  if (!raw || raw.length === 0) return undefined;
  const out: Record<string, string> = {};
  for (const item of raw) {
    const idx = item.indexOf("=");
    if (idx <= 0) {
      return `Invalid --${flagName} "${item}" — use n=value (e.g. 1=TinyFat)`;
    }
    out[item.slice(0, idx).trim()] = item.slice(idx + 1);
  }
  return out;
}

export default class WhatsappTemplatesUpdate extends AuthenticatedCommand {
  static description =
    "Edit an approved or rejected WhatsApp template and resubmit it to Meta for review";

  static examples = [
    '<%= config.bin %> whatsapp templates update 3f6a1c9e-0000-0000-0000-000000000000 --body "Hi {{1}}, your order shipped!" --example 1=TinyFat',
    '<%= config.bin %> whatsapp templates update 3f6a1c9e-0000-0000-0000-000000000000 --footer ""',
  ];

  static args = {
    id: Args.string({
      description: "Template ID",
      required: true,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    body: Flags.string({
      char: "b",
      description: "New body text; use {{1}}, {{2}}, ... for variables",
    }),
    footer: Flags.string({
      description: 'New footer text (pass "" to remove it)',
    }),
    header: Flags.string({
      description: 'New header text (pass "" to remove it)',
    }),
    button: Flags.string({
      description:
        'Replace all buttons: "type:text" or "url:text:https://..." (types: quick_reply, url, otp). Repeatable.',
      multiple: true,
    }),
    example: Flags.string({
      description:
        "Replace example values for body variables, as n=value. Repeatable.",
      multiple: true,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(WhatsappTemplatesUpdate);

    if (
      flags.body === undefined &&
      flags.footer === undefined &&
      flags.header === undefined &&
      flags.button === undefined &&
      flags.example === undefined
    ) {
      error("Nothing to update", {
        hint: "Pass at least one of --body, --footer, --header, --button, --example",
      });
      this.exit(1);
    }

    const examples = parseKeyValuePairs(flags.example, "example");
    if (typeof examples === "string") {
      error(examples);
      this.exit(1);
    }

    let buttons: TemplateButton[] | undefined;
    if (flags.button !== undefined) {
      buttons = [];
      for (const raw of flags.button) {
        const parsed = parseButton(raw);
        if (typeof parsed === "string") {
          error(parsed);
          this.exit(1);
        }
        buttons.push(parsed as TemplateButton);
      }
    }

    const updateSpinner = spinner("Resubmitting template for review...");
    if (!isJsonMode()) {
      updateSpinner.start();
    }

    try {
      const response = await apiClient.patch<WhatsappTemplateResponse>(
        `/api/v1/whatsapp/templates/${encodeURIComponent(args.id)}`,
        {
          ...(flags.body !== undefined && { body: flags.body }),
          ...(flags.footer !== undefined && { footer: flags.footer }),
          ...(flags.header !== undefined && { header: flags.header }),
          ...(buttons !== undefined && { buttons }),
          ...(examples !== undefined && { examples }),
        },
      );

      updateSpinner.stop();

      if (isJsonMode()) {
        json(response);
        return;
      }

      success("Template resubmitted for review", {
        ID: colors.code(response.id),
        Name: response.name,
        Language: response.language,
        Category: response.category,
        Status: colors.warning(response.status),
      });

      console.log();
      console.log(
        colors.dim(
          `Meta reviews the edit, usually within a day. Check with: ${colors.code("sendly whatsapp templates list")}`,
        ),
      );
    } catch (err: any) {
      updateSpinner.stop();

      if (err instanceof ApiError && err.code === "template_not_editable") {
        error(err.message, {
          hint: "Only approved or rejected templates can be edited — a pending template is already in review",
        });
      } else if (err instanceof NotFoundError) {
        error("Template not found", {
          hint: "Run `sendly whatsapp templates list` to see template ids",
        });
      } else if (err instanceof ValidationError && err.message === "HTTP 400") {
        error("The template failed validation checks", {
          hint: "Every {{n}} needs an --example n=value; authentication templates can't contain links and need an otp button",
        });
      } else {
        throw err;
      }
      this.exit(1);
    }
  }
}
