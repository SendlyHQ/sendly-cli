import { Args } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import { success, json, isJsonMode } from "../../lib/output.js";

export default class ContactsMarkValid extends AuthenticatedCommand {
  static description =
    "Clear the invalid flag on a contact so future campaigns include it again. Use when you disagree with an auto-exclusion (e.g. the recipient ported from a landline to mobile).";

  static examples = [
    "<%= config.bin %> contacts mark-valid cnt_xxx",
  ];

  static args = {
    id: Args.string({
      description: "Contact ID to clear the invalid flag on",
      required: true,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
  };

  async run(): Promise<void> {
    const { args } = await this.parse(ContactsMarkValid);

    const contact = await apiClient.post<{
      id: string;
      phoneNumber?: string;
      phone_number?: string;
      invalidReason?: string | null;
      invalid_reason?: string | null;
    }>(`/api/contacts/${args.id}/mark-valid`);

    if (isJsonMode()) {
      json(contact);
      return;
    }

    success("Contact marked as valid — future campaigns will include it", {
      ID: contact.id,
      Phone: contact.phoneNumber ?? contact.phone_number ?? "—",
    });
  }
}
