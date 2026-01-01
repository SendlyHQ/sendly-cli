import { Args, Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../lib/base-command.js";
import { apiClient } from "../lib/api-client.js";
import { success, error, info, colors } from "../lib/output.js";

const VALID_EVENT_TYPES = [
  "message.sent",
  "message.delivered",
  "message.failed",
  "message.bounced",
  "message.received",
];

export default class Trigger extends AuthenticatedCommand {
  static description =
    "Trigger a test webhook event. Sends a synthetic event to your active CLI listener.";

  static examples = [
    "<%= config.bin %> trigger message.delivered",
    "<%= config.bin %> trigger message.failed",
    "<%= config.bin %> trigger message.sent",
  ];

  static args = {
    event: Args.string({
      description: "Event type to trigger",
      required: true,
      options: VALID_EVENT_TYPES,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
  };

  async run(): Promise<void> {
    const { args } = await this.parse(Trigger);
    const eventType = args.event;

    if (!VALID_EVENT_TYPES.includes(eventType)) {
      error(`Invalid event type: ${eventType}`, {
        hint: `Valid types: ${VALID_EVENT_TYPES.join(", ")}`,
      });
      this.exit(1);
    }

    try {
      const response = await apiClient.post<{ success: boolean; message: string }>(
        `/api/cli/trigger/${eventType}`,
        {},
      );

      if (response.success) {
        success(response.message);
      } else {
        error("Failed to trigger event");
        this.exit(1);
      }
    } catch (err: any) {
      if (err.message?.includes("No active CLI listeners")) {
        error("No active CLI listeners", {
          hint: "Run 'sendly webhooks listen' in another terminal first",
        });
      } else {
        throw err;
      }
      this.exit(1);
    }
  }
}
