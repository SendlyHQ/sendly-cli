import { Args } from "@oclif/core";
import { AuthenticatedCommand } from "../../../lib/base-command.js";
import { apiClient } from "../../../lib/api-client.js";
import { json, spinner, isJsonMode } from "../../../lib/output.js";
import {
  nextStepFor,
  printAgent,
  printDevices,
  printNextSteps,
  reportRcsError,
  type CustomerStage,
  type PublicRcsAgent,
  type PublicRcsTestDevice,
} from "../../../lib/rcs-registration.js";

interface GetAgentResponse {
  agent: PublicRcsAgent;
  devices: PublicRcsTestDevice[];
  stage: CustomerStage;
}

export default class RcsAgentsGet extends AuthenticatedCommand {
  static description =
    "Get an RCS agent with its test devices and the latest review stage (run again to refresh)";

  static examples = [
    "<%= config.bin %> rcs agents get 3f6a1c9e-0000-0000-0000-000000000000",
    "<%= config.bin %> rcs agents get 3f6a1c9e-0000-0000-0000-000000000000 --json",
  ];

  static args = {
    id: Args.string({
      description: "Agent ID",
      required: true,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
  };

  async run(): Promise<void> {
    const { args } = await this.parse(RcsAgentsGet);

    const loadSpinner = spinner("Fetching RCS agent...");
    if (!isJsonMode()) {
      loadSpinner.start();
    }

    let response: GetAgentResponse;
    try {
      response = await apiClient.get<GetAgentResponse>(
        `/api/v1/rcs/agents/${encodeURIComponent(args.id)}`,
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

    console.log();
    printAgent(response.agent);
    printDevices(response.devices ?? response.agent.testDevices ?? []);
    printNextSteps(
      nextStepFor(response.stage ?? response.agent.customerStage, {
        brandId: response.agent.brandId,
        agentId: response.agent.id,
      }),
    );
  }
}
