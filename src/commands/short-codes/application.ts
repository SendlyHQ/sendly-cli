import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import {
  json,
  info,
  warn,
  colors,
  spinner,
  isJsonMode,
  keyValue,
} from "../../lib/output.js";

interface DocumentState {
  kind: string;
  templateReady: boolean;
  signedAt: string | null;
  signedByName: string | null;
  awaitingSignature: boolean;
}

interface ApplicationView {
  application: Record<string, unknown> & {
    id: string | null;
    shortCode: string | null;
    status: string;
    reviewStatus: string;
    reviewNote: string | null;
    orderType: string;
    codeType: string;
  };
  editable: boolean;
  lockMessage: string | null;
  canStartNewApplication: boolean;
  requiredDocuments: string[];
  missingDocuments: string[];
  documents: DocumentState[];
  quote: { codeType: string; monthlyUsd: number | null; currency: string };
  carriers: { approved: number; total: number; overall: string };
}

const DOCUMENT_LABELS: Record<string, string> = {
  order_brief: "Short Code Order Brief",
  brand_registration: "Brand Registration Form",
  content_provider_registration: "Content Provider Registration Form",
  migration_letter: "Migration Letter",
  loa: "Letter of Authorization",
};

export function reportShortCodeError(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("short_codes_not_enabled")) {
    warn("Short codes aren't enabled for this account yet. Ask Sendly support.");
  }
  throw error;
}

export default class ShortCodesApplication extends AuthenticatedCommand {
  static description =
    "Show the workspace's short code application — where it stands, what is missing, and the quoted lease";

  static examples = [
    "<%= config.bin %> short-codes application",
    "<%= config.bin %> short-codes application --json",
  ];

  static flags = {
    ...AuthenticatedCommand.baseFlags,
  };

  async run(): Promise<void> {
    await this.parse(ShortCodesApplication);

    const loadSpinner = spinner("Fetching short code application...");
    if (!isJsonMode()) loadSpinner.start();

    let view: ApplicationView;
    try {
      view = await apiClient.get<ApplicationView>(
        "/api/v1/short_codes/application",
      );
      loadSpinner.stop();
    } catch (error) {
      loadSpinner.stop();
      reportShortCodeError(error);
    }

    if (isJsonMode()) {
      json(view);
      return;
    }

    const app = view.application;
    if (!app.id) {
      info("No short code application yet.");
      info(`Start one with: ${colors.code("sendly short-codes update --help")}`);
      return;
    }

    const rows: Array<[string, string]> = [
      ["Code", app.shortCode ?? "not assigned yet"],
      ["Order", `${app.orderType}, ${app.codeType}`],
      ["Status", app.status],
      ["Review", app.reviewStatus],
    ];
    if (view.quote.monthlyUsd !== null) {
      rows.push([
        "Quoted lease",
        `$${view.quote.monthlyUsd}/month (${view.quote.currency}), never charged automatically`,
      ]);
    }
    rows.push([
      "Carriers",
      `${view.carriers.approved} of ${view.carriers.total} approved`,
    ]);
    keyValue(rows);

    if (view.lockMessage) info(view.lockMessage);
    if (app.reviewNote) info(`Note from review: ${app.reviewNote}`);

    if (view.requiredDocuments.length > 0) {
      info("");
      info("Carrier forms:");
      for (const kind of view.requiredDocuments) {
        const doc = view.documents.find((d) => d.kind === kind);
        const label = DOCUMENT_LABELS[kind] ?? kind;
        const state = doc?.signedAt
          ? `signed${doc.signedByName ? ` by ${doc.signedByName}` : ""}`
          : doc?.awaitingSignature
            ? "signing link sent"
            : "not ready yet";
        info(`  ${label}: ${state}`);
      }
    }

    if (view.canStartNewApplication) {
      info("");
      info(`Start a new application with ${colors.code("sendly short-codes update")}.`);
    }
  }
}
