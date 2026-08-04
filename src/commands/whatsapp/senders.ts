import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import {
  json,
  info,
  table,
  colors,
  spinner,
  isJsonMode,
  formatRelativeTime,
} from "../../lib/output.js";

interface WhatsappSender {
  phoneNumber: string;
  displayName: string | null;
  status: string;
  qualityRating: string | null;
  createdAt: string;
}

interface ListSendersResponse {
  senders: WhatsappSender[];
}

function formatSenderStatus(status: string): string {
  switch (String(status).toLowerCase()) {
    case "active":
      return colors.success(status);
    case "suspended":
      return colors.error(status);
    case "pending":
      return colors.warning(status);
    default:
      return status;
  }
}

export default class WhatsappSenders extends AuthenticatedCommand {
  static description = "List the numbers connected to WhatsApp on your workspace";

  static examples = [
    "<%= config.bin %> whatsapp senders",
    "<%= config.bin %> whatsapp senders --json",
  ];

  static flags = {
    ...AuthenticatedCommand.baseFlags,
  };

  async run(): Promise<void> {
    await this.parse(WhatsappSenders);

    const listSpinner = spinner("Fetching WhatsApp senders...");
    if (!isJsonMode()) {
      listSpinner.start();
    }

    const response = await apiClient
      .get<ListSendersResponse>("/api/v1/whatsapp/senders")
      .finally(() => listSpinner.stop());

    if (isJsonMode()) {
      json(response);
      return;
    }

    const senders = response.senders ?? [];
    if (senders.length === 0) {
      info("No WhatsApp senders yet");
      console.log(
        colors.dim(
          `Connect a number with: ${colors.code("sendly whatsapp connect --number +15551234567")}`,
        ),
      );
      return;
    }

    table(senders, [
      { header: "Number", key: "phoneNumber" },
      {
        header: "Display name",
        key: "displayName",
        formatter: (v) => (v ? String(v) : colors.dim("—")),
      },
      {
        header: "Status",
        key: "status",
        formatter: (v) => formatSenderStatus(String(v)),
      },
      {
        header: "Quality",
        key: "qualityRating",
        formatter: (v) => (v ? String(v) : colors.dim("—")),
      },
      {
        header: "Connected",
        key: "createdAt",
        formatter: (v) => formatRelativeTime(String(v)),
      },
    ]);

    const pending = senders.filter(
      (s) => String(s.status).toLowerCase() === "pending",
    );
    if (pending.length > 0) {
      console.log();
      console.log(
        colors.dim(
          `Pending senders are still connecting — someone needs to finish the Facebook sign-in. Check progress with ${colors.code("sendly whatsapp status")}.`,
        ),
      );
    }
  }
}
