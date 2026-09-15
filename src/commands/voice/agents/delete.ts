import { Args, Flags } from "@oclif/core";
import inquirer from "inquirer";
import { AuthenticatedCommand } from "../../../lib/base-command.js";
import { apiClient } from "../../../lib/api-client.js";
import {
  success,
  error,
  info,
  spinner,
  colors,
  json,
  isJsonMode,
} from "../../../lib/output.js";
import {
  AGENT_ROLE_HINT,
  reportVoiceError,
  voiceAgentPath,
  type DeletedVoiceAgent,
} from "../../../lib/voice.js";

export default class VoiceAgentsDelete extends AuthenticatedCommand {
  static description =
    "Delete an AI agent and revoke its sending key. Refused while the agent answers a number: point those numbers elsewhere first. Needs a live API key with calls:write (owner or admin in a team workspace)";

  static examples = [
    "<%= config.bin %> voice agents delete 3c4d5e6f-7081-4293-a4b5-c6d7e8f90a1b",
    "<%= config.bin %> voice agents delete 3c4d5e6f-7081-4293-a4b5-c6d7e8f90a1b --yes",
    "<%= config.bin %> voice agents delete 3c4d5e6f-7081-4293-a4b5-c6d7e8f90a1b --json",
  ];

  static args = {
    id: Args.string({
      description: "Agent ID",
      required: true,
    }),
  };

  static flags = {
    ...AuthenticatedCommand.baseFlags,
    yes: Flags.boolean({
      char: "y",
      description: "Skip confirmation prompt",
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(VoiceAgentsDelete);

    const id = args.id.trim();
    if (!id) {
      error("Pass an agent id", {
        hint: "List your agents with `sendly voice agents list`",
      });
      this.exit(1);
    }

    if (!flags.yes && !isJsonMode() && process.stdin.isTTY) {
      const { confirm } = await inquirer.prompt([
        {
          type: "confirm",
          name: "confirm",
          message: `Delete agent ${colors.code(id)}? Its sending key is revoked and this cannot be undone.`,
          default: false,
        },
      ]);
      if (!confirm) {
        info("Delete cancelled");
        return;
      }
    }

    const deleteSpinner = spinner("Deleting agent...");
    if (!isJsonMode()) {
      deleteSpinner.start();
    }

    let response: DeletedVoiceAgent;
    try {
      response = await apiClient.delete<DeletedVoiceAgent>(voiceAgentPath(id));
      deleteSpinner.stop();
    } catch (err) {
      deleteSpinner.stop();
      if (
        reportVoiceError(err, { agentId: id, forbiddenHint: AGENT_ROLE_HINT })
      ) {
        this.exit(1);
      }
      throw err;
    }

    if (isJsonMode()) {
      json(response);
      return;
    }

    success("Agent deleted", {
      id: colors.code(response.id),
    });
  }
}
