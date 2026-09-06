import { Args, Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../../lib/base-command.js";
import { apiClient } from "../../../lib/api-client.js";
import {
  json,
  success,
  error,
  spinner,
  isJsonMode,
} from "../../../lib/output.js";
import {
  BRAND_FLAGS,
  buildBrandBody,
  idempotencyKeyFlag,
  nextStepFor,
  printBrand,
  printNextSteps,
  reportRcsError,
  type PublicRcsBrand,
} from "../../../lib/rcs-registration.js";

interface UpdateBrandResponse {
  brand: PublicRcsBrand;
}

export default class RcsBrandsUpdate extends AuthenticatedCommand {
  static description =
    "Update fields on a drafted RCS brand (only the flags you pass change; pass an empty value to clear an optional field)";

  static examples = [
    "<%= config.bin %> rcs brands update 3f6a1c9e-0000-0000-0000-000000000000 --ein 12-3456789 --website https://acme.com",
    '<%= config.bin %> rcs brands update 3f6a1c9e-0000-0000-0000-000000000000 --stock-symbol ""',
    "<%= config.bin %> rcs brands update 3f6a1c9e-0000-0000-0000-000000000000 --from-json brand.json --json",
  ];

  static args = {
    id: Args.string({
      description: "Brand ID",
      required: true,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    ...BRAND_FLAGS,
    "from-json": Flags.string({
      description:
        "Path to a JSON file with the fields to change (a plain brand object, or the output of `rcs dossier --json`); flags override fields in the file",
    }),
    "idempotency-key": idempotencyKeyFlag,
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(RcsBrandsUpdate);

    const body = buildBrandBody(flags, { clearEmpty: true });
    if (Object.keys(body).length === 0) {
      error("Nothing to update", {
        hint: "Pass at least one field flag or --from-json <file>; see --help for the list",
      });
      this.exit(1);
    }

    const saveSpinner = spinner("Updating brand...");
    if (!isJsonMode()) {
      saveSpinner.start();
    }

    let response: UpdateBrandResponse;
    try {
      response = await apiClient.patch<UpdateBrandResponse>(
        `/api/v1/rcs/brands/${encodeURIComponent(args.id)}`,
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
    success(`Brand updated: ${brand.id}`);
    console.log();
    printBrand(brand);
    printNextSteps(nextStepFor(brand.customerStage, { brandId: brand.id }));
  }
}
