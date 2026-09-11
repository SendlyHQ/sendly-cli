import { Args } from "@oclif/core";
import { AuthenticatedCommand } from "../../../lib/base-command.js";
import { apiClient } from "../../../lib/api-client.js";
import { success, json, isJsonMode } from "../../../lib/output.js";

export default class ContactsListsRemove extends AuthenticatedCommand {
  static description = "Remove a contact from a list";

  static examples = [
    "<%= config.bin %> contacts lists remove lst_xxx cnt_abc",
  ];

  static args = {
    listId: Args.string({
      description: "Contact list ID",
      required: true,
    }),
    contactId: Args.string({
      description: "Contact ID to remove",
      required: true,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
  };

  async run(): Promise<void> {
    const { args } = await this.parse(ContactsListsRemove);

    await apiClient.delete(
      `/api/v1/contact-lists/${encodeURIComponent(args.listId)}/contacts/${encodeURIComponent(args.contactId)}`,
    );

    if (isJsonMode()) {
      json({ success: true, listId: args.listId, contactId: args.contactId });
      return;
    }

    success("Contact removed from list", {
      "List ID": args.listId,
      "Contact ID": args.contactId,
    });
  }
}
