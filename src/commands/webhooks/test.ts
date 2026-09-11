import { Args } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import {
  success,
  error,
  spinner,
  json,
  colors,
  keyValue,
  isJsonMode,
} from "../../lib/output.js";

interface TestDelivery {
  id: string;
  delivery_id: string;
  webhook_url: string;
  event_type: string;
  status: string;
  response_time: number;
  status_code?: number;
  response_body?: string;
  error?: string;
  delivered_at?: string;
}

interface TestWebhookResponse {
  success: boolean;
  message: string;
  delivery?: TestDelivery;
}

export default class WebhooksTest extends AuthenticatedCommand {
  static description = "Send a test event to a webhook";

  static examples = [
    "<%= config.bin %> webhooks test whk_abc123",
    "<%= config.bin %> webhooks test whk_abc123 --json",
  ];

  static args = {
    id: Args.string({
      description: "Webhook ID to test",
      required: true,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
  };

  async run(): Promise<void> {
    const { args } = await this.parse(WebhooksTest);

    const testSpinner = spinner("Sending test event...");
    testSpinner.start();

    try {
      const result = await apiClient.post<TestWebhookResponse>(
        `/api/v1/webhooks/${encodeURIComponent(args.id)}/test`,
      );

      testSpinner.stop();

      if (isJsonMode()) {
        json(result);
        return;
      }

      const delivery = result.delivery;

      if (result.success && delivery) {
        success("Test event delivered", {
          "Delivery ID": delivery.delivery_id,
          "Webhook URL": delivery.webhook_url,
          "Event Type": delivery.event_type,
          "Response Time": `${delivery.response_time}ms`,
          "Status Code": String(delivery.status_code),
          "Delivered At": delivery.delivered_at || "Just now",
        });

        if (delivery.response_body) {
          console.log();
          console.log(colors.dim("Response Body:"));
          console.log(
            delivery.response_body.substring(0, 200) +
              (delivery.response_body.length > 200 ? "..." : ""),
          );
        }
      } else {
        error("Test event failed", {
          "Delivery ID": delivery?.delivery_id || "N/A",
          "Webhook URL": delivery?.webhook_url || "N/A",
          Status: delivery?.status || "failed",
          Error: delivery?.error || result.message || "Unknown error",
          ...(delivery?.status_code && {
            "Status Code": String(delivery.status_code),
          }),
        });
      }
    } catch (err) {
      testSpinner.stop();

      // Check if it's a "webhook not found" error (API returns 404 status)
      // vs a "target URL returned 404" error (API returns 400 with message)
      if (err instanceof Error) {
        const msg = err.message;
        // Only show "not found" if the API itself returned 404 (webhook doesn't exist)
        // Not if the webhook target URL returned 404
        if (msg.includes("404") && !msg.includes("HTTP 404")) {
          error(`Webhook not found: ${args.id}`);
        } else {
          error(`Failed to send test event: ${msg}`);
        }
      } else {
        error(`Failed to send test event: ${String(err)}`);
      }
      this.exit(1);
    }
  }
}
