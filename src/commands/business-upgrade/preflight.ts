import { Flags } from "@oclif/core";
import { readFileSync } from "node:fs";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import { json, info, error, isJsonMode, colors } from "../../lib/output.js";

interface PreflightIssue {
  severity: "blocker" | "warning" | "info";
  field: string;
  code: string;
  message: string;
  suggestion?: string;
}

interface PreflightReport {
  verdict: "ready" | "warnings" | "blocked";
  country: string;
  issues: PreflightIssue[];
  proposedFixes: Array<{ field: string; proposed: unknown; reason: string }>;
}

export default class BusinessUpgradePreflight extends AuthenticatedCommand {
  static description =
    "Dry-run a business entity upgrade and surface issues + auto-fix suggestions before submitting";

  static examples = [
    '<%= config.bin %> business-upgrade preflight --business-name "Acme LLC" --brn "12-3456789" --brn-type EIN --entity-type PRIVATE_PROFIT',
    "<%= config.bin %> business-upgrade preflight --candidate ./candidate.json --json",
  ];

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    "business-name": Flags.string({
      description: "Legal business name of the new entity",
    }),
    brn: Flags.string({
      description: "Business registration number (EIN/SSN/etc.)",
    }),
    "brn-type": Flags.string({
      description: "Registration type (EIN, SSN, DUNS, CRA, VAT, LEI, OTHER)",
    }),
    "brn-country": Flags.string({
      description: "Registration issuing country (ISO 3166-1 alpha-2)",
      default: "US",
    }),
    "entity-type": Flags.string({
      description:
        "Entity type (SOLE_PROPRIETOR, PRIVATE_PROFIT, PUBLIC_PROFIT, NON_PROFIT, GOVERNMENT)",
      default: "PRIVATE_PROFIT",
    }),
    candidate: Flags.string({
      description: "Path to a JSON file with the full candidate payload",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(BusinessUpgradePreflight);

    let candidate: Record<string, unknown> = {};
    if (flags.candidate) {
      candidate = JSON.parse(readFileSync(flags.candidate, "utf8"));
    } else {
      candidate = {
        businessName: flags["business-name"],
        brn: flags.brn,
        brnType: flags["brn-type"],
        brnCountry: flags["brn-country"],
        entityType: flags["entity-type"],
      };
    }
    if (!candidate.businessName || !candidate.brn) {
      error("Provide --business-name and --brn (or pass --candidate <file>).");
      this.exit(1);
    }

    const report = await apiClient.post<PreflightReport>(
      "/api/v1/verification/preflight",
      candidate,
    );

    if (isJsonMode()) {
      json(report);
      return;
    }

    const verdictColor =
      report.verdict === "blocked"
        ? colors.error
        : report.verdict === "warnings"
          ? colors.warning
          : colors.success;
    info(`Verdict: ${verdictColor(report.verdict)} (${report.country})`);
    if (report.issues.length === 0) {
      info(colors.success("No issues. Ready to submit."));
      return;
    }
    info("");
    for (const issue of report.issues) {
      const sevColor =
        issue.severity === "blocker"
          ? colors.error
          : issue.severity === "warning"
            ? colors.warning
            : colors.dim;
      info(
        `${sevColor(issue.severity.toUpperCase())} ${issue.field} — ${issue.message}`,
      );
      if (issue.suggestion) info(`  ${colors.dim("→ " + issue.suggestion)}`);
    }
  }
}
