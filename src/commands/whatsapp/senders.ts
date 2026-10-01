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
  businessAccountId?: string | null;
  businessName?: string | null;
  callingEnabled?: boolean;
  outboundCallingAllowed?: boolean;
  createdAt: string;
}

interface ListSendersResponse {
  senders: WhatsappSender[];
}

function formatCalling(sender: WhatsappSender): string {
  if (!sender.callingEnabled) return colors.dim("off");
  return sender.outboundCallingAllowed === false
    ? colors.success("on (inbound only)")
    : colors.success("on");
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
        header: "Business",
        key: "businessName",
        formatter: (v) => (v ? String(v) : colors.dim("—")),
      },
      {
        header: "Business account",
        key: "businessAccountId",
        formatter: (v) => (v ? String(v) : colors.dim("—")),
      },
      {
        header: "Calling",
        key: "callingEnabled",
        formatter: (_v, row) => formatCalling(row as WhatsappSender),
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
          `Pending senders are still connecting: someone needs to finish the Facebook sign-in, or enter the verification code for a number added with --business-account. Check progress with ${colors.code("sendly whatsapp status")}.`,
        ),
      );
    }

    const account = senders.find(
      (s) => String(s.status).toLowerCase() === "active" && s.businessAccountId,
    );
    if (account) {
      console.log();
      console.log(
        colors.dim(
          `Add another number to a connected business account without the Facebook step: ${colors.code(`sendly whatsapp connect --number <number> --business-account ${account.businessAccountId}`)}`,
        ),
      );
    }
  }
}
