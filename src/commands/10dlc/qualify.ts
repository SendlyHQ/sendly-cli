import { Args } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import {
  json,
  success,
  warn,
  colors,
  isJsonMode,
  keyValue,
} from "../../lib/output.js";

interface QualifyResult {
  useCase: string;
  qualified: boolean;
  reason: string | null;
  throughput: {
    tier: string;
    carriersReady: number;
  } | null;
}

interface QualifyResponse {
  data: QualifyResult;
}

export default class TendlcQualify extends AuthenticatedCommand {
  static description =
    "Check whether a use case qualifies for a brand on the carrier network before creating a campaign";

  static examples = [
    "<%= config.bin %> 10dlc qualify brd_xxx MIXED",
    "<%= config.bin %> 10dlc qualify brd_xxx MARKETING --json",
  ];

  static args = {
    brand: Args.string({
      description: "Brand ID",
      required: true,
    }),
    usecase: Args.string({
      description: "Use-case code (e.g. MIXED, MARKETING, ACCOUNT_NOTIFICATION, 2FA)",
      required: true,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
  };

  async run(): Promise<void> {
    const { args } = await this.parse(TendlcQualify);

    const response = await apiClient.get<QualifyResponse>(
      `/api/v1/tendlc/brands/${args.brand}/qualify/${encodeURIComponent(args.usecase)}`,
    );

    if (isJsonMode()) {
      json(response);
      return;
    }

    const result = response.data;

    if (result.qualified) {
      success(`${result.useCase} qualifies for this brand`);
      if (result.throughput) {
        console.log();
        keyValue([
          ["Throughput tier", result.throughput.tier],
          ["Carriers ready", String(result.throughput.carriersReady)],
        ]);
      }
      console.log();
      console.log(
        colors.dim(
          `Create a campaign with: sendly 10dlc campaigns create --brand ${args.brand} --use-case ${result.useCase} ...`,
        ),
      );
    } else {
      warn(`${result.useCase} does not qualify for this brand`);
      if (result.reason) {
        console.log(`  ${colors.dim("reason:")} ${result.reason}`);
      }
      console.log();
      console.log(
        colors.dim("Try another use case, e.g.: sendly 10dlc qualify " +
          args.brand +
          " MIXED"),
      );
    }
  }
}
