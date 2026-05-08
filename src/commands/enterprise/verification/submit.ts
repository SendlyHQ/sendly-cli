import { Args, Flags } from "@oclif/core";
import * as fs from "node:fs";
import { AuthenticatedCommand } from "../../../lib/base-command.js";
import { apiClient } from "../../../lib/api-client.js";
import {
  success,
  json,
  isJsonMode,
  spinner,
  colors,
  keyValue,
} from "../../../lib/output.js";

interface VerificationSubmitInput {
  businessName?: string;
  doingBusinessAs?: string;
  website?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
  };
  contact?: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
  };
  brn?: string | null;
  brnType?: string | null;
  brnCountry?: string | null;
  entityType?: string;
  useCase?: string;
  useCaseSummary?: string;
  sampleMessages?: string;
  optInWorkflow?: string;
  optInImageUrls?: string;
  monthlyVolume?: string;
  additionalInformation?: string;
  ageGatedContent?: boolean;
  isvReseller?: string;
  privacyUrl?: string;
  termsUrl?: string;
}

interface SubmitResponse {
  status?: string;
  verification?: { id?: string; status?: string };
  id?: string;
  [key: string]: unknown;
}

export default class EnterpriseVerificationSubmit extends AuthenticatedCommand {
  static description =
    "Submit (or resubmit) a verification for an enterprise workspace. Partial-update friendly: only the fields you pass are changed.";

  static examples = [
    '<%= config.bin %> enterprise verification submit org_abc123 --data ./verification.json',
    '<%= config.bin %> enterprise verification submit org_abc123 --business-name "Acme LLC" --website https://acme.com --use-case "Insurance Services"',
    '<%= config.bin %> enterprise verification submit org_abc123 --contact-email new@acme.com',
  ];

  static args = {
    workspaceId: Args.string({
      description: "Workspace ID",
      required: true,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    data: Flags.string({
      char: "d",
      description: "Path to a JSON file containing the verification payload",
    }),
    "business-name": Flags.string({
      description: "Legal business name",
    }),
    "doing-business-as": Flags.string({
      description: "DBA / trading name",
    }),
    website: Flags.string({
      description: "Business website URL",
    }),
    "entity-type": Flags.string({
      description:
        "Entity type (SOLE_PROPRIETOR | PRIVATE_PROFIT | PUBLIC_PROFIT | NON_PROFIT | GOVERNMENT)",
      options: [
        "SOLE_PROPRIETOR",
        "PRIVATE_PROFIT",
        "PUBLIC_PROFIT",
        "NON_PROFIT",
        "GOVERNMENT",
      ],
    }),
    "address-street": Flags.string({ description: "Street address" }),
    "address-city": Flags.string({ description: "City" }),
    "address-state": Flags.string({ description: "State / region" }),
    "address-zip": Flags.string({ description: "ZIP / postal code" }),
    "address-country": Flags.string({ description: "Country code (e.g. US)" }),
    "contact-first-name": Flags.string({ description: "Contact first name" }),
    "contact-last-name": Flags.string({ description: "Contact last name" }),
    "contact-email": Flags.string({ description: "Contact email address" }),
    "contact-phone": Flags.string({
      description: "Contact phone number (E.164)",
    }),
    brn: Flags.string({
      description:
        "Business registration number (omit for sole proprietors; server will strip)",
    }),
    "brn-type": Flags.string({
      description: "BRN type (EIN | SSN | DUNS | CRA | VAT | LEI | OTHER)",
      options: ["EIN", "SSN", "DUNS", "CRA", "VAT", "LEI", "OTHER"],
    }),
    "brn-country": Flags.string({
      description: "BRN country code (e.g. US)",
    }),
    "use-case": Flags.string({
      description: "Use case (Telnyx use-case enum value)",
    }),
    "use-case-summary": Flags.string({
      description: "Use case summary",
    }),
    "sample-messages": Flags.string({
      description: "Sample messages",
    }),
    "opt-in-workflow": Flags.string({
      description: "Opt-in workflow description",
    }),
    "opt-in-image-urls": Flags.string({
      description: "Opt-in image URLs (newline or comma separated)",
    }),
    "monthly-volume": Flags.string({
      description: "Estimated monthly message volume",
    }),
    "additional-information": Flags.string({
      description: "Additional information for the carrier",
    }),
    "age-gated-content": Flags.boolean({
      description: "Mark traffic as age-gated content",
      allowNo: true,
    }),
    "isv-reseller": Flags.string({
      description: "ISV / reseller name (if applicable)",
    }),
    "privacy-url": Flags.string({ description: "Privacy policy URL" }),
    "terms-url": Flags.string({ description: "Terms of service URL" }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(EnterpriseVerificationSubmit);
    await submitVerification(args.workspaceId, flags, "Submitting verification...");
  }
}

export async function submitVerification(
  workspaceId: string,
  flags: Record<string, unknown>,
  spinnerText: string,
): Promise<void> {
  const payload = buildPayload(flags);

  if (Object.keys(payload).length === 0) {
    throw new Error(
      "No fields provided. Pass --data <file> or one or more --* field flags.",
    );
  }

  const spin = spinner(spinnerText);
  spin.start();

  let response: SubmitResponse;
  try {
    response = await apiClient.post<SubmitResponse>(
      `/api/v1/enterprise/workspaces/${encodeURIComponent(workspaceId)}/verification/submit`,
      payload as unknown as Record<string, unknown>,
    );
  } catch (err) {
    spin.fail("Verification submit failed");
    throw err;
  }

  spin.succeed("Verification submitted");

  if (isJsonMode()) {
    json(response);
    return;
  }

  const status =
    response.status ||
    response.verification?.status ||
    "submitted";
  const id = response.id || response.verification?.id;

  const details: Record<string, string> = {
    Workspace: workspaceId,
    Status: colors.primary(status),
  };
  if (id) details["Verification ID"] = id;

  success("Verification submitted", details);

  if (Object.keys(response).length > 0 && !id) {
    keyValue(response as Record<string, unknown>);
  }
}

export function buildPayload(
  flags: Record<string, unknown>,
): VerificationSubmitInput {
  let payload: VerificationSubmitInput = {};

  const dataFlag = flags.data as string | undefined;
  if (dataFlag) {
    if (!fs.existsSync(dataFlag)) {
      throw new Error(`File not found: ${dataFlag}`);
    }
    const content = fs.readFileSync(dataFlag, "utf-8");
    try {
      payload = JSON.parse(content) as VerificationSubmitInput;
    } catch {
      throw new Error(
        `Invalid JSON in ${dataFlag}. Expected a verification payload object.`,
      );
    }
  }

  const setIf = <K extends keyof VerificationSubmitInput>(
    key: K,
    value: VerificationSubmitInput[K] | undefined,
  ): void => {
    if (value !== undefined) {
      payload[key] = value;
    }
  };

  setIf("businessName", flags["business-name"] as string | undefined);
  setIf("doingBusinessAs", flags["doing-business-as"] as string | undefined);
  setIf("website", flags.website as string | undefined);
  setIf("entityType", flags["entity-type"] as string | undefined);
  setIf("brn", flags.brn as string | undefined);
  setIf("brnType", flags["brn-type"] as string | undefined);
  setIf("brnCountry", flags["brn-country"] as string | undefined);
  setIf("useCase", flags["use-case"] as string | undefined);
  setIf("useCaseSummary", flags["use-case-summary"] as string | undefined);
  setIf("sampleMessages", flags["sample-messages"] as string | undefined);
  setIf("optInWorkflow", flags["opt-in-workflow"] as string | undefined);
  setIf("optInImageUrls", flags["opt-in-image-urls"] as string | undefined);
  setIf("monthlyVolume", flags["monthly-volume"] as string | undefined);
  setIf(
    "additionalInformation",
    flags["additional-information"] as string | undefined,
  );
  setIf("isvReseller", flags["isv-reseller"] as string | undefined);
  setIf("privacyUrl", flags["privacy-url"] as string | undefined);
  setIf("termsUrl", flags["terms-url"] as string | undefined);

  if (flags["age-gated-content"] !== undefined) {
    payload.ageGatedContent = flags["age-gated-content"] as boolean;
  }

  const address = {
    ...(payload.address || {}),
    ...stripUndefined({
      street: flags["address-street"] as string | undefined,
      city: flags["address-city"] as string | undefined,
      state: flags["address-state"] as string | undefined,
      zip: flags["address-zip"] as string | undefined,
      country: flags["address-country"] as string | undefined,
    }),
  };
  if (Object.keys(address).length > 0) {
    payload.address = address;
  }

  const contact = {
    ...(payload.contact || {}),
    ...stripUndefined({
      firstName: flags["contact-first-name"] as string | undefined,
      lastName: flags["contact-last-name"] as string | undefined,
      email: flags["contact-email"] as string | undefined,
      phone: flags["contact-phone"] as string | undefined,
    }),
  };
  if (Object.keys(contact).length > 0) {
    payload.contact = contact;
  }

  return payload;
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      (out as Record<string, unknown>)[k] = v;
    }
  }
  return out;
}
