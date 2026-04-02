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

interface TemplateResponse {
  id: string;
  name: string;
  text: string;
  variables: Array<{ key: string; type: string; fallback?: string }>;
  is_preset: boolean;
  status: string;
  version: number;
  created_at: string;
}

export default class TemplatesUpdate extends AuthenticatedCommand {
  static description = "Update an SMS template";

  static examples = [
    '<%= config.bin %> templates update tmpl_abc123 --name "Updated OTP"',
    '<%= config.bin %> templates update tmpl_abc123 --text "Your new code is {{code}}"',
    '<%= config.bin %> templates update tmpl_abc123 --name "Login V2" --text "{{code}} is your code"',
  ];

  static args = {
    id: Args.string({
      description: "Template ID",
      required: true,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    name: Flags.string({
      char: "n",
      description: "Template name",
    }),
    text: Flags.string({
      char: "t",
      description: "Message text (use {{code}} and {{app_name}} variables)",
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(TemplatesUpdate);

    const body: Record<string, unknown> = {};
    if (flags.name) body.name = flags.name;
    if (flags.text) body.text = flags.text;

    const updateSpinner = spinner("Updating template...");

    if (!isJsonMode()) {
      updateSpinner.start();
    }

    try {
      const response = await apiClient.patch<TemplateResponse>(
        `/api/v1/templates/${encodeURIComponent(args.id)}`,
        body,
      );

      updateSpinner.stop();

      if (isJsonMode()) {
        json(response);
        return;
      }

      success("Template updated", {
        ID: colors.code(response.id),
        Name: response.name,
        Status: colors.dim(response.status),
        Variables: response.variables
          .map((v) => colors.code(`{{${v.key}}}`))
          .join(", ") || colors.dim("none"),
      });
    } catch (err: any) {
      updateSpinner.stop();

      if (err.message?.includes("1600 characters")) {
        error("Template text too long", {
          hint: "Maximum 1600 characters (10 SMS segments)",
        });
        this.exit(1);
      } else {
        throw err;
      }
    }
  }
}
