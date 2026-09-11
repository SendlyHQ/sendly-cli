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

interface ResendResponse {
  id: string;
  status: string;
  phone: string;
  expires_at: string;
  sandbox: boolean;
  sandbox_code?: string;
  message?: string;
}

export default class VerifyResend extends AuthenticatedCommand {
  static description = "Resend an OTP verification code";

  static examples = [
    "<%= config.bin %> verify resend ver_xxx",
    "<%= config.bin %> verify resend ver_xxx --json",
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
    const { args } = await this.parse(VerifyResend);

    const resendSpinner = spinner("Resending verification code...");

    if (!isJsonMode()) {
      resendSpinner.start();
    }

    try {
      const response = await apiClient.post<ResendResponse>(
        `/api/v1/verify/${encodeURIComponent(args.id)}/resend`,
        {},
      );

      resendSpinner.stop();

      if (isJsonMode()) {
        json(response);
        return;
      }

      if (response.sandbox) {
        success("Verification resent (Sandbox)", {
          "Verification ID": colors.code(response.id),
          Phone: response.phone,
          "Sandbox Code": colors.success(response.sandbox_code || ""),
          "Expires At": new Date(response.expires_at).toLocaleString(),
        });
      } else {
        success("Verification resent", {
          "Verification ID": colors.code(response.id),
          Phone: response.phone,
          "Expires At": new Date(response.expires_at).toLocaleString(),
        });
      }
    } catch (err: any) {
      resendSpinner.stop();

      if (err.message?.includes("already_verified")) {
        error("Verification already completed", {
          hint: "This phone number has already been verified",
        });
      } else if (err.message?.includes("expired")) {
        error("Verification expired", {
          hint: "Request a new verification instead",
        });
      } else if (err.message?.includes("max_resends")) {
        error("Maximum resends exceeded", {
          hint: "Request a new verification instead",
        });
      } else if (err.message?.includes("not_found")) {
        error("Verification not found", {
          hint: "Check the verification ID is correct",
        });
      } else if (err.message?.includes("rate_limit")) {
        error("Too many resend requests", {
          hint: "Wait a moment before trying again",
        });
      } else {
        throw err;
      }
      this.exit(1);
    }
  }
}
