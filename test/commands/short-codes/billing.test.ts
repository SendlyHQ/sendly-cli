import os from "node:os";
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../../../src/lib/config.js", () => ({
  isAuthenticated: vi.fn(() => true),
  getAuthToken: vi.fn(() => "sk_live_v1_mock"),
  getStoredAccessToken: vi.fn(() => undefined),
  setAuthTokens: vi.fn(),
  resolveBaseUrl: vi.fn(() => "https://sendly.live"),
  getConfigValue: vi.fn(() => undefined),
  getConfigDir: vi.fn(() => os.tmpdir()),
  getEffectiveValue: vi.fn((key: string) => {
    if (key === "maxRetries") return 0;
    if (key === "timeout") return 30000;
    return undefined;
  }),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

import ShortCodesSubmit from "../../../src/commands/short-codes/submit.js";
import ShortCodesApplication from "../../../src/commands/short-codes/application.js";
import ShortCodesList from "../../../src/commands/short-codes/list.js";
import { setOutputFormat } from "../../../src/lib/output.js";
import { respond, runCommand } from "../../helpers/run-command.js";

const LEASE = {
  monthlyCents: 115000,
  minimumTermMonths: 3,
  startsAt: "go_live",
  state: "past_due",
  billingEnabled: true,
  startedAt: "2026-10-05T08:00:00.000Z",
  nextChargeAt: "2026-11-05T08:00:00.000Z",
  paidThrough: null,
  termEndsAt: "2027-01-05T08:00:00.000Z",
  endsAt: null,
  cancelRequestedAt: null,
  pastDue: {
    chargeId: "charge_1",
    amountCents: 115000,
    status: "failed",
    periodStart: "2026-10-05T08:00:00.000Z",
    periodEnd: "2026-11-05T08:00:00.000Z",
    firstFailedAt: "2026-10-05T08:00:00.000Z",
    pauseAt: "2026-10-12T08:00:00.000Z",
    noticeStage: "failed",
  },
  dueMonths: 0,
  dueCents: 0,
};

function view(overrides: Record<string, unknown> = {}) {
  return {
    application: {
      id: "sc_1",
      shortCode: "72345",
      status: "active",
      reviewStatus: "filed",
      reviewNote: null,
      orderType: "new",
      codeType: "random",
    },
    editable: false,
    lockMessage: null,
    canStartNewApplication: false,
    requiredDocuments: [],
    missingDocuments: [],
    documents: [],
    quote: {
      codeType: "random",
      monthlyUsd: 1150,
      setupUsd: 999,
      currency: "USD",
      autoBilled: false,
      setupCents: 99900,
      monthlyCents: 115000,
      minimumTermMonths: 3,
      setupChargedAt: "submit",
      leaseStartsAt: "go_live",
    },
    billing: {
      setupFee: {
        amountCents: 99900,
        status: "paid",
        chargedAt: "submit",
        paidAt: "2026-09-01T10:00:00.000Z",
        refundedCents: 0,
        refundedAt: null,
      },
      lease: LEASE,
      terms: { version: "2026-10-06", acceptedVersion: "2026-10-06", acceptedAt: "2026-09-01T10:00:00.000Z" },
      refundPolicy: "full_refund_before_filing",
      exempt: null,
      charges: [],
    },
    carriers: { approved: 4, total: 4, overall: "approved" },
    ...overrides,
  };
}

function body(n: number) {
  const [, init] = mockFetch.mock.calls[n] as [string, RequestInit];
  return init.body ? JSON.parse(String(init.body)) : undefined;
}

beforeEach(() => {
  mockFetch.mockReset();
  setOutputFormat("human");
});

describe("short-codes submit", () => {
  it("won't submit, or charge, until the terms are accepted with --accept-terms", async () => {
    const run = await runCommand(ShortCodesSubmit, []);
    expect(run.exitCode).toBe(1);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(run.stderr).toContain("--accept-terms");
    expect(run.stderr).toContain("$999");
  });

  it("sends acceptTerms and says the setup fee was charged", async () => {
    mockFetch.mockResolvedValueOnce(
      respond(200, {
        ...view({ application: { reviewStatus: "awaiting_review" } }),
        submitted: true,
        alreadySubmitted: false,
        payment: { status: "paid", charged: true },
      }),
    );
    const run = await runCommand(ShortCodesSubmit, ["--accept-terms"]);
    expect(run.exitCode).toBeUndefined();
    expect(body(0)).toEqual({ acceptTerms: true });
    expect(run.stdout).toContain("Submitted for review.");
    expect(run.stdout).toContain("$999 setup fee charged");
  });

  it("gives the secure payment page when the bank wants the payment confirmed", async () => {
    mockFetch.mockResolvedValueOnce(
      respond(402, {
        error: "payment_requires_authentication",
        message: "Your bank needs you to confirm the $999 setup fee.",
        nextStep: "complete_payment",
        feature: "short_code_setup",
        amountCents: 99900,
        actionUrl: "/billing",
        checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_1",
      }),
    );
    const run = await runCommand(ShortCodesSubmit, ["--accept-terms"]);
    expect(run.exitCode).toBe(1);
    expect(run.stderr).toContain("Your bank needs you to confirm");
    expect(run.stderr).toContain("https://checkout.stripe.com/c/pay/cs_test_1");
    expect(run.stderr).not.toMatch(/credits/i);
  });

  it("keeps the code and the payment page in --json", async () => {
    setOutputFormat("json");
    mockFetch.mockResolvedValueOnce(
      respond(402, {
        error: "payment_requires_authentication",
        message: "Your bank needs you to confirm the $999 setup fee.",
        checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_1",
      }),
    );
    const run = await runCommand(ShortCodesSubmit, ["--accept-terms"]);
    expect(run.exitCode).toBe(1);
    const out = JSON.parse(run.stderr.slice(run.stderr.indexOf("{")));
    expect(out.code).toBe("payment_requires_authentication");
    expect(out.checkoutUrl).toBe("https://checkout.stripe.com/c/pay/cs_test_1");
  });

  it("says to update the card, not to buy credits, when the card is declined", async () => {
    mockFetch.mockResolvedValueOnce(
      respond(402, {
        error: "payment_failed",
        message: "Your card was declined for the $999 setup fee, so nothing was charged and your application is still a draft.",
        nextStep: "update_payment_method",
      }),
    );
    const run = await runCommand(ShortCodesSubmit, ["--accept-terms"]);
    expect(run.exitCode).toBe(1);
    expect(run.stderr).toContain("payment_failed");
    expect(run.stderr).toContain("sendly.live/billing");
    expect(run.stderr).not.toMatch(/credits/i);
  });
});

describe("short-codes application", () => {
  it("shows the setup fee, the lease and an unpaid month instead of a quote that is never charged", async () => {
    mockFetch.mockResolvedValueOnce(respond(200, view()));
    const run = await runCommand(ShortCodesApplication, []);
    expect(run.exitCode).toBeUndefined();
    expect(run.stdout).not.toMatch(/never charged/);
    expect(run.stdout).toContain("$999, paid");
    expect(run.stdout).toContain("$1,150/month");
    expect(run.stdout).toContain("past_due");
    expect(run.stdout).toContain("$1,150 unpaid");
    expect(run.stdout).toContain("2026-10-12");
  });

  it("states the price and when it is charged before the application is submitted", async () => {
    mockFetch.mockResolvedValueOnce(
      respond(
        200,
        view({
          application: {
            id: "sc_1",
            shortCode: null,
            status: "requested",
            reviewStatus: "draft",
            reviewNote: null,
            orderType: "new",
            codeType: "random",
          },
          billing: {
            ...view().billing,
            setupFee: { ...view().billing.setupFee, status: "unpaid", paidAt: null },
            lease: { ...LEASE, state: "not_started", startedAt: null, nextChargeAt: null, pastDue: null },
          },
        }),
      ),
    );
    const run = await runCommand(ShortCodesApplication, []);
    expect(run.stdout).toContain("$999, charged when you submit");
    expect(run.stdout).toContain("$1,150/month from go-live, 3-month minimum");
  });
});

describe("short-codes application: verification and suggested wording", () => {
  it("says the business is verified", async () => {
    mockFetch.mockResolvedValueOnce(
      respond(200, view({ verification: { verified: true, state: "verified", href: "/verify" } })),
    );
    const run = await runCommand(ShortCodesApplication, []);
    expect(run.stdout).toMatch(/Business verification.*verified/);
    expect(run.stdout).not.toContain("Submitting needs a verified business");
  });

  it("says submitting needs a verified business, and where to finish it", async () => {
    mockFetch.mockResolvedValueOnce(
      respond(200, view({ verification: { verified: false, state: "in_review", href: "/verify" } })),
    );
    const run = await runCommand(ShortCodesApplication, []);
    expect(run.stdout).toContain("in review");
    expect(run.stdout).toContain("Submitting needs a verified business: https://sendly.live/verify");
  });

  it("names the wording Sendly suggested while the application still carries it", async () => {
    const base = view();
    mockFetch.mockResolvedValueOnce(
      respond(
        200,
        view({
          editable: true,
          application: { ...base.application, useCase: "Order alerts for Acme", optInFlow: "Customers text JOIN" },
          generatedDefaults: { useCase: "Order alerts for Acme", optInFlow: "Customers text JOIN" },
        }),
      ),
    );
    const run = await runCommand(ShortCodesApplication, []);
    expect(run.stdout).toContain("Sendly suggested the wording of --use-case and --opt-in-flow");
  });

  it("names only the suggested wording that has not been edited, ignoring spacing and case", async () => {
    const base = view();
    mockFetch.mockResolvedValueOnce(
      respond(
        200,
        view({
          editable: true,
          application: {
            ...base.application,
            useCase: "Order alerts and shipping updates for Acme customers",
            optInFlow: "  customers   text\nJOIN ",
          },
          generatedDefaults: { useCase: "Order alerts for Acme", optInFlow: "Customers text JOIN" },
        }),
      ),
    );
    const run = await runCommand(ShortCodesApplication, []);
    expect(run.stdout).toContain("Sendly suggested the wording of --opt-in-flow. Edit it");
    expect(run.stdout).not.toContain("--use-case");
  });

  it("does not ask for an edit once the suggested wording has been changed", async () => {
    const base = view();
    mockFetch.mockResolvedValueOnce(
      respond(
        200,
        view({
          editable: true,
          application: {
            ...base.application,
            useCase: "Order alerts and shipping updates for Acme customers",
            optInFlow: "Customers tick an unchecked box at checkout",
          },
          generatedDefaults: { useCase: "Order alerts for Acme", optInFlow: "Customers text JOIN" },
        }),
      ),
    );
    const run = await runCommand(ShortCodesApplication, []);
    expect(run.stdout).not.toContain("Sendly suggested");
  });

  it("does not ask for an edit when the application can no longer be changed", async () => {
    const base = view();
    mockFetch.mockResolvedValueOnce(
      respond(
        200,
        view({
          editable: false,
          application: { ...base.application, useCase: "Order alerts for Acme" },
          generatedDefaults: { useCase: "Order alerts for Acme" },
        }),
      ),
    );
    const run = await runCommand(ShortCodesApplication, []);
    expect(run.stdout).not.toContain("Sendly suggested");
  });

  it("takes the setup fee from setupUsd when no cents are given", async () => {
    const base = view();
    mockFetch.mockResolvedValueOnce(
      respond(
        200,
        view({
          quote: { codeType: "random", monthlyUsd: 1150, setupUsd: 1250, currency: "USD", autoBilled: false },
          billing: undefined,
          application: { ...base.application, reviewStatus: "draft", status: "requested" },
        }),
      ),
    );
    const run = await runCommand(ShortCodesApplication, []);
    expect(run.stdout).toContain("$1,250, charged when you submit");
  });
});

describe("short-codes list", () => {
  it("lists drafts with no code yet, and each review status", async () => {
    mockFetch.mockResolvedValueOnce(
      respond(200, {
        shortCodes: [
          {
            id: "sc_2",
            shortCode: null,
            countryCode: "US",
            status: "requested",
            reviewStatus: "draft",
            useCase: "Order alerts",
            createdAt: "2026-10-01T10:00:00.000Z",
          },
        ],
      }),
    );
    const run = await runCommand(ShortCodesList, []);
    expect(run.exitCode).toBeUndefined();
    expect(run.stdout).toContain("not assigned");
    expect(run.stdout).toContain("Review");
    expect(run.stdout).toContain("draft");
  });

  it("describes every application, not only leased codes", () => {
    expect(ShortCodesList.description).toContain("Drafts, rejected and cancelled applications are listed too");
  });
});
