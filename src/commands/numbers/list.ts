import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import {
  table,
  json,
  info,
  formatStatus,
  colors,
  isJsonMode,
} from "../../lib/output.js";

interface OwnedNumber {
  id: string;
  phoneNumber: string;
  status: string;
  source: string;
  countryCode: string;
  phoneNumberType: string;
  monthlyCostCents: number;
  requirementsSubmittedAt: string | null;
  pendingCancellation: boolean;
  scheduledReleaseAt: string | null;
}

interface ListNumbersResponse {
  numbers: OwnedNumber[];
}

export default class NumbersList extends AuthenticatedCommand {
  static description = "List the phone numbers on your account";

  static examples = [
    "<%= config.bin %> numbers list",
    "<%= config.bin %> numbers list --json",
  ];

  static flags = {
    ...AuthenticatedCommand.baseFlags,
  };

  async run(): Promise<void> {
    await this.parse(NumbersList);

    const response = await apiClient.get<ListNumbersResponse>(
      "/api/v1/numbers",
    );

    if (isJsonMode()) {
      json(response);
      return;
    }

    if (!response.numbers || response.numbers.length === 0) {
      info("No phone numbers on your account yet. Buy one with: sendly numbers buy");
      return;
    }

    console.log();
    console.log(colors.dim(`Showing ${response.numbers.length} numbers`));
    console.log();

    table(response.numbers, [
      {
        header: "Number",
        key: "phoneNumber",
        width: 18,
        formatter: (v) => colors.code(String(v)),
      },
      {
        header: "Status",
        key: "status",
        width: 14,
        formatter: (v) => formatStatus(String(v)),
      },
      {
        header: "Country",
        key: "countryCode",
        width: 9,
      },
      {
        header: "Type",
        key: "phoneNumberType",
        width: 12,
      },
    ]);
  }
}
