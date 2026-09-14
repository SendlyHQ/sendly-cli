import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import { json, info, warn, colors, spinner, isJsonMode } from "../../lib/output.js";
import { reportShortCodeError } from "./application.js";

interface Preflight {
  ok: boolean;
  issues: Array<{ path: string; message: string }>;
  missingDocuments: string[];
}

export default class ShortCodesCheck extends AuthenticatedCommand {
  static description =
    "Check the short code application against the carrier rules, without changing anything";

  static examples = [
    "<%= config.bin %> short-codes check",
    "<%= config.bin %> short-codes check --json",
  ];

  static flags = {
    ...AuthenticatedCommand.baseFlags,
  };

  async run(): Promise<void> {
    await this.parse(ShortCodesCheck);

    const checkSpinner = spinner("Checking short code application...");
    if (!isJsonMode()) checkSpinner.start();

    let result: Preflight;
    try {
      result = await apiClient.post<Preflight>(
        "/api/v1/short_codes/application/preflight",
        {},
      );
      checkSpinner.stop();
    } catch (error) {
      checkSpinner.stop();
      reportShortCodeError(error);
    }

    if (isJsonMode()) {
      json(result);
      return;
    }

    if (result.ok) {
      info("Ready to submit.");
      info(`Submit it with ${colors.code("sendly short-codes submit")}.`);
      return;
    }

    warn(`${result.issues.length} thing(s) to fix:`);
    for (const issue of result.issues) {
      info(`  ${colors.code(issue.path)}: ${issue.message}`);
    }
  }
}
