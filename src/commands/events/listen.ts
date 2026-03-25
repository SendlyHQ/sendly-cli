import { Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { getAuthToken, getEffectiveValue } from "../../lib/config.js";
import { colors, json, isJsonMode } from "../../lib/output.js";

export default class EventsListen extends AuthenticatedCommand {
  static description =
    "Listen to real-time events via Server-Sent Events. Streams message deliveries, conversation updates, and more.";

  static examples = [
    "<%= config.bin %> events listen",
    "<%= config.bin %> events listen --types new_message,conversation_update",
    "<%= config.bin %> events listen --json",
  ];

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    types: Flags.string({
      description: "Comma-separated event types to filter (default: all)",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(EventsListen);

    const apiKey = getAuthToken();
    const baseUrl = getEffectiveValue("baseUrl");

    const url = new URL("/api/v1/events", baseUrl);
    if (flags.types) url.searchParams.set("types", flags.types);

    if (!isJsonMode()) {
      console.log(colors.bold("Listening for events..."));
      console.log(colors.dim(`Endpoint: ${url.toString()}`));
      if (flags.types) console.log(colors.dim(`Filtering: ${flags.types}`));
      console.log(colors.dim("Press Ctrl+C to stop\n"));
    }

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!response.ok) {
      throw new Error(`Connection failed: ${response.status} ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response stream");

    const decoder = new TextDecoder();
    let buffer = "";

    process.on("SIGINT", () => {
      reader.cancel();
      if (!isJsonMode()) console.log(colors.dim("\nDisconnected."));
      process.exit(0);
    });

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6).trim();
        if (!raw) continue;

        try {
          const event = JSON.parse(raw);

          if (isJsonMode()) {
            json(event);
          } else {
            const ts = new Date(event.timestamp || Date.now()).toLocaleTimeString();
            const type = colors.primary(event.type || "unknown");
            console.log(`${colors.dim(ts)}  ${type}`);
            if (event.data) {
              const preview = JSON.stringify(event.data).slice(0, 120);
              console.log(`  ${colors.dim(preview)}${JSON.stringify(event.data).length > 120 ? "..." : ""}`);
            }
          }
        } catch {}
      }
    }
  }
}
