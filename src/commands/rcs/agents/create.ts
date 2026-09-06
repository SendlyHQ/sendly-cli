import { Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../../lib/base-command.js";
import { apiClient } from "../../../lib/api-client.js";
import {
  json,
  success,
  error,
  colors,
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

interface CreateAgentResponse {
  agent: PublicRcsAgent;
}

export default class RcsAgentsCreate extends AuthenticatedCommand {
  static description =
    "Draft the RCS agent for a brand (step 2; logo, hero, and call-to-action media must already be public https:// URLs)";

  static examples = [
    '<%= config.bin %> rcs agents create --brand 3f6a1c9e-0000-0000-0000-000000000000 --display-name "Acme" --use-case TRANSACTIONAL --description "Order updates from Acme" --logo-url https://acme.com/logo.png --hero-url https://acme.com/hero.png --brand-color "#1E90FF" --privacy-policy-url https://acme.com/privacy --terms-url https://acme.com/terms --website https://acme.com --website-label "Acme"',
    "<%= config.bin %> rcs agents create --brand 3f6a1c9e-0000-0000-0000-000000000000 --from-json agent.json",
    "<%= config.bin %> rcs agents create --from-json agent.json --json",
  ];

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    brand: Flags.string({
      char: "b",
      description: "Brand ID the agent belongs to (see `rcs registration`)",
    }),
    ...AGENT_BASICS_FLAGS,
    ...AGENT_CAMPAIGN_FLAGS,
    ...AGENT_TESTING_FLAGS,
    "from-json": Flags.string({
      description:
        "Path to a JSON file with the agent ({ brandId, basics, campaign, testing }, or the output of `rcs agents get --json`); flags override fields in the file",
    }),
    "idempotency-key": idempotencyKeyFlag,
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(RcsAgentsCreate);

    const built = buildAgentBody(flags, { clearEmpty: false });
    if (typeof built === "string") {
      error(built);
      this.exit(1);
    }
    const body = built as Record<string, unknown>;
    if (flags.brand) body.brandId = flags.brand;
    if (typeof body.brandId !== "string" || !body.brandId) {
      error("Choose a brand for this agent", {
        hint: "Pass --brand <brandId>; find it with `sendly rcs registration`",
      });
      this.exit(1);
    }

    const saveSpinner = spinner("Saving agent draft...");
    if (!isJsonMode()) {
      saveSpinner.start();
    }

    let response: CreateAgentResponse;
    try {
      response = await apiClient.post<CreateAgentResponse>(
        "/api/v1/rcs/agents",
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
    success(`Agent draft saved: ${agent.id}`);
    console.log();
    printAgent(agent);
    console.log();
    console.log(
      colors.dim(
        "Missing fields are checked when you submit; fill them in any time with `sendly rcs agents update`.",
      ),
    );
    printNextSteps(
      nextStepFor("draft", { brandId: agent.brandId, agentId: agent.id }),
    );
  }
}
