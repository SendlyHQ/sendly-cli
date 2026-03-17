import { Args, Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import {
  success,
  json,
  spinner,
  isJsonMode,
} from "../../lib/output.js";

interface LabelResponse {
  id: string;
  name: string;
  color: string;
  description?: string;
}

export default class LabelsCreate extends AuthenticatedCommand {
  static description = "Create a label";

  static examples = [
    '<%= config.bin %> labels create "VIP"',
    '<%= config.bin %> labels create "Urgent" --color "#FF0000"',
    '<%= config.bin %> labels create "Support" --color "#0000FF" --description "Support tickets"',
    '<%= config.bin %> labels create "VIP" --json',
  ];

  static args = {
    name: Args.string({
      description: "Label name",
      required: true,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    color: Flags.string({
      char: "c",
      description: "Label color (hex, e.g. #FF0000)",
    }),
    description: Flags.string({
      char: "d",
      description: "Label description",
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(LabelsCreate);

    const spin = spinner("Creating label...");
    spin.start();

    try {
      const body: Record<string, unknown> = { name: args.name };
      if (flags.color) body.color = flags.color;
      if (flags.description) body.description = flags.description;

      const response = await apiClient.post<LabelResponse>(
        "/api/v1/labels",
        body,
      );

      spin.stop();

      if (isJsonMode()) {
        json(response);
        return;
      }

      success("Label created", {
        ID: response.id,
        Name: response.name,
        Color: response.color,
      });
    } catch (err) {
      spin.stop();
      throw err;
    }
  }
}
