import { Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import {
  success,
  error,
  info,
  warn,
  colors,
  spinner,
} from "../../lib/output.js";
import { getConfigValue } from "../../lib/config.js";
import WebSocket from "ws";
import * as crypto from "node:crypto";

interface WebhookEvent {
  id: string;
  type: string;
  api_version: string;
  created: number;
  livemode: boolean;
  data: {
    object: Record<string, unknown>;
  };
}

interface WebSocketMessage {
  type: string;
  timestamp?: number;
  signature?: string;
  event?: WebhookEvent;
  sessionId?: string;
  events?: string[];
}

interface ListenStartResponse {
  sessionId: string;
  wsToken: string;
  secret: string;
  wsUrl: string;
  events: string[];
  forwardUrl: string;
}

export default class WebhooksListen extends AuthenticatedCommand {
  static description =
    "Listen for webhooks locally. Receives events in real-time via WebSocket and forwards them to your local server.";

  static examples = [
    "<%= config.bin %> webhooks listen",
    "<%= config.bin %> webhooks listen --forward http://localhost:3000/webhook",
    "<%= config.bin %> webhooks listen --events message.delivered,message.failed",
  ];

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    forward: Flags.string({
      char: "f",
      description: "Local URL to forward events to",
      default: "http://localhost:3000/webhook",
    }),
    events: Flags.string({
      char: "e",
      description: "Comma-separated list of events to listen for",
      default: "message.sent,message.delivered,message.failed,message.bounced",
    }),
  };

  private ws: WebSocket | null = null;
  private sessionId: string | null = null;
  private secret: string | null = null;

  async run(): Promise<void> {
    const { flags } = await this.parse(WebhooksListen);
    const events = flags.events.split(",").map((e) => e.trim());

    const spin = spinner("Starting webhook listener...");
    spin.start();

    try {
      const response = await apiClient.post<ListenStartResponse>(
        "/api/cli/listen/start",
        {
          events,
          forwardUrl: flags.forward,
        },
      );

      this.sessionId = response.sessionId;
      this.secret = response.secret;

      spin.succeed("Listener registered");

      console.log();
      console.log(colors.bold(colors.primary("Webhook listener ready!")));
      console.log();
      console.log(
        `  ${colors.dim("Forwarding to:")} ${colors.code(flags.forward)}`,
      );
      console.log(`  ${colors.dim("Events:")}        ${events.join(", ")}`);
      console.log();
      console.log(`  ${colors.dim("Webhook Secret:")}`);
      console.log(`  ${colors.primary(response.secret)}`);
      console.log();
      console.log(
        colors.dim("Use this secret to verify webhook signatures in your app."),
      );
      console.log();

      const spin2 = spinner("Connecting to Sendly...");
      spin2.start();

      await this.connectWebSocket(response.wsUrl, flags.forward);

      spin2.succeed("Connected");
      console.log();
      console.log(colors.bold("Waiting for events... (Ctrl+C to quit)"));
      console.log(colors.dim("─".repeat(60)));
      console.log();

      const cleanup = async () => {
        console.log();
        info("Shutting down...");
        await this.cleanup();
        process.exit(0);
      };

      process.on("SIGINT", cleanup);
      process.on("SIGTERM", cleanup);

      await new Promise(() => {});
    } catch (err) {
      spin.fail("Failed to start listener");
      throw err;
    }
  }

  private connectWebSocket(wsUrl: string, forwardUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(wsUrl);

      const timeout = setTimeout(() => {
        reject(new Error("WebSocket connection timeout"));
      }, 30000);

      this.ws.on("open", () => {
        clearTimeout(timeout);
      });

      this.ws.on("message", async (data) => {
        try {
          const message: WebSocketMessage = JSON.parse(data.toString());

          if (message.type === "cli_connected") {
            resolve();
            return;
          }

          if (message.type === "webhook_event" && message.event) {
            await this.handleEvent(message, forwardUrl);
          }
        } catch (err) {
          console.error("Failed to parse WebSocket message:", err);
        }
      });

      this.ws.on("close", (code, reason) => {
        if (code !== 1000) {
          warn(`WebSocket disconnected: ${reason || code}`);
        }
      });

      this.ws.on("error", (err) => {
        clearTimeout(timeout);
        error(`WebSocket error: ${err.message}`);
        reject(err);
      });
    });
  }

  private async handleEvent(
    message: WebSocketMessage,
    forwardUrl: string,
  ): Promise<void> {
    const event = message.event!;
    const timestamp = message.timestamp!;
    const signature = message.signature!;

    this.displayEvent(event);

    if (this.verifySignature(event, timestamp, signature)) {
      await this.forwardEvent(forwardUrl, event, timestamp, signature);
    } else {
      console.log(`  ${colors.error("✗")} Signature verification failed`);
      console.log();
    }
  }

  private verifySignature(
    event: WebhookEvent,
    timestamp: number,
    signature: string,
  ): boolean {
    if (!this.secret) return false;

    const payload = JSON.stringify(event);
    const signedPayload = `${timestamp}.${payload}`;
    const expectedSignature = `sha256=${crypto
      .createHmac("sha256", this.secret)
      .update(signedPayload, "utf8")
      .digest("hex")}`;

    return signature === expectedSignature;
  }

  private displayEvent(event: WebhookEvent): void {
    const timestamp = new Date(event.created * 1000).toLocaleTimeString();
    const eventType = event.type;

    let statusColor = colors.info;
    if (eventType.includes("delivered")) statusColor = colors.success;
    if (eventType.includes("failed")) statusColor = colors.error;

    console.log(
      `${colors.dim(timestamp)} ${statusColor("→")} ${colors.bold(eventType)}`,
    );

    const data = event.data?.object;
    if (data) {
      const messageId = data.id as string;
      const to = data.to as string;
      if (messageId) {
        console.log(`  ${colors.dim("id:")} ${messageId}`);
      }
      if (to) {
        console.log(`  ${colors.dim("to:")} ${to}`);
      }
    }
  }

  private async forwardEvent(
    forwardUrl: string,
    event: WebhookEvent,
    timestamp: number,
    signature: string,
  ): Promise<void> {
    try {
      const payload = JSON.stringify(event);

      const response = await fetch(forwardUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Sendly-Signature": signature,
          "X-Sendly-Timestamp": timestamp.toString(),
          "X-Sendly-Event": event.type,
          "X-Sendly-Event-Id": event.id,
        },
        body: payload,
      });

      if (response.ok) {
        console.log(
          `  ${colors.success("✓")} Forwarded to ${forwardUrl} (${response.status})`,
        );
      } else {
        console.log(
          `  ${colors.error("✗")} Forward failed (${response.status})`,
        );
      }
    } catch (err) {
      console.log(
        `  ${colors.error("✗")} Forward error: ${(err as Error).message}`,
      );
    }
    console.log();
  }

  private async cleanup(): Promise<void> {
    if (this.ws) {
      this.ws.close(1000, "Client shutdown");
      this.ws = null;
    }

    if (this.sessionId) {
      try {
        await apiClient.delete(`/api/cli/listen/stop/${this.sessionId}`);
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}
