import { Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { success, json, isJsonMode, spinner } from "../../lib/output.js";
import {
  getAuthToken,
  resolveBaseUrl,
  getEffectiveValue,
} from "../../lib/config.js";
import {
  ApiError,
  AuthenticationError,
} from "../../lib/api-client.js";
import * as fs from "node:fs";
import * as path from "node:path";

interface UploadResponse {
  url: string;
  id: string;
}

export default class EnterpriseUploadVerificationDocument extends AuthenticatedCommand {
  static description = "Upload a verification document (image or PDF)";

  static examples = [
    '<%= config.bin %> enterprise upload-verification-document --file ./ein-letter.png',
    '<%= config.bin %> enterprise upload-verification-document --file ./doc.pdf --workspace-id ws_123',
  ];

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    file: Flags.string({
      char: "f",
      description: "Path to the file to upload (image or PDF)",
      required: true,
    }),
    "workspace-id": Flags.string({
      description: "Workspace ID to associate the document with",
    }),
    "verification-id": Flags.string({
      description: "Verification ID to associate the document with",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(EnterpriseUploadVerificationDocument);

    const filePath = flags.file;
    if (!fs.existsSync(filePath)) {
      this.error(`File not found: ${filePath}`);
    }

    const filename = path.basename(filePath);
    const ext = path.extname(filePath).toLowerCase();

    let mimetype = "application/octet-stream";
    if (ext === ".jpg" || ext === ".jpeg") mimetype = "image/jpeg";
    else if (ext === ".png") mimetype = "image/png";
    else if (ext === ".gif") mimetype = "image/gif";
    else if (ext === ".pdf") mimetype = "application/pdf";
    else if (ext === ".webp") mimetype = "image/webp";

    const fileBuffer = fs.readFileSync(filePath);

    const boundary = `----FormBoundary${Date.now()}${Math.random().toString(36).substring(2)}`;
    const parts: Buffer[] = [];

    parts.push(Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
      `Content-Type: ${mimetype}\r\n\r\n`,
    ));
    parts.push(fileBuffer);

    if (flags["workspace-id"]) {
      parts.push(Buffer.from(
        `\r\n--${boundary}\r\n` +
        `Content-Disposition: form-data; name="workspaceId"\r\n\r\n` +
        flags["workspace-id"],
      ));
    }

    if (flags["verification-id"]) {
      parts.push(Buffer.from(
        `\r\n--${boundary}\r\n` +
        `Content-Disposition: form-data; name="verificationId"\r\n\r\n` +
        flags["verification-id"],
      ));
    }

    parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

    const body = Buffer.concat(parts);

    const token = getAuthToken();
    if (!token) {
      throw new AuthenticationError();
    }

    const baseUrl = resolveBaseUrl();
    const timeout = getEffectiveValue("timeout");
    const url = `${baseUrl}/api/v1/enterprise/verification-document/upload`;

    const headers: Record<string, string> = {
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    };

    const orgId = getEffectiveValue("currentOrgId");
    if (orgId) {
      headers["X-Organization-Id"] = orgId;
    }

    const spin = spinner("Uploading verification document...");
    spin.start();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const resp = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const data = (await resp.json().catch(() => ({}))) as UploadResponse & {
      error?: string;
      message?: string;
    };

    if (!resp.ok) {
      spin.fail("Upload failed");
      throw new ApiError(
        data.error || "upload_error",
        data.message || `HTTP ${resp.status}`,
        resp.status,
      );
    }

    spin.succeed("Document uploaded");

    if (isJsonMode()) {
      json(data);
      return;
    }

    success("Verification document uploaded", {
      ID: data.id,
      URL: data.url,
    });
  }
}
