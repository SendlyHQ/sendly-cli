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
  quote: {
    codeType: string;
    monthlyUsd: number | null;
    currency: string;
    monthlyCents?: number;
    setupCents?: number;
    minimumTermMonths?: number;
  };
  billing?: {
    setupFee: { amountCents: number; status: string; paidAt: string | null; refundedCents: number };
    lease: {
      monthlyCents: number;
      minimumTermMonths: number;
      state: string;
      billingEnabled: boolean;
      nextChargeAt: string | null;
      paidThrough: string | null;
      termEndsAt: string | null;
      endsAt: string | null;
      pastDue: { amountCents: number; pauseAt: string | null } | null;
    };
    exempt: string | null;
  };
  carriers: { approved: number; total: number; overall: string };
}

export function formatUsd(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

function day(value: string | null | undefined): string | null {
  return value ? value.slice(0, 10) : null;
}

const SETUP_FEE_STATES: Record<string, string> = {
  unpaid: "charged when you submit",
  paid: "paid",
  waived: "not charged",
  refunded: "refunded",
  refund_pending: "refund in progress",
  processing: "payment in progress",
  requires_action: "waiting for you to confirm the payment",
  failed: "card declined",
  no_payment_method: "no card on file",
};

export function billingRows(view: ApplicationView): Array<[string, string]> {
  const rows: Array<[string, string]> = [];
  const setupCents = view.billing?.setupFee.amountCents ?? view.quote.setupCents ?? 99900;
  const status = view.billing?.setupFee.status ?? "unpaid";
  const paidOn = status === "paid" ? day(view.billing?.setupFee.paidAt) : null;
  rows.push([
    "Setup fee",
    `${formatUsd(setupCents)}, ${SETUP_FEE_STATES[status] ?? status}${paidOn ? ` on ${paidOn}` : ""}`,
  ]);
  const monthlyCents =
    view.billing?.lease.monthlyCents ??
    view.quote.monthlyCents ??
    (view.quote.monthlyUsd !== null ? view.quote.monthlyUsd * 100 : null);
  if (monthlyCents === null) return rows;
  const lease = view.billing?.lease;
  const term = lease?.minimumTermMonths ?? view.quote.minimumTermMonths ?? 3;
  if (!lease || lease.state === "not_started") {
    rows.push(["Lease", `${formatUsd(monthlyCents)}/month from go-live, ${term}-month minimum`]);
    return rows;
  }
  rows.push(["Lease", `${formatUsd(monthlyCents)}/month, ${lease.state}`]);
  if (lease.paidThrough) rows.push(["Paid through", day(lease.paidThrough)!]);
  if (lease.nextChargeAt) rows.push(["Next charge", day(lease.nextChargeAt)!]);
  if (lease.termEndsAt) rows.push(["Minimum term ends", day(lease.termEndsAt)!]);
  if (lease.endsAt) rows.push(["Lease ends", day(lease.endsAt)!]);
  if (lease.pastDue) {
    const pause = day(lease.pastDue.pauseAt);
    rows.push([
      "Past due",
      `${formatUsd(lease.pastDue.amountCents)} unpaid${pause ? `; sending pauses on ${pause}` : ""}. Pay from the short code status page`,
    ]);
  }
  return rows;
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
    "Show the workspace's short code application — where it stands, what is missing, and where the setup fee and lease stand";

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
    rows.push(...billingRows(view));
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
