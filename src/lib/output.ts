/**
 * Output Formatting Utilities
 * Handles human-readable and JSON output modes
 */

import chalk from "chalk";
import Table from "cli-table3";
import ora, { type Ora } from "ora";
import { getConfigValue } from "./config.js";

export type OutputFormat = "human" | "json";

let currentFormat: OutputFormat = "human";
let quietMode = false;

export function setOutputFormat(format: OutputFormat): void {
  currentFormat = format;
}

export function setQuietMode(quiet: boolean): void {
  quietMode = quiet;
}

export function getOutputFormat(): OutputFormat {
  return currentFormat;
}

export function isJsonMode(): boolean {
  return currentFormat === "json";
}

export function isQuietMode(): boolean {
  return quietMode;
}

// Colors
export const colors = {
  primary: chalk.hex("#F59E0B"), // Amber/Orange - Sendly brand
  success: chalk.green,
  error: chalk.red,
  warning: chalk.yellow,
  info: chalk.blue,
  dim: chalk.dim,
  bold: chalk.bold,
  code: chalk.cyan,
  highlight: chalk.bold.hex("#F59E0B"),
};

// Success output
export function success(message: string, data?: Record<string, unknown>): void {
  if (isJsonMode()) {
    console.log(JSON.stringify({ success: true, message, ...data }, null, 2));
    return;
  }

  if (quietMode) {
    if (data?.id) console.log(data.id);
    return;
  }

  console.log(`${colors.success("✓")} ${message}`);
  if (data) {
    Object.entries(data).forEach(([key, value]) => {
      console.log(`  ${colors.dim(key + ":")} ${value}`);
    });
  }
}

// Error output
export function error(
  message: string,
  details?: Record<string, unknown>,
): void {
  if (isJsonMode()) {
    console.error(
      JSON.stringify({ error: true, message, ...details }, null, 2),
    );
    return;
  }

  console.error(`${colors.error("✗")} ${message}`);
  if (details && !quietMode) {
    Object.entries(details).forEach(([key, value]) => {
      console.error(`  ${colors.dim(key + ":")} ${value}`);
    });
  }
}

// Warning output
export function warn(message: string): void {
  if (isJsonMode()) return;
  if (quietMode) return;
  console.log(`${colors.warning("⚠")} ${message}`);
}

// Info output
export function info(message: string): void {
  if (isJsonMode()) return;
  if (quietMode) return;
  console.log(`${colors.info("ℹ")} ${message}`);
}

// Print raw JSON
export function json(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

// Print a table
export interface TableColumn {
  header: string;
  key: string;
  width?: number;
  formatter?: (value: unknown, row?: Record<string, any>) => string;
}

export function table(
  data: Array<Record<string, any>>,
  columns: TableColumn[],
): void {
  if (isJsonMode()) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  if (data.length === 0) {
    info("No data to display");
    return;
  }

  const t = new Table({
    head: columns.map((c) => colors.bold(c.header)),
    style: {
      head: [],
      border: [],
    },
    colWidths: columns.map((c) => c.width ?? null),
  });

  data.forEach((row) => {
    t.push(
      columns.map((col) => {
        const value = row[col.key];
        if (col.formatter) {
          return col.formatter(value, row);
        }
        return String(value ?? "-");
      }),
    );
  });

  console.log(t.toString());
}

// Spinner for long operations
export function spinner(text: string): Ora {
  if (isJsonMode() || quietMode) {
    return {
      start: () => ({ stop: () => {}, succeed: () => {}, fail: () => {} }),
      stop: () => {},
      succeed: () => {},
      fail: () => {},
    } as unknown as Ora;
  }

  return ora({
    text,
    color: "yellow",
    spinner: "dots",
  });
}

// Status formatters
export function formatStatus(status: string): string {
  switch (status.toLowerCase()) {
    case "delivered":
    case "success":
    case "active":
    case "verified":
      return colors.success(status);
    case "failed":
    case "error":
    case "revoked":
    case "rejected":
      return colors.error(status);
    case "queued":
    case "pending":
    case "processing":
      return colors.warning(status);
    case "sent":
      return colors.info(status);
    default:
      return status;
  }
}

// Format date
export function formatDate(date: string | Date | number): string {
  const d = new Date(date);
  return d.toLocaleString();
}

// Format relative time
export function formatRelativeTime(date: string | Date | number): string {
  const d = new Date(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return `${seconds}s ago`;
}

// Format credits
export function formatCredits(credits: number | undefined | null): string {
  if (credits == null) return "—";
  return `${credits.toLocaleString()} credits`;
}

// Format phone number
export function formatPhone(phone: string): string {
  return colors.code(phone);
}

// Header for commands
export function header(title: string): void {
  if (isJsonMode() || quietMode) return;
  console.log();
  console.log(colors.bold(colors.primary(title)));
  console.log(colors.dim("─".repeat(40)));
}

// Divider
export function divider(): void {
  if (isJsonMode() || quietMode) return;
  console.log();
}

// Key-value display - accepts Record or array of [key, value] tuples
export function keyValue(data: Record<string, unknown> | Array<[string, string | number]>): void {
  const entries = Array.isArray(data) ? data : Object.entries(data);

  if (isJsonMode()) {
    const obj = Array.isArray(data) ? Object.fromEntries(data) : data;
    console.log(JSON.stringify(obj, null, 2));
    return;
  }

  const maxKeyLength = Math.max(...entries.map(([k]) => k.length));

  entries.forEach(([key, value]) => {
    const paddedKey = key.padEnd(maxKeyLength);
    console.log(`  ${colors.dim(paddedKey)}  ${value}`);
  });
}

// Detail view with title and key-value pairs
export function detail(title: string, data: Record<string, unknown>): void {
  if (isJsonMode()) {
    console.log(JSON.stringify({ title, ...data }, null, 2));
    return;
  }

  console.log(colors.bold(title));
  console.log();
  keyValue(data);
}

// Code block
export function codeBlock(code: string, language?: string): void {
  if (isJsonMode()) {
    console.log(JSON.stringify({ code, language }, null, 2));
    return;
  }

  console.log();
  console.log(colors.dim("```" + (language || "")));
  console.log(colors.code(code));
  console.log(colors.dim("```"));
  console.log();
}
