import { Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import {
  success,
  error,
  json,
  colors,
  isJsonMode,
  spinner,
} from "../../lib/output.js";
import inquirer from "inquirer";

interface TransferResponse {
  success: boolean;
  amount: number;
  sourceBalance: number;
  targetBalance: number;
}

export default class EnterpriseTransferCredits extends AuthenticatedCommand {
  static description = "Transfer credits between enterprise workspaces";

  static examples = [
    "<%= config.bin %> enterprise transfer-credits --from org_abc --to org_xyz --amount 500",
    "<%= config.bin %> enterprise transfer-credits --from org_abc --to org_xyz --amount 500 --yes",
  ];

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    from: Flags.string({
      description: "Source workspace ID",
      required: true,
    }),
    to: Flags.string({
      description: "Target workspace ID",
      required: true,
    }),
    amount: Flags.integer({
      char: "a",
      description: "Number of credits to transfer",
      required: true,
    }),
    yes: Flags.boolean({
      char: "y",
      description: "Skip confirmation prompt",
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(EnterpriseTransferCredits);

    if (flags.amount <= 0) {
      this.error("Amount must be a positive integer.");
    }

    if (!flags.yes && !isJsonMode()) {
      console.log();
      console.log(`  ${colors.bold("Transfer Summary")}`);
      console.log(`  ${colors.dim("From:")}    ${flags.from}`);
      console.log(`  ${colors.dim("To:")}      ${flags.to}`);
      console.log(
        `  ${colors.dim("Amount:")}  ${colors.primary(flags.amount.toLocaleString() + " credits")}`,
      );
      console.log();

      const { confirm } = await inquirer.prompt([
        {
          type: "confirm",
          name: "confirm",
          message: "Proceed with transfer?",
          default: false,
        },
      ]);

      if (!confirm) {
        error("Transfer cancelled");
        return;
      }
    }

    const spin = spinner("Transferring credits...");
    spin.start();

    const result = await apiClient.post<TransferResponse>(
      `/api/v1/enterprise/workspaces/${encodeURIComponent(flags.from)}/transfer-credits`,
      {
        targetWorkspaceId: flags.to,
        amount: flags.amount,
      },
    );

    spin.succeed("Transfer complete");

    if (isJsonMode()) {
      json(result);
      return;
    }

    success("Credits transferred", {
      Amount: `${flags.amount.toLocaleString()} credits`,
      "Source balance": `${result.sourceBalance.toLocaleString()} credits`,
      "Target balance": `${result.targetBalance.toLocaleString()} credits`,
    });
  }
}
