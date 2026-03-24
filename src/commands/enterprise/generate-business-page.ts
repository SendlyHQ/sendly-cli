import { Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import {
  success,
  json,
  colors,
  isJsonMode,
  spinner,
} from "../../lib/output.js";

interface GenerateBusinessPageResponse {
  slug: string;
  url: string;
  pageId: string;
}

export default class EnterpriseGenerateBusinessPage extends AuthenticatedCommand {
  static description = "Generate a hosted business page for verification";

  static examples = [
    '<%= config.bin %> enterprise generate-business-page --name "Acme Services" --use-case "Appointment Reminders"',
    '<%= config.bin %> enterprise generate-business-page --name "Acme Services" --email hello@acme.com --phone +15551234567',
  ];

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    name: Flags.string({
      char: "n",
      description: "Business name (required)",
      required: true,
    }),
    "use-case": Flags.string({
      description: "Use case (e.g. Appointment Reminders)",
    }),
    summary: Flags.string({
      description: "Use case summary",
    }),
    email: Flags.string({
      description: "Contact email",
    }),
    phone: Flags.string({
      description: "Contact phone",
    }),
    address: Flags.string({
      description: "Business address",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(EnterpriseGenerateBusinessPage);

    const spin = spinner("Generating business page...");
    spin.start();

    const body: Record<string, unknown> = { businessName: flags.name };
    if (flags["use-case"]) body.useCase = flags["use-case"];
    if (flags.summary) body.useCaseSummary = flags.summary;
    if (flags.email) body.contactEmail = flags.email;
    if (flags.phone) body.contactPhone = flags.phone;
    if (flags.address) body.businessAddress = flags.address;

    const response = await apiClient.post<GenerateBusinessPageResponse>(
      "/api/v1/enterprise/business-page/generate",
      body,
    );

    spin.succeed("Business page generated");

    if (isJsonMode()) {
      json(response);
      return;
    }

    success("Business page generated", {
      URL: colors.success(response.url),
      Slug: response.slug,
      "Page ID": colors.dim(response.pageId),
    });
  }
}
