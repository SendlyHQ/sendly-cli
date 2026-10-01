import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../../../src/lib/config.js", () => ({
  isAuthenticated: vi.fn(() => true),
  getAuthToken: vi.fn(() => "sk_live_v1_mock"),
  getStoredAccessToken: vi.fn(() => undefined),
  setAuthTokens: vi.fn(),
  resolveBaseUrl: vi.fn(() => "https://sendly.live"),
  getConfigValue: vi.fn(() => undefined),
  getEffectiveValue: vi.fn((key: string) => {
    if (key === "maxRetries") return 0;
    if (key === "timeout") return 30000;
    return undefined;
  }),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

import WhatsappTemplatesCreate from "../../../src/commands/whatsapp/templates/create.js";
import WhatsappTemplatesUpdate from "../../../src/commands/whatsapp/templates/update.js";
import { setOutputFormat } from "../../../src/lib/output.js";
import { respond, runCommand } from "../../helpers/run-command.js";

const HEADER_VARIABLE = {
  error: "template_header_variable_unsupported",
  message:
    "Headers can't contain {{n}} variables. Keep the header fixed text and put the variable in the body.",
};

const RESERVED_PREFIX = {
  error: "template_name_reserved_prefix",
  message:
    'Names starting with "test", "sample" or "demo" get rejected by Meta. Pick a more specific name.',
};

function create(status: number, body: Record<string, unknown>) {
  mockFetch.mockResolvedValueOnce(respond(status, body));
  return runCommand(WhatsappTemplatesCreate, [
    "--sender",
    "+15555550100",
    "--name",
    "order_shipped",
    "--language",
    "en_US",
    "--category",
    "utility",
    "--header",
    "Order {{1}}",
    "--body",
    "Hi {{1}}, your order shipped",
    "--example",
    "1=Ada",
  ]);
}

function update(status: number, body: Record<string, unknown>) {
  mockFetch.mockResolvedValueOnce(respond(status, body));
  return runCommand(WhatsappTemplatesUpdate, [
    "tpl_1",
    "--header",
    "Order {{1}}",
  ]);
}

describe.each([
  ["create", create],
  ["update", update],
])("sendly whatsapp templates %s", (_name, run) => {
  beforeEach(() => {
    mockFetch.mockReset();
    setOutputFormat("human");
  });

  afterEach(() => {
    setOutputFormat("human");
  });

  it("explains that a header can't contain {{n}} variables", async () => {
    const result = await run(400, HEADER_VARIABLE);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Headers can't contain {{n}} variables");
    expect(result.stderr).toContain("template_header_variable_unsupported");
    expect(result.stderr).toMatch(/header can't contain \{\{n\}\} variables/i);
    expect(result.stderr).not.toContain("validation_error");
  });

  it("keeps the API's error code on a 400 in --json", async () => {
    setOutputFormat("json");
    const header = await run(400, HEADER_VARIABLE);
    expect(JSON.parse(header.stderr).code).toBe(
      "template_header_variable_unsupported",
    );

    const reserved = await run(400, RESERVED_PREFIX);
    const out = JSON.parse(reserved.stderr);
    expect(out.code).toBe("template_name_reserved_prefix");
    expect(out.message).toContain("Pick a more specific name");
  });

  it("still gives the checklist when a 400 carries no message", async () => {
    const result = await run(400, { error: "template_language_required" });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("The template failed validation checks");
    expect(result.stderr).toContain("template_language_required");
  });
});
