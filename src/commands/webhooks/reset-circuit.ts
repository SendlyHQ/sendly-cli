import { Args } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import { success, error, spinner, json, isJsonMode } from "../../lib/output.js";

interface ResetCircuitResponse {
  message: string;
  webhook?: { id: string; circuit_state?: string; failure_count?: number };
}

export default class WebhooksResetCircuit extends AuthenticatedCommand {
  static description = "Reset the circuit breaker for a webhook";

  static examples = [
    "<%= config.bin %> webhooks reset-circuit whk_abc123",
    "<%= config.bin %> webhooks reset-circuit whk_abc123 --json",
  ];

  static args = {
    id: Args.string({
      description: "Webhook ID",
      required: true,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
  };

  async run(): Promise<void> {
    const { args } = await this.parse(WebhooksResetCircuit);

    const sp = spinner("Resetting circuit breaker...");
    sp.start();

    try {
      const result = await apiClient.post<ResetCircuitResponse>(
        `/api/v1/webhooks/${args.id}/reset-circuit`,
      );

      sp.stop();

      if (isJsonMode()) {
        json(result);
        return;
      }

      success(result.message || "Circuit breaker reset", {
        "Webhook ID": result.webhook?.id || args.id,
        "Circuit State": result.webhook?.circuit_state || "closed",
        "Failure Count": String(result.webhook?.failure_count ?? 0),
      });
    } catch (err) {
      sp.stop();
      error(
        `Failed to reset circuit: ${err instanceof Error ? err.message : String(err)}`,
      );
      this.exit(1);
    }
  }
}
