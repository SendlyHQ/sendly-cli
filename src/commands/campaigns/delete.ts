import { Args, Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import { json, success, colors, isJsonMode, warn } from "../../lib/output.js";
import * as readline from "readline";

interface Campaign {
  id: string;
  name: string;
  status: string;
}

async function confirm(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} (y/N) `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
    });
  });
}

export default class CampaignsDelete extends AuthenticatedCommand {
  static description = "Delete a campaign";

  static examples = [
    "<%= config.bin %> campaigns delete cmp_xxx",
    "<%= config.bin %> campaigns delete cmp_xxx --yes",
  ];

  static args = {
    id: Args.string({
      description: "Campaign ID",
      required: true,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    yes: Flags.boolean({
      char: "y",
      description: "Skip confirmation prompt",
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(CampaignsDelete);

    const campaign = await apiClient.get<Campaign>(
      `/api/v1/campaigns/${args.id}`,
    );

    if (campaign.status === "sending") {
      warn(`Cannot delete a campaign that is currently sending.`);
      this.exit(1);
    }

    if (!flags.yes && !isJsonMode()) {
      console.log();
      console.log(`Campaign: ${colors.bold(campaign.name)}`);
      console.log();

      const confirmed = await confirm(
        colors.warning("Delete this campaign permanently?"),
      );
      if (!confirmed) {
        console.log(colors.dim("Cancelled"));
        return;
      }
    }

    await apiClient.delete(`/api/v1/campaigns/${args.id}`);

    if (isJsonMode()) {
      json({ deleted: true, id: args.id });
      return;
    }

    success(`Campaign deleted`);
  }
}
