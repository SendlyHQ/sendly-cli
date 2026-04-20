import { Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import { success, json, isJsonMode, info } from "../../lib/output.js";

export default class ContactsCheckNumbers extends AuthenticatedCommand {
  static description =
    "Trigger a background carrier lookup across your contacts. Landlines and other non-SMS-capable numbers are auto-excluded from future campaigns. Runs asynchronously — results populate line_type / carrier_name / invalid_reason on affected contacts within a few minutes.";

  static examples = [
    "<%= config.bin %> contacts check-numbers",
    "<%= config.bin %> contacts check-numbers --list lst_xxx",
    "<%= config.bin %> contacts check-numbers --force",
  ];

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    list: Flags.string({
      char: "l",
      description: "Scope the lookup to a single contact list",
    }),
    force: Flags.boolean({
      description: "Re-check contacts even if already looked up",
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(ContactsCheckNumbers);

    const response = await apiClient.post<{
      success: boolean;
      message?: string;
    }>("/api/contacts/lookup", {
      listId: flags.list ?? null,
      force: flags.force,
    });

    if (isJsonMode()) {
      json(response);
      return;
    }

    success("Carrier lookup started", {
      Scope: flags.list ? `list ${flags.list}` : "all un-checked contacts",
      Force: flags.force ? "yes" : "no",
    });
    info(
      response.message ??
        "Results will appear on contacts within a few minutes. Run `sendly contacts list` to check progress.",
    );
  }
}
