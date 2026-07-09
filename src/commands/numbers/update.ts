import { Args, Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import {
  success,
  error,
  json,
  colors,
  formatStatus,
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
 * `sendly numbers update <id>` — mutate a number you own. Two mutations are
 * supported today:
 *   --default   make this the workspace default sender (the number must be
 *               active; the previous default is cleared atomically)
 *   --keep      cancel a scheduled period-end release and keep the number
 *
 * Wraps `PATCH /api/v1/numbers/:id`. At least one of --default / --keep is
 * required. Returns the full number record.
 */
export default class NumbersUpdate extends AuthenticatedCommand {
  static description =
    "Update a number you own: make it the default sender (--default) or cancel a scheduled release (--keep)";

  static examples = [
    "<%= config.bin %> numbers update num_abc123 --default",
    "<%= config.bin %> numbers update num_abc123 --keep",
    "<%= config.bin %> numbers update num_abc123 --default --json",
  ];

  static args = {
    id: Args.string({
      description: "Phone number ID (from `sendly numbers list`)",
      required: true,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    default: Flags.boolean({
      char: "d",
      description: "Make this the workspace default sender (must be active)",
      default: false,
    }),
    keep: Flags.boolean({
      char: "k",
      description: "Cancel a scheduled release and keep the number",
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(NumbersUpdate);

    const body: Record<string, unknown> = {};
    if (flags.default) body.isDefault = true;
    if (flags.keep) body.pendingCancellation = false;

    if (Object.keys(body).length === 0) {
      error("Nothing to update", {
        hint: "Pass --default to make it the default sender, or --keep to cancel a scheduled release.",
      });
      this.exit(1);
    }

    const number = await apiClient.patch<OwnedNumber>(
      `/api/v1/numbers/${encodeURIComponent(args.id)}`,
      body,
    );

    if (isJsonMode()) {
      json(number);
      return;
    }

    success("Number updated", {
      ID: number.id,
      Number: colors.code(number.phoneNumber),
      Status: formatStatus(number.status),
      Default: number.isDefault ? colors.success("yes") : "no",
      "Pending release": number.pendingCancellation
        ? colors.warning("yes")
        : "no",
    });
  }
}
