import { Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../../lib/base-command.js";
import { apiClient } from "../../../lib/api-client.js";
import {
  json,
  success,
  colors,
  spinner,
  isJsonMode,
} from "../../../lib/output.js";
import {
  BRAND_FLAGS,
  buildBrandBody,
  getPath,
  idempotencyKeyFlag,
  nextStepFor,
  printBrand,
  printNextSteps,
  reportRcsError,
  setPath,
  type PublicRcsBrand,
} from "../../../lib/rcs-registration.js";

interface CreateBrandResponse {
  brand: PublicRcsBrand;
}

export default class RcsBrandsCreate extends AuthenticatedCommand {
  static description =
    "Draft the brand behind your RCS registration (step 1; nothing goes for review until `rcs agents submit`)";

  static examples = [
    '<%= config.bin %> rcs brands create --display-name "Acme" --legal-name "Acme Inc" --legal-entity-type CORPORATION --organization-type PRIVATE_PROFIT --ein 12-3456789 --website https://acme.com --address-line1 "1 Main St" --city Austin --state TX --postal-code 78701 --contact-first-name Jane --contact-last-name Doe --contact-email jane@acme.com --contact-phone +15125550100',
    "<%= config.bin %> rcs brands create --from-json brand.json",
    '<%= config.bin %> rcs brands create --from-json brand.json --display-name "Acme" --json',
  ];

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    ...BRAND_FLAGS,
    "from-json": Flags.string({
      description:
        "Path to a JSON file with the brand (a plain brand object, or the output of `rcs dossier --json`); flags override fields in the file",
    }),
    "idempotency-key": idempotencyKeyFlag,
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(RcsBrandsCreate);

    const body = buildBrandBody(flags, { clearEmpty: false });
    if (getPath(body, ["address", "countryCode"]) === undefined) {
      setPath(body, ["address", "countryCode"], "US");
    }

    const saveSpinner = spinner("Saving brand draft...");
    if (!isJsonMode()) {
      saveSpinner.start();
    }

    let response: CreateBrandResponse;
    try {
      response = await apiClient.post<CreateBrandResponse>(
        "/api/v1/rcs/brands",
        body,
        true,
        { idempotencyKey: flags["idempotency-key"] },
      );
      saveSpinner.stop();
    } catch (err) {
      saveSpinner.stop();
      if (reportRcsError(err)) this.exit(1);
      throw err;
    }

    if (isJsonMode()) {
      json(response);
      return;
    }

    const brand = response.brand;
    success(`Brand draft saved: ${brand.id}`);
    console.log();
    printBrand(brand);
    console.log();
    console.log(
      colors.dim(
        "Missing fields are checked when you submit; fill them in any time with `sendly rcs brands update`.",
      ),
    );
    printNextSteps(nextStepFor("draft", { brandId: brand.id }));
  }
}
