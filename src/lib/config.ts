/**
 * CLI Configuration Management
 * Stores user preferences and credentials in ~/.sendly/
 *
 * Environment Variables (take precedence over config file):
 * - SENDLY_API_KEY: API key for authentication
 * - SENDLY_BASE_URL: Custom API endpoint (alias: SENDLY_API_URL)
 * - SENDLY_OUTPUT_FORMAT: Default output format (human/json)
 * - SENDLY_NO_COLOR: Disable colored output (any value)
 * - SENDLY_TIMEOUT: Request timeout in ms (default: 30000)
 * - SENDLY_MAX_RETRIES: Max retry attempts (default: 3)
 * - SENDLY_ORG_ID: Override active organization ID
 * - SENDLY_CONFIG_KEY: Custom encryption key (for CI/CD)
 * - CI: Auto-detect CI mode (disables interactive prompts)
 */

import Conf from "conf";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as crypto from "node:crypto";

export interface SendlyConfig {
  // Authentication
  apiKey?: string;
  accessToken?: string;
  refreshToken?: string;
  tokenExpiresAt?: number;
  userId?: string;
  email?: string;

  // Environment
  environment: "test" | "live";
  baseUrl: string;

  // Preferences
  defaultFormat: "human" | "json";
  colorEnabled: boolean;

  // Network
  timeout: number;
  maxRetries: number;

  // Organization
  currentOrgId?: string;
  currentOrgName?: string;
  currentOrgSlug?: string;
}

/**
 * Check if running in CI environment
 */
export function isCI(): boolean {
  return !!(
    process.env.CI ||
    process.env.CONTINUOUS_INTEGRATION ||
    process.env.GITHUB_ACTIONS ||
    process.env.GITLAB_CI ||
    process.env.CIRCLECI ||
    process.env.TRAVIS ||
    process.env.BUILDKITE
  );
}

/**
 * Check if color output is disabled
 */
export function isColorDisabled(): boolean {
  return !!(
    process.env.SENDLY_NO_COLOR ||
    process.env.NO_COLOR ||
    process.env.TERM === "dumb"
  );
}

const CONFIG_DIR = path.join(os.homedir(), ".sendly");
const CONFIG_FILE = "config.json";

// Old default key - used for migration only
const OLD_DEFAULT_KEY = "sendly-cli-default-key-v1";

/**
 * Derive a machine-specific encryption key.
 * This ensures each installation has a unique key that can't be easily guessed.
 *
 * The key is derived from machine-specific identifiers that are:
 * - Unique per machine
 * - Stable across sessions
 * - Not publicly known
 */
function deriveEncryptionKey(): string {
  const machineId = [os.hostname(), os.userInfo().username, os.homedir()].join(
    ":",
  );

  return crypto
    .createHash("sha256")
    .update(`sendly:${machineId}:v2`)
    .digest("hex");
}

/**
 * Get the encryption key to use for config.
 * Priority: SENDLY_CONFIG_KEY env var > machine-derived key
 */
function getEncryptionKey(): string {
  // Explicit key takes precedence (for CI/CD, testing, advanced users)
  if (process.env.SENDLY_CONFIG_KEY) {
    return process.env.SENDLY_CONFIG_KEY;
  }
  return deriveEncryptionKey();
}

// Ensure config directory exists with secure permissions
if (!fs.existsSync(CONFIG_DIR)) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
}

/**
 * The API host used when nothing else is configured.
 */
export const PRODUCTION_BASE_URL = "https://sendly.live";

const DEFAULT_CONFIG: SendlyConfig = {
  environment: "test",
  baseUrl: PRODUCTION_BASE_URL,
  defaultFormat: "human",
  colorEnabled: true,
  timeout: 30000,
  maxRetries: 3,
};

/**
 * Initialize config with automatic migration from old encryption key.
 * This ensures existing users don't lose their credentials.
 */
function initializeConfig(): Conf<SendlyConfig> {
  const newKey = getEncryptionKey();

  // Try to initialize with new key first
  try {
    const newConfig = new Conf<SendlyConfig>({
      projectName: "sendly",
      cwd: CONFIG_DIR,
      configName: "config",
      defaults: DEFAULT_CONFIG,
      encryptionKey: newKey,
    });

    // Try to read a value to verify decryption works
    newConfig.get("environment");
    return newConfig;
  } catch {
    // New key didn't work - try migration from old key
  }

  // Migration: Try to read with old default key
  try {
    const oldConfig = new Conf<SendlyConfig>({
      projectName: "sendly",
      cwd: CONFIG_DIR,
      configName: "config",
      defaults: DEFAULT_CONFIG,
      encryptionKey: OLD_DEFAULT_KEY,
    });

    // Read all data with old key
    const oldData = { ...oldConfig.store };
    const hasData = Object.keys(oldData).some(
      (k) =>
        !Object.keys(DEFAULT_CONFIG).includes(k) ||
        oldData[k as keyof SendlyConfig] !==
          DEFAULT_CONFIG[k as keyof SendlyConfig],
    );

    if (hasData) {
      // Clear old config file
      oldConfig.clear();

      // Create new config with new key
      const newConfig = new Conf<SendlyConfig>({
        projectName: "sendly",
        cwd: CONFIG_DIR,
        configName: "config",
        defaults: DEFAULT_CONFIG,
        encryptionKey: newKey,
      });

      // Restore data with new encryption
      for (const [key, value] of Object.entries(oldData)) {
        if (value !== undefined) {
          newConfig.set(key as keyof SendlyConfig, value);
        }
      }

      return newConfig;
    }
  } catch {
    // Old key also didn't work - corrupted or fresh install
  }

  // Fresh install or corrupted. If a config file exists at this point,
  // both the new key and the old key failed to decrypt it — that means
  // the file was written by a different machine, encrypted with a
  // SENDLY_CONFIG_KEY that no longer matches, or got corrupted.
  // Constructing a new Conf{} here would just re-read the same file and
  // throw the same SyntaxError. Move it aside so the user keeps a copy
  // (in case they recover the key later) and start clean.
  const filePath = path.join(CONFIG_DIR, CONFIG_FILE);
  if (fs.existsSync(filePath)) {
    try {
      const backupPath = `${filePath}.corrupt.${Date.now()}`;
      fs.renameSync(filePath, backupPath);
      // Stay quiet by default — most callers run early in the process
      // before output helpers are wired. A debug breadcrumb is enough.
      if (process.env.DEBUG) {
        process.stderr.write(
          `[sendly] Could not decrypt ${filePath}; moved to ${backupPath} and starting fresh. Run 'sendly login' to re-authenticate.\n`,
        );
      }
    } catch {
      // If we can't move the file (permissions, FS issue), our best
      // remaining option is to delete it — losing it is strictly better
      // than crashing every command.
      try {
        fs.unlinkSync(filePath);
      } catch {
        // Give up silently and let Conf throw if it must.
      }
    }
  }

  return new Conf<SendlyConfig>({
    projectName: "sendly",
    cwd: CONFIG_DIR,
    configName: "config",
    defaults: DEFAULT_CONFIG,
    encryptionKey: newKey,
  });
}

const config = initializeConfig();

/**
 * Normalize a base URL supplied through the environment (or a flag): trim
 * surrounding whitespace and drop trailing slashes so callers can append a
 * path directly. Empty and whitespace-only values count as "not set".
 */
function normalizeBaseUrl(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed.replace(/\/+$/, "") || trimmed;
}

/**
 * True for hosts whose traffic never leaves the machine: `localhost` and any
 * `*.localhost` name, the 127.0.0.0/8 block, and IPv6 `::1`.
 */
function isLoopbackHost(hostname: string): boolean {
  const host = hostname.replace(/^\[/, "").replace(/\]$/, "").toLowerCase();
  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "::1" ||
    /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)
  );
}

/**
 * True for the production API host, or one of its subdomains, over TLS.
 */
function isProductionHost(parsed: URL): boolean {
  if (parsed.protocol !== "https:") return false;
  const production = new URL(PRODUCTION_BASE_URL).hostname.toLowerCase();
  const host = parsed.hostname.toLowerCase();
  return host === production || host.endsWith(`.${production}`);
}

/**
 * The kind of credential a request would carry, using the same rule as
 * getAuthInfo(): a key is "test" only when it carries the `sk_test_` prefix.
 * Stored session tokens count as live because they authorize the real account.
 */
function activeCredentialKind(): "live" | "test" | "none" {
  const token = getAuthToken();
  if (!token) return "none";
  return token.startsWith("sk_test_") ? "test" : "live";
}

/**
 * Check a base URL supplied for this run (a flag or an environment variable)
 * and return why it is unusable, or undefined when it is fine.
 *
 * A supplied value must be an `http://` or `https://` origin with no path,
 * query or fragment — the CLI appends the API path itself, so a path here
 * would be duplicated into `/api/v1/api/v1/...`.
 *
 * It must also be a host the CLI is willing to hand credentials to. The
 * production host over TLS and loopback addresses always qualify. Anywhere
 * else, a live API key or a stored session token is refused outright, and a
 * test key still requires TLS. The stored `baseUrl` in the config file is not
 * subject to this check: it is written by an explicit local command rather
 * than picked up from the ambient environment.
 */
function checkSuppliedBaseUrl(value: string, source: string): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return `${source} is not a valid URL: "${value}". Use a full origin, e.g. https://sendly.live`;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return `${source} must be an http:// or https:// URL: "${value}". Use a full origin, e.g. http://localhost:5001`;
  }

  if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
    return `${source} must be an origin with no path: "${value}". The CLI appends the API path itself, so use "${parsed.origin}"`;
  }

  if (isProductionHost(parsed) || isLoopbackHost(parsed.hostname)) {
    return undefined;
  }

  if (activeCredentialKind() === "live") {
    return `${source} points at ${parsed.origin}, but a live credential is in use. Refusing to send a live API key to any host other than ${PRODUCTION_BASE_URL} or a loopback address. Use a test key (sk_test_...) or point ${source} at http://localhost:PORT`;
  }

  if (parsed.protocol !== "https:") {
    return `${source} must use https:// for a host other than localhost: "${value}". Refusing to send credentials over cleartext http`;
  }

  return undefined;
}

/**
 * The outcome of resolving the API host.
 */
export interface BaseUrlResolution {
  /**
   * The value in effect. When `error` is set this is the rejected value, kept
   * so it can be shown back to the user; it must not be used for a request.
   */
  url: string;
  /** Where the value came from, phrased for use in a message. */
  source: string;
  /** Why the value cannot be used, when it cannot. */
  error?: string;
}

/**
 * Resolve the API host without throwing.
 *
 * Resolution order, highest priority first:
 *   1. `override` - an explicit per-command value. No command exposes a
 *      base-URL flag today; this parameter is where one would feed in.
 *   2. `SENDLY_BASE_URL` environment variable.
 *   3. `SENDLY_API_URL` environment variable (older documented spelling).
 *   4. `baseUrl` in the config file (`sendly config set baseUrl ...`).
 *   5. `PRODUCTION_BASE_URL`.
 *
 * This mirrors how the API key resolves in getAuthToken(): the environment
 * wins over stored config, and an empty variable counts as unset. Values from
 * the environment or a flag are normalized and checked; the stored config
 * value is returned exactly as written so existing installs are untouched.
 *
 * Read-only callers (`config list`, `whoami`, `doctor`) use this so a bad
 * value cannot break a command that never opens a socket. Anything that is
 * about to make a request uses resolveBaseUrl() instead.
 *
 * Note that SENDLY_API_BASE is deliberately not consulted: elsewhere in the
 * tooling that name carries a version-suffixed base (`.../api/v1`), and the
 * CLI appends the version itself.
 */
export function resolveBaseUrlSafe(override?: string): BaseUrlResolution {
  const supplied: [string, string | undefined][] = [
    ["The --base-url value", override],
    ["SENDLY_BASE_URL", process.env.SENDLY_BASE_URL],
    ["SENDLY_API_URL", process.env.SENDLY_API_URL],
  ];

  for (const [source, raw] of supplied) {
    const url = normalizeBaseUrl(raw);
    if (!url) continue;
    const error = checkSuppliedBaseUrl(url, source);
    return error ? { url, source, error } : { url, source };
  }

  const stored = config.get("baseUrl");
  return stored
    ? { url: stored, source: "the config file" }
    : { url: PRODUCTION_BASE_URL, source: "the built-in default" };
}

/**
 * Resolve the API host for a request, throwing when the resolved value is not
 * one the CLI will send credentials to. Callers that only display the host
 * should use resolveBaseUrlSafe().
 */
export function resolveBaseUrl(override?: string): string {
  const resolved = resolveBaseUrlSafe(override);
  if (resolved.error) throw new Error(resolved.error);
  return resolved.url;
}

/**
 * Get effective config value with environment variable override
 * Priority: env var > config file > default
 */
export function getEffectiveValue<K extends keyof SendlyConfig>(
  key: K,
): SendlyConfig[K] {
  // Environment variable overrides
  switch (key) {
    case "apiKey":
      if (process.env.SENDLY_API_KEY) {
        return process.env.SENDLY_API_KEY as SendlyConfig[K];
      }
      break;
    case "baseUrl":
      return resolveBaseUrlSafe().url as SendlyConfig[K];
    case "defaultFormat":
      if (process.env.SENDLY_OUTPUT_FORMAT) {
        const format = process.env.SENDLY_OUTPUT_FORMAT.toLowerCase();
        if (format === "json" || format === "human") {
          return format as SendlyConfig[K];
        }
      }
      break;
    case "colorEnabled":
      if (isColorDisabled()) {
        return false as SendlyConfig[K];
      }
      break;
    case "timeout":
      if (process.env.SENDLY_TIMEOUT) {
        const timeout = parseInt(process.env.SENDLY_TIMEOUT, 10);
        if (!isNaN(timeout) && timeout > 0) {
          return timeout as SendlyConfig[K];
        }
      }
      break;
    case "maxRetries":
      if (process.env.SENDLY_MAX_RETRIES) {
        const retries = parseInt(process.env.SENDLY_MAX_RETRIES, 10);
        if (!isNaN(retries) && retries >= 0) {
          return retries as SendlyConfig[K];
        }
      }
      break;
    case "currentOrgId":
      if (process.env.SENDLY_ORG_ID) {
        return process.env.SENDLY_ORG_ID as SendlyConfig[K];
      }
      break;
  }

  // Fall back to config file value
  return config.get(key);
}

export function getConfig(): SendlyConfig {
  return config.store;
}

export function setConfig<K extends keyof SendlyConfig>(
  key: K,
  value: SendlyConfig[K],
): void {
  config.set(key, value);
}

export function getConfigValue<K extends keyof SendlyConfig>(
  key: K,
): SendlyConfig[K] {
  return config.get(key);
}

export function clearConfig(): void {
  config.clear();
}

export function clearAuth(): void {
  config.delete("apiKey");
  config.delete("accessToken");
  config.delete("refreshToken");
  config.delete("tokenExpiresAt");
  config.delete("userId");
  config.delete("email");
}

export function isAuthenticated(): boolean {
  // Check env var first
  if (process.env.SENDLY_API_KEY) return true;

  const apiKey = config.get("apiKey");
  const accessToken = config.get("accessToken");
  return !!(apiKey || accessToken);
}

export function getAuthToken(): string | undefined {
  // Environment variable takes highest precedence
  if (process.env.SENDLY_API_KEY) {
    return process.env.SENDLY_API_KEY;
  }

  // Then stored API key
  const apiKey = config.get("apiKey");
  if (apiKey) return apiKey;

  // Finally, access token (if not expired)
  const accessToken = config.get("accessToken");
  const expiresAt = config.get("tokenExpiresAt");

  if (accessToken && expiresAt && Date.now() < expiresAt) {
    return accessToken;
  }

  return undefined;
}

export function getStoredAccessToken(): string | undefined {
  return config.get("accessToken") || undefined;
}

export function setApiKey(apiKey: string): void {
  // Validate API key format
  if (!/^sk_(test|live)_v1_[a-zA-Z0-9_-]+$/.test(apiKey)) {
    throw new Error(
      "Invalid API key format. Expected sk_test_v1_xxx or sk_live_v1_xxx",
    );
  }

  config.set("apiKey", apiKey);

  // Set environment based on key type
  if (apiKey.startsWith("sk_test_")) {
    config.set("environment", "test");
  } else {
    config.set("environment", "live");
  }
}

export function setAuthTokens(
  accessToken: string,
  refreshToken: string,
  expiresIn: number,
  userId: string,
  email: string,
): void {
  config.set("accessToken", accessToken);
  config.set("refreshToken", refreshToken);
  config.set("tokenExpiresAt", Date.now() + expiresIn * 1000);
  config.set("userId", userId);
  config.set("email", email);
}

export function getConfigPath(): string {
  return path.join(CONFIG_DIR, CONFIG_FILE);
}

export function getConfigDir(): string {
  return CONFIG_DIR;
}

export function setCurrentOrg(id: string, name: string, slug?: string): void {
  config.set("currentOrgId", id);
  config.set("currentOrgName", name);
  if (slug) config.set("currentOrgSlug", slug);
}

export function getCurrentOrg(): {
  id: string;
  name: string;
  slug?: string;
} | null {
  const id = getEffectiveValue("currentOrgId");
  const name = config.get("currentOrgName");
  if (!id) return null;
  return { id, name: name || id, slug: config.get("currentOrgSlug") };
}

export function clearCurrentOrg(): void {
  config.delete("currentOrgId");
  config.delete("currentOrgName");
  config.delete("currentOrgSlug");
}

export { config };
