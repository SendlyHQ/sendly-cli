import { Args, Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import { json, success, isJsonMode } from "../../lib/output.js";

interface Contact {
  id: string;
  phone_number: string;
  name?: string;
  email?: string;
}

export default class ContactsUpdate extends AuthenticatedCommand {
  static description = "Update a contact";

  static examples = [
    '<%= config.bin %> contacts update cnt_xxx --name "John Doe"',
    "<%= config.bin %> contacts update cnt_xxx --email john@example.com",
    '<%= config.bin %> contacts update cnt_xxx --name "John" --email john@example.com',
  ];

  static args = {
    id: Args.string({
      description: "Contact ID",
      required: true,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    name: Flags.string({
      char: "n",
      description: "Contact name",
    }),
    email: Flags.string({
      char: "e",
      description: "Contact email",
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ContactsUpdate);

    if (!flags.name && !flags.email) {
      this.error("At least one of --name or --email is required");
    }

    const body: Record<string, string> = {};
    if (flags.name !== undefined) body.name = flags.name;
    if (flags.email !== undefined) body.email = flags.email;

    const contact = await apiClient.patch<Contact>(
      `/api/v1/contacts/${encodeURIComponent(args.id)}`,
      body,
    );

    if (isJsonMode()) {
      json(contact);
      return;
    }

    success("Contact updated", {
      ID: contact.id,
      Phone: contact.phone_number,
      Name: contact.name || "(none)",
      Email: contact.email || "(none)",
    });
  }
}
