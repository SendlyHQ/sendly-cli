import fs from "node:fs";
import path from "node:path";
import { Args } from "@oclif/core";
import { AuthenticatedCommand } from "../../../lib/base-command.js";
import { apiClient } from "../../../lib/api-client.js";
import {
  success,
  error,
  json,
  colors,
  spinner,
  isJsonMode,
} from "../../../lib/output.js";
import {
  PROFILE_PHOTO_MAX_BYTES,
  photoMimeType,
  reportWhatsappError,
  whatsappSenderPath,
  type WhatsappSenderProfile,
} from "../../../lib/whatsapp.js";

export default class WhatsappProfileUploadPhoto extends AuthenticatedCommand {
  static description =
    "Set the profile photo customers see for one of your connected WhatsApp numbers. JPEG or PNG, 5 MB or less; WhatsApp wants it square and at least 192 pixels wide (640 recommended). The upload is never retried automatically. Needs a live API key with the whatsapp:write scope and, in a team workspace, an owner or admin.";

  static examples = [
    "<%= config.bin %> whatsapp profile upload-photo +15555550123 ./logo.png",
    "<%= config.bin %> whatsapp profile upload-photo +15555550123 ./logo.jpg --json",
  ];

  static args = {
    number: Args.string({
      description: "WhatsApp-connected sender number (E.164 format)",
      required: true,
    }),
    file: Args.string({
      description: "Path to the JPEG or PNG image",
      required: true,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
  };

  async run(): Promise<void> {
    const { args } = await this.parse(WhatsappProfileUploadPhoto);

    const filePath = path.resolve(args.file);
    let buffer: Buffer;
    try {
      buffer = fs.readFileSync(filePath);
    } catch {
      error(`File not found: ${filePath}`);
      this.exit(1);
    }

    if (buffer!.length === 0 || buffer!.length > PROFILE_PHOTO_MAX_BYTES) {
      error(
        buffer!.length === 0
          ? "The photo file is empty."
          : "The photo must be 5 MB or smaller.",
      );
      this.exit(1);
    }

    const mimetype = photoMimeType(buffer!);
    if (!mimetype) {
      error("The photo must be a JPEG or PNG image.");
      this.exit(1);
    }

    const uploadSpinner = spinner("Uploading profile photo...");
    if (!isJsonMode()) {
      uploadSpinner.start();
    }

    let response: WhatsappSenderProfile;
    try {
      response = await apiClient.uploadFile<WhatsappSenderProfile>(
        whatsappSenderPath(args.number, "profile/photo"),
        { buffer: buffer!, filename: path.basename(filePath), mimetype: mimetype! },
        true,
        { retry: false, organization: true },
      );
      uploadSpinner.stop();
    } catch (err) {
      uploadSpinner.stop();
      if (
        reportWhatsappError(err, {
          number: args.number,
          roleAction: "Editing the profile",
          keepApiCode: true,
        })
      ) {
        this.exit(1);
      }
      throw err;
    }

    if (isJsonMode()) {
      json(response);
      return;
    }

    success("Profile photo uploaded", {
      Number: response.phoneNumber,
      Photo: response.profilePhotoUrl ?? colors.dim("—"),
    });
  }
}
