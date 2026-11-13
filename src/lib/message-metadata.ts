import { Flags } from "@oclif/core";

export const metadataFlag = Flags.string({
  description:
    'Your own JSON object stored with the message and returned on it (e.g. --metadata \'{"orderId":"4821"}\')',
});

export function parseMetadataJson(
  raw: string | undefined,
): Record<string, unknown> | string | undefined {
  if (raw === undefined) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return 'Invalid --metadata: expected a JSON object, e.g. --metadata \'{"orderId":"4821"}\'';
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return 'Invalid --metadata: expected a JSON object, e.g. --metadata \'{"orderId":"4821"}\'';
  }
  return parsed as Record<string, unknown>;
}
