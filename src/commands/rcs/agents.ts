import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient, NotFoundError } from "../../lib/api-client.js";
import {
  json,
  info,
  error,
  table,
  colors,
  spinner,
  isJsonMode,
  formatRelativeTime,
} from "../../lib/output.js";
import { formatStage, type CustomerStage } from "../../lib/rcs-registration.js";

interface RcsAgent {
  id: string;
  name: string;
  status: string;
  useCase: string | null;
  sendable: boolean;
  stage?: CustomerStage;
  createdAt: string;
}

interface ListAgentsResponse {
  agents: RcsAgent[];
}

function formatAgentStatus(status: string): string {
  switch (String(status).toLowerCase()) {
    case "approved":
      return colors.success(status);
    case "rejected":
    case "suspended":
      return colors.error(status);
    case "testing":
    case "pending":
      return colors.warning(status);
    default:
      return status;
  }
}

export default class RcsAgents extends AuthenticatedCommand {
  static description = "List the RCS agents on your workspace";

  static examples = [
    "<%= config.bin %> rcs agents",
    "<%= config.bin %> rcs agents --json",
  ];

  static flags = {
    ...AuthenticatedCommand.baseFlags,
  };

  async run(): Promise<void> {
    await this.parse(RcsAgents);

    const listSpinner = spinner("Fetching RCS agents...");
    if (!isJsonMode()) {
      listSpinner.start();
    }

    let response: ListAgentsResponse;
    try {
      response = await apiClient.get<ListAgentsResponse>("/api/v1/rcs/agents");
      listSpinner.stop();
    } catch (err: any) {
      listSpinner.stop();
      if (err instanceof NotFoundError) {
        error("RCS isn't available on your workspace yet.", {
          hint: "RCS is rolling out gradually — contact support@sendly.live for early access.",
        });
        this.exit(1);
      }
      throw err;
    }

    if (isJsonMode()) {
      json(response);
      return;
    }

    const agents = response.agents ?? [];
    if (agents.length === 0) {
      info("No RCS agents yet");
      console.log(
        colors.dim(
          `Register one: ${colors.code("sendly rcs brands create ...")} then ${colors.code("sendly rcs agents create --brand <brandId> ...")}; track it with ${colors.code("sendly rcs registration")}.`,
        ),
      );
      return;
    }

    table(agents, [
      { header: "ID", key: "id", formatter: (v) => colors.code(String(v)) },
      { header: "Name", key: "name" },
      {
        header: "Status",
        key: "status",
        formatter: (v) => formatAgentStatus(String(v)),
      },
      {
        header: "Use case",
        key: "useCase",
        formatter: (v) => (v ? String(v) : colors.dim("—")),
      },
      {
        header: "Sendable",
        key: "sendable",
        formatter: (v) => (v ? colors.success("yes") : colors.dim("no")),
      },
      {
        header: "Stage",
        key: "stage",
        formatter: (v) => (v ? formatStage(String(v)) : colors.dim("—")),
      },
      {
        header: "Created",
        key: "createdAt",
        formatter: (v) => formatRelativeTime(String(v)),
      },
    ]);

    const testing = agents.filter(
      (a) => String(a.status).toLowerCase() === "testing",
    );
    if (testing.length > 0) {
      console.log();
      console.log(
        colors.dim(
          "Agents in testing can only reach invited test devices — approved agents reach everyone.",
        ),
      );
    }
    console.log();
    console.log(
      colors.dim(
        `Details and next steps: ${colors.code("sendly rcs agents get <agentId>")} or ${colors.code("sendly rcs registration")}.`,
      ),
    );
  }
}
