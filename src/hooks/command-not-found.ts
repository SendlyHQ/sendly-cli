import { Hook } from "@oclif/core";
import { colors } from "../lib/output.js";

// Curated intent-based redirects (map what people mean, not just spelling).
const TYPO_MAP: Record<string, string> = {
  "text": "send",
  "txt": "send",
  "msg": "send",
  "message": "sms send",
  "messages": "sms list",
  "balance": "credits balance",
  "credit": "credits balance",
  "key": "keys list",
  "apikey": "keys list",
  "apikeys": "keys list",
  "webhook": "webhooks list",
  "hook": "webhooks list",
  "hooks": "webhooks list",
  "log": "logs tail",
  "tail": "logs tail",
  "auth": "login",
  "signin": "login",
  "signout": "logout",
  "me": "whoami",
  "info": "status",
  "dashboard": "status",
  "account": "status",
  "check": "doctor",
  "test": "doctor",
  "setup": "onboarding",
  "init": "onboarding",
  "start": "onboarding",
  "pricing": "countries",
  "prices": "countries",
  "numbers countries": "countries",
  "numbers pricing": "countries",
};

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1,
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Find similar commands based on Levenshtein distance
 */
function findSimilarCommands(
  input: string,
  known: string[],
  maxDistance = 3,
): string[] {
  const inputLower = input.toLowerCase();
  const suggestions: Array<{ command: string; distance: number }> = [];

  for (const command of known) {
    const distance = levenshteinDistance(inputLower, command.toLowerCase());
    if (distance <= maxDistance) {
      suggestions.push({ command, distance });
    }
  }

  return suggestions
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3)
    .map((s) => s.command);
}

const hook: Hook<"command_not_found"> = async function (options) {
  // oclif joins topic + subcommand with a colon internally; normalize to the
  // space-separated form users actually type.
  const inputCommand = options.id.replace(/:/g, " ");

  // Derive the command + topic lists from the loaded manifest so suggestions and
  // the fallback topic list can never drift from what actually ships.
  const known = this.config.commands
    .filter((c) => !c.hidden)
    .map((c) => c.id.replace(/:/g, " "))
    .filter(Boolean);
  const topics = this.config.topics
    .filter((t) => !t.hidden && !t.name.includes(" ") && !t.name.includes(":"))
    .sort((a, b) => a.name.localeCompare(b.name));

  console.log();
  console.log(colors.error(`Command not found: ${colors.code(inputCommand)}`));
  console.log();

  const typoFix = TYPO_MAP[inputCommand.toLowerCase()];
  if (typoFix) {
    console.log(colors.dim("Did you mean?"));
    console.log(`  ${colors.code(`sendly ${typoFix}`)}`);
    console.log();
  } else {
    const similar = findSimilarCommands(inputCommand, known);
    if (similar.length > 0) {
      console.log(colors.dim("Did you mean?"));
      similar.forEach((cmd) => {
        console.log(`  ${colors.code(`sendly ${cmd}`)}`);
      });
      console.log();
    } else {
      if (topics.length > 0) {
        console.log(colors.dim("Topics:"));
        const width = Math.max(...topics.map((t) => t.name.length), 8);
        for (const t of topics) {
          const desc = (t.description || "").split("\n")[0];
          console.log(
            `  ${colors.code(t.name.padEnd(width))}  ${colors.dim(desc)}`,
          );
        }
        console.log();
      }
      console.log(`Run ${colors.code("sendly --help")} for all commands.`);
      console.log();
    }
  }

  // An unknown command is an error: exit non-zero so a typo in a CI/deploy
  // script fails loudly instead of silently going green. this.exit() is the
  // oclif-honored mechanism (process.exitCode alone gets overridden to 0).
  this.exit(127);
};

export default hook;
