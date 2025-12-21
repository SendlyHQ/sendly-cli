import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import {
  success,
  json,
  keyValue,
  colors,
  header,
  isJsonMode,
} from "../../lib/output.js";

interface CreditsResponse {
  balance: string;
  reservedBalance: string;
  recentTransactions?: Array<{
    id: string;
    amount: string;
    type: string;
    description: string;
    createdAt: string;
  }>;
}

export default class CreditsBalance extends AuthenticatedCommand {
  static description = "Check your credit balance";

  static examples = [
    "<%= config.bin %> credits balance",
    "<%= config.bin %> credits balance --json",
  ];

  static flags = {
    ...AuthenticatedCommand.baseFlags,
  };

  async run(): Promise<void> {
    const credits = await apiClient.get<CreditsResponse>(
      "/api/v1/account/credits",
    );

    if (isJsonMode()) {
      json(credits);
      return;
    }

    header("Credit Balance");

    const balance = parseFloat(credits.balance) || 0;
    const reserved = parseFloat(credits.reservedBalance) || 0;
    const availableCredits = balance - reserved;

    keyValue({
      Available: colors.primary(`${availableCredits.toLocaleString()} credits`),
      Reserved:
        reserved > 0
          ? colors.warning(`${reserved.toLocaleString()} credits`)
          : colors.dim("0 credits"),
      "Total Balance": `${balance.toLocaleString()} credits`,
    });

    console.log();

    // Show approximate message capacity
    const domesticMessages = Math.floor(availableCredits / 1);
    const internationalMessages = Math.floor(availableCredits / 2);

    console.log(colors.dim("Estimated capacity:"));
    console.log(
      `  ${colors.dim("US/Canada:")} ~${domesticMessages.toLocaleString()} messages`,
    );
    console.log(
      `  ${colors.dim("International:")} ~${internationalMessages.toLocaleString()} messages`,
    );
  }
}
