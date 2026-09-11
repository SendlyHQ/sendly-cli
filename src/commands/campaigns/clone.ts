import { Args, Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import { json, success, colors, isJsonMode, keyValue } from "../../lib/output.js";

interface Campaign {
  id: string;
  name: string;
  messageText: string;
  status: string;
  totalRecipients: number;
  estimatedCredits: number;
  createdAt: string;
}

export default class CampaignsClone extends AuthenticatedCommand {
  static description = "Clone an existing campaign";

  static examples = [
    "<%= config.bin %> campaigns clone cmp_xxx",
    '<%= config.bin %> campaigns clone cmp_xxx --name "Copy of Sale"',
  ];

  static args = {
    id: Args.string({
      description: "Campaign ID to clone",
      required: true,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    name: Flags.string({
      char: "n",
      description: "Name for the cloned campaign",
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(CampaignsClone);

    const body: Record<string, string> = {};
    if (flags.name) body.name = flags.name;

    const campaign = await apiClient.post<Campaign>(
      `/api/v1/campaigns/${encodeURIComponent(args.id)}/clone`,
      body,
    );

    if (isJsonMode()) {
      json(campaign);
      return;
    }

    success(`Campaign cloned: ${campaign.id}`);
    console.log();

    keyValue([
      ["Name", campaign.name],
      ["Status", colors.dim("draft")],
      ["Message", campaign.messageText],
    ]);

    console.log();
    console.log(colors.dim("Next steps:"));
    console.log(
      `  Preview:  ${colors.code(`sendly campaigns preview ${campaign.id}`)}`,
    );
    console.log(
      `  Send now: ${colors.code(`sendly campaigns send ${campaign.id}`)}`,
    );
  }
}
