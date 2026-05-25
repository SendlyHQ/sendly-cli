import { Flags } from "@oclif/core";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import { json, info, success, isJsonMode } from "../../lib/output.js";

export default class BusinessUpgradeStart extends AuthenticatedCommand {
  static description =
    "Start a business entity upgrade — auto-provisions a new toll-free number under the new entity and submits to the carrier for review";

  static examples = [
    '<%= config.bin %> business-upgrade start --workspace ws_abc --business-name "Acme Holdings LLC" --brn "12-3456789" --brn-type EIN --entity-type PRIVATE_PROFIT --ein-doc ./CP-575.pdf',
  ];

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    workspace: Flags.string({
      description: "Workspace ID being upgraded",
      required: true,
    }),
    "business-name": Flags.string({ required: true }),
    brn: Flags.string({ required: true }),
    "brn-type": Flags.string({ required: true, default: "EIN" }),
    "brn-country": Flags.string({ default: "US" }),
    "entity-type": Flags.string({ required: true, default: "PRIVATE_PROFIT" }),
    "doing-business-as": Flags.string(),
    website: Flags.string(),
    "monthly-volume": Flags.string(),
    "use-case": Flags.string(),
    "ein-doc": Flags.string({
      description: "Path to the IRS letter (CP-575 or 147C) PDF",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(BusinessUpgradeStart);

    const form = new FormData();
    const fieldMap: Record<string, string | undefined> = {
      businessName: flags["business-name"],
      brn: flags.brn,
      brnType: flags["brn-type"],
      brnCountry: flags["brn-country"],
      entityType: flags["entity-type"],
      doingBusinessAs: flags["doing-business-as"],
      website: flags.website,
      monthlyVolume: flags["monthly-volume"],
      useCase: flags["use-case"],
    };
    for (const [k, v] of Object.entries(fieldMap)) {
      if (v !== undefined) form.append(k, v);
    }
    if (flags["ein-doc"]) {
      const buf = readFileSync(flags["ein-doc"]);
      const blob = new Blob([buf], { type: "application/pdf" });
      form.append("einDoc", blob, basename(flags["ein-doc"]));
    }

    const result = await apiClient.postMultipart<{
      success: boolean;
      pendingVerificationId: string;
      telnyxVerificationId: string;
      tollFreeNumber: string;
      message: string;
    }>(`/api/v1/workspaces/${encodeURIComponent(flags.workspace)}/upgrade`, form);

    if (isJsonMode()) {
      json(result);
      return;
    }
    success("Upgrade submitted to carrier.");
    info(`Pending verification: ${result.pendingVerificationId}`);
    info(`New toll-free number (reserved): ${result.tollFreeNumber}`);
    info(result.message);
  }
}
