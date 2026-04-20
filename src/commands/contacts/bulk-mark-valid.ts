import { Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import { success, json, isJsonMode, error } from "../../lib/output.js";

export default class ContactsBulkMarkValid extends AuthenticatedCommand {
  static description =
    "Clear the invalid flag on many contacts at once. Pass --ids (comma-separated, up to 10,000) OR --list <id>, not both. Escape hatch for when auto-mark misclassifies at scale.";

  static examples = [
    "<%= config.bin %> contacts bulk-mark-valid --ids cnt_abc,cnt_def,cnt_ghi",
    "<%= config.bin %> contacts bulk-mark-valid --list lst_xxx",
  ];

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    ids: Flags.string({
      description:
        "Comma-separated contact IDs to clear (max 10,000 per call)",
      exclusive: ["list"],
    }),
    list: Flags.string({
      description: "Clear every flagged member of this list ID",
      exclusive: ["ids"],
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(ContactsBulkMarkValid);

    if (!flags.ids && !flags.list) {
      error("Provide either --ids or --list");
      this.exit(1);
    }

    const body: { ids?: string[]; listId?: string } = flags.ids
      ? {
          ids: flags.ids
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        }
      : { listId: flags.list };

    const result = await apiClient.post<{ cleared: number }>(
      "/api/contacts/bulk-mark-valid",
      body,
    );

    if (isJsonMode()) {
      json(result);
      return;
    }

    success(
      result.cleared === 0
        ? "No flagged contacts matched the selection"
        : `${result.cleared} contact${result.cleared === 1 ? "" : "s"} marked as valid`,
      { Cleared: result.cleared },
    );
  }
}
