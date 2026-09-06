import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import {
  json,
  info,
  warn,
  colors,
  spinner,
  isJsonMode,
} from "../../lib/output.js";
import {
  formatStage,
  nextStepFor,
  printAgent,
  printBrand,
  printDevices,
  printNextSteps,
  reportRcsError,
  type RegistrationResponse,
} from "../../lib/rcs-registration.js";

export default class RcsRegistration extends AuthenticatedCommand {
  static description =
    "Show where your RCS registration stands — brand, agent, test devices, and what to do next";

  static examples = [
    "<%= config.bin %> rcs registration",
    "<%= config.bin %> rcs registration --json",
  ];

  static flags = {
    ...AuthenticatedCommand.baseFlags,
  };

  async run(): Promise<void> {
    await this.parse(RcsRegistration);

    const loadSpinner = spinner("Fetching RCS registration...");
    if (!isJsonMode()) {
      loadSpinner.start();
    }

    let response: RegistrationResponse;
    try {
      response = await apiClient.get<RegistrationResponse>(
        "/api/v1/rcs/registration",
      );
      loadSpinner.stop();
    } catch (err) {
      loadSpinner.stop();
      if (reportRcsError(err)) this.exit(1);
      throw err;
    }

    if (isJsonMode()) {
      json(response);
      return;
    }

    const { brand, agent, devices, stage, usEligible } = response;

    console.log();
    console.log(`${colors.bold("RCS registration")}  ${formatStage(stage)}`);
    console.log();

    if (!usEligible) {
      warn(
        "The business details on file name a non-US country. RCS registration is available to US businesses for now.",
      );
      console.log();
    }

    if (!brand && !agent) {
      info("No RCS registration yet.");
      printNextSteps(nextStepFor("draft", {}));
      return;
    }

    if (brand) {
      printBrand(brand);
      console.log();
    }

    if (agent) {
      printAgent(agent);
      printDevices(devices ?? []);
    }

    printNextSteps(
      nextStepFor(stage, { brandId: brand?.id, agentId: agent?.id }),
    );
  }
}
