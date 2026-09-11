import { Args, Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import { json, success, colors, isJsonMode, keyValue } from "../../lib/output.js";

interface Template {
  id: string;
  name: string;
  text: string;
  status: string;
  isPreset: boolean;
  version: number;
  createdAt: string;
}

export default class TemplatesClone extends AuthenticatedCommand {
  static description = "Clone a template";

  static examples = [
    "<%= config.bin %> templates clone tpl_preset_otp",
    '<%= config.bin %> templates clone tpl_preset_otp --name "My Custom OTP"',
    "<%= config.bin %> templates clone tpl_xxx --json",
  ];

  static args = {
    id: Args.string({
      description: "Template ID to clone",
      required: true,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    name: Flags.string({
      char: "n",
      description: "Name for the cloned template",
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(TemplatesClone);

    const template = await apiClient.post<Template>(
      `/api/v1/templates/${encodeURIComponent(args.id)}/clone`,
      flags.name ? { name: flags.name } : {},
    );

    if (isJsonMode()) {
      json(template);
      return;
    }

    success(`Template cloned: ${template.id}`);
    console.log();

    keyValue([
      ["Name", template.name],
      ["Status", colors.dim("draft")],
      ["Text", template.text.length > 50 ? template.text.slice(0, 50) + "..." : template.text],
    ]);

    console.log();
    console.log(colors.dim("Next steps:"));
    console.log(`  Edit:    ${colors.code(`sendly templates get ${template.id}`)}`);
    console.log(`  Publish: ${colors.code(`sendly templates publish ${template.id}`)}`);
  }
}
