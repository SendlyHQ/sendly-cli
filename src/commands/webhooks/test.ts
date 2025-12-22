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

interface TestWebhookResponse {
  id: string;
  deliveryId: string;
  webhookUrl: string;
  eventType: string;
  status: string;
  responseTime: number;
  statusCode?: number;
  responseBody?: string;
  error?: string;
  deliveredAt: string;
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
      const result = await apiClient.post<TestWebhookResponse>(`/api/v1/webhooks/${args.id}/test`);
      
      testSpinner.stop();

      if (isJsonMode()) {
        json(result);
        return;
      }

      if (result.status === "delivered") {
        success("Test event delivered", {
          "Delivery ID": result.deliveryId,
          "Webhook URL": result.webhookUrl,
          "Event Type": result.eventType,
          "Response Time": `${result.responseTime}ms`,
          "Status Code": String(result.statusCode),
          "Delivered At": result.deliveredAt,
        });

        if (result.responseBody) {
          console.log();
          console.log(colors.dim("Response Body:"));
          console.log(result.responseBody.substring(0, 200) + (result.responseBody.length > 200 ? "..." : ""));
        }
      } else {
        error("Test event failed", {
          "Delivery ID": result.deliveryId,
          "Webhook URL": result.webhookUrl,
          "Status": result.status,
          "Error": result.error || "Unknown error",
          ...(result.statusCode && { "Status Code": String(result.statusCode) }),
        });
      }
    } catch (err) {
      testSpinner.stop();
      
      if (err instanceof Error && err.message.includes("404")) {
        error(`Webhook not found: ${args.id}`);
      } else {
        if (err instanceof Error) {
          error(`Failed to send test event: ${err.message}`);
        } else {
          error(`Failed to send test event: ${String(err)}`);
        }
      }
      this.exit(1);
    }
  }
}