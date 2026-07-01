import { Args } from "@oclif/core";
import { AuthenticatedCommand } from "../../../lib/base-command.js";
import { apiClient } from "../../../lib/api-client.js";
import {
  json,
  colors,
  formatStatus,
  isJsonMode,
  keyValue,
} from "../../../lib/output.js";

interface Brand {
  id: string;
  legalName: string;
  dba: string | null;
  entityType: string;
  ein: string | null;
  vertical: string | null;
  website: string | null;
  status: string;
  identityStatus: string | null;
  failureReasons: string[] | null;
  createdAt: string;
  updatedAt: string;
}

interface GetBrandResponse {
  data: Brand;
}

export default class TendlcBrandsGet extends AuthenticatedCommand {
  static description =
    "Get brand details with the latest carrier-review status (run again to refresh)";

  static examples = [
    "<%= config.bin %> 10dlc brands get brd_xxx",
    "<%= config.bin %> 10dlc brands get brd_xxx --json",
  ];

  static args = {
    id: Args.string({
      description: "Brand ID",
      required: true,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
  };

  async run(): Promise<void> {
    const { args } = await this.parse(TendlcBrandsGet);

    const response = await apiClient.get<GetBrandResponse>(
      `/api/v1/tendlc/brands/${args.id}`,
    );

    if (isJsonMode()) {
      json(response);
      return;
    }

    const brand = response.data;

    console.log();
    console.log(colors.bold(`Brand: ${brand.legalName}`));
    console.log();

    keyValue([
      ["ID", brand.id],
      ["Status", formatStatus(brand.status)],
      ["Entity type", brand.entityType],
      ...(brand.dba ? [["DBA", brand.dba] as [string, string]] : []),
      ...(brand.ein ? [["EIN", brand.ein] as [string, string]] : []),
      ...(brand.vertical
        ? [["Vertical", brand.vertical] as [string, string]]
        : []),
      ...(brand.website
        ? [["Website", brand.website] as [string, string]]
        : []),
      ...(brand.identityStatus
        ? [["Identity", brand.identityStatus] as [string, string]]
        : []),
      ["Created", new Date(brand.createdAt).toLocaleString()],
      ["Updated", new Date(brand.updatedAt).toLocaleString()],
    ]);

    if (brand.failureReasons && brand.failureReasons.length > 0) {
      console.log();
      console.log(colors.error("Failure reasons:"));
      brand.failureReasons.forEach((r) => console.log(`  - ${r}`));
    }

    console.log();
    if (brand.status === "pending") {
      console.log(
        colors.dim(
          "Carrier review is in progress — run this command again to refresh.",
        ),
      );
    } else if (brand.status === "verified") {
      console.log(
        colors.dim(
          `Create a campaign with: sendly 10dlc campaigns create --brand ${brand.id} ...`,
        ),
      );
    }
  }
}
