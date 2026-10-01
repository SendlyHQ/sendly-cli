import { Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import {
  json,
  success,
  warn,
  colors,
  isJsonMode,
  keyValue,
} from "../../lib/output.js";

interface Campaign {
  id: string;
  name: string;
  messageText: string;
  status: string;
  totalRecipients: number;
  estimatedCredits: number;
  createdAt: string;
}

export default class CampaignsCreate extends AuthenticatedCommand {
  static description = "Create a new campaign";

  static examples = [
    '<%= config.bin %> campaigns create --name "Welcome" --text "Hello {{name}}!" --list lst_xxx',
    '<%= config.bin %> campaigns create --name "Sale" --text "50% off today!" --list lst_customers',
    '<%= config.bin %> campaigns create --name "Promo" --template tpl_xxx --list lst_xxx',
  ];

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    name: Flags.string({
      char: "n",
      description: "Campaign name",
      required: true,
    }),
    text: Flags.string({
      char: "t",
      description: "Message text ({{name}} and {{brand_name}} are filled in for each contact)",
    }),
    template: Flags.string({
      description: "Template ID to use instead of text (it may use only {{name}} and {{brand_name}})",
    }),
    list: Flags.string({
      char: "l",
      description: "Contact list ID (a campaign targets one list)",
      multiple: true,
      required: true,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(CampaignsCreate);

    if (!flags.text && !flags.template) {
      this.error("Either --text or --template is required");
    }

    if (flags.list!.length > 1) {
      warn(
        `A campaign targets one contact list, so only the first --list (${flags.list![0]}) is used. Run campaigns create once per list to reach the others.`,
      );
    }

    const campaign = await apiClient.post<Campaign>("/api/v1/campaigns", {
      name: flags.name,
      messageText: flags.text,
      templateId: flags.template,
      targetType: "contact_list",
      targetListId: flags.list![0],
    });

    if (isJsonMode()) {
      json(campaign);
      return;
    }

    success(`Campaign created: ${campaign.id}`);
    console.log();

    keyValue([
      ["Name", campaign.name],
      ["Status", colors.dim("draft")],
      ["Recipients", String(campaign.totalRecipients)],
      ["Estimated Credits", String(campaign.estimatedCredits)],
    ]);

    console.log();
    console.log(colors.dim("Next steps:"));
    console.log(
      `  Preview:  ${colors.code(`sendly campaigns preview ${campaign.id}`)}`,
    );
    console.log(
      `  Send now: ${colors.code(`sendly campaigns send ${campaign.id}`)}`,
    );
    console.log(
      `  Schedule: ${colors.code(`sendly campaigns schedule ${campaign.id} --at "2024-01-15T10:00:00Z"`)}`,
    );
  }
}
