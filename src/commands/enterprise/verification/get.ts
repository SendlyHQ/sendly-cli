import { Args } from "@oclif/core";
import { AuthenticatedCommand } from "../../../lib/base-command.js";
import { apiClient } from "../../../lib/api-client.js";
import {
  json,
  isJsonMode,
  header,
  keyValue,
  colors,
  formatStatus,
} from "../../../lib/output.js";

interface VerificationRecord {
  id?: string;
  status?: string;
  businessName?: string;
  doingBusinessAs?: string;
  website?: string;
  entityType?: string;
  brn?: string | null;
  brnType?: string | null;
  brnCountry?: string | null;
  address?: Record<string, unknown> | null;
  contact?: Record<string, unknown> | null;
  useCase?: string;
  useCaseSummary?: string;
  sampleMessages?: string;
  optInWorkflow?: string;
  optInImageUrls?: string;
  monthlyVolume?: string;
  additionalInformation?: string;
  ageGatedContent?: boolean;
  isvReseller?: string;
  privacyUrl?: string;
  termsUrl?: string;
  rejectionReason?: string;
  submittedAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export default class EnterpriseVerificationGet extends AuthenticatedCommand {
  static description =
    "Show the current verification record for an enterprise workspace.";

  static examples = [
    "<%= config.bin %> enterprise verification get org_abc123",
    "<%= config.bin %> enterprise verification get org_abc123 --json",
  ];

  static args = {
    workspaceId: Args.string({
      description: "Workspace ID",
      required: true,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
  };

  async run(): Promise<void> {
    const { args } = await this.parse(EnterpriseVerificationGet);

    const verification = await apiClient.get<VerificationRecord>(
      `/api/v1/enterprise/workspaces/${encodeURIComponent(args.workspaceId)}/verification`,
    );

    if (isJsonMode()) {
      json(verification);
      return;
    }

    header("Workspace Verification");

    const summary: Record<string, unknown> = {
      Workspace: args.workspaceId,
    };
    if (verification.id) summary["Verification ID"] = verification.id;
    if (verification.status) summary["Status"] = formatStatus(verification.status);
    if (verification.businessName)
      summary["Business Name"] = verification.businessName;
    if (verification.doingBusinessAs)
      summary["DBA"] = verification.doingBusinessAs;
    if (verification.entityType)
      summary["Entity Type"] = verification.entityType;
    if (verification.website) summary["Website"] = verification.website;
    if (verification.useCase) summary["Use Case"] = verification.useCase;
    if (verification.brn) summary["BRN"] = verification.brn;
    if (verification.brnType) summary["BRN Type"] = verification.brnType;
    if (verification.brnCountry)
      summary["BRN Country"] = verification.brnCountry;
    if (verification.monthlyVolume)
      summary["Monthly Volume"] = verification.monthlyVolume;
    if (verification.privacyUrl)
      summary["Privacy URL"] = verification.privacyUrl;
    if (verification.termsUrl) summary["Terms URL"] = verification.termsUrl;
    if (verification.submittedAt)
      summary["Submitted"] = verification.submittedAt;
    if (verification.updatedAt) summary["Updated"] = verification.updatedAt;

    keyValue(summary);

    if (verification.address && typeof verification.address === "object") {
      console.log();
      header("Address");
      keyValue(verification.address as Record<string, unknown>);
    }

    if (verification.contact && typeof verification.contact === "object") {
      console.log();
      header("Contact");
      keyValue(verification.contact as Record<string, unknown>);
    }

    if (verification.rejectionReason) {
      console.log();
      console.log(
        colors.error(`Rejection reason: ${verification.rejectionReason}`),
      );
    }
  }
}
