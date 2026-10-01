import fs from "node:fs";
import path from "node:path";
import {
  ApiError,
  ForbiddenError,
  isMissingScopesError,
  NotFoundError,
  RateLimitError,
} from "./api-client.js";
import { getConfigDir } from "./config.js";
import { colors, error, success } from "./output.js";

export interface WhatsappSignup {
  id: string;
  status: string;
  phoneNumber: string;
  businessAccountId: string | null;
  failureReasons: string[] | null;
  verificationMethod?: "sms" | "voice";
  verificationAttemptsRemaining?: number;
  verificationCode?: string | null;
  updatedAt: string;
}

export interface WhatsappSenderProfile {
  phoneNumber: string;
  displayName: string | null;
  profilePhotoUrl: string | null;
  category: string | null;
  about: string | null;
  description: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
}

export interface WhatsappConversationalComponents {
  phoneNumber: string;
  iceBreakers: string[];
  commands: Array<{ command: string; description: string }>;
}

export interface WhatsappCallingSettings {
  phoneNumber: string;
  callingEnabled: boolean;
  outboundCallingAllowed: boolean;
}

export const VERIFICATION_METHODS = ["sms", "voice"] as const;

export const PROFILE_PHOTO_MAX_BYTES = 5 * 1024 * 1024;

export function photoMimeType(buffer: Buffer): "image/jpeg" | "image/png" | undefined {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (buffer.length >= png.length && png.every((b, i) => buffer[i] === b)) {
    return "image/png";
  }
  return undefined;
}

export function parseCommandFlags(
  raw: string[] | undefined,
): Array<{ command: string; description: string }> | string | undefined {
  if (!raw || raw.length === 0) return undefined;
  const out: Array<{ command: string; description: string }> = [];
  for (const item of raw) {
    const idx = item.indexOf("=");
    if (idx <= 0) {
      return `Invalid --command "${item}": use name=description (e.g. "quote=Get a price for a job")`;
    }
    out.push({
      command: item.slice(0, idx).trim(),
      description: item.slice(idx + 1).trim(),
    });
  }
  return out;
}

export function printConversationalComponents(
  title: string,
  components: WhatsappConversationalComponents,
): void {
  const iceBreakers = components.iceBreakers ?? [];
  const commands = components.commands ?? [];
  success(title, {
    Number: components.phoneNumber,
    "Ice breakers": iceBreakers.length ? iceBreakers.length : colors.dim("none"),
    Commands: commands.length ? commands.length : colors.dim("none"),
  });
  if (iceBreakers.length) {
    console.log();
    console.log(colors.bold("Ice breakers"));
    iceBreakers.forEach((text) => console.log(`  ${text}`));
  }
  if (commands.length) {
    console.log();
    console.log(colors.bold("Commands"));
    const width = Math.max(...commands.map((c) => c.command.length)) + 1;
    commands.forEach((c) =>
      console.log(`  ${colors.code(`/${c.command}`.padEnd(width))}  ${c.description}`),
    );
  }
}

export const NOT_ENABLED_HINT =
  "WhatsApp is enabled per person (the user who owns the API key, not the workspace) and is rolling out gradually. Contact support@sendly.live for early access.";

export function whatsappSignupPath(id: string, action?: string): string {
  return `/api/v1/whatsapp/signup/${encodeURIComponent(id)}${action ? `/${action}` : ""}`;
}

export function whatsappSenderPath(number: string, resource: string): string {
  return `/api/v1/whatsapp/senders/${encodeURIComponent(number)}/${resource}`;
}

export function rememberSignup(id: string, phoneNumber: string): void {
  try {
    fs.writeFileSync(
      path.join(getConfigDir(), "whatsapp-signup.json"),
      JSON.stringify({ id, phoneNumber, createdAt: new Date().toISOString() }),
      { mode: 0o600 },
    );
  } catch {
    // non-fatal
  }
}

export function lastSignupId(): string | undefined {
  try {
    const raw = fs.readFileSync(
      path.join(getConfigDir(), "whatsapp-signup.json"),
      "utf8",
    );
    const parsed = JSON.parse(raw) as { id?: string };
    return parsed.id || undefined;
  } catch {
    return undefined;
  }
}

export function whatsappErrorCode(err: ApiError): string {
  const code = err.body?.error;
  return typeof code === "string" && /^[a-z0-9_]+$/.test(code)
    ? code
    : err.code;
}

export interface WhatsappErrorContext {
  number?: string;
  signupId?: string;
  roleAction?: string;
  keepApiCode?: boolean;
  photoRemoval?: boolean;
}

const START_AGAIN =
  "Start again with `sendly whatsapp connect --number <number> --business-account <id>`.";

export function reportWhatsappError(
  err: unknown,
  context: WhatsappErrorContext = {},
): boolean {
  if (!(err instanceof ApiError)) return false;
  const code = whatsappErrorCode(err);
  const body = err.body ?? {};
  const signup = context.signupId ?? "<id>";

  const report = (hint?: string, extra: Record<string, unknown> = {}) => {
    error(err.message, { code, ...extra, ...(hint && { hint }) });
    return true;
  };

  switch (code) {
    case "not_found":
      if (err instanceof NotFoundError && err.message === "Resource not found") {
        error("WhatsApp isn't enabled for your account yet.", {
          code,
          hint: NOT_ENABLED_HINT,
        });
        return true;
      }
      return false;
    case "insufficient_permissions":
      if (!(err instanceof ForbiddenError)) return false;
      return report(
        isMissingScopesError(err)
          ? `Use an API key with the ${/whatsapp:read/.test(err.message) ? "whatsapp:read" : "whatsapp:write"} scope.`
          : `${context.roleAction ?? "This change"} needs a workspace owner or admin (settings:write). Ask one of them to run this command.`,
      );
    case "whatsapp_sender_not_connected":
      return report(
        `Connect it first: sendly whatsapp connect --number ${context.number ?? "<number>"}`,
      );
    case "whatsapp_business_account_not_found":
      return report(
        "`sendly whatsapp senders` lists each connected number's business account id. To connect the first number of an account, run `sendly whatsapp connect --number <number>` without --business-account.",
      );
    case "display_name_required":
      return report(
        "Pass --display-name with the business name WhatsApp should show for this number.",
      );
    case "whatsapp_signup_in_progress":
      return report(
        typeof body.id === "string"
          ? `Finish that connection or wait for it to expire. Check it with \`sendly whatsapp status ${body.id}\`.`
          : "Finish that connection or wait for it to expire.",
        typeof body.id === "string" ? { id: body.id } : {},
      );
    case "whatsapp_verification_in_progress":
      return report(
        typeof body.id === "string"
          ? `Enter its code with \`sendly whatsapp verify ${body.id}\`, or wait for that attempt to expire.`
          : "Try again in a moment.",
        typeof body.id === "string" ? { id: body.id } : {},
      );
    case "whatsapp_already_enabled":
      return report("See it with `sendly whatsapp senders`.");
    case "whatsapp_verification_start_failed":
      return report(
        err.statusCode === 422
          ? "Check the number isn't registered with another WhatsApp account and the display name is allowed, then run the command again."
          : "The fee is refunded. Run the command again shortly to start over.",
      );
    case "payment_failed":
      return report(
        "Check your card at https://sendly.live/dashboard/billing, then try again.",
      );
    case "signup_not_found":
      error("WhatsApp connection not found.", {
        code,
        hint: "Check the signup id, or start one with `sendly whatsapp connect`.",
      });
      return true;
    case "signup_not_active":
      return report(`Check it with \`sendly whatsapp status ${signup}\`. ${START_AGAIN}`);
    case "invalid_verification_code":
      return report("Pass the 6-digit code WhatsApp sent, e.g. --code 482913.");
    case "whatsapp_verification_code_invalid":
      return report(
        `Check the code, or request a new one with \`sendly whatsapp resend-code ${signup}\`.`,
        typeof body.attemptsRemaining === "number"
          ? { attemptsRemaining: body.attemptsRemaining }
          : {},
      );
    case "whatsapp_verification_failed":
      return report(`The fee is refunded. ${START_AGAIN}`);
    case "whatsapp_verification_busy":
      return report("Try again in a moment.");
    case "whatsapp_verification_unavailable":
      return report("The attempt wasn't counted. Try again shortly.");
    case "whatsapp_activation_pending":
      return report(
        `Don't start again. Check with \`sendly whatsapp status ${signup}\` shortly.`,
      );
    case "whatsapp_verification_resend_too_soon": {
      const retryAfter = Number(body.retryAfter);
      const wait =
        Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter
          : err instanceof RateLimitError
            ? err.retryAfter
            : 30;
      return report(
        `Wait ${wait} second${wait === 1 ? "" : "s"}, then run the command again.`,
        { retryAfter: wait },
      );
    }
    case "whatsapp_verification_resend_failed":
      return report(
        err.statusCode === 422
          ? "Wait a few minutes, then try again."
          : "Try again shortly.",
      );
    case "file_required":
    case "whatsapp_profile_photo_invalid":
    case "whatsapp_profile_photo_too_large":
      return report("Use a square JPEG or PNG of 5 MB or less, at least 192 pixels wide (640 recommended).");
    case "whatsapp_profile_update_failed":
      return report(
        context.photoRemoval
          ? "Try again shortly."
          : "WhatsApp needs a square JPEG or PNG at least 192 pixels wide (640 recommended). Try again shortly.",
      );
    case "whatsapp_profile_fetch_failed":
    case "whatsapp_conversational_components_fetch_failed":
    case "whatsapp_conversational_components_update_failed":
    case "whatsapp_calling_update_failed":
      return report("Try again shortly.");
    case "voice_not_enabled":
      return report(
        `Turn voice on for the number first: sendly voice numbers update ${context.number ?? "<number>"} --enable`,
      );
    case "whatsapp_calling_unavailable":
    case "invalid_request":
      return report();
    default:
      if (
        context.keepApiCode &&
        code !== err.code &&
        (err.statusCode === 400 || err.statusCode === 404)
      ) {
        return report();
      }
      return false;
  }
}
