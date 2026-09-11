import { Args, Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import { json, success, colors, isJsonMode, keyValue } from "../../lib/output.js";

interface Campaign {
  id: string;
  name: string;
  messageText: string;
  status: string;
  targetListId?: string;
  totalRecipients: number;
  estimatedCredits: number;
  updatedAt: string;
}

export default class CampaignsUpdate extends AuthenticatedCommand {
  static description = "Update a campaign";

  static examples = [
    '<%= config.bin %> campaigns update cmp_xxx --name "New Name"',
    '<%= config.bin %> campaigns update cmp_xxx --text "Updated message"',
    "<%= config.bin %> campaigns update cmp_xxx --list lst_xxx",
    '<%= config.bin %> campaigns update cmp_xxx --name "Sale" --text "50% off!"',
  ];

  static args = {
    id: Args.string({
      description: "Campaign ID",
      required: true,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    name: Flags.string({
      char: "n",
      description: "Campaign name",
    }),
    text: Flags.string({
      char: "t",
      description: "Message text (supports {{variables}})",
    }),
    list: Flags.string({
      char: "l",
      description: "Contact list ID",
    }),
    template: Flags.string({
      description: "Template ID",
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(CampaignsUpdate);

    if (!flags.name && !flags.text && !flags.list && !flags.template) {
      this.error(
        "At least one of --name, --text, --list, or --template is required",
      );
    }

    const body: Record<string, unknown> = {};
    if (flags.name !== undefined) body.name = flags.name;
    if (flags.text !== undefined) body.messageText = flags.text;
    if (flags.list !== undefined) body.targetListId = flags.list;
    if (flags.template !== undefined) body.templateId = flags.template;

    const campaign = await apiClient.patch<Campaign>(
      `/api/v1/campaigns/${encodeURIComponent(args.id)}`,
      body,
    );

    if (isJsonMode()) {
      json(campaign);
      return;
    }

    success(`Campaign updated: ${campaign.id}`);
    console.log();

    keyValue([
      ["Name", campaign.name],
      ["Status", colors.dim(campaign.status)],
      ["Message", campaign.messageText],
      ["Recipients", String(campaign.totalRecipients)],
    ]);
  }
}
