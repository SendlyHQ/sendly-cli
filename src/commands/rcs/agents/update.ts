import { Args, Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../../lib/base-command.js";
import { apiClient } from "../../../lib/api-client.js";
import {
  json,
  success,
  error,
  spinner,
  isJsonMode,
} from "../../../lib/output.js";
import {
  AGENT_BASICS_FLAGS,
  AGENT_CAMPAIGN_FLAGS,
  AGENT_TESTING_FLAGS,
  buildAgentBody,
  idempotencyKeyFlag,
  nextStepFor,
  printAgent,
  printNextSteps,
  reportRcsError,
  type PublicRcsAgent,
} from "../../../lib/rcs-registration.js";

interface UpdateAgentResponse {
  agent: PublicRcsAgent;
}

export default class RcsAgentsUpdate extends AuthenticatedCommand {
  static description =
    "Update a drafted RCS agent — basics, campaign details for launch, or testing notes (only the flags you pass change; pass an empty value to clear an optional field)";

  static examples = [
    '<%= config.bin %> rcs agents update 3f6a1c9e-0000-0000-0000-000000000000 --description "Order updates from Acme" --brand-color "#1E90FF"',
    '<%= config.bin %> rcs agents update 3f6a1c9e-0000-0000-0000-000000000000 --company-overview "Acme sells widgets online" --agent-overview "Order and delivery updates" --interaction TRANSACTIONAL_UPDATES --message-example "Your Acme order #4821 has shipped. Reply STOP to opt out." --message-example "Your order is out for delivery today." --message-example "Delivered! Reply HELP for help." --opt-in-method "WEBSITE=Checkbox at checkout" --call-to-action "Get order updates by text" --call-to-action-url https://acme.com/checkout --call-to-action-media-url https://acme.com/optin.png --no-double-opt-in --opt-in-message "Welcome to Acme updates. Reply STOP to opt out." --help-response "Acme support: help@acme.com" --opt-out-response "You are unsubscribed from Acme updates."',
    "<%= config.bin %> rcs agents update 3f6a1c9e-0000-0000-0000-000000000000 --from-json agent.json --json",
  ];

  static args = {
    id: Args.string({
      description: "Agent ID",
      required: true,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    ...AGENT_BASICS_FLAGS,
    ...AGENT_CAMPAIGN_FLAGS,
    ...AGENT_TESTING_FLAGS,
    "clear-campaign": Flags.boolean({
      description: "Remove the campaign section entirely",
      default: false,
    }),
    "clear-testing": Flags.boolean({
      description: "Remove the testing section entirely",
      default: false,
    }),
    "from-json": Flags.string({
      description:
        "Path to a JSON file with the fields to change ({ basics, campaign, testing }, or the output of `rcs agents get --json`); flags override fields in the file",
    }),
    "idempotency-key": idempotencyKeyFlag,
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(RcsAgentsUpdate);

    const built = buildAgentBody(flags, { clearEmpty: true });
    if (typeof built === "string") {
      error(built);
      this.exit(1);
    }
    const body = built as Record<string, unknown>;
    delete body.brandId;
    if (Object.keys(body).length === 0) {
      error("Nothing to update", {
        hint: "Pass at least one field flag or --from-json <file>; see --help for the list",
      });
      this.exit(1);
    }

    const saveSpinner = spinner("Updating agent...");
    if (!isJsonMode()) {
      saveSpinner.start();
    }

    let response: UpdateAgentResponse;
    try {
      response = await apiClient.patch<UpdateAgentResponse>(
        `/api/v1/rcs/agents/${encodeURIComponent(args.id)}`,
        body,
        true,
        { idempotencyKey: flags["idempotency-key"] },
      );
      saveSpinner.stop();
    } catch (err) {
      saveSpinner.stop();
      if (reportRcsError(err)) this.exit(1);
      throw err;
    }

    if (isJsonMode()) {
      json(response);
      return;
    }

    const agent = response.agent;
    success(`Agent updated: ${agent.id}`);
    console.log();
    printAgent(agent);
    printNextSteps(
      nextStepFor(agent.customerStage, {
        brandId: agent.brandId,
        agentId: agent.id,
      }),
    );
  }
}
