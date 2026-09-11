import { Args } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import { success, json, colors, spinner, isJsonMode } from "../../lib/output.js";

interface TemplateResponse {
  id: string;
  name: string;
  text: string;
  variables: Array<{ key: string; type: string; fallback?: string }>;
  is_preset: boolean;
  preset_slug: string | null;
  status: string;
  version: number;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export default class TemplatesGet extends AuthenticatedCommand {
  static description = "Get template details";

  static examples = [
    "<%= config.bin %> templates get tpl_xxx",
    "<%= config.bin %> templates get tpl_preset_2fa",
  ];

  static args = {
    id: Args.string({
      description: "Template ID",
      required: true,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
  };

  async run(): Promise<void> {
    const { args } = await this.parse(TemplatesGet);

    const getSpinner = spinner("Fetching template...");

    if (!isJsonMode()) {
      getSpinner.start();
    }

    try {
      const response = await apiClient.get<TemplateResponse>(
        `/api/v1/templates/${encodeURIComponent(args.id)}`,
      );

      getSpinner.stop();

      if (isJsonMode()) {
        json(response);
        return;
      }

      const statusDisplay = response.is_preset
        ? colors.primary("preset")
        : response.status === "published"
          ? colors.success("published")
          : colors.dim("draft");

      success("Template details", {
        ID: colors.code(response.id),
        Name: response.name,
        Type: statusDisplay,
        Version: String(response.version),
        ...(response.preset_slug && { Slug: response.preset_slug }),
      });

      console.log();
      console.log(colors.bold("Message Text:"));
      console.log(colors.dim("  " + response.text));

      if (response.variables.length > 0) {
        console.log();
        console.log(colors.bold("Variables:"));
        for (const v of response.variables) {
          const fallback = v.fallback
            ? ` (default: ${colors.dim(String(v.fallback))})`
            : "";
          console.log(`  ${colors.code(`{{${v.key}}}`)} - ${v.type}${fallback}`);
        }
      }

      if (!response.is_preset && response.status === "draft") {
        console.log();
        console.log(
          colors.dim(
            `Publish with: ${colors.code(`sendly templates publish ${response.id}`)}`,
          ),
        );
      }
    } catch (err: any) {
      getSpinner.stop();
      throw err;
    }
  }
}
