import { Flags } from "@oclif/core";
import * as fs from "node:fs";
import * as path from "node:path";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import {
  getAuthToken,
  resolveBaseUrl,
  getEffectiveValue,
} from "../../lib/config.js";
import { ApiError, AuthenticationError } from "../../lib/api-client.js";
import { json, success, info, isJsonMode } from "../../lib/output.js";

const TEXT_FIELDS: Record<string, string> = {
  "business-name": "businessName",
  brn: "brn",
  "brn-type": "brnType",
  "brn-country": "brnCountry",
  "entity-type": "entityType",
  "monthly-volume": "monthlyVolume",
  "use-case": "useCase",
  "use-case-summary": "useCaseSummary",
  "sample-messages": "sampleMessages",
  "opt-in-workflow": "optInWorkflow",
  "privacy-url": "privacyUrl",
  "terms-url": "termsUrl",
};

interface ResubmitUpgradeResponse {
  success: boolean;
  pendingVerificationId: string;
  message: string;
  error?: string;
}

export default class BusinessUpgradeResubmit extends AuthenticatedCommand {
  static description =
    "Resubmit a previously rejected (or waiting-for-customer) business entity upgrade with corrected fields and optionally a new EIN document";

  static examples = [
    '<%= config.bin %> business-upgrade resubmit --workspace ws_abc --business-name "Acme Holdings LLC" --ein-doc ./CP-575-v2.pdf',
  ];

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    workspace: Flags.string({ required: true }),
    "business-name": Flags.string(),
    brn: Flags.string(),
    "brn-type": Flags.string(),
    "brn-country": Flags.string(),
    "entity-type": Flags.string(),
    "monthly-volume": Flags.string(),
    "use-case": Flags.string(),
    "use-case-summary": Flags.string(),
    "sample-messages": Flags.string(),
    "opt-in-workflow": Flags.string(),
    "privacy-url": Flags.string(),
    "terms-url": Flags.string(),
    "ein-doc": Flags.string(),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(BusinessUpgradeResubmit);

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

    const baseUrl = resolveBaseUrl();
    const timeout = getEffectiveValue("timeout");
    const url = `${baseUrl}/api/v1/workspaces/${encodeURIComponent(flags.workspace)}/upgrade/resubmit`;

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

    const data = (await resp
      .json()
      .catch(() => ({}))) as ResubmitUpgradeResponse;
    if (!resp.ok) {
      throw new ApiError(
        data.error || "resubmit_error",
        data.message || `HTTP ${resp.status}`,
        resp.status,
      );
    }

    if (isJsonMode()) {
      json(data);
      return;
    }
    success("Resubmitted to carrier.");
    info(data.message);
  }
}
