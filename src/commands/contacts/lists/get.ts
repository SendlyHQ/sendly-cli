import { Args } from "@oclif/core";
import { AuthenticatedCommand } from "../../../lib/base-command.js";
import { apiClient } from "../../../lib/api-client.js";
import {
  json,
  colors,
  isJsonMode,
  keyValue,
  table,
} from "../../../lib/output.js";

interface ContactListDetail {
  id: string;
  name: string;
  description?: string;
  contact_count: number;
  created_at: string;
  updated_at: string;
  contacts?: Array<{
    id: string;
    phone_number: string;
    name?: string;
    email?: string;
  }>;
}

export default class ContactsListsGet extends AuthenticatedCommand {
  static description = "Get contact list details";

  static examples = [
    "<%= config.bin %> contacts lists get lst_xxx",
    "<%= config.bin %> contacts lists get lst_xxx --json",
  ];

  static args = {
    id: Args.string({
      description: "Contact list ID",
      required: true,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
  };

  async run(): Promise<void> {
    const { args } = await this.parse(ContactsListsGet);

    const list = await apiClient.get<ContactListDetail>(
      `/api/v1/contact-lists/${encodeURIComponent(args.id)}`,
      { includeContacts: "true", limit: "10" },
    );

    if (isJsonMode()) {
      json(list);
      return;
    }

    console.log();
    console.log(colors.bold(list.name));
    console.log();

    keyValue([
      ["ID", list.id],
      ["Description", list.description || colors.dim("(none)")],
      ["Contacts", String(list.contact_count)],
      ["Created", new Date(list.created_at).toLocaleString()],
      ["Updated", new Date(list.updated_at).toLocaleString()],
    ]);

    if (list.contacts && list.contacts.length > 0) {
      console.log();
      console.log(colors.dim("Contacts:"));
      console.log();

      table(list.contacts, [
        { header: "Phone", key: "phone_number", width: 18 },
        {
          header: "Name",
          key: "name",
          width: 20,
          formatter: (v) => String(v || colors.dim("-")),
        },
        {
          header: "Email",
          key: "email",
          width: 25,
          formatter: (v) => String(v || colors.dim("-")),
        },
      ]);

      if (list.contact_count > 10) {
        console.log();
        console.log(
          colors.dim(`  Showing 10 of ${list.contact_count} contacts`),
        );
      }
    }
  }
}
