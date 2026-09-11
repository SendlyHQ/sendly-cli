import { Flags, Args } from "@oclif/core";
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

interface CheckResponse {
  id: string;
  status: string;
  phone: string;
  verified_at?: string;
  remaining_attempts?: number;
}

export default class VerifyCheck extends AuthenticatedCommand {
  static description = "Verify an OTP code";

  static examples = [
    "<%= config.bin %> verify check ver_xxx --code 123456",
    "<%= config.bin %> verify check ver_xxx -c 123456",
  ];

  static args = {
    id: Args.string({
      description: "Verification ID",
      required: true,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    code: Flags.string({
      char: "c",
      description: "The OTP code to verify",
      required: true,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(VerifyCheck);

    const checkSpinner = spinner("Verifying code...");

    if (!isJsonMode()) {
      checkSpinner.start();
    }

    try {
      const response = await apiClient.post<CheckResponse>(
        `/api/v1/verify/${encodeURIComponent(args.id)}/check`,
        { code: flags.code },
      );

      checkSpinner.stop();

      if (isJsonMode()) {
        json(response);
        return;
      }

      if (response.status === "verified") {
        success("Code verified successfully", {
          "Verification ID": colors.code(response.id),
          Phone: response.phone,
          Status: colors.success("verified"),
          "Verified At": response.verified_at
            ? new Date(response.verified_at).toLocaleString()
            : "now",
        });
      } else {
        error("Verification failed", {
          Status: response.status,
        });
      }
    } catch (err: any) {
      checkSpinner.stop();

      if (err.message?.includes("invalid_code")) {
        const remaining = err.details?.remaining_attempts;
        error("Invalid code", {
          hint: remaining
            ? `${remaining} attempt(s) remaining`
            : "Try again with the correct code",
        });
      } else if (err.message?.includes("expired")) {
        error("Verification expired", {
          hint: "Request a new verification code",
        });
      } else if (err.message?.includes("max_attempts")) {
        error("Maximum attempts exceeded", {
          hint: "Request a new verification code",
        });
      } else if (err.message?.includes("not_found")) {
        error("Verification not found", {
          hint: "Check the verification ID is correct",
        });
      } else {
        throw err;
      }
      this.exit(1);
    }
  }
}
