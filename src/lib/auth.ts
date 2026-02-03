/**
 * Authentication utilities for CLI
 * Handles browser-based login flow and API key authentication
 */

import open from "open";
import * as http from "node:http";
import * as crypto from "node:crypto";
import {
  setAuthTokens,
  setApiKey,
  clearAuth,
  getConfigValue,
  isAuthenticated,
  getAuthToken,
} from "./config.js";
import { colors, spinner } from "./output.js";

const USER_CODE_LENGTH = 8;
const POLL_INTERVAL = 2000; // 2 seconds
const MAX_POLL_ATTEMPTS = 150; // 5 minutes max

export interface DeviceCodeResponse {
  deviceCode: string;
  userCode: string;
  verificationUrl: string;
  expiresIn: number;
  interval: number;
}

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  userId: string;
  email: string;
}

/**
 * Generate a long random device code for URL (session identifier)
 * This goes in the URL and identifies which CLI session is waiting
 */
export function generateDeviceCode(): string {
  return crypto.randomBytes(16).toString("hex"); // 32 chars, not guessable
}

/**
 * Generate a short human-readable user code for terminal display
 * This is what the user types to prove they have terminal access
 * Uses characters that are easy to read and type (no 0/O, 1/I/L confusion)
 */
export function generateUserCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Exclude confusing chars
  let code = "";
  const bytes = crypto.randomBytes(USER_CODE_LENGTH);
  for (let i = 0; i < USER_CODE_LENGTH; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return code;
}

/**
 * Start the browser-based login flow
 *
 * Security model:
 * - deviceCode: Long random token in URL, identifies CLI session (not secret)
 * - userCode: Short code shown ONLY in terminal, proves user has terminal access
 *
 * The userCode is NEVER in the URL - this is critical for security.
 * Anyone with the URL can't authorize without also seeing the terminal.
 */
export async function browserLogin(): Promise<TokenResponse> {
  const baseUrl = getConfigValue("baseUrl") || "https://sendly.live";

  // Generate TWO SEPARATE codes for security
  const deviceCode = generateDeviceCode(); // Long random, goes in URL
  const userCode = generateUserCode(); // Short readable, shown in terminal only

  // Request device code registration from server
  const response = await fetch(`${baseUrl}/api/cli/auth/device-code`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceCode, userCode }), // Send both to server
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as {
      message?: string;
    };
    throw new Error(error.message || "Failed to initiate login");
  }

  const data = (await response.json()) as DeviceCodeResponse;

  // Format user code with hyphen for readability (e.g., "ABCD-EFGH")
  const displayUserCode = `${userCode.slice(0, 4)}-${userCode.slice(4)}`;

  // Display instructions to user
  console.log();
  console.log(colors.bold("Login to Sendly"));
  console.log();
  console.log(`Open this URL in your browser:`);
  console.log(colors.primary(`  ${data.verificationUrl}`));
  console.log();
  console.log(`And enter this code:`);
  console.log(colors.bold(colors.primary(`  ${displayUserCode}`)));
  console.log();

  // Try to open browser automatically
  try {
    await open(data.verificationUrl);
    console.log(colors.dim("Browser opened automatically"));
  } catch {
    console.log(colors.dim("Please open the URL manually"));
  }

  console.log();

  // Poll for token
  const spin = spinner("Waiting for authorization...");
  spin.start();

  let attempts = 0;
  while (attempts < MAX_POLL_ATTEMPTS) {
    await sleep(data.interval * 1000 || POLL_INTERVAL);
    attempts++;

    try {
      const tokenResponse = await fetch(`${baseUrl}/api/cli/auth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceCode }),
      });

      if (tokenResponse.ok) {
        const tokens = (await tokenResponse.json()) as TokenResponse;
        spin.succeed("Authorized");

        // Store tokens
        setAuthTokens(
          tokens.accessToken,
          tokens.refreshToken,
          tokens.expiresIn,
          tokens.userId,
          tokens.email,
        );

        // Check if new user needs quick-start (only for CLI sessions)
        if (tokens.accessToken.startsWith("cli_")) {
          const { shouldOfferQuickStart, offerQuickStart } =
            await import("./onboarding.js");

          if (await shouldOfferQuickStart()) {
            await offerQuickStart();
          }
        }

        return tokens;
      }

      const errorData = (await tokenResponse.json().catch(() => ({}))) as {
        error?: string;
      };

      if (errorData.error === "authorization_pending") {
        // Still waiting, continue polling
        continue;
      }

      if (errorData.error === "expired_token") {
        spin.fail("Login request expired");
        process.exit(1);
      }

      if (errorData.error === "access_denied") {
        spin.fail("Login was denied");
        process.exit(1);
      }
    } catch (error) {
      // Network error, continue polling
    }
  }

  spin.fail("Login timed out");
  process.exit(1);
}

/**
 * Login with an API key directly
 */
export async function apiKeyLogin(apiKey: string): Promise<void> {
  const baseUrl = getConfigValue("baseUrl") || "https://sendly.live";

  // Validate the API key with the server
  const response = await fetch(`${baseUrl}/api/cli/auth/verify-key`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as {
      message?: string;
    };
    throw new Error(error.message || "Invalid API key");
  }

  // Store the API key
  setApiKey(apiKey);
}

/**
 * Logout - clear all stored credentials
 */
export function logout(): void {
  clearAuth();
}

/**
 * Check if currently authenticated
 */
export function checkAuth(): boolean {
  return isAuthenticated();
}

/**
 * Get current auth info for display
 */
export async function getAuthInfo(): Promise<{
  authenticated: boolean;
  email?: string;
  userId?: string;
  environment: string;
  keyType?: string;
}> {
  const token = getAuthToken();
  const email = getConfigValue("email");
  const userId = getConfigValue("userId");
  const apiKey = getConfigValue("apiKey");
  const environment = getConfigValue("environment");

  if (!token && !apiKey) {
    return { authenticated: false, environment };
  }

  let keyType: string | undefined;
  if (apiKey) {
    keyType = apiKey.startsWith("sk_test_") ? "test" : "live";
  }

  return {
    authenticated: true,
    email,
    userId,
    environment,
    keyType,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
