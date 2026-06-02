import { Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import { table, json, info, colors, isJsonMode } from "../../lib/output.js";

interface AvailableNumber {
  phoneNumber: string;
  country: string;
  numberType: string;
  monthlyCost: string;
  currency: string;
}

interface SearchNumbersResponse {
  numbers: AvailableNumber[];
}

export default class NumbersSearch extends AuthenticatedCommand {
  static description =
    "Search for available phone numbers to buy in a country";

  static examples = [
    "<%= config.bin %> numbers search --country GB --type mobile",
    "<%= config.bin %> numbers search --country US --type local --contains 555",
    "<%= config.bin %> numbers search --country GB --type mobile --json",
  ];

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    country: Flags.string({
      char: "c",
      description: "ISO country code (e.g. GB, US)",
      required: true,
    }),
    type: Flags.string({
      char: "t",
      description: "Number type (e.g. mobile, local, toll-free)",
      required: true,
    }),
    contains: Flags.string({
      description: "Only return numbers containing this digit pattern",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(NumbersSearch);

    const response = await apiClient.get<SearchNumbersResponse>(
      "/api/v1/numbers/available",
      {
        country: flags.country,
        type: flags.type,
        ...(flags.contains && { contains: flags.contains }),
      },
    );

    if (isJsonMode()) {
      json(response);
      return;
    }

    if (!response.numbers || response.numbers.length === 0) {
      info(
        `No available numbers found for ${flags.country} (${flags.type})${
          flags.contains ? ` matching "${flags.contains}"` : ""
        }`,
      );
      return;
    }

    console.log();
    console.log(
      colors.dim(
        `${response.numbers.length} available numbers for ${flags.country} (${flags.type})`,
      ),
    );
    console.log();

    table(response.numbers, [
      {
        header: "Number",
        key: "phoneNumber",
        width: 18,
        formatter: (v) => colors.code(String(v)),
      },
      {
        header: "Country",
        key: "country",
        width: 9,
      },
      {
        header: "Type",
        key: "numberType",
        width: 12,
      },
      {
        header: "Monthly",
        key: "monthlyCost",
        width: 14,
        formatter: (v, row) =>
          `${v} ${row?.currency ?? ""}`.trim(),
      },
    ]);

    console.log();
    console.log(
      colors.dim(
        "Buy one with: sendly numbers buy --country " +
          flags.country +
          " --type " +
          flags.type +
          " --number <number>",
      ),
    );
  }
}
