import { Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import { json, info, warn, error, colors, spinner, isJsonMode } from "../../lib/output.js";
import { formatUsd, reportShortCodeError } from "./application.js";

interface SubmitResponse {
  application: { reviewStatus: string };
  submitted?: boolean;
  alreadySubmitted?: boolean;
  payment?: { status: "paid" | "waived"; charged: boolean };
  billing?: { setupFee?: { amountCents?: number } };
}

export const SHORT_CODE_TERMS =
  "Submitting charges the one-time $999 setup fee to your workspace's card on file. The monthly lease ($1,150 random, $2,150 vanity) is charged from the day the code goes live, with a 3-month minimum. The setup fee is refunded in full if Sendly rejects the application before filing it, and isn't refundable once it is filed.";

export default class ShortCodesSubmit extends AuthenticatedCommand {
  static description =
    "Submit the short code application to Sendly for review. Charges the $999 setup fee to the card on file";

  static examples = [
    "<%= config.bin %> short-codes submit --accept-terms",
    "<%= config.bin %> short-codes submit --accept-terms --json",
  ];

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    "accept-terms": Flags.boolean({
      description:
        "Accept the $999 setup fee charged now, the monthly lease from go-live and the 3-month minimum",
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(ShortCodesSubmit);

    if (!flags["accept-terms"]) {
      error("Not submitted: accept the price first.", {
        code: "terms_not_accepted",
        terms: SHORT_CODE_TERMS,
        hint: `Run ${colors.code("sendly short-codes submit --accept-terms")} to accept and submit`,
      });
      this.exit(1);
    }

    const submitSpinner = spinner("Submitting short code application...");
    if (!isJsonMode()) submitSpinner.start();

    let result: SubmitResponse;
    try {
      result = await apiClient.post<SubmitResponse>(
        "/api/v1/short_codes/application/submit",
        { acceptTerms: true },
      );
      submitSpinner.stop();
    } catch (err) {
      submitSpinner.stop();
      warn(`Not submitted. Run ${colors.code("sendly short-codes check")} to see why.`);
      reportShortCodeError(err);
    }

    if (isJsonMode()) {
      json(result);
      return;
    }

    if (result.alreadySubmitted) {
      info("Already submitted. Nothing changed, and nothing was charged.");
      return;
    }
    info("Submitted for review.");
    const fee = formatUsd(result.billing?.setupFee?.amountCents ?? 99900);
    if (result.payment?.charged) {
      info(`${fee} setup fee charged to your card. The receipt is on its way by email.`);
    } else if (result.payment?.status === "waived") {
      info("No setup fee was charged for this workspace.");
    } else if (result.payment?.status === "paid") {
      info(`The ${fee} setup fee was already paid.`);
    }
    info("Sendly reviews it, then emails you the carrier forms to sign.");
  }
}
