import { Args } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import { json, success, colors, isJsonMode, keyValue } from "../../lib/output.js";

interface Campaign {
  id: string;
  name: string;
  status: string;
}

export default class CampaignsCancel extends AuthenticatedCommand {
  static description = "Cancel a scheduled campaign";

  static examples = [
    "<%= config.bin %> campaigns cancel cmp_xxx",
  ];

  static args = {
    id: Args.string({
      description: "Campaign ID",
      required: true,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
  };

  async run(): Promise<void> {
    const { args } = await this.parse(CampaignsCancel);

    const campaign = await apiClient.post<Campaign>(
      `/api/v1/campaigns/${encodeURIComponent(args.id)}/cancel`,
    );

    if (isJsonMode()) {
      json(campaign);
      return;
    }

    success(`Campaign cancelled`);
    console.log();

    keyValue([
      ["Campaign", campaign.name],
      ["Status", colors.dim("cancelled")],
    ]);
  }
}
