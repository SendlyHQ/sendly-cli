import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import {
  table,
  json,
  info,
  formatRelativeTime,
  colors,
  isJsonMode,
} from "../../lib/output.js";

interface Label {
  id: string;
  name: string;
  color: string;
  description?: string;
  createdAt: string;
}

interface ListLabelsResponse {
  data: Label[];
}

export default class Labels extends AuthenticatedCommand {
  static description = "List labels (default subcommand)";

  static examples = [
    "<%= config.bin %> labels",
    "<%= config.bin %> labels --json",
  ];

  static flags = {
    ...AuthenticatedCommand.baseFlags,
  };

  async run(): Promise<void> {
    await this.parse(Labels);

    const response = await apiClient.get<ListLabelsResponse>(
      "/api/v1/labels",
    );

    if (isJsonMode()) {
      json(response);
      return;
    }

    if (response.data.length === 0) {
      info("No labels found");
      return;
    }

    console.log();
    console.log(
      colors.dim(`Showing ${response.data.length} labels`),
    );
    console.log();

    table(response.data, [
      {
        header: "Name",
        key: "name",
        width: 20,
      },
      {
        header: "Color",
        key: "color",
        width: 10,
        formatter: (v) => colors.code(String(v ?? "-")),
      },
      {
        header: "Description",
        key: "description",
        width: 30,
        formatter: (v) => {
          if (!v) return colors.dim("-");
          const text = String(v);
          return text.length > 27 ? text.slice(0, 27) + "..." : text;
        },
      },
      {
        header: "Created",
        key: "createdAt",
        width: 14,
        formatter: (v) => (v ? formatRelativeTime(String(v)) : colors.dim("-")),
      },
    ]);
  }
}
