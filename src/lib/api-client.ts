/**
 * API Client for Sendly CLI
 * Handles all HTTP requests to the Sendly API
 */

import { createRequire } from "node:module";
import { getAuthToken, getConfigValue, getEffectiveValue } from "./config.js";

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

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class AuthenticationError extends ApiError {
  constructor(
    message: string = "Not authenticated. Run 'sendly login' first.",
  ) {
    super("authentication_error", message, 401);
    this.name = "AuthenticationError";
  }
}

export class RateLimitError extends ApiError {
  constructor(
    public retryAfter: number,
    message: string = "Rate limit exceeded",
  ) {
    super("rate_limit_exceeded", message, 429);
    this.name = "RateLimitError";
  }
}

export class InsufficientCreditsError extends ApiError {
  constructor(message: string = "Insufficient credits") {
    super("insufficient_credits", message, 402);
    this.name = "InsufficientCreditsError";
  }
}

class ApiClient {
  private rateLimitInfo?: RateLimitInfo;

  private getBaseUrl(): string {
    return getConfigValue("baseUrl") || "https://sendly.live";
  }

  private getHeaders(requireAuth: boolean = true): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": `@sendly/cli/${version}`,
    };

    if (requireAuth) {
      const token = getAuthToken();
      if (!token) {
        throw new AuthenticationError();
      }
      headers["Authorization"] = `Bearer ${token}`;
    }

    return headers;
  }

  async request<T>(
    method: string,
    path: string,
    options: {
      body?: Record<string, unknown>;
      query?: Record<string, string | number | boolean | undefined>;
      requireAuth?: boolean;
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

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(url.toString(), {
          method,
          headers: this.getHeaders(requireAuth),
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        // Update rate limit info
        this.updateRateLimitInfo(response.headers);

        // Parse response
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          this.handleError(response.status, data);
        }

        return data as T;
      } catch (error) {
        lastError = error as Error;

        // Don't retry non-retryable errors (4xx client errors)
        if (!isRetryableError(error)) {
          throw error;
        }

        // Don't retry on last attempt
        if (attempt === maxRetries) {
          throw error;
        }

        // Exponential backoff: 1s, 2s, 4s, etc.
        const backoffMs = Math.min(1000 * Math.pow(2, attempt), 10000);
        await sleep(backoffMs);
      }
    }

    // Should never reach here, but TypeScript needs this
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

    switch (statusCode) {
      case 401:
      case 403:
        throw new AuthenticationError(message);
      case 402:
        throw new InsufficientCreditsError(message);
      case 429:
        const retryAfter = data?.retryAfter || 60;
        throw new RateLimitError(retryAfter, message);
      default:
        throw new ApiError(error, message, statusCode, details);
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
  ): Promise<T> {
    return this.request<T>("POST", path, { body, requireAuth });
  }

  async patch<T>(
    path: string,
    body?: Record<string, unknown>,
    requireAuth: boolean = true,
  ): Promise<T> {
    return this.request<T>("PATCH", path, { body, requireAuth });
  }

  async delete<T>(path: string, requireAuth: boolean = true): Promise<T> {
    return this.request<T>("DELETE", path, { requireAuth });
  }

  /**
   * Upload a file using multipart/form-data
   * Used for batch CSV uploads to Supabase storage
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
      const token = getAuthToken();
      if (!token) {
        throw new AuthenticationError();
      }
      headers["Authorization"] = `Bearer ${token}`;
    }

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(url, {
          method: "POST",
          headers,
          body,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        this.updateRateLimitInfo(response.headers);
        const data = await response.json().catch(() => ({}));

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

        const backoffMs = Math.min(1000 * Math.pow(2, attempt), 10000);
        await sleep(backoffMs);
      }
    }

    throw lastError || new Error("Upload failed");
  }
}

export const apiClient = new ApiClient();
