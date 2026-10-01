import { AuthenticatedCommand } from "../../../lib/base-command.js";
import { apiClient } from "../../../lib/api-client.js";
import {
  json,
  keyValue,
  info,
  colors,
  header,
  isJsonMode,
} from "../../../lib/output.js";

interface WebhookConfig {
  url: string | null;
  events: string[] | null;
  workspaces: string[] | null;
}

export default class EnterpriseWebhooksGet extends AuthenticatedCommand {
  static description = "Get the enterprise webhook configuration";

  static examples = [
    "<%= config.bin %> enterprise webhooks get",
    "<%= config.bin %> enterprise webhooks get --json",
  ];

  static flags = {
    ...AuthenticatedCommand.baseFlags,
  };

  async run(): Promise<void> {
    const response = await apiClient.get<WebhookConfig | null>(
      "/api/v1/enterprise/webhooks",
    );

    if (isJsonMode()) {
      json(response);
      return;
    }

    if (!response || !response.url) {
      info("No enterprise webhook configured");
      console.log();
      console.log(
        `  Set one with ${colors.code("sendly enterprise webhooks set --url <url>")}`,
      );
      return;
    }

    header("Enterprise Webhook");

    keyValue({
      URL: response.url,
      Events: response.events?.length
        ? response.events.join(", ")
        : colors.dim("all events"),
    });
  }
}
