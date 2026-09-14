import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import { json, info, warn, colors, spinner, isJsonMode } from "../../lib/output.js";
import { reportShortCodeError } from "./application.js";

interface SubmitResponse {
  application: { reviewStatus: string };
  submitted?: boolean;
  alreadySubmitted?: boolean;
}

export default class ShortCodesSubmit extends AuthenticatedCommand {
  static description = "Submit the short code application to Sendly for review";

  static examples = [
    "<%= config.bin %> short-codes submit",
    "<%= config.bin %> short-codes submit --json",
  ];

  static flags = {
    ...AuthenticatedCommand.baseFlags,
  };

  async run(): Promise<void> {
    await this.parse(ShortCodesSubmit);

    const submitSpinner = spinner("Submitting short code application...");
    if (!isJsonMode()) submitSpinner.start();

    let result: SubmitResponse;
    try {
      result = await apiClient.post<SubmitResponse>(
        "/api/v1/short_codes/application/submit",
        {},
      );
      submitSpinner.stop();
    } catch (error) {
      submitSpinner.stop();
      warn(`Not submitted. Run ${colors.code("sendly short-codes check")} to see why.`);
      reportShortCodeError(error);
    }

    if (isJsonMode()) {
      json(result);
      return;
    }

    if (result.alreadySubmitted) {
      info("Already submitted. Nothing changed.");
      return;
    }
    info("Submitted for review.");
    info("Sendly reviews it, then emails you the carrier forms to sign.");
  }
}
