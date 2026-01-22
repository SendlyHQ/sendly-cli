import { Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import { json, colors, spinner, isJsonMode, table } from "../../lib/output.js";

interface Verification {
  id: string;
  status: string;
  phone: string;
  delivery_status: string;
  attempts: number;
  max_attempts: number;
  expires_at: string;
  verified_at: string | null;
  created_at: string;
  sandbox: boolean;
}

interface Pagination {
  total: number;
  limit: number;
  offset: number;
  page: number;
  totalPages: number;
  hasMore: boolean;
}

interface ListResponse {
  verifications: Verification[];
  pagination: Pagination;
}

export default class VerifyList extends AuthenticatedCommand {
  static description = "List recent verifications";

  static examples = [
    "<%= config.bin %> verify list",
    "<%= config.bin %> verify list --limit 10",
    "<%= config.bin %> verify list --page 2",
    "<%= config.bin %> verify list --status verified",
    "<%= config.bin %> verify list --json",
  ];

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    limit: Flags.integer({
      char: "l",
      description: "Number of verifications per page",
      default: 20,
    }),
    page: Flags.integer({
      char: "p",
      description: "Page number (starts at 1)",
    }),
    offset: Flags.integer({
      description: "Offset from start (alternative to --page)",
    }),
    status: Flags.string({
      char: "s",
      description: "Filter by status (pending, verified, expired, failed)",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(VerifyList);

    const listSpinner = spinner("Fetching verifications...");

    if (!isJsonMode()) {
      listSpinner.start();
    }

    try {
      const response = await apiClient.get<ListResponse>("/api/v1/verify", {
        limit: flags.limit,
        ...(flags.page && { page: flags.page }),
        ...(flags.offset && { offset: flags.offset }),
        ...(flags.status && { status: flags.status }),
      });

      listSpinner.stop();

      if (isJsonMode()) {
        json(response);
        return;
      }

      if (response.verifications.length === 0) {
        console.log(colors.dim("No verifications found."));
        console.log(
          colors.dim(
            `Send one with: ${colors.code('sendly verify send --to "+1234567890"')}`,
          ),
        );
        return;
      }

      const pagination = response.pagination || {
        total: response.verifications.length,
        page: 1,
        totalPages: 1,
        hasMore: false,
      };

      console.log();
      console.log(
        colors.dim(
          `Showing ${response.verifications.length} verifications (page ${pagination.page} of ${pagination.totalPages}, ${pagination.total} total)`,
        ),
      );
      console.log();

      const statusColor = (status: string) => {
        switch (status) {
          case "verified":
            return colors.success(status);
          case "pending":
            return colors.primary(status);
          case "expired":
            return colors.dim(status);
          default:
            return colors.error(status);
        }
      };

      const rows = response.verifications.map((v) => ({
        ...v,
        attemptsDisplay: `${v.attempts}/${v.max_attempts}`,
      }));

      table(rows, [
        { header: "ID", key: "id", width: 20, formatter: (v) => colors.code(String(v).slice(0, 16) + "...") },
        { header: "Phone", key: "phone", width: 16 },
        { header: "Status", key: "status", width: 12, formatter: (v) => statusColor(String(v)) },
        { header: "Attempts", key: "attemptsDisplay", width: 10 },
        { header: "Sandbox", key: "sandbox", width: 8, formatter: (v) => v ? colors.dim("yes") : "" },
        { header: "Created", key: "created_at", width: 20, formatter: (v) => new Date(String(v)).toLocaleString() },
      ]);

      if (pagination.hasMore) {
        console.log();
        console.log(
          colors.dim(
            `  Use ${colors.code(`--page ${pagination.page + 1}`)} to see more`,
          ),
        );
      }
    } catch (err: any) {
      listSpinner.stop();
      throw err;
    }
  }
}
