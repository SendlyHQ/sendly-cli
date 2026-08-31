/**
 * CLI Onboarding utilities
 * Handles quick-start flow for new users
 */

import { apiClient } from "./api-client.js";
import { setApiKey, resolveBaseUrl } from "./config.js";
import { success, info, error, colors, spinner } from "./output.js";
import inquirer from "inquirer";

export interface OnboardingStatus {
  needsOnboarding: boolean;
  onboardingCompleted: boolean;
  cliOnboardingCompleted?: boolean;
  hasApiKeys: boolean;
  hasTestKey: boolean;
  hasLiveKey: boolean;
  hasVerification: boolean;
  recommendedRoute: string;
}

export interface QuickStartResponse {
  success: boolean;
  type: string;
  apiKey: {
    id: string;
    key: string;
    name: string;
    type: "test" | "live";
  };
  message: string;
  testNumbers: Array<{
    number: string;
    behavior: string;
  }>;
  nextSteps: string[];
  warning: string;
}

/**
 * Check if user should be offered CLI quick-start
 */
export async function shouldOfferQuickStart(): Promise<boolean> {
  try {
    const status = await apiClient.get<OnboardingStatus>("/api/onboarding/status");
    
    // Only offer quick-start if user has done NOTHING yet
    return !status.onboardingCompleted && 
           !status.cliOnboardingCompleted && 
           !status.hasApiKeys && 
           !status.hasVerification;
  } catch (err) {
    // If we can't check status, don't offer quick-start
    console.error("Failed to check onboarding status:", err);
    return false;
  }
}

/**
 * Offer CLI quick-start to new users
 */
export async function offerQuickStart(): Promise<boolean> {
  console.log();
  console.log(colors.bold("🎉 Welcome to Sendly!"));
  console.log("Let's get you started with SMS messaging.");
  console.log();

  const { choice } = await inquirer.prompt([
    {
      type: "list",
      name: "choice",
      message: "What would you like to do?",
      choices: [
        {
          name: "🧪 Set up development environment (2 minutes)",
          value: "development",
          short: "Development setup",
        },
        {
          name: "🌍 Set up production messaging (full verification)",
          value: "production", 
          short: "Production setup",
        },
        {
          name: "⏭  Skip for now",
          value: "skip",
          short: "Skip",
        },
      ],
    },
  ]);

  switch (choice) {
    case "development":
      return await runQuickStart();
    case "production":
      return await openProductionOnboarding();
    case "skip":
      info("You can run 'sendly onboarding' anytime to set up your account.");
      return false;
    default:
      return false;
  }
}

/**
 * Run the CLI quick-start flow
 */
async function runQuickStart(): Promise<boolean> {
  const quickStartSpinner = spinner("Creating your development environment...");
  quickStartSpinner.start();

  try {
    const result = await apiClient.post<QuickStartResponse>("/api/cli/quick-start", {
      intent: "development",
    });

    quickStartSpinner.succeed("Development environment created!");

    // Store the API key for immediate use
    setApiKey(result.apiKey.key);

    console.log();
    success("Ready to code! 🚀", {
      "API Key": result.apiKey.name,
      "Environment": colors.warning("test"),
      "Key Type": result.apiKey.type,
    });

    console.log();
    console.log(colors.bold("Test Numbers:"));
    result.testNumbers.forEach(({ number, behavior }) => {
      console.log(`  ${colors.primary(number)} - ${colors.dim(behavior)}`);
    });

    console.log();
    console.log(colors.bold("Next Steps:"));
    result.nextSteps.forEach((step, i) => {
      console.log(`  ${i + 1}. ${step}`);
    });

    console.log();
    console.log(colors.warning("⚠️ " + result.warning));

    return true;
  } catch (err) {
    quickStartSpinner.fail("Failed to create development environment");
    
    if (err instanceof Error) {
      error(err.message);
    } else {
      error("Unknown error occurred during setup");
    }
    
    return false;
  }
}

/**
 * Open browser for production onboarding
 */
async function openProductionOnboarding(): Promise<boolean> {
  try {
    const baseUrl = resolveBaseUrl();
    const onboardingUrl = `${baseUrl}/onboarding`;
    
    console.log();
    console.log(colors.bold("Opening browser for production setup..."));
    console.log(`If it doesn't open automatically, visit: ${colors.primary(onboardingUrl)}`);
    
    const open = (await import("open")).default;
    await open(onboardingUrl);
    
    info("Complete the verification in your browser, then run 'sendly whoami' to check status.");
    return false; // Don't continue CLI flow
  } catch (err) {
    error("Failed to open browser. Please visit https://sendly.live/onboarding manually.");
    return false;
  }
}

/**
 * Check if user needs upgrade from CLI session to API key
 */
export async function checkUpgradeNeeded(missingScopes: string[]): Promise<void> {
  if (missingScopes.includes("sms:send")) {
    console.log();
    console.log(colors.warning("🔒 SMS messaging requires an API key."));
    
    const { upgrade } = await inquirer.prompt([
      {
        type: "confirm",
        name: "upgrade",
        message: "Would you like to set up a development API key now?",
        default: true,
      },
    ]);

    if (upgrade) {
      await runQuickStart();
    } else {
      info("You can run 'sendly onboarding' anytime to set up messaging.");
    }
  }
}