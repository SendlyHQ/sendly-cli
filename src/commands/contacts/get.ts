import { Args } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import { detail, json, colors, isJsonMode } from "../../lib/output.js";

interface Contact {
  id: string;
  phone_number: string;
  name?: string;
  email?: string;
  metadata?: Record<string, any>;
  opted_out?: boolean;
  created_at: string;
  updated_at?: string;
  lists?: Array<{ id: string; name: string }>;
}

export default class ContactsGet extends AuthenticatedCommand {
  static description = "Get contact details";

  static examples = [
    "<%= config.bin %> contacts get cnt_xxx",
    "<%= config.bin %> contacts get cnt_xxx --json",
  ];

  static args = {
    id: Args.string({
      description: "Contact ID",
      required: true,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
  };

  async run(): Promise<void> {
    const { args } = await this.parse(ContactsGet);

    const contact = await apiClient.get<Contact>(
      `/api/v1/contacts/${encodeURIComponent(args.id)}`,
    );

    if (isJsonMode()) {
      json(contact);
      return;
    }

    console.log();
    detail("Contact Details", {
      ID: contact.id,
      Phone: contact.phone_number,
      Name: contact.name || colors.dim("(none)"),
      Email: contact.email || colors.dim("(none)"),
      Status: contact.opted_out ? colors.error("Opted Out") : colors.success("Active"),
      Lists: contact.lists?.length
        ? contact.lists.map((l) => l.name).join(", ")
        : colors.dim("(none)"),
      Created: new Date(contact.created_at).toLocaleString(),
      ...(contact.updated_at && {
        Updated: new Date(contact.updated_at).toLocaleString(),
      }),
    });

    if (contact.metadata && Object.keys(contact.metadata).length > 0) {
      console.log();
      console.log(colors.bold("Metadata:"));
      for (const [key, value] of Object.entries(contact.metadata)) {
        console.log(`  ${key}: ${JSON.stringify(value)}`);
      }
    }
  }
}
