import { Args } from "@oclif/core";
import { AuthenticatedCommand } from "../../../lib/base-command.js";
import { apiClient, NotFoundError } from "../../../lib/api-client.js";
import {
  success,
  error,
  json,
  colors,
  spinner,
  isJsonMode,
} from "../../../lib/output.js";

interface WhatsappSenderProfile {
  phoneNumber: string;
  displayName: string | null;
  profilePhotoUrl: string | null;
  category: string | null;
  about: string | null;
  description: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
}

export default class WhatsappProfileGet extends AuthenticatedCommand {
  static description =
    "Show the WhatsApp business profile customers see for one of your connected numbers";

  static examples = [
    "<%= config.bin %> whatsapp profile get +15551234567",
    "<%= config.bin %> whatsapp profile get +15551234567 --json",
  ];

  static args = {
    number: Args.string({
      description: "WhatsApp-connected sender number (E.164 format)",
      required: true,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
  };

  async run(): Promise<void> {
    const { args } = await this.parse(WhatsappProfileGet);

    const profileSpinner = spinner("Fetching WhatsApp profile...");
    if (!isJsonMode()) {
      profileSpinner.start();
    }

    let response: WhatsappSenderProfile;
    try {
      response = await apiClient.get<WhatsappSenderProfile>(
        `/api/v1/whatsapp/senders/${encodeURIComponent(args.number)}/profile`,
      );
      profileSpinner.stop();
    } catch (err: any) {
      profileSpinner.stop();
      if (
        err instanceof NotFoundError &&
        err.message.includes("connected to WhatsApp")
      ) {
        error(err.message, {
          hint: `Connect it first: sendly whatsapp connect --number ${args.number}`,
        });
        this.exit(1);
      }
      if (err instanceof NotFoundError) {
        error("WhatsApp isn't available on your workspace yet.", {
          hint: "WhatsApp is rolling out gradually — contact support@sendly.live for early access.",
        });
        this.exit(1);
      }
      throw err;
    }

    if (isJsonMode()) {
      json(response);
      return;
    }

    success("WhatsApp sender profile", {
      Number: response.phoneNumber,
      "Display name": response.displayName ?? colors.dim("—"),
      About: response.about ?? colors.dim("—"),
      Description: response.description ?? colors.dim("—"),
      Category: response.category ?? colors.dim("—"),
      Email: response.email ?? colors.dim("—"),
      Website: response.website ?? colors.dim("—"),
      Address: response.address ?? colors.dim("—"),
      Photo: response.profilePhotoUrl ?? colors.dim("—"),
    });

    console.log();
    console.log(
      colors.dim(
        `Update it with: ${colors.code(`sendly whatsapp profile update ${response.phoneNumber} --about "..."`)}`,
      ),
    );
  }
}
