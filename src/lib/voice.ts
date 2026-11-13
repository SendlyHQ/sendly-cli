/**
 * Voice configuration helpers
 * Shapes, paths, request bodies, formatting and error reporting shared by the
 * `sendly voice` commands (numbers, agents, voices)
 */

import {
  ApiError,
  ApiKeyRequiredError,
  CREATE_LIVE_KEY_COMMAND,
} from "./api-client.js";
import { readFileSync } from "node:fs";
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
  backgroundAudio?: boolean;
}

export type VoiceAgentKind =
  | "sendly"
  | "custom_llm"
  | "sip"
  | "websocket"
  | (string & {});

export interface CustomLlmConnection {
  baseUrl: string;
  model: string;
  headerNames: string[];
  hasApiKey: boolean;
}

export interface SipConnection {
  uri: string;
  transport: "auto" | "udp" | "tcp" | "tls" | (string & {});
  mediaEncryption: "disable" | "allow" | "require" | (string & {});
  username: string | null;
  hasPassword: boolean;
  headers: Record<string, string>;
}

export interface WebsocketConnection {
  url: string;
  audioFormat:
    | "pcm16_16000"
    | "pcm16_24000"
    | "pcm16_8000"
    | "mulaw_8000"
    | (string & {});
  hasAuthToken: boolean;
  customParameters: Record<string, string>;
}

export type VoiceAgentConnection =
  | CustomLlmConnection
  | SipConnection
  | WebsocketConnection;

export interface VoiceAgent {
  id: string;
  object: "voice_agent";
  name: string;
  enabled: boolean;
  kind: VoiceAgentKind;
  connection: VoiceAgentConnection | null;
  hasSigningSecret: boolean;
  signingSecret?: string;
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

export type VoiceAgentTestOutcome =
  | "ok"
  | "blocked_destination"
  | "unreachable"
  | "timeout"
  | "tls_failed"
  | "auth_required"
  | "auth_failed"
  | "not_found"
  | "rejected"
  | "bad_reply"
  | (string & {});

export interface VoiceAgentTestStep {
  step: "address" | "connect" | "login" | "reply" | (string & {});
  ok: boolean;
  detail: string;
}

export interface VoiceAgentTest {
  ok: boolean;
  outcome: VoiceAgentTestOutcome;
  message: string;
  status: number | null;
  latencyMs: number | null;
  signed: boolean;
  steps: VoiceAgentTestStep[];
}

export const VOICE_MODES: readonly VoiceMode[] = ["none", "ring_dashboard", "agent"];

export const VOICE_AGENT_KINDS = ["sendly", "custom_llm", "sip", "websocket"] as const;

export const VOICE_AGENT_TEST_KINDS = ["custom_llm", "sip", "websocket"] as const;

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

export function voiceAgentTestPath(id: string): string {
  return `${voiceAgentPath(id)}/test`;
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
  "transfer-to"?: string;
  "background-audio"?: boolean;
  kind?: string;
  connection?: Record<string, unknown>;
  "rotate-signing-secret"?: boolean;
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
  const tools: Record<string, unknown> = {};
  if (flags.sms !== undefined) tools.sendSms = flags.sms;
  if (flags["transfer-to"] !== undefined) {
    const transferTo = flags["transfer-to"].trim();
    tools.transferTo = transferTo === "" ? null : transferTo;
  }
  if (flags["background-audio"] !== undefined) {
    tools.backgroundAudio = flags["background-audio"];
  }
  if (Object.keys(tools).length > 0) body.tools = tools;
  if (flags.kind !== undefined) body.kind = flags.kind;
  if (flags.connection !== undefined) body.connection = flags.connection;
  if (flags["rotate-signing-secret"]) body.rotateSigningSecret = true;
  return body;
}

export interface AgentTestFlags {
  kind?: string;
  connection?: Record<string, unknown>;
  instructions?: string;
}

export function buildAgentTestBody(flags: AgentTestFlags): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (flags.kind !== undefined) body.kind = flags.kind;
  if (flags.connection !== undefined) body.connection = flags.connection;
  if (flags.instructions !== undefined) body.instructions = flags.instructions;
  return body;
}

export function agentTestLines(result: VoiceAgentTest): string[] {
  const mark = (ok: boolean) => (ok ? colors.success("✓") : colors.error("✗"));
  const lines = [`${mark(result.ok)} ${result.message}`];
  const facts: string[] = [`outcome ${result.outcome}`];
  if (result.status !== null && result.status !== undefined) facts.push(`status ${result.status}`);
  if (result.latencyMs !== null && result.latencyMs !== undefined) facts.push(`${result.latencyMs} ms`);
  facts.push(result.signed ? "signed" : "not signed");
  lines.push(`  ${colors.dim(facts.join(" · "))}`);
  const steps = Array.isArray(result.steps) ? result.steps : [];
  if (steps.length > 0) {
    const width = Math.max(...steps.map((s) => String(s.step).length));
    lines.push("");
    for (const s of steps) {
      lines.push(`  ${mark(s.ok)} ${String(s.step).padEnd(width)}  ${s.detail}`);
    }
  }
  return lines;
}

export function parseConnectionFlag(
  raw: string,
): Record<string, unknown> | string {
  let text = raw;
  if (raw.startsWith("@")) {
    const path = raw.slice(1);
    try {
      text = readFileSync(path, "utf8");
    } catch {
      return `Could not read --connection file "${path}"`;
    }
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return "--connection must be a JSON object, e.g. '{\"url\":\"wss://agent.example.com/calls\"}'";
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return "--connection must be a JSON object, e.g. '{\"url\":\"wss://agent.example.com/calls\"}'";
  }
  return parsed as Record<string, unknown>;
}

const AGENT_KIND_LABELS: Record<string, string> = {
  sendly: "Sendly writes the replies",
  custom_llm: "your chat completions endpoint writes the replies",
  sip: "callers are connected to your SIP address",
  websocket: "call audio is streamed to your server",
};

export function formatAgentKind(kind: string | null | undefined): string {
  if (!kind) return colors.dim("-");
  const label = AGENT_KIND_LABELS[kind];
  return label ? `${kind} ${colors.dim(`(${label})`)}` : kind;
}

export function canPlaceCalls(kind: string | null | undefined): boolean {
  return kind !== "sip" && kind !== "websocket";
}

function savedOrNone(saved: boolean | undefined): string {
  return saved ? colors.success("saved") : colors.dim("none");
}

function pairs(map: Record<string, string> | null | undefined, sep: string): string {
  const entries = Object.entries(map ?? {});
  if (entries.length === 0) return colors.dim("none");
  return entries.map(([k, v]) => `${k}${sep}${v}`).join(", ");
}

export function connectionRows(
  agent: Pick<VoiceAgent, "connection" | "hasSigningSecret" | "kind">,
): Array<[string, string]> {
  const c = agent.connection as Record<string, unknown> | null | undefined;
  const rows: Array<[string, string]> = [];
  if (c && typeof c === "object") {
    if (typeof c.baseUrl === "string") {
      const conn = c as unknown as CustomLlmConnection;
      rows.push(
        ["Endpoint", conn.baseUrl],
        ["Model", conn.model],
        ["API key", savedOrNone(conn.hasApiKey)],
        [
          "Extra headers",
          conn.headerNames?.length
            ? `${conn.headerNames.join(", ")} ${colors.dim("(values saved)")}`
            : colors.dim("none"),
        ],
      );
    } else if (typeof c.uri === "string") {
      const conn = c as unknown as SipConnection;
      rows.push(
        ["SIP address", conn.uri],
        ["Transport", String(conn.transport)],
        ["Media encryption", String(conn.mediaEncryption)],
        ["Username", conn.username ?? colors.dim("none")],
        ["Password", savedOrNone(conn.hasPassword)],
        ["SIP headers", pairs(conn.headers, ": ")],
      );
    } else if (typeof c.url === "string") {
      const conn = c as unknown as WebsocketConnection;
      rows.push(
        ["WebSocket URL", conn.url],
        ["Audio format", String(conn.audioFormat)],
        ["Auth token", savedOrNone(conn.hasAuthToken)],
        ["Custom parameters", pairs(conn.customParameters, "=")],
      );
    }
  }
  if ((agent.kind && agent.kind !== "sendly") || agent.hasSigningSecret) {
    rows.push(["Signing secret", agent.hasSigningSecret ? colors.success("set") : colors.dim("none")]);
  }
  return rows;
}

export function printSigningSecret(secret: string): void {
  console.log();
  console.log(
    `${colors.warning("⚠")} ${colors.bold("Signing secret: save it now, it is never shown again.")}`,
  );
  console.log(
    colors.dim(
      "Sendly signs every request to your agent with it in the X-Sendly-Signature header (t=<unix time>,v1=<hex HMAC-SHA256>).",
    ),
  );
  console.log();
  console.log(`  ${colors.code(secret)}`);
  console.log();
}

export function formatTransfer(agent: Pick<VoiceAgent, "tools">): string {
  return agent.tools?.transferTo ?? colors.dim("off");
}

export function formatBackgroundAudio(agent: Pick<VoiceAgent, "tools">): string {
  return agent.tools?.backgroundAudio ? colors.success("on") : colors.dim("off");
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
    case "byo_agents_not_enabled":
      error(err.message, {
        code,
        hint: "Your own agents (--kind custom_llm, sip or websocket) are switched on workspace by workspace. Contact support@sendly.live to get them switched on",
      });
      return true;
    case "invalid_request":
      if (/^(connection\b|rotateSigningSecret\b)/.test(err.message)) {
        error(err.message, {
          code,
          hint: /^rotateSigningSecret/.test(err.message)
            ? "Only your own agents (--kind custom_llm, sip or websocket) have a signing secret"
            : "Fix that field in --connection. `sendly voice agents create --help` lists the fields for each --kind",
        });
        return true;
      }
      break;
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
          hint: `Test keys can read voice settings but not change them. Create a live key with \`${CREATE_LIVE_KEY_COMMAND}\``,
        });
        return true;
      }
      break;
    default:
      break;
  }

  return reportCallsError(err);
}
