/**
 * Voice configuration helpers
 * Shapes, paths, request bodies, formatting and error reporting shared by the
 * `sendly voice` commands (numbers, agents, voices)
 */

import { ApiError, ApiKeyRequiredError } from "./api-client.js";
import { reportCallsError } from "./calls.js";
import { colors, error, isJsonMode } from "./output.js";

export type VoiceMode = "none" | "ring_dashboard" | "agent";

export interface EmergencyAddress {
  street: string;
  unit?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}

export interface VoiceNumberEmergencyAddress {
  status: string;
  address: EmergencyAddress | null;
}

export interface VoiceNumberRates {
  inbound: number;
  outbound: number;
  agent: number;
}

export interface VoiceNumber {
  id: string;
  object: "voice_number";
  phoneNumber: string;
  phoneNumberType: string | null;
  countryCode: string | null;
  isDefault: boolean;
  voiceEnabled: boolean;
  voiceMode: VoiceMode;
  agentId: string | null;
  emergencyAddress: VoiceNumberEmergencyAddress | null;
  ratePerMinute: VoiceNumberRates;
}

export interface VoiceAgentTools {
  sendSms: boolean;
  transferTo: string | null;
}

export interface VoiceAgent {
  id: string;
  object: "voice_agent";
  name: string;
  enabled: boolean;
  voice: string;
  voiceLabel: string;
  language: string;
  greeting: string;
  instructions: string;
  tools: VoiceAgentTools;
  canSendSms: boolean;
  callsHandled: number;
  avgDurationSecs: number;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface Voice {
  id: string;
  label: string;
  language: string;
}

export interface VoiceListResponse<T> {
  data: T[];
}

export interface DeletedVoiceAgent {
  id: string;
  object: "voice_agent";
  deleted: true;
}

export const VOICE_MODES: readonly VoiceMode[] = ["none", "ring_dashboard", "agent"];

export const VOICE_NUMBERS_PATH = "/api/v1/voice/numbers";
export const VOICE_AGENTS_PATH = "/api/v1/voice/agents";
export const VOICE_VOICES_PATH = "/api/v1/voice/voices";

export const EMERGENCY_ADDRESS_COUNTRIES = new Set(["US", "CA"]);

export function voiceNumberPath(number: string): string {
  return `${VOICE_NUMBERS_PATH}/${encodeURIComponent(number)}`;
}

export function voiceNumberEmergencyAddressPath(number: string): string {
  return `${voiceNumberPath(number)}/emergency-address`;
}

export function voiceAgentPath(id: string): string {
  return `${VOICE_AGENTS_PATH}/${encodeURIComponent(id)}`;
}

export interface NumberUpdateFlags {
  enable?: boolean;
  disable?: boolean;
  mode?: string;
  agent?: string;
}

export function buildNumberUpdateBody(
  flags: NumberUpdateFlags,
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (flags.enable) body.voiceEnabled = true;
  if (flags.disable) body.voiceEnabled = false;
  if (flags.mode !== undefined) body.voiceMode = flags.mode;
  if (flags.agent !== undefined) body.agentId = flags.agent.trim() || null;
  return body;
}

export interface EmergencyAddressFlags {
  street: string;
  unit?: string;
  city: string;
  state: string;
  zip: string;
  country?: string;
}

export function buildEmergencyAddressBody(
  flags: EmergencyAddressFlags,
): Record<string, string> | string {
  const body: Record<string, string> = {};
  for (const key of ["street", "city", "state", "zip"] as const) {
    const value = (flags[key] ?? "").trim();
    if (!value) return `--${key} cannot be empty`;
    body[key] = value;
  }
  const unit = flags.unit?.trim();
  if (unit) body.unit = unit;
  const country = flags.country?.trim();
  if (country) body.country = country;
  return body;
}

export interface AgentFlags {
  name?: string;
  enable?: boolean;
  disable?: boolean;
  voice?: string;
  language?: string;
  greeting?: string;
  instructions?: string;
  sms?: boolean;
}

export function buildAgentBody(flags: AgentFlags): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (flags.name !== undefined) body.name = flags.name.trim();
  if (flags.enable) body.enabled = true;
  if (flags.disable) body.enabled = false;
  if (flags.voice !== undefined) body.voice = flags.voice.trim();
  if (flags.language !== undefined) body.language = flags.language.trim();
  if (flags.greeting !== undefined) body.greeting = flags.greeting;
  if (flags.instructions !== undefined) body.instructions = flags.instructions;
  if (flags.sms !== undefined) body.tools = { sendSms: flags.sms };
  return body;
}

export function formatVoiceMode(mode: string, voiceEnabled: boolean): string {
  if (!voiceEnabled || mode === "none") return colors.dim("off");
  if (mode === "agent") return colors.success("AI agent");
  if (mode === "ring_dashboard") return colors.success("team");
  return mode;
}

export function describeAnswering(number: VoiceNumber): string {
  if (!number.voiceEnabled || number.voiceMode === "none") {
    return colors.dim("nobody, voice is off");
  }
  if (number.voiceMode === "agent") {
    return `AI agent ${number.agentId ? colors.code(number.agentId) : colors.dim("(none chosen)")}`;
  }
  if (number.voiceMode === "ring_dashboard") {
    return "your team, ringing in the dashboard";
  }
  return number.voiceMode;
}

export function formatEmergencyStatus(
  emergency: VoiceNumberEmergencyAddress | null | undefined,
): string {
  if (!emergency) return colors.dim("not registered");
  switch (emergency.status) {
    case "active":
      return colors.success("active");
    case "provisioning":
      return colors.warning("provisioning");
    default:
      return colors.error(emergency.status);
  }
}

export function formatAddress(
  address: Partial<EmergencyAddress> | null | undefined,
): string {
  if (!address) return "-";
  const street = [address.street, address.unit].filter(Boolean).join(", ");
  const region = [address.state, address.zip].filter(Boolean).join(" ");
  const line = [street, address.city, region, address.country]
    .filter(Boolean)
    .join(", ");
  return line || "-";
}

export function formatRates(rates: VoiceNumberRates | null | undefined): string {
  if (!rates) return "-";
  return `${rates.inbound} / ${rates.outbound} / ${rates.agent}`;
}

export function formatTexting(
  agent: Pick<VoiceAgent, "tools" | "canSendSms">,
): string {
  if (!agent.tools?.sendSms) return colors.dim("off");
  return agent.canSendSms
    ? colors.success("on")
    : colors.warning("on, but no sending key yet");
}

export function needsEmergencyAddress(number: VoiceNumber): boolean {
  if (number.countryCode && !EMERGENCY_ADDRESS_COUNTRIES.has(number.countryCode)) {
    return false;
  }
  const status = number.emergencyAddress?.status;
  return status !== "active" && status !== "provisioning";
}

export function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_+.,:/@-]+$/.test(value)) return value;
  return `"${value.replace(/(["\\$`])/g, "\\$1")}"`;
}

const ADDRESS_FIELDS = ["street", "unit", "city", "state", "zip", "country"] as const;

export function emergencyAddressCommand(
  number: string,
  address: Partial<EmergencyAddress>,
): string {
  const parts = ["sendly voice numbers emergency-address", shellQuote(number)];
  for (const field of ADDRESS_FIELDS) {
    const value = address[field];
    if (typeof value === "string" && value.trim()) {
      parts.push(`--${field} ${shellQuote(value.trim())}`);
    }
  }
  return parts.join(" ");
}

export function apiErrorCode(err: ApiError): string {
  const code = err.body?.error;
  return typeof code === "string" && code ? code : err.code;
}

function suggestedAddress(value: unknown): Partial<EmergencyAddress> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out: Partial<EmergencyAddress> = {};
  for (const field of ADDRESS_FIELDS) {
    const raw = (value as Record<string, unknown>)[field];
    if (typeof raw === "string" && raw.trim()) out[field] = raw.trim();
  }
  return Object.keys(out).length > 0 ? out : null;
}

export interface VoiceErrorContext {
  number?: string;
  agentId?: string;
  address?: Partial<EmergencyAddress>;
  forbiddenHint?: string;
}

export const NUMBER_ROLE_HINT =
  "Changing a number's voice settings needs the owner or admin role in this workspace";

export const AGENT_ROLE_HINT =
  "Managing agents needs the owner or admin role in this workspace, because each agent holds its own sending key";

export function reportVoiceError(
  err: unknown,
  context: VoiceErrorContext = {},
): boolean {
  if (!(err instanceof ApiError)) return false;
  const code = apiErrorCode(err);
  const body = err.body ?? {};

  switch (code) {
    case "number_not_found":
      error(err.message, {
        code,
        hint: "List your numbers with `sendly voice numbers list`, then pass an id or the E.164 number",
      });
      return true;
    case "agent_not_found":
      error(err.message, {
        code,
        hint: "List your agents with `sendly voice agents list`",
      });
      return true;
    case "agent_required":
      error(err.message, {
        code,
        hint: "Pass --agent <id> together with --mode agent. List your agents with `sendly voice agents list`",
      });
      return true;
    case "agent_disabled":
      error(err.message, {
        code,
        hint: `Switch the agent on first: sendly voice agents update ${context.agentId ?? "<agentId>"} --enable`,
      });
      return true;
    case "agent_limit":
      error(err.message, {
        code,
        hint: "Delete an agent you no longer use with `sendly voice agents delete <id>`",
      });
      return true;
    case "agent_in_use": {
      const numbers = Array.isArray(body.numbers)
        ? body.numbers.filter((n): n is string => typeof n === "string")
        : [];
      error(err.message, {
        code,
        ...(numbers.length > 0
          ? { numbers: isJsonMode() ? numbers : numbers.join(", ") }
          : {}),
        hint: `Point those numbers at another agent or back to the team first: sendly voice numbers update ${numbers[0] ?? "<number>"} --mode ring_dashboard`,
      });
      return true;
    }
    case "invalid_address": {
      const suggested = suggestedAddress(body.suggested);
      if (suggested) {
        const merged = { ...(context.address ?? {}), ...suggested };
        error(err.message, {
          code,
          suggested: isJsonMode() ? suggested : formatAddress(suggested),
          hint: context.number
            ? `If the suggested address is right, register it with: ${emergencyAddressCommand(context.number, merged)}`
            : "If the suggested address is right, run the command again with it",
        });
        return true;
      }
      error(err.message, {
        code,
        hint: "Pass --street, --city, --state (two letters) and --zip; add --country CA for a Canadian address",
      });
      return true;
    }
    case "e911_not_applicable":
      error(err.message, { code });
      return true;
    case "voice_attach_failed":
    case "carrier_refused":
      error(err.message, {
        code,
        hint: "Try again in a moment. If it keeps failing, contact support@sendly.live",
      });
      return true;
    case "forbidden":
      error(err.message, {
        code,
        hint: context.forbiddenHint ?? "Ask a workspace owner or admin to make this change",
      });
      return true;
    case "live_key_required":
      if (err instanceof ApiKeyRequiredError) {
        error(err.message, {
          code,
          hint: "Test keys can read voice settings but not change them. Create a live key with `sendly keys create --type live`",
        });
        return true;
      }
      break;
    default:
      break;
  }

  return reportCallsError(err);
}
