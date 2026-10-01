import { Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient, ApiError, ForbiddenError } from "../../lib/api-client.js";
import {
  success,
  warn,
  json,
  table,
  colors,
  isJsonMode,
  spinner,
} from "../../lib/output.js";
import * as fs from "node:fs";

interface ProvisionResponse {
  workspace: { id: string; name: string; slug: string };
  verification?: { status: string; inherited?: boolean };
  credits?: { transferred?: number; balance?: number; error?: string };
  key?: { id: string; name: string; key: string; keyPrefix: string; type: string };
  webhook?: { url?: string; error?: string };
  optInPage?: { id?: string; slug?: string; url?: string; error?: string };
}

interface SourceWorkspace {
  id: string;
  verification: { status: string } | null;
}

interface Organization {
  id: string;
  isPersonal: boolean;
  role: string;
}

interface Account {
  verification: { status: string } | null;
}

type BulkProvisionItem = Record<string, unknown> & { name?: unknown };

interface BulkResultItem {
  name: string;
  status?: string;
  success: boolean;
  workspaceId?: string;
  error?: string;
  warning?: string;
}

interface BulkProvisionResponse {
  results?: BulkResultItem[];
  totalRequested?: number;
  totalCreated?: number;
  totalFailed?: number;
}

const BULK_PROVISION_MAX = 100;

export default class EnterpriseProvision extends AuthenticatedCommand {
  static description =
    "Provision a new workspace that inherits an existing workspace's verification, or bulk provision from a JSON file";

  static examples = [
    '<%= config.bin %> enterprise provision --name "Acme Corp" --inherit-from org_abc123',
    '<%= config.bin %> enterprise provision --name "Acme Corp" --inherit-from org_abc123 --credits 500 --credits-from org_pool --create-key',
    "<%= config.bin %> enterprise provision --bulk workspaces.json",
    "<%= config.bin %> enterprise provision --bulk workspaces.json --credits-from org_pool",
  ];

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    name: Flags.string({
      char: "n",
      description: "Workspace name (single provision)",
    }),
    credits: Flags.integer({
      char: "c",
      description: "Credits to move into the new workspace (needs --credits-from)",
    }),
    "credits-from": Flags.string({
      description:
        "Workspace ID to take --credits from; with --bulk, the source for items that set credits without one",
    }),
    "inherit-from": Flags.string({
      description:
        "Workspace ID to inherit verification from (required for single provisioning)",
    }),
    "webhook-url": Flags.string({
      description:
        "Enterprise webhook URL: sets the webhook for your whole enterprise account, not only this workspace",
    }),
    "create-key": Flags.boolean({
      description: 'Create a test API key named "<name> key" for the workspace',
      default: false,
    }),
    bulk: Flags.string({
      char: "b",
      description: `Path to JSON file for bulk provisioning (up to ${BULK_PROVISION_MAX} workspaces)`,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(EnterpriseProvision);

    if (flags.bulk) {
      await this.bulkProvision(flags.bulk, flags["credits-from"]);
      return;
    }

    if (!flags.name) {
      this.error("--name is required for single provisioning. Use --bulk for batch provisioning.");
    }

    const sourceId = flags["inherit-from"];
    if (!sourceId) {
      this.error(
        "--inherit-from is required: pass the ID of a workspace whose verification the new workspace should inherit.",
      );
    }

    if (flags.credits !== undefined && flags.credits <= 0) {
      this.error("--credits must be a positive number of credits.");
    }

    if (flags.credits !== undefined && !flags["credits-from"]) {
      this.error(
        "--credits needs --credits-from: pass the ID of the workspace to take the credits from.",
      );
    }

    if (flags["webhook-url"] && !flags["webhook-url"].startsWith("https://")) {
      this.error("--webhook-url must be an https:// URL.");
    }

    await this.confirmSource(sourceId);

    const spin = spinner("Provisioning workspace...");
    spin.start();

    const body: Record<string, unknown> = {
      name: flags.name,
      sourceWorkspaceId: sourceId,
    };
    if (flags.credits !== undefined) {
      body.creditAmount = flags.credits;
      body.creditSourceWorkspaceId = flags["credits-from"];
    }
    if (flags["create-key"]) {
      body.keyName = `${flags.name} key`;
      body.keyType = "test";
    }
    if (flags["webhook-url"]) body.webhookUrl = flags["webhook-url"];

    let response: ProvisionResponse;
    try {
      response = await apiClient.post<ProvisionResponse>(
        "/api/v1/enterprise/workspaces/provision",
        body,
      );
    } catch (err) {
      spin.stop();
      if (err instanceof ApiError && err.statusCode === 400) {
        err.hint = `The API may have created "${flags.name}" before it refused. Find it with sendly enterprise workspaces list and delete it with sendly enterprise workspaces delete <workspaceId>.`;
      }
      throw err;
    }

    spin.succeed("Workspace provisioned");

    if (isJsonMode()) {
      json(response);
      return;
    }

    const details: Record<string, string> = {
      ID: response.workspace.id,
      Name: response.workspace.name,
      Slug: response.workspace.slug,
    };

    if (response.verification) {
      details["Verification"] = response.verification.status === "approved"
        ? colors.success("inherited")
        : colors.warning(response.verification.status);
    }
    if (response.credits?.error) {
      details["Credits"] = colors.error(`not moved: ${response.credits.error}`);
    } else if (response.credits) {
      details["Credits"] = `${Number(response.credits.balance ?? response.credits.transferred ?? 0).toLocaleString()} credits`;
    } else if (flags.credits !== undefined) {
      details["Credits"] = colors.error(
        `not moved: ${flags["credits-from"]} isn't a workspace you own`,
      );
    }
    if (response.key) {
      details["API Key"] = response.key.key;
    }
    if (response.webhook?.error) {
      details["Webhook"] = colors.error(`not set: ${response.webhook.error}`);
    } else if (response.webhook?.url) {
      details["Webhook"] = response.webhook.url;
    }

    success("Workspace provisioned", details);

    if (response.key) {
      console.log();
      console.log(
        colors.warning("  Save the API key now — it won't be shown again."),
      );
    }
  }

  private async confirmSource(sourceId: string): Promise<void> {
    let source: SourceWorkspace;
    try {
      source = await apiClient.get<SourceWorkspace>(
        `/api/v1/enterprise/workspaces/${encodeURIComponent(sourceId)}`,
      );
    } catch (err) {
      if (err instanceof ForbiddenError && err.code === "invalid_workspace") {
        const orgs = await apiClient.get<Organization[]>("/api/organizations");
        const own = orgs.find(
          (o) => o.id === sourceId && o.isPersonal && o.role === "owner",
        );
        if (!own) this.error(`${sourceId} is not a workspace you own.`);
        const account = await apiClient.get<Account>("/api/v1/account");
        if (!account.verification) {
          this.error(
            `${sourceId} is your personal workspace, and your account has no verification to inherit. Pick a verified workspace for --inherit-from.`,
          );
        }
        return;
      }
      throw err;
    }

    if (!source.verification) {
      this.error(
        `${sourceId} has no verification to inherit. Pick a verified workspace for --inherit-from.`,
      );
    }
  }

  private async bulkProvision(
    filePath: string,
    creditsFrom: string | undefined,
  ): Promise<void> {
    if (!fs.existsSync(filePath)) {
      this.error(`File not found: ${filePath}`);
    }

    const content = fs.readFileSync(filePath, "utf-8");
    let workspaces: BulkProvisionItem[];

    try {
      workspaces = JSON.parse(content);
    } catch {
      this.error("Invalid JSON file. Expected an array of workspace objects.");
    }

    if (!Array.isArray(workspaces)) {
      this.error("JSON file must contain an array of workspace objects.");
    }

    if (workspaces.length > BULK_PROVISION_MAX) {
      this.error(
        `Bulk provisioning supports up to ${BULK_PROVISION_MAX} workspaces at a time.`,
      );
    }

    const droppedKeys: string[] = [];
    const droppedCredits: string[] = [];
    const items = workspaces.map((workspace) => {
      if (!workspace || typeof workspace !== "object" || Array.isArray(workspace)) {
        return workspace;
      }
      const label = typeof workspace.name === "string" ? workspace.name : "(unnamed)";
      if (workspace.webhookUrl != null || workspace.webhook_url != null) {
        this.error(
          `Workspace "${label}" sets webhookUrl, which bulk provisioning can't apply. Provision it on its own with --webhook-url.`,
        );
      }

      const { credits, createApiKey, ...item } = workspace;
      if (createApiKey) droppedKeys.push(label);

      const source = item.creditSourceWorkspaceId ?? creditsFrom;
      if (credits != null && credits !== 0 && item.creditAmount == null) {
        if (Number.isInteger(credits) && (credits as number) > 0 && source) {
          item.creditAmount = credits;
          item.creditSourceWorkspaceId = source;
        } else {
          droppedCredits.push(label);
        }
      } else if (item.creditAmount != null && source) {
        item.creditSourceWorkspaceId = source;
      }
      return item;
    });

    if (droppedKeys.length > 0) {
      warn(
        `Bulk provisioning can't create API keys, so createApiKey was dropped for: ${droppedKeys.join(", ")}. Create keys afterwards with sendly enterprise keys create <workspaceId> --name "<name>".`,
      );
    }

    if (droppedCredits.length > 0) {
      warn(
        `credits was dropped for: ${droppedCredits.join(", ")}, so they are created without credits. To move credits, give a positive whole number and a workspace to take them from: the item's creditSourceWorkspaceId, or --credits-from.`,
      );
    }

    const spin = spinner(`Provisioning ${items.length} workspaces...`);
    spin.start();

    let response: BulkProvisionResponse;
    try {
      response = await apiClient.post<BulkProvisionResponse>(
        "/api/v1/enterprise/workspaces/provision/bulk",
        { workspaces: items },
      );
    } catch (err) {
      spin.stop();
      throw err;
    }

    if (!Array.isArray(response.results)) {
      spin.succeed("Bulk provisioning accepted");
      if (isJsonMode()) {
        json(response);
        return;
      }
      console.log(JSON.stringify(response, null, 2));
      return;
    }

    spin.succeed(
      `Provisioned ${response.totalCreated}/${response.totalRequested} workspaces`,
    );

    if (isJsonMode()) {
      json(response);
      return;
    }

    console.log();
    table(response.results, [
      { header: "Name", key: "name", width: 24 },
      {
        header: "Status",
        key: "success",
        width: 10,
        formatter: (v, row) =>
          row?.status === "partial"
            ? colors.warning("partial")
            : v
              ? colors.success("created")
              : colors.error("failed"),
      },
      {
        header: "Workspace ID",
        key: "workspaceId",
        width: 20,
        formatter: (v) => (v ? colors.dim(String(v)) : colors.dim("—")),
      },
      {
        header: "Error",
        key: "error",
        formatter: (v, row) =>
          v
            ? colors.error(String(v))
            : row?.warning
              ? colors.warning(String(row.warning))
              : "",
      },
    ]);

    if ((response.totalFailed ?? 0) > 0) {
      console.log();
      console.log(
        colors.warning(
          `  ${response.totalFailed} workspace(s) failed to provision.`,
        ),
      );
    }
  }
}
