import { Args, Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../../lib/base-command.js";
import { apiClient } from "../../../lib/api-client.js";
import { success, json, isJsonMode } from "../../../lib/output.js";

interface AddContactsResponse {
  success: boolean;
  added_count: number;
}

export default class ContactsListsAdd extends AuthenticatedCommand {
  static description = "Add contacts to a list";

  static examples = [
    "<%= config.bin %> contacts lists add lst_xxx --contacts cnt_abc,cnt_def",
    "<%= config.bin %> contacts lists add lst_xxx --contacts cnt_abc --contacts cnt_def",
  ];

  static args = {
    listId: Args.string({
      description: "Contact list ID",
      required: true,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    contacts: Flags.string({
      char: "c",
      description: "Contact IDs to add (comma-separated or multiple flags)",
      required: true,
      multiple: true,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ContactsListsAdd);

    const contactIds = flags.contacts.flatMap((c) =>
      c.split(",").map((id) => id.trim()),
    );

    const response = await apiClient.post<AddContactsResponse>(
      `/api/v1/contact-lists/${encodeURIComponent(args.listId)}/contacts`,
      { contact_ids: contactIds },
    );

    if (isJsonMode()) {
      json(response);
      return;
    }

    success("Contacts added to list", {
      "List ID": args.listId,
      "Added Count": response.added_count,
    });
  }
}
