import { Args } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import { success, json, colors, spinner, isJsonMode } from "../../lib/output.js";

interface StatusResponse {
  id: string;
  status: string;
  phone: string;
  delivery_status: string;
  attempts: number;
  max_attempts: number;
  expires_at: string;
  verified_at: string | null;
  created_at: string;
  sandbox: boolean;
  app_name?: string;
  template_id?: string;
  profile_id?: string;
}

export default class VerifyStatus extends AuthenticatedCommand {
  static description = "Get verification status";

  static examples = [
    "<%= config.bin %> verify status ver_xxx",
    "<%= config.bin %> verify status ver_xxx --json",
  ];

  static args = {
    id: Args.string({
      description: "Verification ID",
      required: true,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
  };

  async run(): Promise<void> {
    const { args } = await this.parse(VerifyStatus);

    const statusSpinner = spinner("Fetching verification status...");

    if (!isJsonMode()) {
      statusSpinner.start();
    }

    try {
      const response = await apiClient.get<StatusResponse>(
        `/api/v1/verify/${args.id}`,
      );

      statusSpinner.stop();

      if (isJsonMode()) {
        json(response);
        return;
      }

      const statusColor =
        response.status === "verified"
          ? colors.success
          : response.status === "pending"
            ? colors.primary
            : colors.error;

      success("Verification status", {
        "Verification ID": colors.code(response.id),
        Phone: response.phone,
        Status: statusColor(response.status),
        "Delivery Status": response.delivery_status,
        Attempts: `${response.attempts}/${response.max_attempts}`,
        "Expires At": new Date(response.expires_at).toLocaleString(),
        ...(response.verified_at && {
          "Verified At": new Date(response.verified_at).toLocaleString(),
        }),
        Sandbox: response.sandbox ? colors.dim("yes") : "no",
      });
    } catch (err: any) {
      statusSpinner.stop();
      throw err;
    }
  }
}
