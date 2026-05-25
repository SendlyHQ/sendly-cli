import { Flags } from "@oclif/core";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import { json, success, info, isJsonMode } from "../../lib/output.js";

export default class BusinessUpgradeResubmit extends AuthenticatedCommand {
  static description =
    "Resubmit a previously rejected (or waiting-for-customer) business entity upgrade with corrected fields and optionally a new EIN document";

  static examples = [
    '<%= config.bin %> business-upgrade resubmit --workspace ws_abc --business-name "Acme Holdings LLC" --ein-doc ./CP-575-v2.pdf',
  ];

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    workspace: Flags.string({ required: true }),
    "business-name": Flags.string(),
    brn: Flags.string(),
    "brn-type": Flags.string(),
    "brn-country": Flags.string(),
    "entity-type": Flags.string(),
    "monthly-volume": Flags.string(),
    "use-case": Flags.string(),
    "sample-messages": Flags.string(),
    "opt-in-workflow": Flags.string(),
    "ein-doc": Flags.string(),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(BusinessUpgradeResubmit);

    const form = new FormData();
    const fieldMap: Record<string, string | undefined> = {
      businessName: flags["business-name"],
      brn: flags.brn,
      brnType: flags["brn-type"],
      brnCountry: flags["brn-country"],
      entityType: flags["entity-type"],
      monthlyVolume: flags["monthly-volume"],
      useCase: flags["use-case"],
      sampleMessages: flags["sample-messages"],
      optInWorkflow: flags["opt-in-workflow"],
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
      message: string;
    }>(
      `/api/v1/workspaces/${encodeURIComponent(flags.workspace)}/upgrade/resubmit`,
      form,
    );

    if (isJsonMode()) {
      json(result);
      return;
    }
    success("Resubmitted to carrier.");
    info(result.message);
  }
}
