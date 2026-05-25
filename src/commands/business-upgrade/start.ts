import { Flags } from "@oclif/core";
import * as fs from "node:fs";
import * as path from "node:path";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import {
  getAuthToken,
  getConfigValue,
  getEffectiveValue,
} from "../../lib/config.js";
import { ApiError, AuthenticationError } from "../../lib/api-client.js";
import { json, info, success, isJsonMode } from "../../lib/output.js";

interface StartUpgradeResponse {
  success: boolean;
  pendingVerificationId: string;
  telnyxVerificationId: string;
  tollFreeNumber: string;
  message: string;
  error?: string;
}

const TEXT_FIELDS: Record<string, string> = {
  "business-name": "businessName",
  brn: "brn",
  "brn-type": "brnType",
  "brn-country": "brnCountry",
  "entity-type": "entityType",
  "doing-business-as": "doingBusinessAs",
  website: "website",
  address1: "address1",
  address2: "address2",
  city: "city",
  state: "state",
  zip: "zip",
  "address-country": "addressCountry",
  "contact-first-name": "contactFirstName",
  "contact-last-name": "contactLastName",
  "contact-email": "contactEmail",
  "contact-phone": "contactPhone",
  "monthly-volume": "monthlyVolume",
  "use-case": "useCase",
  "use-case-summary": "useCaseSummary",
  "sample-messages": "sampleMessages",
  "opt-in-workflow": "optInWorkflow",
  "privacy-url": "privacyUrl",
  "terms-url": "termsUrl",
  "additional-information": "additionalInformation",
};

export default class BusinessUpgradeStart extends AuthenticatedCommand {
  static description =
    "Start a business entity upgrade — auto-provisions a new toll-free number under the new entity and submits to the carrier for review";

  static examples = [
    '<%= config.bin %> business-upgrade start --workspace ws_abc --business-name "Acme Holdings LLC" --brn "12-3456789" --brn-type EIN --entity-type PRIVATE_PROFIT --ein-doc ./CP-575.pdf',
  ];

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    workspace: Flags.string({
      description: "Workspace ID being upgraded",
      required: true,
    }),
    "business-name": Flags.string({ required: true }),
    brn: Flags.string({ required: true }),
    "brn-type": Flags.string({ required: true, default: "EIN" }),
    "brn-country": Flags.string({ default: "US" }),
    "entity-type": Flags.string({ required: true, default: "PRIVATE_PROFIT" }),
    "doing-business-as": Flags.string(),
    website: Flags.string(),
    address1: Flags.string(),
    address2: Flags.string(),
    city: Flags.string(),
    state: Flags.string(),
    zip: Flags.string(),
    "address-country": Flags.string(),
    "contact-first-name": Flags.string(),
    "contact-last-name": Flags.string(),
    "contact-email": Flags.string(),
    "contact-phone": Flags.string(),
    "monthly-volume": Flags.string(),
    "use-case": Flags.string(),
    "use-case-summary": Flags.string(),
    "sample-messages": Flags.string(),
    "opt-in-workflow": Flags.string(),
    "privacy-url": Flags.string(),
    "terms-url": Flags.string(),
    "additional-information": Flags.string(),
    "age-gated-content": Flags.boolean({ default: false }),
    "ein-doc": Flags.string({
      description: "Path to the IRS letter (CP-575 or 147C) PDF",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(BusinessUpgradeStart);

    const boundary = `----FormBoundary${Date.now()}${Math.random()
      .toString(36)
      .substring(2)}`;
    const parts: Buffer[] = [];

    const appendField = (name: string, value: string) => {
      parts.push(
        Buffer.from(
          `--${boundary}\r\n` +
            `Content-Disposition: form-data; name="${name}"\r\n\r\n` +
            value +
            "\r\n",
        ),
      );
    };

    for (const [flagKey, wireKey] of Object.entries(TEXT_FIELDS)) {
      const v = flags[flagKey as keyof typeof flags];
      if (typeof v === "string" && v.length > 0) appendField(wireKey, v);
    }
    appendField("ageGatedContent", flags["age-gated-content"] ? "true" : "false");

    if (flags["ein-doc"]) {
      const filePath = flags["ein-doc"];
      if (!fs.existsSync(filePath)) {
        this.error(`File not found: ${filePath}`);
      }
      const filename = path.basename(filePath);
      const fileBuffer = fs.readFileSync(filePath);
      parts.push(
        Buffer.from(
          `--${boundary}\r\n` +
            `Content-Disposition: form-data; name="einDoc"; filename="${filename}"\r\n` +
            `Content-Type: application/pdf\r\n\r\n`,
        ),
      );
      parts.push(fileBuffer);
      parts.push(Buffer.from("\r\n"));
    }
    parts.push(Buffer.from(`--${boundary}--\r\n`));

    const body = Buffer.concat(parts);
    const token = getAuthToken();
    if (!token) throw new AuthenticationError();

    const baseUrl = getConfigValue("baseUrl") || "https://sendly.live";
    const timeout = getEffectiveValue("timeout");
    const url = `${baseUrl}/api/v1/workspaces/${encodeURIComponent(flags.workspace)}/upgrade`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      body,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const data = (await resp.json().catch(() => ({}))) as StartUpgradeResponse;
    if (!resp.ok) {
      throw new ApiError(
        data.error || "upgrade_error",
        data.message || `HTTP ${resp.status}`,
        resp.status,
      );
    }

    if (isJsonMode()) {
      json(data);
      return;
    }
    success("Upgrade submitted to carrier.");
    info(`Pending verification: ${data.pendingVerificationId}`);
    info(`New toll-free number (reserved): ${data.tollFreeNumber}`);
    info(data.message);
  }
}
