import { Args, Flags } from "@oclif/core";
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

interface RequestLaunchResponse {
  agent: PublicRcsAgent;
  stage: CustomerStage;
}

export default class RcsAgentsRequestLaunch extends AuthenticatedCommand {
  static description =
    "Request launch once testing is done — Sendly reviews the campaign details, then sends the launch to the carrier network";

  static examples = [
    "<%= config.bin %> rcs agents request-launch 3f6a1c9e-0000-0000-0000-000000000000 --test-url https://acme.com/rcs-test-recording.mp4",
    '<%= config.bin %> rcs agents request-launch 3f6a1c9e-0000-0000-0000-000000000000 --test-url https://acme.com/rcs-test.png --testing-info "Tested on two Pixel devices" --json',
  ];

  static args = {
    id: Args.string({
      description: "Agent ID",
      required: true,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    "test-url": Flags.string({
      description:
        "Public https:// URL of a screen recording or screenshots of the agent on a test device (stored on the agent before the request)",
    }),
    "testing-info": Flags.string({
      description: "Anything else reviewers should know about testing",
    }),
    "idempotency-key": idempotencyKeyFlag,
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(RcsAgentsRequestLaunch);

    const body: Record<string, unknown> = {};
    if (flags["test-url"] !== undefined) body.testUrl = flags["test-url"];
    if (flags["testing-info"] !== undefined) {
      body.testingAdditionalInformation = flags["testing-info"];
    }

    const launchSpinner = spinner("Requesting launch...");
    if (!isJsonMode()) {
      launchSpinner.start();
    }

    let response: RequestLaunchResponse;
    try {
      response = await apiClient.post<RequestLaunchResponse>(
        `/api/v1/rcs/agents/${encodeURIComponent(args.id)}/request-launch`,
        body,
        true,
        { idempotencyKey: flags["idempotency-key"] },
      );
      launchSpinner.stop();
    } catch (err) {
      launchSpinner.stop();
      if (reportRcsError(err)) this.exit(1);
      throw err;
    }

    if (isJsonMode()) {
      json(response);
      return;
    }

    const agent = response.agent;
    const stage = response.stage ?? agent.customerStage;
    success(`Launch requested: ${agent.displayName || agent.id}`);
    console.log();
    keyValue([
      ["Agent", agent.id],
      ["Brand", agent.brandId ?? colors.dim("—")],
      ["Stage", formatStage(stage)],
      ["Review", agent.reviewStatus],
      ...(agent.testing?.testUrl
        ? [["Test URL", String(agent.testing.testUrl)] as [string, string]]
        : []),
    ]);
    printNextSteps(
      nextStepFor(stage, { brandId: agent.brandId, agentId: agent.id }),
    );
  }
}
