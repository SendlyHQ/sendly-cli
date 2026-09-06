/**
 * API Client for Sendly CLI
 * Handles all HTTP requests to the Sendly API
 */

import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import {
  getAuthToken,
  getStoredAccessToken,
  getEffectiveValue,
  resolveBaseUrl,
  setAuthTokens,
} from "./config.js";

// Read version from package.json
const require = createRequire(import.meta.url);
const { version } = require("../../package.json") as { version: string };

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generate an idempotency key for a logical request. Reused across retry
 * attempts so the server can recognize a retry of a POST that actually
 * reached it.
 */
function generateIdempotencyKey(): string {
  return `sendly-cli-retry-${randomUUID()}`;
}

/**
 * Validate and normalize a caller-supplied idempotency key. Empty and
 * whitespace-only values are treated as absent (auto-generation still
 * applies); invalid values fail fast before any network call.
 */
function normalizeIdempotencyKey(key: string | undefined): string | undefined {
  if (key === undefined) return undefined;
  const trimmed = key.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > 255 || !/^[\x20-\x7E]+$/.test(trimmed)) {
    throw new ValidationError(
      "Idempotency key must be 1-255 printable ASCII characters",
    );
  }
  return trimmed;
}

/**
 * True when the error carries an actual 5xx response from the server, as
 * opposed to a network failure where the outcome of the request is unknown.
 */
function isServerErrorResponse(error: unknown): boolean {
  return error instanceof ApiError && error.statusCode >= 500;
}

/**
 * Check if an error is retryable (network errors or 5xx server errors)
 */
function isRetryableError(error: unknown): boolean {
  // Network errors
  if (error instanceof TypeError && error.message.includes("fetch")) {
    return true;
  }
  // Server errors (5xx) are retryable
  if (error instanceof ApiError && error.statusCode >= 500) {
    return true;
  }
  return false;
}

export interface ApiResponse<T> {
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number;
}

export interface ApiFieldError {
  path: string;
  message: string;
}

export class ApiError extends Error {
  public hint?: string;
  public fieldErrors?: ApiFieldError[];

  constructor(
    public code: string,
    message: string,
    public statusCode: number,
    public details?: Record<string, unknown>,
    hint?: string,
  ) {
    super(message);
    this.name = "ApiError";
    this.hint = hint;
  }
}

export class AuthenticationError extends ApiError {
  constructor(
    message: string = "Authentication failed",
    hint: string = "Run 'sendly login' to authenticate, or check your current auth with 'sendly whoami'",
  ) {
    super("authentication_error", message, 401, undefined, hint);
    this.name = "AuthenticationError";
  }
}

export class ApiKeyRequiredError extends ApiError {
  constructor(
    message: string = "API key required for this operation.",
    public hint: string = "Set SENDLY_API_KEY environment variable or create a key with: sendly keys create --type test",
  ) {
    super("api_key_required", message, 401);
    this.name = "ApiKeyRequiredError";
  }
}

export class RateLimitError extends ApiError {
  constructor(
    public retryAfter: number,
    message: string = "Rate limit exceeded",
  ) {
    const hint = `Wait ${retryAfter} seconds before retrying, or upgrade your plan for higher limits`;
    super("rate_limit_exceeded", message, 429, undefined, hint);
    this.name = "RateLimitError";
  }
}

export class InsufficientCreditsError extends ApiError {
  constructor(message: string = "Insufficient credits") {
    const hint =
      "Check your balance with 'sendly credits', or add credits at https://sendly.live/dashboard/billing";
    super("insufficient_credits", message, 402, undefined, hint);
    this.name = "InsufficientCreditsError";
  }
}

export class PaymentMethodRequiredError extends ApiError {
  constructor(message: string = "A payment method is required") {
    const hint =
      "Add a card at https://sendly.live/dashboard/billing, then try again";
    super("payment_method_required", message, 402, undefined, hint);
    this.name = "PaymentMethodRequiredError";
  }
}

export class NotFoundError extends ApiError {
  constructor(
    message: string = "Resource not found",
    hint: string = "Verify the ID is correct, or use a list command to see available resources",
  ) {
    super("not_found", message, 404, undefined, hint);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends ApiError {
  constructor(
    message: string = "Validation failed",
    details?: Record<string, unknown>,
  ) {
    const hint =
      "Check the command help with --help for valid options and formats";
    super("validation_error", message, 400, details, hint);
    this.name = "ValidationError";
  }
}

class ApiClient {
  private rateLimitInfo?: RateLimitInfo;
  private refreshing: Promise<boolean> | null = null;

  private getBaseUrl(): string {
    return resolveBaseUrl();
  }

  private async ensureAuth(): Promise<string> {
    let token = getAuthToken();
    if (token) return token;

    const stored = getStoredAccessToken();
    if (stored?.startsWith("cli_")) {
      const refreshed = await this.refreshTokens();
      if (refreshed) {
        token = getAuthToken();
        if (token) return token;
      }
    }

    throw new AuthenticationError();
  }

  private async getHeaders(
    requireAuth: boolean = true,
  ): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": `@sendly/cli/${version}`,
    };

    if (requireAuth) {
      headers["Authorization"] = `Bearer ${await this.ensureAuth()}`;
    }

    const orgId = getEffectiveValue("currentOrgId");
    if (orgId) {
      headers["X-Organization-Id"] = orgId;
    }

    return headers;
  }

  private async refreshTokens(): Promise<boolean> {
    if (this.refreshing) return this.refreshing;

    this.refreshing = (async () => {
      const stored = getStoredAccessToken();
      if (!stored) return false;

      try {
        const response = await fetch(
          `${this.getBaseUrl()}/api/cli/auth/refresh`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "User-Agent": `@sendly/cli/${version}`,
            },
            body: JSON.stringify({ accessToken: stored }),
          },
        );

        if (!response.ok) return false;

        const data = (await response.json()) as {
          accessToken: string;
          refreshToken: string;
          expiresIn: number;
          userId: string;
          email: string;
        };

        setAuthTokens(
          data.accessToken,
          data.refreshToken,
          data.expiresIn,
          data.userId,
          data.email,
        );

        return true;
      } catch {
        return false;
      }
    })();

    try {
      return await this.refreshing;
    } finally {
      this.refreshing = null;
    }
  }

  async request<T>(
    method: string,
    path: string,
    options: {
      body?: Record<string, unknown>;
      query?: Record<string, string | number | boolean | undefined>;
      requireAuth?: boolean;
      idempotencyKey?: string;
      autoIdempotencyKey?: boolean;
    } = {},
  ): Promise<T> {
    const { body, query, requireAuth = true } = options;
    const maxRetries = getEffectiveValue("maxRetries");
    const timeout = getEffectiveValue("timeout");

    const url = new URL(`${this.getBaseUrl()}${path}`);
    if (query) {
      Object.entries(query).forEach(([key, value]) => {
        if (value !== undefined) {
          url.searchParams.append(key, String(value));
        }
      });
    }

    const explicitKey = normalizeIdempotencyKey(options.idempotencyKey);
    let idempotencyKey =
      explicitKey ??
      (method === "POST" && options.autoIdempotencyKey !== false
        ? generateIdempotencyKey()
        : undefined);

    let lastError: Error | undefined;
    let didRefresh = false;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const headers = await this.getHeaders(requireAuth);
        if (idempotencyKey) {
          headers["Idempotency-Key"] = idempotencyKey;
        }

        const response = await fetch(url.toString(), {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        this.updateRateLimitInfo(response.headers);

        const data = await response.json().catch(() => ({}));

        if (response.status === 401 && requireAuth && !didRefresh) {
          didRefresh = true;
          const refreshed = await this.refreshTokens();
          if (refreshed) {
            attempt--;
            continue;
          }
        }

        if (!response.ok) {
          this.handleError(response.status, data);
        }

        return data as T;
      } catch (error) {
        lastError = error as Error;

        if (!isRetryableError(error)) {
          throw error;
        }

        if (attempt === maxRetries) {
          throw error;
        }

        // A 5xx means the server responded (and may have cached that response
        // under the key), so an auto-generated key is rotated to let the retry
        // re-execute. Network errors leave the outcome unknown — the key is
        // kept so the server can dedupe a request that actually went through.
        // Caller-supplied keys are never rotated.
        if (!explicitKey && idempotencyKey && isServerErrorResponse(error)) {
          idempotencyKey = generateIdempotencyKey();
        }

        const backoffMs = Math.min(1000 * Math.pow(2, attempt), 10000);
        await sleep(backoffMs);
      }
    }

    throw lastError || new Error("Request failed");
  }

  private updateRateLimitInfo(headers: Headers): void {
    const limit = headers.get("X-RateLimit-Limit");
    const remaining = headers.get("X-RateLimit-Remaining");
    const reset = headers.get("X-RateLimit-Reset");

    if (limit && remaining && reset) {
      this.rateLimitInfo = {
        limit: parseInt(limit, 10),
        remaining: parseInt(remaining, 10),
        reset: parseInt(reset, 10),
      };
    }
  }

  private handleError(statusCode: number, data: any): never {
    const error = data?.error || "unknown_error";
    const message = data?.message || `HTTP ${statusCode}`;
    const details = data?.details;
    const fieldErrors = Array.isArray(data?.errors)
      ? (data.errors as ApiFieldError[])
      : undefined;

    switch (statusCode) {
      case 401:
      case 403:
        // Detect if this is an API key required error vs general auth error
        if (
          error === "invalid_api_key" ||
          error === "api_key_required" ||
          message?.toLowerCase().includes("api key")
        ) {
          throw new ApiKeyRequiredError(
            "API key required for sending messages",
            "Set SENDLY_API_KEY environment variable or create a key with:\n  sendly keys create --type test",
          );
        }
        throw new AuthenticationError(message);
      case 400: {
        const validation = new ValidationError(message, details);
        validation.fieldErrors = fieldErrors;
        throw validation;
      }
      case 402:
        // A bare 402 can mean either "out of credits" or "no card on file" —
        // they need opposite remedies, so branch on the server error code
        // instead of always steering the user to buy credits.
        if (error === "payment_method_required")
          throw new PaymentMethodRequiredError(message);
        throw new InsufficientCreditsError(message);
      case 404:
        // If the server sent no message, use NotFoundError's friendly default
        // ("Resource not found") rather than a bare "HTTP 404".
        throw new NotFoundError(data?.message || undefined);
      case 429:
        const retryAfter = data?.retryAfter || 60;
        throw new RateLimitError(retryAfter, message);
      default: {
        const defaultHint =
          statusCode >= 500
            ? "This is a server error. Try again later or check https://status.sendly.live"
            : undefined;
        const apiError = new ApiError(
          error,
          message,
          statusCode,
          details,
          defaultHint,
        );
        apiError.fieldErrors = fieldErrors;
        throw apiError;
      }
    }
  }

  getRateLimitInfo(): RateLimitInfo | undefined {
    return this.rateLimitInfo;
  }

  // Convenience methods
  async get<T>(
    path: string,
    query?: Record<string, string | number | boolean | undefined>,
    requireAuth: boolean = true,
  ): Promise<T> {
    return this.request<T>("GET", path, { query, requireAuth });
  }

  async post<T>(
    path: string,
    body?: Record<string, unknown>,
    requireAuth: boolean = true,
    options: { idempotencyKey?: string; autoIdempotencyKey?: boolean } = {},
  ): Promise<T> {
    return this.request<T>("POST", path, { body, requireAuth, ...options });
  }

  async patch<T>(
    path: string,
    body?: Record<string, unknown>,
    requireAuth: boolean = true,
    options: { idempotencyKey?: string } = {},
  ): Promise<T> {
    return this.request<T>("PATCH", path, { body, requireAuth, ...options });
  }

  async put<T>(
    path: string,
    body?: Record<string, unknown>,
    requireAuth: boolean = true,
    options: { idempotencyKey?: string } = {},
  ): Promise<T> {
    return this.request<T>("PUT", path, { body, requireAuth, ...options });
  }

  async delete<T>(path: string, requireAuth: boolean = true): Promise<T> {
    return this.request<T>("DELETE", path, { requireAuth });
  }

  /**
   * Upload a file using multipart/form-data
   * Used for batch CSV uploads to R2 storage
   */
  async uploadFile<T>(
    path: string,
    file: {
      buffer: Buffer;
      filename: string;
      mimetype?: string;
    },
    requireAuth: boolean = true,
  ): Promise<T> {
    const maxRetries = getEffectiveValue("maxRetries");
    const timeout = getEffectiveValue("timeout");
    const url = `${this.getBaseUrl()}${path}`;

    // Build multipart form data manually (Node.js compatible)
    const boundary = `----FormBoundary${Date.now()}${Math.random().toString(36).substring(2)}`;
    const mimetype = file.mimetype || "text/csv";

    const header = Buffer.from(
      `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="${file.filename}"\r\n` +
        `Content-Type: ${mimetype}\r\n\r\n`,
    );
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body = Buffer.concat([header, file.buffer, footer]);

    const headers: Record<string, string> = {
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      Accept: "application/json",
      "User-Agent": `@sendly/cli/${version}`,
    };

    if (requireAuth) {
      headers["Authorization"] = `Bearer ${await this.ensureAuth()}`;
    }

    let idempotencyKey = generateIdempotencyKey();

    let lastError: Error | undefined;
    let didRefresh = false;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(url, {
          method: "POST",
          headers: { ...headers, "Idempotency-Key": idempotencyKey },
          body,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        this.updateRateLimitInfo(response.headers);
        const data = await response.json().catch(() => ({}));

        if (response.status === 401 && requireAuth && !didRefresh) {
          didRefresh = true;
          const refreshed = await this.refreshTokens();
          if (refreshed) {
            headers["Authorization"] = `Bearer ${getAuthToken()}`;
            attempt--;
            continue;
          }
        }

        if (!response.ok) {
          this.handleError(response.status, data);
        }

        return data as T;
      } catch (error) {
        lastError = error as Error;

        if (!isRetryableError(error)) {
          throw error;
        }

        if (attempt === maxRetries) {
          throw error;
        }

        // Same rotation rules as request(): rotate the auto key only after
        // an actual 5xx response; keep it across network-error retries.
        if (isServerErrorResponse(error)) {
          idempotencyKey = generateIdempotencyKey();
        }

        const backoffMs = Math.min(1000 * Math.pow(2, attempt), 10000);
        await sleep(backoffMs);
      }
    }

    throw lastError || new Error("Upload failed");
  }
}

export const apiClient = new ApiClient();
