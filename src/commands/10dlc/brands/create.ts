import { Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../../lib/base-command.js";
import { apiClient } from "../../../lib/api-client.js";
import {
  json,
  success,
  colors,
  isJsonMode,
  keyValue,
} from "../../../lib/output.js";

interface Brand {
  id: string;
  legalName: string;
  dba: string | null;
  entityType: string;
  status: string;
  createdAt: string;
}

interface CreateBrandResponse {
  data: Brand;
}

const TEXT_FIELDS: Record<string, string> = {
  dba: "dba",
  ein: "ein",
  vertical: "vertical",
  website: "website",
  email: "email",
  phone: "phone",
  "mobile-phone": "mobilePhone",
  street: "street",
  city: "city",
  state: "state",
  "postal-code": "postalCode",
  country: "country",
  "verification-id": "verificationId",
};

export default class TendlcBrandsCreate extends AuthenticatedCommand {
  static description =
    "Register a brand for carrier review (step 1 of enabling local-number texting)";

  static examples = [
    '<%= config.bin %> 10dlc brands create --legal-name "Acme Inc" --ein "12-3456789" --website https://acme.com',
    '<%= config.bin %> 10dlc brands create --legal-name "Jane Doe" --entity-type SOLE_PROPRIETOR --email jane@example.com',
  ];

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    "legal-name": Flags.string({
      description: "Legal business name",
      required: true,
    }),
    dba: Flags.string({ description: "DBA / trading name" }),
    ein: Flags.string({ description: "EIN / tax ID" }),
    "entity-type": Flags.string({
      description: "Entity type (e.g. PRIVATE_PROFIT, SOLE_PROPRIETOR)",
      default: "PRIVATE_PROFIT",
    }),
    vertical: Flags.string({
      description: "Industry vertical (e.g. TECHNOLOGY, RETAIL)",
    }),
    website: Flags.string({ description: "Business website URL" }),
    email: Flags.string({ description: "Business contact email" }),
    phone: Flags.string({ description: "Business phone number" }),
    "mobile-phone": Flags.string({
      description: "Contact mobile number (sole proprietors)",
    }),
    street: Flags.string({ description: "Street address" }),
    city: Flags.string({ description: "City" }),
    state: Flags.string({ description: "State / region" }),
    "postal-code": Flags.string({ description: "ZIP / postal code" }),
    country: Flags.string({
      description: "Country code (e.g. US)",
      default: "US",
    }),
    "verification-id": Flags.string({
      description: "Verification ID to prefill business details from",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(TendlcBrandsCreate);

    const body: Record<string, unknown> = {
      legalName: flags["legal-name"],
      entityType: flags["entity-type"],
    };

    for (const [flagKey, wireKey] of Object.entries(TEXT_FIELDS)) {
      const v = flags[flagKey as keyof typeof flags];
      if (typeof v === "string" && v.length > 0) body[wireKey] = v;
    }

    const response = await apiClient.post<CreateBrandResponse>(
      "/api/v1/tendlc/brands",
      body,
    );

    if (isJsonMode()) {
      json(response);
      return;
    }

    const brand = response.data;

    success(`Brand submitted for carrier review: ${brand.id}`);
    console.log();

    keyValue([
      ["Legal name", brand.legalName],
      ["Entity type", brand.entityType],
      ["Status", colors.warning(brand.status)],
    ]);

    console.log();
    console.log(colors.dim("Next steps:"));
    console.log(
      `  Check status:  ${colors.code(`sendly 10dlc brands get ${brand.id}`)}`,
    );
    console.log(
      `  Once verified: ${colors.code(`sendly 10dlc qualify ${brand.id} MIXED`)}`,
    );
  }
}
