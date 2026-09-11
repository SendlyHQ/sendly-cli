import { Args, Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../../lib/base-command.js";
import { apiClient } from "../../../lib/api-client.js";
import { json, success, isJsonMode } from "../../../lib/output.js";

interface ContactList {
  id: string;
  name: string;
  description?: string;
  contact_count: number;
}

export default class ContactsListsUpdate extends AuthenticatedCommand {
  static description = "Update a contact list";

  static examples = [
    '<%= config.bin %> contacts lists update lst_xxx --name "VIP Customers"',
    '<%= config.bin %> contacts lists update lst_xxx --description "Updated desc"',
  ];

  static args = {
    id: Args.string({
      description: "Contact list ID",
      required: true,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    name: Flags.string({
      char: "n",
      description: "List name",
    }),
    description: Flags.string({
      char: "d",
      description: "List description",
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ContactsListsUpdate);

    if (!flags.name && !flags.description) {
      this.error("At least one of --name or --description is required");
    }

    const body: Record<string, string> = {};
    if (flags.name !== undefined) body.name = flags.name;
    if (flags.description !== undefined) body.description = flags.description;

    const list = await apiClient.patch<ContactList>(
      `/api/v1/contact-lists/${encodeURIComponent(args.id)}`,
      body,
    );

    if (isJsonMode()) {
      json(list);
      return;
    }

    success("Contact list updated", {
      ID: list.id,
      Name: list.name,
      Description: list.description || "(none)",
      Contacts: String(list.contact_count),
    });
  }
}
