import { Args, Flags } from "@oclif/core";
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

export default class WhatsappProfileUpdate extends AuthenticatedCommand {
  static description =
    "Update the WhatsApp business profile customers see for one of your connected numbers";

  static examples = [
    '<%= config.bin %> whatsapp profile update +15551234567 --about "Family-run bakery in Austin"',
    '<%= config.bin %> whatsapp profile update +15551234567 --website https://example.com --email hello@example.com',
  ];

  static args = {
    number: Args.string({
      description: "WhatsApp-connected sender number (E.164 format)",
      required: true,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    "display-name": Flags.string({
      description: "Business name shown to customers",
    }),
    about: Flags.string({
      description: "Short about line (max 139 characters)",
    }),
    description: Flags.string({
      description: "Longer business description (max 512 characters)",
    }),
    category: Flags.string({
      description: "Business category",
    }),
    email: Flags.string({
      description: "Contact email shown on the profile",
    }),
    website: Flags.string({
      description: "Website URL shown on the profile",
    }),
    address: Flags.string({
      description: "Business address shown on the profile",
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(WhatsappProfileUpdate);

    if (
      flags["display-name"] === undefined &&
      flags.about === undefined &&
      flags.description === undefined &&
      flags.category === undefined &&
      flags.email === undefined &&
      flags.website === undefined &&
      flags.address === undefined
    ) {
      error("Nothing to update", {
        hint: "Pass at least one of --display-name, --about, --description, --category, --email, --website, --address",
      });
      this.exit(1);
    }

    const updateSpinner = spinner("Updating WhatsApp profile...");
    if (!isJsonMode()) {
      updateSpinner.start();
    }

    try {
      const response = await apiClient.patch<WhatsappSenderProfile>(
        `/api/v1/whatsapp/senders/${encodeURIComponent(args.number)}/profile`,
        {
          ...(flags["display-name"] !== undefined && {
            displayName: flags["display-name"],
          }),
          ...(flags.about !== undefined && { about: flags.about }),
          ...(flags.description !== undefined && {
            description: flags.description,
          }),
          ...(flags.category !== undefined && { category: flags.category }),
          ...(flags.email !== undefined && { email: flags.email }),
          ...(flags.website !== undefined && { website: flags.website }),
          ...(flags.address !== undefined && { address: flags.address }),
        },
      );

      updateSpinner.stop();

      if (isJsonMode()) {
        json(response);
        return;
      }

      success("WhatsApp sender profile updated", {
        Number: response.phoneNumber,
        "Display name": response.displayName ?? colors.dim("—"),
        About: response.about ?? colors.dim("—"),
        Description: response.description ?? colors.dim("—"),
        Category: response.category ?? colors.dim("—"),
        Email: response.email ?? colors.dim("—"),
        Website: response.website ?? colors.dim("—"),
        Address: response.address ?? colors.dim("—"),
      });
    } catch (err: any) {
      updateSpinner.stop();

      if (
        err instanceof NotFoundError &&
        err.message.includes("connected to WhatsApp")
      ) {
        error(err.message, {
          hint: `Connect it first: sendly whatsapp connect --number ${args.number}`,
        });
      } else if (err instanceof NotFoundError) {
        error("WhatsApp isn't available on your workspace yet.", {
          hint: "WhatsApp is rolling out gradually — contact support@sendly.live for early access.",
        });
      } else {
        throw err;
      }
      this.exit(1);
    }
  }
}
