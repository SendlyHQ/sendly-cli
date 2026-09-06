import { AuthenticatedCommand } from "../../lib/base-command.js";
import { apiClient } from "../../lib/api-client.js";
import {
  json,
  info,
  warn,
  colors,
  spinner,
  isJsonMode,
  keyValue,
} from "../../lib/output.js";
import {
  isDict,
  reportRcsError,
  type DossierResponse,
} from "../../lib/rcs-registration.js";

const SOURCE_LABELS: Record<DossierResponse["source"], string> = {
  tendlc: "your 10DLC brand",
  verification: "your toll-free verification",
  none: "nothing on file yet",
};

function flatten(
  value: unknown,
  prefix: string,
  out: Array<[string, string]>,
): void {
  if (isDict(value)) {
    for (const [key, inner] of Object.entries(value)) {
      flatten(inner, prefix ? `${prefix}.${key}` : key, out);
    }
    return;
  }
  if (value === null || value === undefined || value === "") return;
  out.push([prefix, String(value)]);
}

export default class RcsDossier extends AuthenticatedCommand {
  static description =
    "Show the brand details Sendly can prefill from your 10DLC brand or toll-free verification";

  static examples = [
    "<%= config.bin %> rcs dossier",
    "<%= config.bin %> rcs dossier --json > brand.json",
  ];

  static flags = {
    ...AuthenticatedCommand.baseFlags,
  };

  async run(): Promise<void> {
    await this.parse(RcsDossier);

    const loadSpinner = spinner("Fetching prefill details...");
    if (!isJsonMode()) {
      loadSpinner.start();
    }

    let response: DossierResponse;
    try {
      response = await apiClient.get<DossierResponse>("/api/v1/rcs/dossier");
      loadSpinner.stop();
    } catch (err) {
      loadSpinner.stop();
      if (reportRcsError(err)) this.exit(1);
      throw err;
    }

    if (isJsonMode()) {
      json(response);
      return;
    }

    const rows: Array<[string, string]> = [];
    flatten(response.brand ?? {}, "", rows);

    console.log();
    console.log(colors.bold("Prefilled brand details"));
    console.log(
      colors.dim(`Source: ${SOURCE_LABELS[response.source] ?? response.source}`),
    );
    console.log();

    if (rows.length === 0) {
      info("Nothing to prefill yet — you'll enter the brand details yourself.");
    } else {
      keyValue(rows);
    }

    if (!response.usEligible) {
      console.log();
      warn(
        "Something on file names a non-US country. RCS registration is available to US businesses for now.",
      );
    }

    console.log();
    console.log(colors.dim("Use it:"));
    console.log(
      `  Save:  ${colors.code("sendly rcs dossier --json > brand.json")}`,
    );
    console.log(
      `  Draft: ${colors.code("sendly rcs brands create --from-json brand.json --ein 12-3456789 ...")}`,
    );
  }
}
