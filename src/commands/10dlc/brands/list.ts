import { AuthenticatedCommand } from "../../../lib/base-command.js";
import { apiClient } from "../../../lib/api-client.js";
import {
  table,
  json,
  info,
  formatStatus,
  formatRelativeTime,
  colors,
  isJsonMode,
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

interface ListBrandsResponse {
  data: Brand[];
}

export default class TendlcBrandsList extends AuthenticatedCommand {
  static description = "List the brands registered for carrier review";

  static examples = [
    "<%= config.bin %> 10dlc brands list",
    "<%= config.bin %> 10dlc brands list --json",
  ];

  static flags = {
    ...AuthenticatedCommand.baseFlags,
  };

  async run(): Promise<void> {
    await this.parse(TendlcBrandsList);

    const response = await apiClient.get<ListBrandsResponse>(
      "/api/v1/tendlc/brands",
    );

    if (isJsonMode()) {
      json(response);
      return;
    }

    if (!response.data || response.data.length === 0) {
      info(
        'No brands registered yet. Register one with: sendly 10dlc brands create --legal-name "Acme Inc"',
      );
      return;
    }

    console.log();
    console.log(colors.dim(`Showing ${response.data.length} brands`));
    console.log();

    table(response.data, [
      {
        header: "ID",
        key: "id",
        width: 38,
        formatter: (v) => colors.dim(String(v)),
      },
      {
        header: "Legal name",
        key: "legalName",
        width: 24,
        formatter: (v) => {
          const name = String(v);
          return name.length > 22 ? name.slice(0, 22) + "..." : name;
        },
      },
      {
        header: "Entity",
        key: "entityType",
        width: 18,
      },
      {
        header: "Status",
        key: "status",
        width: 11,
        formatter: (v) => formatStatus(String(v)),
      },
      {
        header: "Created",
        key: "createdAt",
        width: 12,
        formatter: (v) => formatRelativeTime(String(v)),
      },
    ]);
  }
}
