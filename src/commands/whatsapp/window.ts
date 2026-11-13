import { Args, Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import {
  success,
  error,
  json,
  colors,
  spinner,
  isJsonMode,
} from "../../lib/output.js";
import { reportWhatsappError } from "../../lib/whatsapp.js";

interface WhatsappWindow {
  open: boolean;
  expiresAt: string | null;
}

interface ListSendersResponse {
  senders: Array<{ phoneNumber: string; status: string }>;
}

export default class WhatsappWindowCommand extends AuthenticatedCommand {
  static description =
    "Check whether the 24-hour WhatsApp reply window with a recipient is open. Inside it any message can be sent; outside it, only an approved template. Read from Sendly's record of the recipient's last message. Needs the whatsapp:read scope.";

  static examples = [
    "<%= config.bin %> whatsapp window +15551234567",
    "<%= config.bin %> whatsapp window +15551234567 --from +15559876543",
    "<%= config.bin %> whatsapp window +15551234567 --from +15559876543 --json",
  ];

  static args = {
    phone: Args.string({
      description: "Recipient phone number (E.164 format)",
      required: true,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    from: Flags.string({
      char: "f",
      description:
        "Your WhatsApp-connected sender number (E.164 format). Optional when the workspace has exactly one active sender.",
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(WhatsappWindowCommand);

    const windowSpinner = spinner("Checking the 24-hour window...");
    if (!isJsonMode()) {
      windowSpinner.start();
    }

    let from = flags.from;
    let response: WhatsappWindow;
    try {
      if (!from) {
        const { senders = [] } = await apiClient.get<ListSendersResponse>(
          "/api/v1/whatsapp/senders",
        );
        const active = senders.filter(
          (s) => String(s.status).toLowerCase() === "active",
        );
        if (active.length !== 1) {
          windowSpinner.stop();
          if (active.length === 0) {
            error("No active WhatsApp sender on this workspace.", {
              hint: "Connect one with `sendly whatsapp connect --number <number>`, or pass --from.",
            });
          } else {
            error("More than one active WhatsApp sender. Choose one with --from.", {
              senders: active.map((s) => s.phoneNumber),
              hint: `e.g. sendly whatsapp window ${args.phone} --from ${active[0].phoneNumber}`,
            });
          }
          this.exit(1);
        }
        from = active[0].phoneNumber;
      }

      response = await apiClient.get<WhatsappWindow>("/api/v1/whatsapp/window", {
        from,
        to: args.phone,
      });
      windowSpinner.stop();
    } catch (err) {
      windowSpinner.stop();
      if (reportWhatsappError(err, { number: from })) {
        this.exit(1);
      }
      throw err;
    }

    if (isJsonMode()) {
      json(response);
      return;
    }

    const state = response.open
      ? colors.success("open")
      : response.expiresAt
        ? colors.error("closed")
        : colors.dim("no window on record");

    success("WhatsApp 24-hour window", {
      From: from,
      To: args.phone,
      Window: state,
      ...(response.expiresAt && {
        [response.open ? "Closes" : "Closed"]: new Date(
          response.expiresAt,
        ).toLocaleString(),
      }),
    });

    console.log();
    if (response.open) {
      console.log(
        colors.dim(
          "Any message can be sent until the window closes. Each message from the recipient opens it again for 24 hours.",
        ),
      );
    } else {
      console.log(
        colors.dim(
          `${response.expiresAt ? "Outside the window" : "Sendly has no message from this recipient on record, though a send may still find the window open. Outside the window"}, only an approved template can be sent: ${colors.code(`sendly whatsapp send --to ${args.phone} --from ${from} --template <name> --language en_US`)}`,
        ),
      );
    }
  }
}
