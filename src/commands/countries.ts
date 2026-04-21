import { Flags } from "@oclif/core";
import { BaseCommand } from "../lib/base-command.js";
import { apiClient } from "../lib/api-client.js";
import { json, isJsonMode, colors, header } from "../lib/output.js";

interface Country {
  code: string;
  name: string;
  dial_code: string;
  tier: string;
  credits_per_sms: number;
  price_usd: number;
  requires_registration: boolean;
}

/**
 * `sendly countries` — list supported countries with pricing.
 *
 * Backs the public `GET /api/v1/countries` endpoint. No auth required so
 * customers can browse before signing up. Useful for populating country
 * pickers in sign-up forms, validating phone numbers client-side, and
 * checking which tiers require registration (toll-free brand
 * verification in US/CA, for instance).
 */
export default class Countries extends BaseCommand {
  static description =
    "List supported countries with pricing (credits per SMS, USD price, tier). No auth required.";

  static examples = [
    "<%= config.bin %> countries",
    "<%= config.bin %> countries --search UK",
    "<%= config.bin %> countries --tier domestic",
    "<%= config.bin %> countries --json",
  ];

  static flags = {
    ...BaseCommand.baseFlags,
    search: Flags.string({
      description: "Filter by name, country code, or dial code",
    }),
    tier: Flags.string({
      description: "Filter by pricing tier (domestic, international, etc.)",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Countries);

    const resp = await apiClient.get<{ countries?: Country[] } | Country[]>(
      "/api/v1/countries",
    );
    const all: Country[] = Array.isArray(resp)
      ? resp
      : (resp.countries ?? []);

    const filtered = all.filter((c) => {
      if (flags.tier && c.tier !== flags.tier) return false;
      if (flags.search) {
        const q = flags.search.toLowerCase();
        return (
          c.code.toLowerCase().includes(q) ||
          c.name.toLowerCase().includes(q) ||
          c.dial_code.includes(q)
        );
      }
      return true;
    });

    if (isJsonMode()) {
      json(filtered);
      return;
    }

    header(`Supported countries (${filtered.length})`);
    if (filtered.length === 0) {
      console.log(colors.dim("  (no matches)"));
      return;
    }

    // Column widths derived from the data so the table stays compact.
    const codeW = 4;
    const dialW = Math.max(...filtered.map((c) => c.dial_code.length), 5);
    const nameW = Math.max(...filtered.map((c) => c.name.length), 12);

    console.log(
      "  " +
        colors.dim("Code".padEnd(codeW)) +
        "  " +
        colors.dim("Dial".padEnd(dialW)) +
        "  " +
        colors.dim("Name".padEnd(nameW)) +
        "  " +
        colors.dim("Tier".padEnd(14)) +
        "  " +
        colors.dim("Credits/SMS".padStart(11)) +
        "  " +
        colors.dim("Price (USD)".padStart(11)) +
        "  " +
        colors.dim("Registration"),
    );
    for (const c of filtered) {
      const regHint = c.requires_registration
        ? colors.warning("required")
        : colors.dim("not required");
      console.log(
        "  " +
          c.code.padEnd(codeW) +
          "  " +
          c.dial_code.padEnd(dialW) +
          "  " +
          c.name.padEnd(nameW) +
          "  " +
          c.tier.padEnd(14) +
          "  " +
          String(c.credits_per_sms).padStart(11) +
          "  " +
          c.price_usd.toFixed(4).padStart(11) +
          "  " +
          regHint,
      );
    }
  }
}
