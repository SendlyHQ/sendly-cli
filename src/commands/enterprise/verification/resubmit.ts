import { Args, Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../../lib/base-command.js";
import { submitVerification } from "./submit.js";

export default class EnterpriseVerificationResubmit extends AuthenticatedCommand {
  static description =
    "Resubmit a verification after rejection. Same endpoint as submit — partial-update friendly, omitted fields are preserved from the existing record.";

  static examples = [
    '<%= config.bin %> enterprise verification resubmit org_abc123 --contact-email new@acme.com',
    '<%= config.bin %> enterprise verification resubmit org_abc123 --data ./fixes.json',
    '<%= config.bin %> enterprise verification resubmit org_abc123 --use-case-summary "Updated summary"',
  ];

  static args = {
    workspaceId: Args.string({
      description: "Workspace ID",
      required: true,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    data: Flags.string({
      char: "d",
      description: "Path to a JSON file containing the partial-update payload",
    }),
    "business-name": Flags.string({ description: "Legal business name" }),
    "doing-business-as": Flags.string({ description: "DBA / trading name" }),
    website: Flags.string({ description: "Business website URL" }),
    "entity-type": Flags.string({
      description:
        "Entity type (SOLE_PROPRIETOR | PRIVATE_PROFIT | PUBLIC_PROFIT | NON_PROFIT | GOVERNMENT)",
      options: [
        "SOLE_PROPRIETOR",
        "PRIVATE_PROFIT",
        "PUBLIC_PROFIT",
        "NON_PROFIT",
        "GOVERNMENT",
      ],
    }),
    "address-street": Flags.string({ description: "Street address" }),
    "address-city": Flags.string({ description: "City" }),
    "address-state": Flags.string({ description: "State / region" }),
    "address-zip": Flags.string({ description: "ZIP / postal code" }),
    "address-country": Flags.string({ description: "Country code (e.g. US)" }),
    "contact-first-name": Flags.string({ description: "Contact first name" }),
    "contact-last-name": Flags.string({ description: "Contact last name" }),
    "contact-email": Flags.string({ description: "Contact email address" }),
    "contact-phone": Flags.string({
      description: "Contact phone number (E.164)",
    }),
    brn: Flags.string({
      description:
        "Business registration number (omit for sole proprietors; server will strip)",
    }),
    "brn-type": Flags.string({
      description: "BRN type (EIN | SSN | DUNS | CRA | VAT | LEI | OTHER)",
      options: ["EIN", "SSN", "DUNS", "CRA", "VAT", "LEI", "OTHER"],
    }),
    "brn-country": Flags.string({ description: "BRN country code (e.g. US)" }),
    "use-case": Flags.string({
      description: "Use case (Telnyx use-case enum value)",
    }),
    "use-case-summary": Flags.string({ description: "Use case summary" }),
    "sample-messages": Flags.string({ description: "Sample messages" }),
    "opt-in-workflow": Flags.string({
      description: "Opt-in workflow description",
    }),
    "opt-in-image-urls": Flags.string({
      description: "Opt-in image URLs (newline or comma separated)",
    }),
    "monthly-volume": Flags.string({
      description: "Estimated monthly message volume",
    }),
    "additional-information": Flags.string({
      description: "Additional information for the carrier",
    }),
    "age-gated-content": Flags.boolean({
      description: "Mark traffic as age-gated content",
      allowNo: true,
    }),
    "isv-reseller": Flags.string({
      description: "ISV / reseller name (if applicable)",
    }),
    "privacy-url": Flags.string({ description: "Privacy policy URL" }),
    "terms-url": Flags.string({ description: "Terms of service URL" }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(EnterpriseVerificationResubmit);
    await submitVerification(
      args.workspaceId,
      flags,
      "Resubmitting verification...",
    );
  }
}
