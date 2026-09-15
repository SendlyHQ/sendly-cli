/**
 * Voice call helpers
 * Shapes, paths, formatting and error reporting shared by the `sendly calls`
 * commands (list, get, create, hangup, recording)
 */

import {
  ApiError,
  ApiKeyRequiredError,
  AuthenticationError,
  InsufficientCreditsError,
  NotFoundError,
  ValidationError,
} from "./api-client.js";
import { colors, error, formatRelativeTime } from "./output.js";

export type CallStatus =
  | "ringing"
  | "active"
  | "suspended"
  | "completed"
  | "no_answer"
  | "busy"
  | "cancelled"
  | "declined"
  | "failed";

export type CallDirection = "inbound" | "outbound";
export type CallKind = "pstn" | "internal";
export type CallHandledBy = "agent" | "dashboard";
export type CallBilling = "metered" | "settled" | "unbilled";
export type CallRecordingStatus = "recording" | "ready" | "failed" | null;

export interface CallTranscriptLine {
  speaker: "caller" | "agent";
  text: string;
  atMs: number;
}

export interface Call {
  id: string;
  object: "call";
  kind: CallKind;
  direction: CallDirection;
  status: CallStatus;
  handledBy: CallHandledBy;
  agentId: string | null;
  from: string | null;
  to: string | null;
  callerName: string | null;
  calleeName: string | null;
  startedAt: string;
  answeredAt: string | null;
  endedAt: string | null;
  durationSecs: number;
  creditsCharged: number;
  billing: CallBilling;
  hangupClass: string | null;
  recordingStatus: CallRecordingStatus;
  metadata: Record<string, string>;
  transcript?: CallTranscriptLine[];
}

export interface CallListResponse {
  data: Call[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export interface CallRecording {
  callId: string;
  status: "none" | "recording" | "ready" | "failed";
  url: string | null;
  expiresAt: string | null;
  contentType: string | null;
}

export const CALL_STATUSES: readonly CallStatus[] = [
  "ringing",
  "active",
  "suspended",
  "completed",
  "no_answer",
  "busy",
  "cancelled",
  "declined",
  "failed",
];

export const CALL_DIRECTIONS: readonly CallDirection[] = ["inbound", "outbound"];

export const CALLS_PATH = "/api/v1/calls";

export function callPath(id: string): string {
  return `${CALLS_PATH}/${encodeURIComponent(id)}`;
}

export function callHangupPath(id: string): string {
  return `${callPath(id)}/hangup`;
}

export function callRecordingPath(id: string): string {
  return `${callPath(id)}/recording`;
}

export const E911_HINT =
  "Register one with `sendly voice numbers emergency-address <number> --street ... --city ... --state ... --zip ...`, or in the dashboard under Calls → Settings";

export const AGENT_IDS_HINT = "List your agents with `sendly voice agents list`";

export const VOICE_ACCESS_HINT =
  "Voice is being enabled workspace by workspace. Contact support@sendly.live to get it switched on.";

const HANGUP_CLASS_LABELS: Record<string, string> = {
  normal: "hung up after talking",
  caller_hung_up: "caller hung up",
  callee_hung_up: "callee hung up",
  caller_left: "caller left",
  peer_left: "other side left",
  agent_ended: "agent ended the call",
  agent_agent_hangup: "agent decided the conversation was over",
  agent_caller_left: "caller left the agent",
  ring_timeout: "nobody answered",
  callee_declined: "declined",
  callee_busy: "line busy",
  caller_cancelled: "cancelled before it was answered",
  room_closed_unanswered: "closed before it was answered",
  agent_left_unanswered: "agent left before it was answered",
  agent_caller_never_joined: "caller never joined",
  invalid_number: "invalid number",
  destination_rejected: "destination rejected the call",
  max_duration: "60-minute ceiling reached",
  credits_exhausted: "ran out of credits",
  media_aborted: "media aborted",
  peer_connection_lost: "connection lost",
  room_closed: "closed by the platform",
  agent_left: "agent left mid-call",
  setup_failed: "setup failed",
  agent_dispatch_failed: "agent could not be dispatched",
  agent_api_unreachable: "agent service unreachable",
  agent_already_ended: "agent had already ended",
  ended: "ended",
};

export function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}

export function formatDuration(secs: number | null | undefined): string {
  if (secs == null || secs <= 0) return "-";
  const whole = Math.floor(secs);
  const minutes = Math.floor(whole / 60);
  const seconds = whole % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

export function formatCallStatus(status: string): string {
  switch (status) {
    case "active":
      return colors.success(status);
    case "ringing":
    case "suspended":
      return colors.warning(status);
    case "completed":
      return status;
    case "failed":
    case "declined":
      return colors.error(status);
    case "no_answer":
    case "busy":
    case "cancelled":
      return colors.dim(status);
    default:
      return status;
  }
}

export function formatDirection(direction: string): string {
  return direction === "inbound" ? "in" : direction === "outbound" ? "out" : direction;
}

export function formatHangupClass(hangupClass: string | null): string {
  if (!hangupClass) return "-";
  const label = HANGUP_CLASS_LABELS[hangupClass];
  return label ? `${hangupClass} ${colors.dim(`(${label})`)}` : hangupClass;
}

export function formatRecordingStatus(status: string | null): string {
  if (!status) return colors.dim("none");
  switch (status) {
    case "ready":
      return colors.success(status);
    case "recording":
      return colors.warning(status);
    case "failed":
      return colors.error(status);
    default:
      return status;
  }
}

export function formatStartedAt(startedAt: string | null | undefined): string {
  if (!startedAt) return "-";
  return formatRelativeTime(startedAt);
}

export function formatTranscriptTime(atMs: number): string {
  const totalSecs = Math.max(0, Math.floor(atMs / 1000));
  const minutes = Math.floor(totalSecs / 60);
  const seconds = totalSecs % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function parseMetadataFlags(
  raw: string[] | undefined,
): Record<string, string> | string {
  if (!raw || raw.length === 0) return {};
  const out: Record<string, string> = {};
  for (const item of raw) {
    const idx = item.indexOf("=");
    if (idx <= 0) {
      return `Invalid --metadata "${item}": use key=value, e.g. --metadata crmId=lead_8812`;
    }
    const key = item.slice(0, idx).trim();
    const value = item.slice(idx + 1);
    if (!key) {
      return `Invalid --metadata "${item}": the key before "=" cannot be empty`;
    }
    out[key] = value;
  }
  return out;
}

export function reportCallsError(err: unknown): boolean {
  if (err instanceof NotFoundError) {
    if (/voice is not enabled/i.test(err.message)) {
      error(err.message, { code: "voice_not_enabled", hint: VOICE_ACCESS_HINT });
      return true;
    }
    if (/aren't enabled for this workspace/i.test(err.message)) {
      error(err.message, {
        code: "outbound_calls_not_enabled",
        hint: VOICE_ACCESS_HINT,
      });
      return true;
    }
    if (/agent doesn't exist/i.test(err.message)) {
      error(err.message, {
        code: "agent_not_found",
        hint: AGENT_IDS_HINT,
      });
      return true;
    }
    if (/number isn't in your workspace/i.test(err.message)) {
      error(err.message, {
        code: "number_not_found",
        hint: "List your voice numbers with `sendly voice numbers list` and pass one of them as --from",
      });
      return true;
    }
    if (/no call with that id/i.test(err.message)) {
      error(err.message, {
        code: "call_not_found",
        hint: "List recent calls with `sendly calls list`",
      });
      return true;
    }
    return false;
  }

  if (err instanceof ApiKeyRequiredError && /live api key/i.test(err.message)) {
    error(err.message, {
      code: "live_key_required",
      hint: "Test keys can read calls but not place or end them. Create a live key with `sendly keys create --type live`",
    });
    return true;
  }

  if (
    err instanceof AuthenticationError &&
    /missing required scopes/i.test(err.message)
  ) {
    error(err.message, {
      code: "insufficient_permissions",
      hint: "Use an API key with the calls:read and calls:write scopes, or sign in with `sendly login`",
    });
    return true;
  }

  if (err instanceof InsufficientCreditsError) {
    error(err.message, {
      code: err.code,
      hint: "Check your balance with `sendly credits`, then add credits at https://sendly.live/dashboard/billing",
    });
    return true;
  }

  if (err instanceof ValidationError) {
    if (/which number to call from/i.test(err.message)) {
      error(err.message, {
        code: "from_number_required",
        hint: "Your workspace has more than one voice-enabled number. Pass --from <e164>",
      });
      return true;
    }
    if (/answered by an ai agent/i.test(err.message)) {
      error(err.message, {
        code: "agent_required",
        hint: `Pass --agent <id>. ${AGENT_IDS_HINT}`,
      });
      return true;
    }
    if (/us and canadian numbers/i.test(err.message)) {
      error(err.message, { code: "destination_not_supported" });
      return true;
    }
    return false;
  }

  if (!(err instanceof ApiError)) return false;

  switch (err.code) {
    case "e911_required":
      error(err.message, { code: err.code, hint: E911_HINT });
      return true;
    case "agent_disabled":
      error(err.message, {
        code: err.code,
        hint: "Switch the agent on with `sendly voice agents update <agentId> --enable`",
      });
      return true;
    case "no_voice_number":
      error(err.message, {
        code: err.code,
        hint: "Switch voice on for a number with `sendly voice numbers update <number> --enable`, or in the dashboard under Calls → Settings",
      });
      return true;
    case "lines_busy":
      error(err.message, {
        code: err.code,
        hint: "Wait for a call to end, or retry in a moment",
      });
      return true;
    case "daily_call_limit":
      error(err.message, { code: err.code });
      return true;
    case "voice_unavailable":
    case "agents_unavailable":
      error(err.message, {
        code: err.code,
        hint: "Try again later or check https://status.sendly.live",
      });
      return true;
    case "idempotency_key_mismatch":
      error(err.message, {
        code: err.code,
        hint: "An idempotency key can only replay an identical request; use a new key for a changed body",
      });
      return true;
    default:
      return false;
  }
}
