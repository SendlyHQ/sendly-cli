import { Args, Flags } from "@oclif/core";
import * as fs from "node:fs";
import * as path from "node:path";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import {
  success,
  json,
  isJsonMode,
  colors,
  error,
  keyValue,
} from "../../lib/output.js";

interface MediaUploadResponse {
  id: string;
  url: string;
  contentType: string;
  sizeBytes: number;
}

const ALLOWED_EXTS = [".jpg", ".jpeg", ".png", ".gif"];

/**
 * `sendly sms upload-media <file>` — upload an image for MMS.
 *
 * Wraps `POST /api/v1/media`. Returns a public URL the caller passes as
 * `--media-url` to `sms send`. Flag-gated behind `enable_mms`
 * on the server — if your account doesn't have MMS, the server returns
 * 403 and this command surfaces it.
 */
export default class SmsUploadMedia extends AuthenticatedCommand {
  static description =
    "Upload a JPEG/PNG/GIF image for MMS and get back a public URL to pass to `sms send --media-url`. Requires MMS to be enabled for your account.";

  static examples = [
    "<%= config.bin %> sms upload-media ./promo.jpg",
    "<%= config.bin %> sms upload-media ./animated.gif --json",
  ];

  static args = {
    file: Args.string({
      description: "Path to the image file (JPEG, PNG, or GIF)",
      required: true,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    "content-type": Flags.string({
      description: "Override the detected mime type",
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(SmsUploadMedia);

    const filePath = path.resolve(args.file);
    if (!fs.existsSync(filePath)) {
      error(`File not found: ${filePath}`);
      this.exit(1);
    }

    const ext = path.extname(filePath).toLowerCase();
    if (!ALLOWED_EXTS.includes(ext)) {
      error(
        `Unsupported file extension '${ext}'. MMS supports JPEG, PNG, and GIF.`,
      );
      this.exit(1);
    }

    const buffer = fs.readFileSync(filePath);
    const filename = path.basename(filePath);

    const detected =
      flags["content-type"] ??
      (ext === ".png"
        ? "image/png"
        : ext === ".gif"
          ? "image/gif"
          : "image/jpeg");

    const resp = await apiClient.uploadFile<MediaUploadResponse>(
      "/api/v1/media",
      {
        buffer,
        filename,
        mimetype: detected,
      },
    );

    if (isJsonMode()) {
      json(resp);
      return;
    }

    success("Media uploaded", {
      ID: resp.id,
      URL: resp.url,
      "Content-Type": resp.contentType,
      Size: formatBytes(resp.sizeBytes),
    });
    console.log();
    console.log(colors.dim("  Send an MMS with this image:"));
    console.log(
      "    " +
        colors.code(
          `sendly sms send --to +15551234567 --text "Hi" --media-url "${resp.url}"`,
        ),
    );
  }
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
