/**
 * RCS registration helpers
 * Shapes, flag sets, body builders and output shared by the `sendly rcs`
 * registration commands (registration, dossier, brands, agents)
 */

import { readFileSync } from "node:fs";
import { Flags } from "@oclif/core";
import {
  ApiError,
  AuthenticationError,
  NotFoundError,
  ValidationError,
} from "./api-client.js";
import {
  colors,
  error,
  isJsonMode,
  keyValue,
  table,
  formatRelativeTime,
} from "./output.js";

export type CustomerStage =
  | "draft"
  | "in_review"
  | "changes_requested"
  | "rejected"
  | "brand_verification"
  | "agent_review"
  | "testing"
  | "launch_review"
  | "launching"
  | "launch_rejected"
  | "live"
  | "suspended"
  | "failed";

export interface PublicRcsBrand {
  id: string;
  reviewStatus: string;
  customerStage: CustomerStage;
  displayName: string;
  legalName: string;
  legalEntityType: string;
  organizationType: string;
  stockSymbol: string | null;
  websiteUrl: string;
  ein: string;
  address: {
    line1: string;
    line2: string | null;
    city: string;
    state: string;
    postalCode: string;
    countryCode: string;
  };
  contact: {
    firstName: string;
    lastName: string;
    title: string | null;
    email: string;
    phoneNumber: string;
  };
  reviewNote: string | null;
  rejectionReason: string | null;
  submittedForReviewAt: string | null;
  sentToCarrierAt: string | null;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublicRcsTestDevice {
  id: string;
  phoneNumber: string;
  label: string | null;
  inviteStatus: string | null;
  createdAt: string;
}

export interface RcsAgentBasics {
  displayName?: string | null;
  useCase?: string | null;
  hostingRegion?: string | null;
  description?: string | null;
  logoUrl?: string | null;
  heroUrl?: string | null;
  brandColor?: string | null;
  privacyPolicyUrl?: string | null;
  termsAndConditionsUrl?: string | null;
  phoneNumber?: { number?: string | null; label?: string | null } | null;
  website?: { url?: string | null; label?: string | null } | null;
  email?: { address?: string | null; label?: string | null } | null;
}

export interface RcsCampaign {
  companyOverview?: string | null;
  agentOverview?: string | null;
  interactions?: Array<{
    interactionType?: string | null;
    description?: string | null;
  } | null> | null;
  messageExamples?: Array<string | null> | null;
  consentSettings?: {
    optInMethods?: Array<{
      methodType?: string | null;
      description?: string | null;
    } | null> | null;
    callToAction?: string | null;
    callToActionUrl?: string | null;
    callToActionMediaUrl?: string | null;
    doubleOptIn?: boolean | null;
    doubleOptInMessage?: string | null;
    optInMessage?: string | null;
    helpResponse?: string | null;
    optOutResponse?: string | null;
  } | null;
  additionalInformation?: string | null;
}

export interface RcsTesting {
  testUrl?: string | null;
  messageId?: string | null;
  additionalInformation?: string | null;
}

export interface PublicRcsAgent {
  id: string;
  brandId: string | null;
  status: string;
  reviewStatus: string;
  customerStage: CustomerStage;
  displayName: string;
  useCase: string | null;
  hostingRegion: string | null;
  basics: RcsAgentBasics;
  campaign: RcsCampaign | null;
  testing: RcsTesting | null;
  reviewNote: string | null;
  rejectionReason: string | null;
  testDevices: PublicRcsTestDevice[];
  submittedForReviewAt: string | null;
  basicsSubmittedAt: string | null;
  launchSubmittedAt: string | null;
  liveAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RegistrationResponse {
  brand: PublicRcsBrand | null;
  agent: PublicRcsAgent | null;
  devices: PublicRcsTestDevice[];
  stage: CustomerStage;
  usEligible: boolean;
}

export interface DossierResponse {
  brand: Record<string, unknown>;
  usEligible: boolean;
  source: "tendlc" | "verification" | "none";
}

export type Dict = Record<string, unknown>;

export const LEGAL_ENTITY_TYPES = [
  "LIMITED_LIABILITY_COMPANY",
  "CORPORATION",
  "S_CORPORATION",
  "PARTNERSHIP",
  "SOLE_PROPRIETORSHIP",
] as const;

export const ORGANIZATION_TYPES = [
  "PRIVATE_PROFIT",
  "PUBLIC_PROFIT",
  "NON_PROFIT",
  "GOVERNMENT",
  "UNKNOWN",
] as const;

export const AGENT_USE_CASES = [
  "MULTI_USE",
  "TRANSACTIONAL",
  "PROMOTIONAL",
  "OTP",
] as const;

export const INTERACTION_TYPES = [
  "TRANSACTIONAL_UPDATES",
  "CUSTOMER_SUPPORT",
  "ACCOUNT_ALERTS",
  "LOYALTY_OR_REWARD",
  "MARKETING_OR_PROMOTIONAL",
  "TWO_WAY_CONVERSATION",
  "OTHER",
] as const;

export const OPT_IN_METHOD_TYPES = [
  "WEBSITE",
  "SMS",
  "MOBILE_APP",
  "QR_CODE",
  "SALE_POINT",
  "OTHER",
] as const;

export const STAGE_LABELS: Record<CustomerStage, string> = {
  draft: "Draft",
  in_review: "In review with Sendly",
  changes_requested: "Action needed",
  rejected: "Not approved",
  brand_verification: "Brand verification",
  agent_review: "Agent review",
  testing: "Testing",
  launch_review: "Launch review",
  launching: "Launching",
  launch_rejected: "Launch not approved",
  live: "Live",
  suspended: "Suspended",
  failed: "Failed",
};

export const EARLY_ACCESS_HINT =
  "RCS is rolling out gradually — contact support@sendly.live for early access.";

export const idempotencyKeyFlag = Flags.string({
  description:
    "Idempotency key (1-255 printable ASCII characters). Re-running with the same key within 24 hours returns the original result instead of saving again.",
});

export const BRAND_FLAGS = {
  "display-name": Flags.string({
    description: "Brand name as customers will see it",
  }),
  "legal-name": Flags.string({ description: "Registered legal business name" }),
  "legal-entity-type": Flags.string({
    description: "Legal entity type",
    options: [...LEGAL_ENTITY_TYPES],
  }),
  "organization-type": Flags.string({
    description: "Organization type",
    options: [...ORGANIZATION_TYPES],
  }),
  website: Flags.string({ description: "Business website (https)" }),
  ein: Flags.string({ description: "EIN (123456789 or 12-3456789)" }),
  "stock-symbol": Flags.string({
    description: "EXCHANGE:TICKER, required for publicly traded companies",
  }),
  "address-line1": Flags.string({ description: "Street address" }),
  "address-line2": Flags.string({ description: "Suite, floor, or unit" }),
  city: Flags.string({ description: "City" }),
  state: Flags.string({ description: "State (two-letter code)" }),
  "postal-code": Flags.string({ description: "ZIP code" }),
  country: Flags.string({
    description: "Country code (US; RCS registration is US-only for now)",
  }),
  "contact-first-name": Flags.string({
    description: "Brand contact first name",
  }),
  "contact-last-name": Flags.string({ description: "Brand contact last name" }),
  "contact-title": Flags.string({ description: "Brand contact job title" }),
  "contact-email": Flags.string({ description: "Brand contact email" }),
  "contact-phone": Flags.string({
    description: "Brand contact phone number (E.164)",
  }),
};

export const BRAND_FIELD_PATHS: Record<string, string[]> = {
  "display-name": ["displayName"],
  "legal-name": ["legalName"],
  "legal-entity-type": ["legalEntityType"],
  "organization-type": ["organizationType"],
  website: ["websiteUrl"],
  ein: ["ein"],
  "stock-symbol": ["stockSymbol"],
  "address-line1": ["address", "line1"],
  "address-line2": ["address", "line2"],
  city: ["address", "city"],
  state: ["address", "state"],
  "postal-code": ["address", "postalCode"],
  country: ["address", "countryCode"],
  "contact-first-name": ["contact", "firstName"],
  "contact-last-name": ["contact", "lastName"],
  "contact-title": ["contact", "title"],
  "contact-email": ["contact", "email"],
  "contact-phone": ["contact", "phoneNumber"],
};

export const AGENT_BASICS_FLAGS = {
  "display-name": Flags.string({
    description: "Agent name shown in the conversation header (max 40 characters)",
  }),
  "use-case": Flags.string({
    description: "What the agent sends",
    options: [...AGENT_USE_CASES],
  }),
  description: Flags.string({
    description: "Short description shown on the agent's info page (max 100 characters)",
  }),
  "logo-url": Flags.string({
    description: "Public https:// URL of the agent logo",
  }),
  "hero-url": Flags.string({
    description: "Public https:// URL of the agent hero image",
  }),
  "brand-color": Flags.string({ description: "Hex brand color, like #1E90FF" }),
  "privacy-policy-url": Flags.string({
    description: "Privacy policy URL (https)",
  }),
  "terms-url": Flags.string({ description: "Terms and conditions URL (https)" }),
  phone: Flags.string({
    description: "Contact phone number shown on the agent (E.164)",
  }),
  "phone-label": Flags.string({ description: "Label for the contact phone" }),
  website: Flags.string({
    description: "Contact website shown on the agent (https)",
  }),
  "website-label": Flags.string({ description: "Label for the contact website" }),
  email: Flags.string({ description: "Contact email shown on the agent" }),
  "email-label": Flags.string({ description: "Label for the contact email" }),
};

export const AGENT_BASICS_PATHS: Record<string, string[]> = {
  "display-name": ["basics", "displayName"],
  "use-case": ["basics", "useCase"],
  description: ["basics", "description"],
  "logo-url": ["basics", "logoUrl"],
  "hero-url": ["basics", "heroUrl"],
  "brand-color": ["basics", "brandColor"],
  "privacy-policy-url": ["basics", "privacyPolicyUrl"],
  "terms-url": ["basics", "termsAndConditionsUrl"],
  phone: ["basics", "phoneNumber", "number"],
  "phone-label": ["basics", "phoneNumber", "label"],
  website: ["basics", "website", "url"],
  "website-label": ["basics", "website", "label"],
  email: ["basics", "email", "address"],
  "email-label": ["basics", "email", "label"],
};

export const AGENT_CAMPAIGN_FLAGS = {
  "company-overview": Flags.string({
    description: "What your company does (launch requirement)",
  }),
  "agent-overview": Flags.string({
    description: "What this agent will send and why (launch requirement)",
  }),
  "campaign-info": Flags.string({
    description: "Anything else reviewers should know about the campaign",
  }),
  interaction: Flags.string({
    description:
      'Interaction type, optionally with a description as "TYPE=description" (repeatable; replaces the list). One of: ' +
      INTERACTION_TYPES.join(", "),
    multiple: true,
  }),
  "message-example": Flags.string({
    description:
      "Example message a subscriber would receive (repeatable, at least 3 to launch; replaces the list)",
    multiple: true,
  }),
  "opt-in-method": Flags.string({
    description:
      'How subscribers opt in, optionally with a description as "TYPE=description" (repeatable; replaces the list). One of: ' +
      OPT_IN_METHOD_TYPES.join(", "),
    multiple: true,
  }),
  "call-to-action": Flags.string({
    description: "The opt-in call to action subscribers see",
  }),
  "call-to-action-url": Flags.string({
    description: "Where the call to action lives (https; required for WEBSITE opt-in)",
  }),
  "call-to-action-media-url": Flags.string({
    description:
      "Public https:// URL of a screenshot of the opt-in (required for WEBSITE and MOBILE_APP opt-in)",
  }),
  "double-opt-in": Flags.boolean({
    description: "Subscribers confirm their opt-in (disable with --no-double-opt-in)",
    allowNo: true,
  }),
  "double-opt-in-message": Flags.string({
    description: "Confirmation message sent when double opt-in is enabled",
  }),
  "opt-in-message": Flags.string({
    description: "Welcome message sent after opt-in",
  }),
  "help-response": Flags.string({ description: "Reply sent to HELP" }),
  "opt-out-response": Flags.string({ description: "Reply sent to STOP" }),
};

export const AGENT_CAMPAIGN_PATHS: Record<string, string[]> = {
  "company-overview": ["campaign", "companyOverview"],
  "agent-overview": ["campaign", "agentOverview"],
  "campaign-info": ["campaign", "additionalInformation"],
  "call-to-action": ["campaign", "consentSettings", "callToAction"],
  "call-to-action-url": ["campaign", "consentSettings", "callToActionUrl"],
  "call-to-action-media-url": [
    "campaign",
    "consentSettings",
    "callToActionMediaUrl",
  ],
  "double-opt-in-message": ["campaign", "consentSettings", "doubleOptInMessage"],
  "opt-in-message": ["campaign", "consentSettings", "optInMessage"],
  "help-response": ["campaign", "consentSettings", "helpResponse"],
  "opt-out-response": ["campaign", "consentSettings", "optOutResponse"],
};

export const AGENT_TESTING_FLAGS = {
  "test-url": Flags.string({
    description:
      "Public https:// URL of a screen recording or screenshots of the agent on a test device",
  }),
  "test-message-id": Flags.string({
    description: "Id of a message sent to a test device",
  }),
  "testing-info": Flags.string({
    description: "Anything else reviewers should know about testing",
  }),
};

export const AGENT_TESTING_PATHS: Record<string, string[]> = {
  "test-url": ["testing", "testUrl"],
  "test-message-id": ["testing", "messageId"],
  "testing-info": ["testing", "additionalInformation"],
};

export function isDict(value: unknown): value is Dict {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function setPath(target: Dict, path: string[], value: unknown): void {
  let current = target;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    if (!isDict(current[key])) current[key] = {};
    current = current[key] as Dict;
  }
  current[path[path.length - 1]] = value;
}

export function getPath(source: Dict, path: string[]): unknown {
  let current: unknown = source;
  for (const key of path) {
    if (!isDict(current)) return undefined;
    current = current[key];
  }
  return current;
}

export function readJsonBody(filePath: string): Dict {
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch {
    throw new ValidationError(`File not found: ${filePath}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ValidationError(
      `Invalid JSON in ${filePath}. Expected a JSON object.`,
    );
  }
  if (!isDict(parsed)) {
    throw new ValidationError(
      `Invalid JSON in ${filePath}. Expected a JSON object.`,
    );
  }
  return parsed;
}

function unwrap(body: Dict, key: string): Dict {
  const inner = body[key];
  return isDict(inner) ? { ...inner } : { ...body };
}

function applyTextFlags(
  body: Dict,
  flags: Dict,
  paths: Record<string, string[]>,
  clearEmpty: boolean,
): boolean {
  let touched = false;
  for (const [flag, path] of Object.entries(paths)) {
    const value = flags[flag];
    if (typeof value !== "string") continue;
    if (value === "" && !clearEmpty) continue;
    setPath(body, path, value === "" ? null : value);
    touched = true;
  }
  return touched;
}

export interface BuildOptions {
  clearEmpty: boolean;
}

export function buildBrandBody(flags: Dict, options: BuildOptions): Dict {
  const fromJson = flags["from-json"];
  const body: Dict =
    typeof fromJson === "string" ? unwrap(readJsonBody(fromJson), "brand") : {};
  applyTextFlags(body, flags, BRAND_FIELD_PATHS, options.clearEmpty);
  return body;
}

export function parseTypedList(
  raw: string[] | undefined,
  typeKey: string,
  allowed: readonly string[],
  flagName: string,
): Array<Record<string, string>> | string {
  if (!raw || raw.length === 0) return [];
  const out: Array<Record<string, string>> = [];
  for (const item of raw) {
    const idx = item.indexOf("=");
    const type = (idx === -1 ? item : item.slice(0, idx)).trim().toUpperCase();
    const description = idx === -1 ? "" : item.slice(idx + 1).trim();
    if (!allowed.includes(type)) {
      return `Invalid --${flagName} "${item}" — use one of ${allowed.join(", ")}, optionally as TYPE=description`;
    }
    const entry: Record<string, string> = { [typeKey]: type };
    if (description) entry.description = description;
    out.push(entry);
  }
  return out;
}

export function buildAgentBody(
  flags: Dict,
  options: BuildOptions,
): Dict | string {
  const fromJson = flags["from-json"];
  const body: Dict =
    typeof fromJson === "string" ? unwrap(readJsonBody(fromJson), "agent") : {};

  applyTextFlags(body, flags, AGENT_BASICS_PATHS, options.clearEmpty);
  applyTextFlags(body, flags, AGENT_CAMPAIGN_PATHS, options.clearEmpty);
  applyTextFlags(body, flags, AGENT_TESTING_PATHS, options.clearEmpty);

  const interactions = parseTypedList(
    flags.interaction as string[] | undefined,
    "interactionType",
    INTERACTION_TYPES,
    "interaction",
  );
  if (typeof interactions === "string") return interactions;
  if (interactions.length > 0) {
    setPath(body, ["campaign", "interactions"], interactions);
  }

  const optInMethods = parseTypedList(
    flags["opt-in-method"] as string[] | undefined,
    "methodType",
    OPT_IN_METHOD_TYPES,
    "opt-in-method",
  );
  if (typeof optInMethods === "string") return optInMethods;
  if (optInMethods.length > 0) {
    setPath(body, ["campaign", "consentSettings", "optInMethods"], optInMethods);
  }

  const examples = flags["message-example"];
  if (Array.isArray(examples) && examples.length > 0) {
    setPath(body, ["campaign", "messageExamples"], examples);
  }

  if (typeof flags["double-opt-in"] === "boolean") {
    setPath(
      body,
      ["campaign", "consentSettings", "doubleOptIn"],
      flags["double-opt-in"],
    );
  }

  if (flags["clear-campaign"] === true) body.campaign = null;
  if (flags["clear-testing"] === true) body.testing = null;

  return body;
}

export function parseDeviceFlags(
  raw: string[] | undefined,
): Array<{ phoneNumber: string; label?: string }> | string {
  if (!raw || raw.length === 0) return [];
  const out: Array<{ phoneNumber: string; label?: string }> = [];
  for (const item of raw) {
    const idx = item.indexOf("=");
    const phoneNumber = (idx === -1 ? item : item.slice(0, idx)).trim();
    const label = idx === -1 ? "" : item.slice(idx + 1).trim();
    if (!phoneNumber) {
      return `Invalid --phone "${item}" — use +13125550100 or "+13125550100=Label"`;
    }
    out.push(label ? { phoneNumber, label } : { phoneNumber });
  }
  return out;
}

export function stageLabel(stage: string): string {
  return STAGE_LABELS[stage as CustomerStage] ?? stage;
}

export function formatStage(stage: string): string {
  const label = stageLabel(stage);
  switch (stage) {
    case "live":
      return colors.success(label);
    case "rejected":
    case "failed":
    case "suspended":
      return colors.error(label);
    case "changes_requested":
    case "launch_rejected":
      return colors.warning(label);
    case "testing":
      return colors.primary(label);
    case "draft":
      return colors.dim(label);
    default:
      return colors.info(label);
  }
}

export function formatReviewStatus(status: string): string {
  switch (status) {
    case "rejected":
    case "failed":
      return colors.error(status);
    case "changes_requested":
    case "launch_rejected":
      return colors.warning(status);
    case "approved_for_carrier":
    case "launch_submitted":
      return colors.success(status);
    case "draft":
      return colors.dim(status);
    default:
      return colors.info(status);
  }
}

export function formatSendStatus(status: string): string {
  switch (status) {
    case "approved":
      return colors.success(status);
    case "suspended":
      return colors.error(status);
    case "testing":
      return colors.primary(status);
    case "draft":
      return colors.dim(status);
    default:
      return colors.info(status);
  }
}

export function nextStepFor(
  stage: string,
  ids: { brandId?: string | null; agentId?: string | null },
): string[] {
  const agent = ids.agentId ?? "<agentId>";
  const brand = ids.brandId ?? "<brandId>";
  const code = (s: string) => colors.code(s);
  switch (stage) {
    case "draft":
      if (!ids.brandId) {
        return [
          `Prefill from what's on file: ${code("sendly rcs dossier --json > brand.json")}`,
          `Then draft the brand:        ${code("sendly rcs brands create --from-json brand.json")}`,
        ];
      }
      if (!ids.agentId) {
        return [
          `Draft the agent: ${code(`sendly rcs agents create --brand ${brand} --display-name "Acme" --use-case TRANSACTIONAL ...`)}`,
        ];
      }
      return [
        `Fill in anything missing: ${code(`sendly rcs agents update ${agent} ...`)}`,
        `Then send it for review:  ${code(`sendly rcs agents submit ${agent}`)}`,
      ];
    case "in_review":
      return [
        "Sendly is reviewing your brand and agent; we'll email you if anything needs changing.",
        `Check back with ${code("sendly rcs registration")}.`,
      ];
    case "changes_requested":
      return [
        "See the review note above, then update and resubmit:",
        `  ${code(`sendly rcs brands update ${brand} ...`)} / ${code(`sendly rcs agents update ${agent} ...`)}`,
        `  ${code(`sendly rcs agents submit ${agent}`)}`,
      ];
    case "rejected":
      return [
        "This registration wasn't approved. Reply to the review email or contact support@sendly.live.",
      ];
    case "brand_verification":
    case "agent_review":
      return [
        "The carrier network is reviewing your registration; we'll email you when it moves.",
        `Check back with ${code("sendly rcs registration")}.`,
      ];
    case "testing":
      return [
        `Invite test devices:   ${code(`sendly rcs agents devices set ${agent} --phone +13125550100`)}`,
        `Send a test message:   ${code('sendly rcs send --to +13125550100 --text "Hello from testing"')}`,
        `Then request launch:   ${code(`sendly rcs agents request-launch ${agent} --test-url https://...`)}`,
      ];
    case "launch_review":
      return [
        "Sendly is reviewing your launch request before sending it to the carrier network.",
        `Check back with ${code("sendly rcs registration")}.`,
      ];
    case "launching":
      return [
        "The carrier network is reviewing the launch; we'll email you when the agent goes live.",
      ];
    case "launch_rejected":
      return [
        "The launch wasn't approved. See the note above, update the campaign, then request launch again:",
        `  ${code(`sendly rcs agents update ${agent} ...`)}`,
        `  ${code(`sendly rcs agents request-launch ${agent}`)}`,
      ];
    case "live":
      return [
        `Send with: ${code('sendly rcs send --to +13125550100 --text "Hello!"')}`,
      ];
    case "suspended":
    case "failed":
      return ["Contact support@sendly.live to get this registration moving again."];
    default:
      return [];
  }
}

export function printNextSteps(lines: string[]): void {
  if (lines.length === 0) return;
  console.log();
  console.log(colors.dim("Next steps:"));
  lines.forEach((line) => console.log(`  ${line}`));
}

function row(key: string, value: string | null | undefined): [string, string][] {
  return value ? [[key, value]] : [];
}

function printNotes(item: {
  reviewNote: string | null;
  rejectionReason: string | null;
}): void {
  if (item.reviewNote) {
    console.log();
    console.log(colors.warning("Review note:"));
    console.log(`  ${item.reviewNote}`);
  }
  if (item.rejectionReason) {
    console.log();
    console.log(colors.error("Rejection reason:"));
    console.log(`  ${item.rejectionReason}`);
  }
}

export function printBrand(brand: PublicRcsBrand): void {
  const address = brand.address ?? {};
  const contact = brand.contact ?? {};
  const addressLine = [
    address.line1,
    address.line2,
    address.city,
    address.state,
    address.postalCode,
    address.countryCode,
  ]
    .filter(Boolean)
    .join(", ");
  const contactName = [contact.firstName, contact.lastName]
    .filter(Boolean)
    .join(" ");

  console.log(
    colors.bold(`Brand: ${brand.displayName || brand.legalName || brand.id}`),
  );
  console.log();
  keyValue([
    ["ID", brand.id],
    ["Stage", formatStage(brand.customerStage)],
    ["Review", formatReviewStatus(brand.reviewStatus)],
    ...row("Legal name", brand.legalName),
    ...row("Entity type", brand.legalEntityType),
    ...row("Organization", brand.organizationType),
    ...row("EIN", brand.ein),
    ...row("Stock symbol", brand.stockSymbol),
    ...row("Website", brand.websiteUrl),
    ...row("Address", addressLine),
    ...row(
      "Contact",
      contactName
        ? `${contactName}${contact.title ? `, ${contact.title}` : ""}`
        : "",
    ),
    ...row("Contact email", contact.email),
    ...row("Contact phone", contact.phoneNumber),
    ...row(
      "Submitted",
      brand.submittedForReviewAt
        ? new Date(brand.submittedForReviewAt).toLocaleString()
        : "",
    ),
    ...row(
      "Verified",
      brand.verifiedAt ? new Date(brand.verifiedAt).toLocaleString() : "",
    ),
    ["Updated", new Date(brand.updatedAt).toLocaleString()],
  ]);
  printNotes(brand);
}

function contactLine(
  primary: string | null | undefined,
  label: string | null | undefined,
): string {
  if (!primary) return "";
  return label ? `${primary} (${label})` : primary;
}

export function printAgent(agent: PublicRcsAgent): void {
  const basics = agent.basics ?? {};
  console.log(colors.bold(`Agent: ${agent.displayName || agent.id}`));
  console.log();
  keyValue([
    ["ID", agent.id],
    ["Brand", agent.brandId ?? colors.dim("—")],
    ["Stage", formatStage(agent.customerStage)],
    ["Review", formatReviewStatus(agent.reviewStatus)],
    ["Send status", formatSendStatus(agent.status)],
    ["Use case", agent.useCase ?? colors.dim("—")],
    ...row("Description", basics.description),
    ...row("Logo", basics.logoUrl),
    ...row("Hero", basics.heroUrl),
    ...row("Brand color", basics.brandColor),
    ...row("Privacy policy", basics.privacyPolicyUrl),
    ...row("Terms", basics.termsAndConditionsUrl),
    ...row(
      "Phone",
      contactLine(basics.phoneNumber?.number, basics.phoneNumber?.label),
    ),
    ...row("Website", contactLine(basics.website?.url, basics.website?.label)),
    ...row("Email", contactLine(basics.email?.address, basics.email?.label)),
    ...row(
      "Test URL",
      agent.testing?.testUrl ? String(agent.testing.testUrl) : "",
    ),
    ...row(
      "Submitted",
      agent.submittedForReviewAt
        ? new Date(agent.submittedForReviewAt).toLocaleString()
        : "",
    ),
    ...row(
      "Live since",
      agent.liveAt ? new Date(agent.liveAt).toLocaleString() : "",
    ),
    ["Updated", new Date(agent.updatedAt).toLocaleString()],
  ]);

  const campaign = agent.campaign;
  if (campaign) {
    const interactions = (campaign.interactions ?? [])
      .map((i) => i?.interactionType)
      .filter(Boolean);
    const examples = (campaign.messageExamples ?? []).filter(Boolean);
    const methods = (campaign.consentSettings?.optInMethods ?? [])
      .map((m) => m?.methodType)
      .filter(Boolean);
    console.log();
    console.log(colors.dim("Campaign:"));
    keyValue([
      ...row("Company overview", campaign.companyOverview),
      ...row("Agent overview", campaign.agentOverview),
      ...row("Interactions", interactions.join(", ")),
      ...row("Message examples", examples.length ? String(examples.length) : ""),
      ...row("Opt-in methods", methods.join(", ")),
      ...row("Call to action", campaign.consentSettings?.callToAction),
      ...row(
        "Double opt-in",
        typeof campaign.consentSettings?.doubleOptIn === "boolean"
          ? campaign.consentSettings.doubleOptIn
            ? "yes"
            : "no"
          : "",
      ),
    ]);
  }

  printNotes(agent);
}

export function formatInviteStatus(status: string | null): string {
  if (!status) return colors.dim("not invited");
  switch (status.toUpperCase()) {
    case "ACCEPTED":
    case "ACTIVE":
      return colors.success(status);
    case "REJECTED":
    case "FAILED":
    case "EXPIRED":
      return colors.error(status);
    default:
      return colors.warning(status);
  }
}

export function printDevices(devices: PublicRcsTestDevice[]): void {
  console.log();
  console.log(colors.dim(`Test devices (${devices.length})`));
  if (devices.length === 0) {
    console.log(colors.dim("  none invited yet"));
    return;
  }
  table(devices, [
    {
      header: "Phone",
      key: "phoneNumber",
      formatter: (v) => colors.code(String(v)),
    },
    {
      header: "Label",
      key: "label",
      formatter: (v) => (v ? String(v) : colors.dim("—")),
    },
    {
      header: "Invite",
      key: "inviteStatus",
      formatter: (v) => formatInviteStatus(v ? String(v) : null),
    },
    {
      header: "Added",
      key: "createdAt",
      formatter: (v) => formatRelativeTime(String(v)),
    },
  ]);
}

export function reportRcsError(err: unknown): boolean {
  if (err instanceof NotFoundError) {
    if (/isn't enabled/i.test(err.message)) {
      error(err.message, { code: "rcs_not_enabled", hint: EARLY_ACCESS_HINT });
      return true;
    }
    return false;
  }

  if (
    err instanceof AuthenticationError &&
    /missing required scopes/i.test(err.message)
  ) {
    error(err.message, {
      code: "insufficient_permissions",
      hint: "Use an API key with the rcs:read and rcs:write scopes, or sign in with `sendly login`",
    });
    return true;
  }

  if (!(err instanceof ApiError)) return false;

  switch (err.code) {
    case "rcs_invalid_content": {
      const fieldErrors = err.fieldErrors ?? [];
      if (isJsonMode()) {
        error(err.message, { code: err.code, errors: fieldErrors });
        return true;
      }
      error(err.message, { code: err.code });
      fieldErrors.forEach((issue) =>
        console.error(`  ${colors.dim(issue.path)}  ${issue.message}`),
      );
      return true;
    }
    case "rcs_field_locked":
      error(err.message, {
        code: err.code,
        hint: "Check where the registration stands with `sendly rcs registration`",
      });
      return true;
    case "rcs_launch_not_ready":
      error(err.message, {
        code: err.code,
        hint: "Invite a device with `sendly rcs agents devices set <agentId> --phone +13125550100`, send it a test message with `sendly rcs send`, then request launch",
      });
      return true;
    case "rcs_brand_not_verified":
      error(err.message, {
        code: err.code,
        hint: "See the reason with `sendly rcs registration`, fix the brand with `sendly rcs brands update <brandId>`, then submit again",
      });
      return true;
    case "rcs_us_only":
      error(err.message, { code: err.code });
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
