import { Args } from "@oclif/core";
import { AuthenticatedCommand } from "../../../lib/base-command.js";
import { apiClient } from "../../../lib/api-client.js";
import {
  success,
  json,
  colors,
  spinner,
  isJsonMode,
} from "../../../lib/output.js";
import {
  reportWhatsappError,
  whatsappSenderPath,
  type WhatsappSenderProfile,
} from "../../../lib/whatsapp.js";

export default class WhatsappProfileRemovePhoto extends AuthenticatedCommand {
  static description =
    "Remove the profile photo from one of your connected WhatsApp numbers. Needs a live API key with the whatsapp:write scope and, in a team workspace, an owner or admin.";

  static examples = [
    "<%= config.bin %> whatsapp profile remove-photo +15555550123",
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
    const { args } = await this.parse(WhatsappProfileRemovePhoto);

    const removeSpinner = spinner("Removing profile photo...");
    if (!isJsonMode()) {
      removeSpinner.start();
    }

    let response: WhatsappSenderProfile;
    try {
      response = await apiClient.delete<WhatsappSenderProfile>(
        whatsappSenderPath(args.number, "profile/photo"),
      );
      removeSpinner.stop();
    } catch (err) {
      removeSpinner.stop();
      if (
        reportWhatsappError(err, {
          number: args.number,
          roleAction: "Editing the profile",
          keepApiCode: true,
          photoRemoval: true,
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

    success("Profile photo removed", {
      Number: response.phoneNumber,
      Photo: response.profilePhotoUrl ?? colors.dim("—"),
    });
  }
}
