/**
 * Base Command class for all Sendly CLI commands
 * Provides common functionality and flags
 */

import { Command, Flags } from "@oclif/core";
import { setOutputFormat, setQuietMode, error } from "./output.js";
import { isAuthenticated } from "./config.js";
import {
  ApiError,
  AuthenticationError,
  ApiKeyRequiredError,
  RateLimitError,
  InsufficientCreditsError,
  NotFoundError,
  ValidationError,
} from "./api-client.js";

export abstract class BaseCommand extends Command {
  static baseFlags = {
    json: Flags.boolean({
      description: "Output in JSON format",
      default: false,
    }),
    quiet: Flags.boolean({
      char: "q",
      description: "Minimal output",
      default: false,
    }),
  };

  protected async init(): Promise<void> {
    await super.init();
    const { flags } = await this.parse(this.constructor as typeof BaseCommand);

    if (flags.json) {
      setOutputFormat("json");
    }
    if (flags.quiet) {
      setQuietMode(true);
    }
  }

  protected async catch(err: Error): Promise<void> {
    if (err instanceof ApiKeyRequiredError) {
      error(err.message, {
        hint: err.hint,
      });
      this.exit(1);
    }

    if (err instanceof AuthenticationError) {
      error(err.message, {
        hint: err.hint,
      });
      this.exit(1);
    }

    if (err instanceof RateLimitError) {
      error(err.message, {
        "Retry after": `${err.retryAfter} seconds`,
        hint: err.hint,
      });
      this.exit(1);
    }

    if (err instanceof InsufficientCreditsError) {
      error(err.message, {
        hint: err.hint,
      });
      this.exit(1);
    }

    if (err instanceof NotFoundError) {
      error(err.message, {
        hint: err.hint,
      });
      this.exit(1);
    }

    if (err instanceof ValidationError) {
      error(err.message, {
        hint: err.hint,
        ...(err.details || {}),
      });
      this.exit(1);
    }

    if (err instanceof ApiError) {
      error(err.message, {
        code: err.code,
        ...(err.hint && { hint: err.hint }),
        ...(err.details || {}),
      });
      this.exit(1);
    }

    error(err.message);
    this.exit(1);
  }

  protected requireAuth(): void {
    if (!isAuthenticated()) {
      throw new AuthenticationError();
    }
  }
}

export abstract class AuthenticatedCommand extends BaseCommand {
  protected async init(): Promise<void> {
    await super.init();
    this.requireAuth();
  }
}
