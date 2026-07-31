import { Flags } from "@oclif/core";
import open from "open";
import inquirer from "inquirer";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient, NotFoundError } from "../../lib/api-client.js";
import {
  json,
  success,
  info,
  warn,
  error,
  colors,
  spinner,
  isJsonMode,
} from "../../lib/output.js";
import { attachLoginKeypressHandler } from "../../lib/keypress.js";

interface AvailableNumber {
  phoneNumber: string;
  country: string;
  numberType: string;
  monthlyCost: string;
  currency: string;
}

interface SearchNumbersResponse {
  numbers: AvailableNumber[];
}

interface BuyAction {
  url: string;
  // actionCode (32-hex) identifies the action — used to POLL and to RE-BUY.
  actionCode: string;
  // code (8-char userCode) is shown to the human to type on the hosted page
  // to prove terminal access. DISPLAY only — never used as actionCode.
  code: string;
  expiresAt: number;
}

interface OwnedNumber {
  id: string;
  phoneNumber: string;
  status: string;
  source: string;
  countryCode: string;
  phoneNumberType: string;
  monthlyCostCents: number;
}

interface BuyResponse {
  status:
    | "provisioning"
    | "documents_required"
    | "under_review"
    | "payment_required";
  number?: OwnedNumber;
  requirements?: unknown;
  action?: BuyAction;
  // US local numbers land owned-but-unregistered: they reach status "active"
  // at the carrier but the send-gate blocks them until they're assigned to a
  // registered 10DLC campaign. The server flags that here so we don't tell the
  // user a dead number is ready.
  registrationRequired?: boolean;
}

interface ListNumbersResponse {
  numbers: OwnedNumber[];
}

interface ActionStatusResponse {
  status: "pending" | "authorized" | "completed" | "expired";
  actionType: string;
  result?: unknown;
  expiresAt: string;
}

const ACTION_POLL_INTERVAL = 2000; // 2 seconds
const ACTION_MAX_ATTEMPTS = 600; // ~20 minutes
const PROVISION_POLL_INTERVAL = 3000; // 3 seconds
const PROVISION_MAX_ATTEMPTS = 60; // ~3 minutes

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default class NumbersBuy extends AuthenticatedCommand {
  static description =
    "Buy a phone number. Handles document/payment steps interactively when a country requires them.";

  static examples = [
    "<%= config.bin %> numbers buy --country GB --type mobile",
    "<%= config.bin %> numbers buy --country US --type local --number +15551234567",
    "<%= config.bin %> numbers buy --country GB --type mobile --json",
  ];

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    country: Flags.string({
      char: "c",
      description: "ISO country code (e.g. GB, US)",
      required: true,
    }),
    type: Flags.string({
      char: "t",
      description: "Number type (e.g. mobile, local, toll-free)",
      required: true,
    }),
    number: Flags.string({
      char: "n",
      description: "Specific number to buy in E.164 format (skips selection)",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(NumbersBuy);

    const selected = await this.resolveNumber(flags);
    if (!selected) return;

    // The buy body is reused verbatim across every re-POST; only actionCode
    // is added once a hosted action (docs/payment) has completed.
    const buyBody: Record<string, unknown> = {
      phoneNumber: selected.phoneNumber,
      countryCode: flags.country,
      phoneNumberType: flags.type,
      monthlyCost: selected.monthlyCost,
    };

    let response = await apiClient.post<BuyResponse>(
      "/api/v1/numbers/buy",
      buyBody,
    );

    // Drive the action loop until the carrier accepts the order (provisioning).
    while (
      response.status === "documents_required" ||
      response.status === "payment_required"
    ) {
      const action = response.action;
      if (!action) {
        // Backend says docs/payment required but gave us nowhere to send the
        // user — nothing the CLI can do.
        if (isJsonMode()) {
          json(response);
          return;
        }
        error(
          `This number needs ${response.status === "payment_required" ? "payment" : "documents"} but no action link was returned.`,
          {
            hint: "Try again, or complete this number from the Sendly dashboard.",
          },
        );
        this.exit(1);
      }

      if (isJsonMode()) {
        // Non-interactive: surface the action so the caller can drive it.
        json(response);
        return;
      }

      const completed = await this.runHostedAction(response.status, action);
      if (!completed) return; // expired / cancelled — already messaged

      // Re-buy with the action identifier (actionCode), NOT the display userCode.
      buyBody.actionCode = action.actionCode;
      response = await apiClient.post<BuyResponse>(
        "/api/v1/numbers/buy",
        buyBody,
      );
    }

    // Document-required country: details submitted, number reserved + under
    // review. No carrier order is placed until our team verifies + registers
    // it, so there's nothing to poll for here.
    if (response.status === "under_review") {
      if (isJsonMode()) {
        json(response);
        return;
      }
      success("Number reserved — your details are under review", {
        number: response.number?.phoneNumber,
        note: "We verify your documents and register the number, usually within a few business days. It can't send until it's active — check `sendly numbers list`.",
      });
      return;
    }

    // status === "provisioning"
    const registrationRequired = response.registrationRequired === true;

    if (isJsonMode()) {
      // Wait for activation then emit the final number record, preserving the
      // registration signal so an automated caller knows the number can't send
      // until it's assigned to a 10DLC campaign.
      const active = await this.waitForActive(selected.phoneNumber);
      json(active ? { ...active, registrationRequired } : response);
      return;
    }

    info(`Order accepted for ${colors.code(selected.phoneNumber)} — provisioning...`);
    const active = await this.waitForActive(selected.phoneNumber);

    if (active && registrationRequired) {
      success("Number is active — but not yet able to send", {
        number: active.phoneNumber,
        id: active.id,
        country: active.countryCode,
        type: active.phoneNumberType,
        note: "A US local number must be assigned to a registered 10DLC campaign before it can send. Set one up with `sendly 10dlc`, then assign this number.",
      });
    } else if (active) {
      success("Number is active", {
        number: active.phoneNumber,
        id: active.id,
        country: active.countryCode,
        type: active.phoneNumberType,
      });
    } else if (registrationRequired) {
      warn(
        "Number ordered. Once active it still can't send until it's assigned to a registered 10DLC campaign — set one up with `sendly 10dlc`, then check `sendly numbers list`.",
      );
    } else {
      warn(
        "Number is still provisioning. It usually activates within a few minutes — check `sendly numbers list`.",
      );
    }
  }

  /**
   * Resolve which number to buy. If --number is given we trust it (and
   * still need its monthlyCost, so we look it up among available numbers).
   * Otherwise we search and prompt the user to pick one.
   */
  private async resolveNumber(flags: {
    country: string;
    type: string;
    number?: string;
  }): Promise<AvailableNumber | undefined> {
    const spin = spinner("Finding available numbers...");
    spin.start();

    let available: AvailableNumber[];
    try {
      const search = await apiClient.get<SearchNumbersResponse>(
        "/api/v1/numbers/available",
        {
          country: flags.country,
          type: flags.type,
          ...(flags.number && { contains: flags.number.replace(/^\+/, "") }),
        },
      );
      available = search.numbers ?? [];
      spin.stop();
    } catch (err) {
      spin.fail("Could not load available numbers");
      throw err;
    }

    if (flags.number) {
      const match = available.find((n) => n.phoneNumber === flags.number);
      if (!match) {
        error(`${flags.number} is not available for purchase.`, {
          hint: `Run: sendly numbers search --country ${flags.country} --type ${flags.type}`,
        });
        this.exit(1);
      }
      return match;
    }

    if (available.length === 0) {
      info(`No available numbers found for ${flags.country} (${flags.type}).`);
      return undefined;
    }

    // Non-interactive (no TTY / json): take the first result.
    if (isJsonMode() || !process.stdout.isTTY) {
      return available[0];
    }

    const { choice } = await inquirer.prompt([
      {
        type: "list",
        name: "choice",
        message: `Choose a number to buy (${flags.country}, ${flags.type}):`,
        choices: available.slice(0, 25).map((n) => ({
          name: `${n.phoneNumber}  —  ${n.monthlyCost} ${n.currency}/mo`,
          value: n.phoneNumber,
        })),
      },
    ]);

    return available.find((n) => n.phoneNumber === choice);
  }

  /**
   * Drive a hosted document-upload / payment action: print the link + code,
   * auto-open it, wire press-[c]-to-copy / [q] to cancel, then poll until
   * the action completes (resolves true) or expires (resolves false).
   */
  private async runHostedAction(
    kind: "documents_required" | "payment_required",
    action: BuyAction,
  ): Promise<boolean> {
    const label =
      kind === "payment_required" ? "Payment required" : "Documents required";

    console.log();
    console.log(colors.bold(label));
    console.log();
    console.log(
      kind === "payment_required"
        ? "This number needs a payment to complete. Open this secure page:"
        : "This number needs documents before it can be activated. Open this secure page:",
    );
    console.log(colors.primary(`  ${action.url}`));
    console.log();
    console.log("Confirmation code (shown so you can verify this is your session):");
    console.log(colors.bold(colors.primary(`  ${action.code}`)));
    console.log();

    try {
      await open(action.url);
      console.log(colors.dim("Browser opened automatically"));
    } catch {
      console.log(colors.dim("Please open the URL manually"));
    }

    const keypressCleanup = attachLoginKeypressHandler(action.url);
    console.log();

    const spin = spinner("Waiting for you to finish on the secure page...");
    spin.start();

    let attempts = 0;
    while (attempts < ACTION_MAX_ATTEMPTS) {
      await sleep(ACTION_POLL_INTERVAL);
      attempts++;

      let status: ActionStatusResponse;
      try {
        status = await apiClient.get<ActionStatusResponse>(
          `/api/cli/action/${encodeURIComponent(action.actionCode)}`,
        );
      } catch (err) {
        if (err instanceof NotFoundError) {
          // The action is gone (expired/cleaned up) — terminal, not transient.
          spin.fail("This step expired");
          keypressCleanup();
          warn(
            "The secure page expired before it was completed. Re-run `sendly numbers buy` to start over.",
          );
          return false;
        }
        // Transient error — keep polling.
        continue;
      }

      if (status.status === "completed") {
        spin.succeed("Completed");
        keypressCleanup();
        return true;
      }

      if (status.status === "expired") {
        spin.fail("This step expired");
        keypressCleanup();
        warn(
          "The secure page expired before it was completed. Re-run `sendly numbers buy` to start over.",
        );
        return false;
      }
      // pending / authorized — keep polling
    }

    spin.fail("Timed out waiting for completion");
    keypressCleanup();
    warn(
      "We stopped waiting. If you finished on the page, re-run `sendly numbers buy` and we'll pick up where you left off.",
    );
    return false;
  }

  /**
   * Poll the owned-numbers list until the just-ordered number reports
   * `active`. Returns the active record, or undefined if it hasn't
   * activated within the polling window.
   */
  private async waitForActive(
    phoneNumber: string,
  ): Promise<OwnedNumber | undefined> {
    const spin = spinner("Activating number...");
    spin.start();

    let attempts = 0;
    while (attempts < PROVISION_MAX_ATTEMPTS) {
      let list: ListNumbersResponse;
      try {
        list = await apiClient.get<ListNumbersResponse>("/api/v1/numbers");
      } catch {
        await sleep(PROVISION_POLL_INTERVAL);
        attempts++;
        continue;
      }

      const found = (list.numbers ?? []).find(
        (n) => n.phoneNumber === phoneNumber,
      );
      if (found && found.status === "active") {
        spin.succeed("Active");
        return found;
      }

      await sleep(PROVISION_POLL_INTERVAL);
      attempts++;
    }

    spin.stop();
    return undefined;
  }
}
