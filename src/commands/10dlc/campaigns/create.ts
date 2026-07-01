import { Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../../lib/base-command.js";
import { apiClient } from "../../../lib/api-client.js";
import {
  json,
  success,
  colors,
  isJsonMode,
  keyValue,
} from "../../../lib/output.js";

interface Campaign {
  id: string;
  brandId: string;
  useCase: string;
  status: string;
  createdAt: string;
}

interface CreateCampaignResponse {
  data: Campaign;
}

const TEXT_FIELDS: Record<string, string> = {
  "opt-in-keywords": "optInKeywords",
  "opt-out-keywords": "optOutKeywords",
  "help-keywords": "helpKeywords",
  "opt-in-message": "optInMessage",
  "opt-out-message": "optOutMessage",
  "help-message": "helpMessage",
};

export default class TendlcCampaignsCreate extends AuthenticatedCommand {
  static description =
    "Create a messaging campaign under a verified brand and submit it for carrier review";

  static examples = [
    '<%= config.bin %> 10dlc campaigns create --brand brd_xxx --use-case MIXED --description "Order updates and promotions" --message-flow "Customers opt in at checkout" --sample "Your order has shipped!" --sample "20% off this weekend"',
    '<%= config.bin %> 10dlc campaigns create --brand brd_xxx --use-case 2FA --description "Login codes" --message-flow "Users request a code at sign-in" --sample "Your code is {{code}}" --opt-out-keywords "STOP,UNSUBSCRIBE"',
  ];

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    brand: Flags.string({
      char: "b",
      description: "Brand ID (must be verified)",
      required: true,
    }),
    "use-case": Flags.string({
      description: "Use-case code (e.g. MIXED, MARKETING, ACCOUNT_NOTIFICATION, 2FA)",
      required: true,
    }),
    description: Flags.string({
      char: "d",
      description: "What this campaign sends",
      required: true,
    }),
    "message-flow": Flags.string({
      description: "How recipients opt in to receive messages",
      required: true,
    }),
    sample: Flags.string({
      char: "s",
      description: "Sample message (repeat for up to 5 samples)",
      multiple: true,
      required: true,
    }),
    "sub-use-case": Flags.string({
      description: "Sub use-case code (can specify multiple)",
      multiple: true,
    }),
    "opt-in-keywords": Flags.string({
      description: "Comma-separated opt-in keywords",
    }),
    "opt-out-keywords": Flags.string({
      description: "Comma-separated opt-out keywords",
    }),
    "help-keywords": Flags.string({
      description: "Comma-separated help keywords",
    }),
    "opt-in-message": Flags.string({
      description: "Reply sent on opt-in",
    }),
    "opt-out-message": Flags.string({
      description: "Reply sent on opt-out",
    }),
    "help-message": Flags.string({
      description: "Reply sent on a help keyword",
    }),
    "embedded-link": Flags.boolean({
      description: "Messages include links (default true; disable with --no-embedded-link)",
      allowNo: true,
    }),
    "embedded-phone": Flags.boolean({
      description: "Messages include phone numbers (default false)",
      allowNo: true,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(TendlcCampaignsCreate);

    const body: Record<string, unknown> = {
      brandId: flags.brand,
      useCase: flags["use-case"],
      description: flags.description,
      messageFlow: flags["message-flow"],
      sampleMessages: flags.sample,
    };

    if (flags["sub-use-case"] && flags["sub-use-case"].length > 0) {
      body.subUseCases = flags["sub-use-case"];
    }
    for (const [flagKey, wireKey] of Object.entries(TEXT_FIELDS)) {
      const v = flags[flagKey as keyof typeof flags];
      if (typeof v === "string" && v.length > 0) body[wireKey] = v;
    }
    if (flags["embedded-link"] !== undefined) {
      body.embeddedLink = flags["embedded-link"];
    }
    if (flags["embedded-phone"] !== undefined) {
      body.embeddedPhone = flags["embedded-phone"];
    }

    const response = await apiClient.post<CreateCampaignResponse>(
      "/api/v1/tendlc/campaigns",
      body,
    );

    if (isJsonMode()) {
      json(response);
      return;
    }

    const campaign = response.data;

    success(`Campaign submitted for carrier review: ${campaign.id}`);
    console.log();

    keyValue([
      ["Brand", campaign.brandId],
      ["Use case", campaign.useCase],
      ["Status", colors.warning(campaign.status)],
    ]);

    console.log();
    console.log(colors.dim("Next steps:"));
    console.log(
      `  Check status: ${colors.code(`sendly 10dlc campaigns get ${campaign.id}`)}`,
    );
    console.log(
      `  Once active:  ${colors.code(`sendly 10dlc campaigns assign ${campaign.id} --number "+15551234567"`)}`,
    );
  }
}
