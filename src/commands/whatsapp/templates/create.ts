import { Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../../lib/base-command.js";
import {
  apiClient,
  ApiError,
  ValidationError,
} from "../../../lib/api-client.js";
import {
  success,
  error,
  warn,
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
  warnings?: string[];
}

interface TemplateButton {
  type: string;
  text: string;
  url?: string;
}

const TEMPLATE_NAME_RE = /^[a-z0-9_]{1,512}$/;
const BUTTON_TYPES = ["url", "quick_reply", "otp"];

/**
 * Parse a --button value: "quick_reply:Stop promotions",
 * "url:Track order:https://example.com/{{1}}", or "otp:Copy code".
 * Returns an error string on bad input.
 */
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

/** Parse repeatable n=value pairs into a variables/examples record. */
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

/** Unique {{n}} placeholders in a body, ascending. */
function bodyPlaceholders(body: string): number[] {
  const seen = new Set<number>();
  const re = /\{\{(\d+)\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body || "")) !== null) {
    seen.add(parseInt(m[1], 10));
  }
  return Array.from(seen).sort((a, b) => a - b);
}

export default class WhatsappTemplatesCreate extends AuthenticatedCommand {
  static description =
    "Create a WhatsApp template and submit it to Meta for review";

  static examples = [
    '<%= config.bin %> whatsapp templates create --sender +15551234567 --name order_shipped --language en_US --category utility --body "Hi {{1}}, order {{2}} shipped!" --example 1=TinyFat --example 2=4821',
    '<%= config.bin %> whatsapp templates create --sender +15551234567 --name summer_sale --language en_US --category marketing --body "Our sale is on!" --footer "Reply STOP to opt out" --button "quick_reply:Stop promotions"',
    '<%= config.bin %> whatsapp templates create --sender +15551234567 --name login_code --language en_US --category authentication --body "{{1}} is your code" --example 1=123456 --button "otp:Copy code"',
  ];

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    sender: Flags.string({
      char: "s",
      description: "WhatsApp-connected sender number (E.164 format)",
      required: true,
    }),
    name: Flags.string({
      char: "n",
      description:
        "Template name (lowercase letters, numbers, and underscores)",
      required: true,
    }),
    language: Flags.string({
      char: "l",
      description: "Template language code (e.g. en_US)",
      required: true,
    }),
    category: Flags.string({
      char: "c",
      description: "Template category",
      options: ["authentication", "utility", "marketing"],
      required: true,
    }),
    body: Flags.string({
      char: "b",
      description: "Body text; use {{1}}, {{2}}, ... for variables",
      required: true,
    }),
    footer: Flags.string({
      description: "Footer text (optional)",
    }),
    header: Flags.string({
      description: "Header text (optional)",
    }),
    button: Flags.string({
      description:
        'Button as "type:text" or "url:text:https://..." (types: quick_reply, url, otp). Repeatable.',
      multiple: true,
    }),
    example: Flags.string({
      description:
        "Example value for a body variable, as n=value (required for every {{n}}). Repeatable.",
      multiple: true,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(WhatsappTemplatesCreate);

    if (!TEMPLATE_NAME_RE.test(flags.name)) {
      error("Invalid template name", {
        hint: "Use only lowercase letters, numbers, and underscores (e.g. order_shipped)",
      });
      this.exit(1);
    }

    const examples = parseKeyValuePairs(flags.example, "example");
    if (typeof examples === "string") {
      error(examples);
      this.exit(1);
    }

    const missing = bodyPlaceholders(flags.body).filter(
      (n) => !(examples && examples[String(n)]),
    );
    if (missing.length > 0) {
      error(
        `Missing example value${missing.length === 1 ? "" : "s"} for {{${missing.join("}}, {{")}}}`,
        {
          hint: `Meta requires an example for every variable: --example ${missing[0]}=value`,
        },
      );
      this.exit(1);
    }

    const buttons: TemplateButton[] = [];
    for (const raw of flags.button ?? []) {
      const parsed = parseButton(raw);
      if (typeof parsed === "string") {
        error(parsed);
        this.exit(1);
      }
      buttons.push(parsed as TemplateButton);
    }

    const createSpinner = spinner("Submitting template for review...");
    if (!isJsonMode()) {
      createSpinner.start();
    }

    try {
      const response = await apiClient.post<WhatsappTemplateResponse>(
        "/api/v1/whatsapp/templates",
        {
          sender: flags.sender,
          name: flags.name,
          language: flags.language,
          category: flags.category,
          body: flags.body,
          ...(flags.footer && { footer: flags.footer }),
          ...(flags.header && { header: flags.header }),
          ...(buttons.length > 0 && { buttons }),
          ...(examples && { examples }),
        },
      );

      createSpinner.stop();

      if (isJsonMode()) {
        json(response);
        return;
      }

      success("Template submitted for review", {
        ID: colors.code(response.id),
        Name: response.name,
        Language: response.language,
        Category: response.category,
        Status: colors.warning(response.status),
      });

      (response.warnings ?? []).forEach((w) => warn(w));

      console.log();
      console.log(
        colors.dim(
          `Meta reviews new templates, usually within a day. Check with: ${colors.code("sendly whatsapp templates list")}`,
        ),
      );
    } catch (err: any) {
      createSpinner.stop();

      if (err instanceof ApiError && err.code === "template_name_locked") {
        error(err.message, {
          hint: "Edit the existing template instead: sendly whatsapp templates update <id>",
        });
      } else if (
        err instanceof ApiError &&
        err.code === "template_already_exists"
      ) {
        error(err.message, {
          hint: "Pick a different name, or edit the existing template with `sendly whatsapp templates update`",
        });
      } else if (err instanceof ValidationError && err.message === "HTTP 400") {
        error("The template failed validation checks", {
          hint: "Every {{n}} needs an --example n=value; authentication templates can't contain links and need an otp button; names can't start with test/sample/demo",
        });
      } else if (err.message?.includes("connected to WhatsApp")) {
        error(err.message, {
          hint: `Connect it first: sendly whatsapp connect --number ${flags.sender}`,
        });
      } else {
        throw err;
      }
      this.exit(1);
    }
  }
}
