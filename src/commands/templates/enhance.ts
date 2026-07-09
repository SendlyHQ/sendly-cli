import { Args, Flags } from "@oclif/core";
import * as fs from "node:fs";
import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import {
  success,
  json,
  isJsonMode,
  colors,
  header,
  info,
  error,
} from "../../lib/output.js";

interface EnhanceResponse {
  enhanced: string;
  explanation: string;
}

/**
 * `sendly templates enhance` — AI rewrite a message template for
 * compliance/clarity/conversions.
 *
 * Wraps `POST /api/v1/ai/enhance` (flag-gated behind `ai_classification`
 * on the server — if your account doesn't have the flag, the server
 * returns 404 and this command surfaces it). Accepts text directly via
 * `--text`, from a file via `--file`, or piped on stdin.
 */
export default class TemplatesEnhance extends AuthenticatedCommand {
  static description =
    "AI-enhance a message template for clarity, compliance, and send-readiness. Returns the rewritten text + an explanation.";

  static examples = [
    '<%= config.bin %> templates enhance --text "hey come check out our sale"',
    '<%= config.bin %> templates enhance --file ./draft.txt --message-type marketing',
    '<%= config.bin %> echo "your sale msg" | sendly templates enhance --message-type promotional',
  ];

  static args = {
    text: Args.string({
      description: "Message text to enhance (alternative to --text / --file)",
      required: false,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    text: Flags.string({
      description: "Message text to enhance",
    }),
    file: Flags.string({
      description: "Read message text from a file path",
    }),
    "message-type": Flags.string({
      description:
        "Hint the kind of message (e.g. marketing, transactional, notification) for targeted enhancements",
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(TemplatesEnhance);

    let text: string | undefined = flags.text ?? args.text;
    if (!text && flags.file) {
      text = fs.readFileSync(flags.file, "utf8").trim();
    }
    if (!text && !process.stdin.isTTY) {
      text = await new Promise<string>((resolve) => {
        let buf = "";
        process.stdin.setEncoding("utf8");
        process.stdin.on("data", (c) => (buf += c));
        process.stdin.on("end", () => resolve(buf.trim()));
      });
    }

    if (!text) {
      error(
        "Provide text to enhance via --text, --file, a positional arg, or stdin.",
      );
      this.exit(1);
    }

    const resp = await apiClient.post<EnhanceResponse>(
      "/api/v1/ai/enhance",
      {
        text: text ?? "",
        messageType: flags["message-type"],
      },
    );

    if (isJsonMode()) {
      json(resp);
      return;
    }

    header("Enhanced text");
    console.log("  " + (resp.enhanced || colors.dim("(no change)")));
    if (resp.explanation) {
      console.log();
      info(resp.explanation);
    }
    if (!resp.enhanced || resp.enhanced === text) {
      success("No enhancement suggested — original text looks good.");
    }
  }
}
