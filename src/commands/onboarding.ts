import { Command } from "@oclif/core";
import { isAuthenticated } from "../lib/config.js";
import { offerQuickStart, shouldOfferQuickStart } from "../lib/onboarding.js";
import { info, error } from "../lib/output.js";

export default class Onboarding extends Command {
  static override description = "Interactive onboarding for new users";

  static override examples = [
    "$ sendly onboarding",
    "$ sendly onboarding --help",
  ];

  static override flags = {};

  async run(): Promise<void> {
    try {
      // Check authentication first
      if (!(await isAuthenticated())) {
        error("Please authenticate first with: sendly login");
        this.exit(1);
      }

      // Check if user should be offered quick-start
      const shouldOffer = await shouldOfferQuickStart();
      
      if (!shouldOffer) {
        info("Your account is already set up! Use 'sendly --help' to see available commands.");
        return;
      }

      // Run the interactive onboarding
      const completed = await offerQuickStart();
      
      if (completed) {
        console.log();
        info("Onboarding completed! You're ready to start sending SMS messages.");
      }
    } catch (error_) {
      error(error_ instanceof Error ? error_.message : "Onboarding failed");
      this.exit(1);
    }
  }
}