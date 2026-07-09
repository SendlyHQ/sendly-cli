import { Args } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import {
  success,
  json,
  colors,
  formatStatus,
  formatRelativeTime,
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
  isDefault?: boolean;
  requirementsSubmittedAt: string | null;
  pendingCancellation: boolean;
  scheduledReleaseAt: string | null;
}

/**
 * `sendly numbers get <id>` — show one phone number you own, including whether
 * it's the workspace default sender.
 *
 * Wraps `GET /api/v1/numbers/:id`. Returns 404 when the id isn't one of your
 * numbers.
 */
export default class NumbersGet extends AuthenticatedCommand {
  static description = "Show details for one phone number you own";

  static examples = [
    "<%= config.bin %> numbers get num_abc123",
    "<%= config.bin %> numbers get num_abc123 --json",
  ];

  static args = {
    id: Args.string({
      description: "Phone number ID (from `sendly numbers list`)",
      required: true,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
  };

  async run(): Promise<void> {
    const { args } = await this.parse(NumbersGet);

    const number = await apiClient.get<OwnedNumber>(
      `/api/v1/numbers/${encodeURIComponent(args.id)}`,
    );

    if (isJsonMode()) {
      json(number);
      return;
    }

    success("Number details", {
      ID: number.id,
      Number: colors.code(number.phoneNumber),
      Status: formatStatus(number.status),
      Country: number.countryCode,
      Type: number.phoneNumberType,
      Source: number.source,
      Default: number.isDefault ? colors.success("yes") : "no",
      "Monthly cost": `$${(number.monthlyCostCents / 100).toFixed(2)}`,
      ...(number.pendingCancellation && {
        "Pending release": colors.warning("yes"),
      }),
      ...(number.scheduledReleaseAt && {
        "Scheduled release": formatRelativeTime(number.scheduledReleaseAt),
      }),
    });
  }
}
