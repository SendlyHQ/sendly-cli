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
import { getCurrentOrg } from "../../lib/config.js";
import inquirer from "inquirer";

interface Organization {
  id: string;
  name: string;
  slug: string;
  isPersonal: boolean;
  role: string;
}

interface TransferResponse {
  success: boolean;
  amount: number;
  sourceBalance: number;
  targetBalance: number;
}

interface CreditsResponse {
  balance: number;
  reservedBalance: number;
  availableBalance: number;
}

export default class CreditsTransfer extends AuthenticatedCommand {
  static description = "Transfer credits between workspaces";

  static examples = [
    "<%= config.bin %> credits transfer --to org_abc123 --amount 500",
    "<%= config.bin %> credits transfer --amount 1000",
    "<%= config.bin %> credits transfer --to org_abc123 --amount 500 --yes",
  ];

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    to: Flags.string({
      description: "Target workspace ID to transfer credits to",
    }),
    amount: Flags.integer({
      char: "a",
      description: "Number of credits to transfer",
    }),
    yes: Flags.boolean({
      char: "y",
      description: "Skip confirmation prompt",
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(CreditsTransfer);

    const currentOrg = getCurrentOrg();
    if (!currentOrg) {
      this.error("No workspace selected. Run 'sendly teams switch' first.");
    }

    const orgs = await apiClient.get<Organization[]>("/api/organizations");
    const ownedOrgs = orgs.filter(
      (o) => o.role === "owner" && o.id !== currentOrg.id,
    );

    if (ownedOrgs.length === 0) {
      this.error("No other workspaces available. You need at least two workspaces you own to transfer credits.");
    }

    let targetOrgId = flags.to;
    let amount = flags.amount;

    if (!targetOrgId && !isJsonMode()) {
      const { selected } = await inquirer.prompt([
        {
          type: "list",
          name: "selected",
          message: "Transfer credits to which workspace?",
          choices: ownedOrgs.map((o) => ({
            name: `${o.name}${o.isPersonal ? " (personal)" : ""}`,
            value: o.id,
          })),
        },
      ]);
      targetOrgId = selected;
    }

    if (!targetOrgId) {
      this.error("Target workspace is required. Use --to <org_id>.");
    }

    const targetOrg = ownedOrgs.find((o) => o.id === targetOrgId);
    if (!targetOrg) {
      this.error("Target workspace not found or you don't own it.");
    }

    const credits = await apiClient.get<CreditsResponse>("/api/v1/account/credits");

    if (!amount && !isJsonMode()) {
      const { entered } = await inquirer.prompt([
        {
          type: "input",
          name: "entered",
          message: `How many credits to transfer? (available: ${credits.availableBalance.toLocaleString()})`,
          validate: (input: string) => {
            const n = parseInt(input, 10);
            if (isNaN(n) || n <= 0) return "Must be a positive number";
            if (n > credits.availableBalance) return `Exceeds available balance (${credits.availableBalance.toLocaleString()})`;
            return true;
          },
        },
      ]);
      amount = parseInt(entered, 10);
    }

    if (!amount || amount <= 0) {
      this.error("Amount must be a positive integer.");
    }

    if (amount > credits.availableBalance) {
      this.error(`Insufficient credits. Available: ${credits.availableBalance.toLocaleString()}, requested: ${amount.toLocaleString()}`);
    }

    if (!flags.yes && !isJsonMode()) {
      console.log();
      console.log(`  ${colors.bold("Transfer Summary")}`);
      console.log(`  ${colors.dim("From:")}    ${currentOrg.name}`);
      console.log(`  ${colors.dim("To:")}      ${targetOrg.name}`);
      console.log(`  ${colors.dim("Amount:")}  ${colors.primary(amount.toLocaleString() + " credits")}`);
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
      `/api/organizations/${encodeURIComponent(currentOrg.id)}/transfer-credits`,
      {
        targetOrganizationId: targetOrgId,
        amount,
      },
    );

    spin.succeed("Transfer complete");

    if (isJsonMode()) {
      json(result);
      return;
    }

    success("Credits transferred", {
      Amount: `${amount.toLocaleString()} credits`,
      "Source balance": `${result.sourceBalance.toLocaleString()} credits`,
      "Target balance": `${result.targetBalance.toLocaleString()} credits`,
    });
  }
}
