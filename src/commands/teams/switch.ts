import { Args } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import {
  success,
  json,
  info,
  colors,
  isJsonMode,
} from "../../lib/output.js";
import { setCurrentOrg, clearCurrentOrg, getCurrentOrg } from "../../lib/config.js";
import { isCI } from "../../lib/config.js";

interface Organization {
  id: string;
  name: string;
  slug: string;
  role: string;
  isPersonal: boolean;
}

export default class TeamsSwitch extends AuthenticatedCommand {
  static description = "Switch the active team";

  static examples = [
    "<%= config.bin %> teams switch",
    "<%= config.bin %> teams switch <org-id-or-slug>",
    "<%= config.bin %> teams switch --clear",
  ];

  static args = {
    org: Args.string({
      description: "Organization ID or slug to switch to",
      required: false,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
  };

  async run(): Promise<void> {
    const { args } = await this.parse(TeamsSwitch);

    if (args.org === "clear" || args.org === "none" || args.org === "personal") {
      clearCurrentOrg();
      if (isJsonMode()) {
        json({ cleared: true });
        return;
      }
      success("Switched to personal account");
      return;
    }

    const orgs = await apiClient.get<Organization[]>("/api/organizations");

    if (args.org) {
      const match = orgs.find(
        (o) =>
          o.id === args.org ||
          o.slug === args.org ||
          o.name.toLowerCase() === args.org!.toLowerCase(),
      );
      if (!match) {
        this.error(`Team not found: ${args.org}`);
      }
      setCurrentOrg(match.id, match.name, match.slug);
      if (isJsonMode()) {
        json({ id: match.id, name: match.name, slug: match.slug });
        return;
      }
      success(`Switched to ${colors.primary(match.name)}`);
      return;
    }

    if (isCI()) {
      this.error("Interactive mode not available in CI. Pass an org ID or slug as argument.");
    }

    const { default: inquirer } = await import("inquirer");

    const currentOrg = getCurrentOrg();
    const choices = orgs.map((o) => ({
      name: `${o.name}${o.role ? ` (${o.role})` : ""}${o.isPersonal ? " — personal" : ""}`,
      value: o.id,
    }));

    const { orgId } = await inquirer.prompt([
      {
        type: "list",
        name: "orgId",
        message: "Select a team:",
        choices,
        default: currentOrg?.id,
      },
    ]);

    const selected = orgs.find((o) => o.id === orgId)!;

    if (selected.isPersonal) {
      clearCurrentOrg();
      if (isJsonMode()) {
        json({ cleared: true });
        return;
      }
      success("Switched to personal account");
      return;
    }

    setCurrentOrg(selected.id, selected.name, selected.slug);

    if (isJsonMode()) {
      json({ id: selected.id, name: selected.name, slug: selected.slug });
      return;
    }

    success(`Switched to ${colors.primary(selected.name)}`);
  }
}
