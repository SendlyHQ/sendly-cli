import { AuthenticatedCommand } from "../../lib/base-command.js";
import { json, info, keyValue, colors, isJsonMode } from "../../lib/output.js";
import { getCurrentOrg } from "../../lib/config.js";

export default class TeamsCurrent extends AuthenticatedCommand {
  static description = "Show the currently active team";

  static examples = [
    "<%= config.bin %> teams current",
    "<%= config.bin %> teams current --json",
  ];

  static flags = {
    ...AuthenticatedCommand.baseFlags,
  };

  async run(): Promise<void> {
    const org = getCurrentOrg();

    if (isJsonMode()) {
      json(org || { message: "No active team" });
      return;
    }

    if (!org) {
      info("No active team set");
      console.log();
      console.log(
        `  Run ${colors.code("sendly teams switch")} to select a team`,
      );
      return;
    }

    console.log();
    keyValue({
      Team: colors.primary(org.name),
      ID: colors.dim(org.id),
      ...(org.slug ? { Slug: colors.dim(org.slug) } : {}),
    });
  }
}
