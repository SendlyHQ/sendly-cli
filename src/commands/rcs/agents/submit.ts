import { Args } from "@oclif/core";
import { AuthenticatedCommand } from "../../../lib/base-command.js";
import { apiClient } from "../../../lib/api-client.js";
import {
  json,
  success,
  colors,
  spinner,
  isJsonMode,
  keyValue,
} from "../../../lib/output.js";
import {
  formatStage,
  idempotencyKeyFlag,
  nextStepFor,
  printNextSteps,
  reportRcsError,
  type CustomerStage,
  type PublicRcsAgent,
} from "../../../lib/rcs-registration.js";

interface SubmitAgentResponse {
  agent: PublicRcsAgent;
  stage: CustomerStage;
}

export default class RcsAgentsSubmit extends AuthenticatedCommand {
  static description =
    "Submit the brand and agent for review (Sendly checks them, then sends them on to the carrier network)";

  static examples = [
    "<%= config.bin %> rcs agents submit 3f6a1c9e-0000-0000-0000-000000000000",
    "<%= config.bin %> rcs agents submit 3f6a1c9e-0000-0000-0000-000000000000 --idempotency-key acme-rcs-submit-1 --json",
  ];

  static args = {
    id: Args.string({
      description: "Agent ID",
      required: true,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    "idempotency-key": idempotencyKeyFlag,
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(RcsAgentsSubmit);

    const submitSpinner = spinner("Submitting for review...");
    if (!isJsonMode()) {
      submitSpinner.start();
    }

    let response: SubmitAgentResponse;
    try {
      response = await apiClient.post<SubmitAgentResponse>(
        `/api/v1/rcs/agents/${encodeURIComponent(args.id)}/submit`,
        {},
        true,
        { idempotencyKey: flags["idempotency-key"] },
      );
      submitSpinner.stop();
    } catch (err) {
      submitSpinner.stop();
      if (reportRcsError(err)) this.exit(1);
      throw err;
    }

    if (isJsonMode()) {
      json(response);
      return;
    }

    const agent = response.agent;
    const stage = response.stage ?? agent.customerStage;
    success(`Submitted for review: ${agent.displayName || agent.id}`);
    console.log();
    keyValue([
      ["Agent", agent.id],
      ["Brand", agent.brandId ?? colors.dim("—")],
      ["Stage", formatStage(stage)],
      ["Review", agent.reviewStatus],
    ]);
    printNextSteps(
      nextStepFor(stage, { brandId: agent.brandId, agentId: agent.id }),
    );
  }
}
