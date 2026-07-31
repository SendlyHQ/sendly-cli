import { Help } from "@oclif/core";
import { colors } from "./output.js";

/**
 * Custom root help: prepend a GETTING STARTED block so a first-time user
 * running `sendly --help` has a path from zero to authenticated without
 * leaving the terminal (previously auth guidance lived only in the README
 * and inside `login --help`).
 */
export default class SendlyHelp extends Help {
  protected formatRoot(): string {
    const base = super.formatRoot();
    const gettingStarted = [
      colors.dim("GETTING STARTED"),
      `  1. ${colors.code("sendly login")}            Authenticate in the browser (or set ${colors.code("SENDLY_API_KEY")})`,
      `  2. ${colors.code("sendly onboarding")}       Guided setup: key, sender, first message`,
      `  3. ${colors.code("sendly send +447700900123 \"Hello\"")}   Send your first message`,
      "",
      `  Check your auth anytime with ${colors.code("sendly whoami")}.`,
    ].join("\n");
    return `${base}\n\n${gettingStarted}`;
  }
}
