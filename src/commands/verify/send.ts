import { Flags } from "@oclif/core";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient, ApiError } from "../../lib/api-client.js";
import {
  success,
  error,
  json,
  colors,
  spinner,
  isJsonMode,
} from "../../lib/output.js";

interface VerifyResponse {
  id: string;
  status: string;
  phone: string;
  expires_at: string;
  sandbox: boolean;
  sandbox_code?: string;
  message?: string;
}

export default class VerifySend extends AuthenticatedCommand {
  static description = "Send an OTP verification code";

  static examples = [
    '<%= config.bin %> verify send --to "+1234567890"',
    '<%= config.bin %> verify send --to "+1234567890" --app-name "MyApp"',
    '<%= config.bin %> verify send --to "+1234567890" --template tpl_preset_2fa',
    '<%= config.bin %> verify send --to "+1234567890" --profile vp_xxx',
    '<%= config.bin %> verify send --to "+1234567890" --code-length 8 --timeout 120',
  ];

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    to: Flags.string({
      char: "t",
      description: "Recipient phone number (E.164 format)",
      required: true,
    }),
    "app-name": Flags.string({
      char: "a",
      description: "App name shown in message (defaults to your business name)",
    }),
    template: Flags.string({
      description: "Template ID to use (defaults to tpl_preset_otp)",
    }),
    profile: Flags.string({
      char: "p",
      description: "Verify profile ID for preconfigured settings",
    }),
    "code-length": Flags.integer({
      description: "Length of OTP code (4-10, default: 6)",
    }),
    timeout: Flags.integer({
      description: "Code validity in seconds (60-3600, default: 300)",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(VerifySend);

    const sendSpinner = spinner("Sending verification code...");

    if (!isJsonMode()) {
      sendSpinner.start();
    }

    try {
      const response = await apiClient.post<VerifyResponse>("/api/v1/verify", {
        to: flags.to,
        ...(flags["app-name"] && { app_name: flags["app-name"] }),
        ...(flags.template && { template_id: flags.template }),
        ...(flags.profile && { profile_id: flags.profile }),
        ...(flags["code-length"] && { code_length: flags["code-length"] }),
        ...(flags.timeout && { timeout_secs: flags.timeout }),
      });

      sendSpinner.stop();

      if (isJsonMode()) {
        json(response);
        return;
      }

      if (response.sandbox) {
        success("Verification sent (Sandbox)", {
          "Verification ID": colors.code(response.id),
          Phone: response.phone,
          "Sandbox Code": colors.success(response.sandbox_code || ""),
          "Expires At": new Date(response.expires_at).toLocaleString(),
          "": "",
          Note: colors.dim(
            "Sandbox mode: SMS not sent. Use sandbox code to verify.",
          ),
        });
        console.log();
        console.log(
          colors.dim(
            `Check with: ${colors.code(`sendly verify check ${response.id} --code ${response.sandbox_code}`)}`,
          ),
        );
      } else {
        success("Verification sent", {
          "Verification ID": colors.code(response.id),
          Phone: response.phone,
          "Expires At": new Date(response.expires_at).toLocaleString(),
        });
        console.log();
        console.log(
          colors.dim(
            `Check with: ${colors.code(`sendly verify check ${response.id} --code <code>`)}`,
          ),
        );
      }
    } catch (err: any) {
      sendSpinner.stop();

      const code = err instanceof ApiError ? err.body?.error : undefined;

      if (code === "insufficient_credits") {
        error("Insufficient credits", {
          code,
          hint: `Run ${colors.code("sendly credits balance")} to check your balance`,
        });
      } else if (code === "verification_required") {
        error("Business verification required", {
          code,
          hint: "Complete verification at https://sendly.live/verify",
        });
      } else if (code === "invalid_phone_format") {
        error("Invalid phone number format", {
          code,
          hint: "Use E.164 format: +1234567890",
        });
      } else {
        throw err;
      }
      this.exit(1);
    }
  }
}
