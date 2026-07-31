import { AuthenticatedCommand } from "../../../lib/base-command.js";
import { apiClient } from "../../../lib/api-client.js";
import {
  json,
  info,
  table,
  colors,
  spinner,
  isJsonMode,
  formatRelativeTime,
} from "../../../lib/output.js";

interface WhatsappTemplate {
  id: string;
  name: string;
  language: string;
  category: string;
  status: string;
  qualityRating: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ListTemplatesResponse {
  templates: WhatsappTemplate[];
}

function formatTemplateStatus(status: string): string {
  switch (String(status).toUpperCase()) {
    case "APPROVED":
      return colors.success(status);
    case "REJECTED":
    case "DISABLED":
      return colors.error(status);
    case "PENDING":
    case "PAUSED":
      return colors.warning(status);
    default:
      return status;
  }
}

export default class WhatsappTemplatesList extends AuthenticatedCommand {
  static description = "List your WhatsApp message templates";

  static examples = [
    "<%= config.bin %> whatsapp templates list",
    "<%= config.bin %> whatsapp templates list --json",
  ];

  static flags = {
    ...AuthenticatedCommand.baseFlags,
  };

  async run(): Promise<void> {
    await this.parse(WhatsappTemplatesList);

    const listSpinner = spinner("Fetching WhatsApp templates...");
    if (!isJsonMode()) {
      listSpinner.start();
    }

    const response = await apiClient
      .get<ListTemplatesResponse>("/api/v1/whatsapp/templates")
      .finally(() => listSpinner.stop());

    if (isJsonMode()) {
      json(response);
      return;
    }

    const templates = response.templates ?? [];
    if (templates.length === 0) {
      info("No WhatsApp templates yet");
      console.log(
        colors.dim(
          `Create one with: ${colors.code('sendly whatsapp templates create --sender +15551234567 --name order_update --language en_US --category utility --body "Your order {{1}} shipped" --example 1=4821')}`,
        ),
      );
      return;
    }

    table(templates, [
      { header: "ID", key: "id", formatter: (v) => colors.code(String(v)) },
      { header: "Name", key: "name" },
      { header: "Language", key: "language" },
      { header: "Category", key: "category" },
      {
        header: "Status",
        key: "status",
        formatter: (v) => formatTemplateStatus(String(v)),
      },
      {
        header: "Quality",
        key: "qualityRating",
        formatter: (v) => (v ? String(v) : colors.dim("—")),
      },
      {
        header: "Updated",
        key: "updatedAt",
        formatter: (v) => formatRelativeTime(String(v)),
      },
    ]);

    const rejected = templates.filter((t) => t.rejectionReason);
    if (rejected.length > 0) {
      console.log();
      rejected.forEach((t) => {
        console.log(
          `${colors.error("✗")} ${t.name} (${t.language}): ${colors.dim(t.rejectionReason!)}`,
        );
      });
      console.log(
        colors.dim(
          `Edit a rejected template to resubmit it: ${colors.code("sendly whatsapp templates update <id> --body ...")}`,
        ),
      );
    }
  }
}
