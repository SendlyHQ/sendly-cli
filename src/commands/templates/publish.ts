import { Args } from "@oclif/core";
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

interface TemplateResponse {
  id: string;
  name: string;
  text: string;
  status: string;
  version: number;
  published_at: string;
}

export default class TemplatesPublish extends AuthenticatedCommand {
  static description = "Publish a draft template (locks it for use)";

  static examples = ["<%= config.bin %> templates publish tpl_xxx"];

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
    const { args } = await this.parse(TemplatesPublish);

    const publishSpinner = spinner("Publishing template...");

    if (!isJsonMode()) {
      publishSpinner.start();
    }

    try {
      const response = await apiClient.post<TemplateResponse>(
        `/api/v1/templates/${encodeURIComponent(args.id)}/publish`,
      );

      publishSpinner.stop();

      if (isJsonMode()) {
        json(response);
        return;
      }

      success("Template published", {
        ID: colors.code(response.id),
        Name: response.name,
        Status: colors.success(response.status),
        "Published At": new Date(response.published_at).toLocaleString(),
      });

      console.log();
      console.log(
        colors.dim(
          `Use with: ${colors.code(`sendly verify send --to "+1234567890" --template ${response.id}`)}`,
        ),
      );
    } catch (err: any) {
      publishSpinner.stop();

      if (err.message?.includes("already published")) {
        error("Template already published");
      } else if (err.message?.includes("preset")) {
        error("Cannot publish preset templates");
      } else if (err.message?.includes("not_found")) {
        error("Template not found");
      } else {
        throw err;
      }
      this.exit(1);
    }
  }
}
