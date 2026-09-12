import { Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import { json, info, colors, spinner, isJsonMode } from "../../lib/output.js";
import { reportShortCodeError } from "./application.js";

export default class ShortCodesUpdate extends AuthenticatedCommand {
  static description =
    "Save answers on the short code application, creating it on the first run";

  static examples = [
    '<%= config.bin %> short-codes update --use-case "Delivery alerts for Acme orders"',
    '<%= config.bin %> short-codes update --message-frequency "4 messages per month" --json',
  ];

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    "use-case": Flags.string({ description: "What the short code will be used for" }),
    "opt-in-flow": Flags.string({ description: "How subscribers opt in" }),
    "opt-in-confirmation": Flags.string({ description: "The welcome message sent the moment someone opts in" }),
    "help-response": Flags.string({ description: "The HELP reply: program name, help source, rates, frequency and STOP" }),
    "stop-confirmation": Flags.string({ description: "The STOP reply" }),
    "message-frequency": Flags.string({ description: "Precise frequency, such as 4 messages per month" }),
    "campaign-keyword": Flags.string({ description: "The keyword subscribers text to join" }),
    "expected-monthly-volume": Flags.string({ description: "Expected messages per month" }),
    "privacy-policy-url": Flags.string({ description: "Privacy policy URL" }),
    "terms-url": Flags.string({ description: "SMS terms URL" }),
    "order-type": Flags.string({ description: "Either new or migration" }),
    "code-type": Flags.string({ description: "Either random or vanity" }),
    "requested-digits": Flags.string({ description: "The digits you want (vanity), or the code being migrated" }),
    "losing-provider": Flags.string({ description: "Who the code is moving from (migration only)" }),
    "brand-contact-name": Flags.string({ description: "Name the Short Code Registry will contact" }),
    "brand-contact-email": Flags.string({ description: "Email the Short Code Registry will verify" }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(ShortCodesUpdate);
    const body: Record<string, unknown> = {};
    if (flags["use-case"] !== undefined) body.useCase = flags["use-case"];
    if (flags["opt-in-flow"] !== undefined) body.optInFlow = flags["opt-in-flow"];
    if (flags["opt-in-confirmation"] !== undefined) body.optInConfirmation = flags["opt-in-confirmation"];
    if (flags["help-response"] !== undefined) body.helpResponse = flags["help-response"];
    if (flags["stop-confirmation"] !== undefined) body.stopConfirmation = flags["stop-confirmation"];
    if (flags["message-frequency"] !== undefined) body.messageFrequency = flags["message-frequency"];
    if (flags["campaign-keyword"] !== undefined) body.campaignKeyword = flags["campaign-keyword"];
    if (flags["expected-monthly-volume"] !== undefined) body.expectedMonthlyVolume = flags["expected-monthly-volume"];
    if (flags["privacy-policy-url"] !== undefined) body.privacyPolicyUrl = flags["privacy-policy-url"];
    if (flags["terms-url"] !== undefined) body.termsUrl = flags["terms-url"];
    if (flags["order-type"] !== undefined) body.orderType = flags["order-type"];
    if (flags["code-type"] !== undefined) body.codeType = flags["code-type"];
    if (flags["requested-digits"] !== undefined) body.requestedDigits = flags["requested-digits"];
    if (flags["losing-provider"] !== undefined) body.losingProvider = flags["losing-provider"];
    if (flags["brand-contact-name"] !== undefined) body.brandContactName = flags["brand-contact-name"];
    if (flags["brand-contact-email"] !== undefined) body.brandContactEmail = flags["brand-contact-email"];

    if (Object.keys(body).length === 0) {
      info("Nothing to save. Pass a field, for example --use-case.");
      return;
    }

    const saveSpinner = spinner("Saving short code application...");
    if (!isJsonMode()) saveSpinner.start();
    try {
      const view = await apiClient.put<Record<string, unknown>>(
        "/short_codes/application",
        body,
      );
      saveSpinner.stop();
      if (isJsonMode()) {
        json(view);
        return;
      }
      info("Saved.");
      const ignored = (view as { ignoredFields?: string[] }).ignoredFields ?? [];
      if (ignored.length > 0) {
        info(`Ignored (Sendly or the carriers own these): ${ignored.join(", ")}`);
      }
      info(`Check it with ${colors.code("sendly short-codes check")}.`);
    } catch (error) {
      saveSpinner.stop();
      reportShortCodeError(error);
    }
  }
}
