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

import WhatsappComponentsGet from "../../../src/commands/whatsapp/components/get.js";
import WhatsappComponentsUpdate from "../../../src/commands/whatsapp/components/update.js";
import { setOutputFormat } from "../../../src/lib/output.js";
import { respond, runCommand } from "../../helpers/run-command.js";

const NUMBER = "+14155550123";
const PATH = `https://sendly.live/api/v1/whatsapp/senders/${encodeURIComponent(NUMBER)}/conversational_components`;

const COMPONENTS = {
  phoneNumber: NUMBER,
  iceBreakers: ["Book a repair", "Get a quote", "Opening hours"],
  commands: [
    { command: "quote", description: "Get a price for a job" },
    { command: "status", description: "Check your booking" },
  ],
};

function sent() {
  const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
  return {
    url,
    method: init.method,
    body: init.body ? JSON.parse(String(init.body)) : undefined,
  };
}

beforeEach(() => {
  mockFetch.mockReset();
  setOutputFormat("human");
});

afterEach(() => {
  setOutputFormat("human");
});

describe("sendly whatsapp components get", () => {
  it("GETs the sender's ice breakers and commands and lists them", async () => {
    mockFetch.mockResolvedValueOnce(respond(200, COMPONENTS));

    const run = await runCommand(WhatsappComponentsGet, [NUMBER]);

    expect(run.exitCode).toBeUndefined();
    expect(sent()).toMatchObject({ url: PATH, method: "GET" });
    expect(run.stdout).toContain("Book a repair");
    expect(run.stdout).toContain("Opening hours");
    expect(run.stdout).toContain("/quote");
    expect(run.stdout).toContain("Check your booking");
  });

  it("says when a list is empty", async () => {
    mockFetch.mockResolvedValueOnce(
      respond(200, { phoneNumber: NUMBER, iceBreakers: [], commands: [] }),
    );

    const run = await runCommand(WhatsappComponentsGet, [NUMBER]);

    expect(run.stdout).toMatch(/Ice breakers:.*none/);
    expect(run.stdout).toMatch(/Commands:.*none/);
  });

  it("prints the API object in --json", async () => {
    setOutputFormat("json");
    mockFetch.mockResolvedValueOnce(respond(200, COMPONENTS));

    const run = await runCommand(WhatsappComponentsGet, [NUMBER]);

    expect(JSON.parse(run.stdout)).toEqual(COMPONENTS);
  });

  it("names the whatsapp:read scope when a read key lacks it", async () => {
    mockFetch.mockResolvedValueOnce(
      respond(403, {
        error: "insufficient_permissions",
        message: "Missing required scopes: whatsapp:read",
      }),
    );

    const run = await runCommand(WhatsappComponentsGet, [NUMBER]);

    expect(run.exitCode).toBe(1);
    expect(run.stderr).toContain("Use an API key with the whatsapp:read scope");
  });

  it("keeps the fetch-failed code", async () => {
    setOutputFormat("json");
    mockFetch.mockResolvedValueOnce(
      respond(502, {
        error: "whatsapp_conversational_components_fetch_failed",
        message:
          "The conversation settings couldn't be fetched. Please try again shortly.",
      }),
    );

    const run = await runCommand(WhatsappComponentsGet, [NUMBER]);

    expect(run.exitCode).toBe(1);
    expect(JSON.parse(run.stderr).code).toBe(
      "whatsapp_conversational_components_fetch_failed",
    );
  });
});

describe("sendly whatsapp components update", () => {
  it("PATCHes only the ice breakers when only --ice-breaker is given", async () => {
    mockFetch.mockResolvedValueOnce(respond(200, COMPONENTS));

    const run = await runCommand(WhatsappComponentsUpdate, [
      NUMBER,
      "--ice-breaker",
      "Book a repair",
      "--ice-breaker",
      "Get a quote",
    ]);

    expect(run.exitCode).toBeUndefined();
    expect(sent()).toEqual({
      url: PATH,
      method: "PATCH",
      body: { iceBreakers: ["Book a repair", "Get a quote"] },
    });
  });

  it("sends each --command as name=description", async () => {
    mockFetch.mockResolvedValueOnce(respond(200, COMPONENTS));

    await runCommand(WhatsappComponentsUpdate, [
      NUMBER,
      "--command",
      "/quote=Get a price for a job",
      "--command",
      "status=Check your booking",
    ]);

    expect(sent().body).toEqual({
      commands: [
        { command: "/quote", description: "Get a price for a job" },
        { command: "status", description: "Check your booking" },
      ],
    });
  });

  it("clears a list with an empty array", async () => {
    mockFetch.mockResolvedValueOnce(
      respond(200, { phoneNumber: NUMBER, iceBreakers: [], commands: [] }),
    );

    await runCommand(WhatsappComponentsUpdate, [
      NUMBER,
      "--clear-ice-breakers",
      "--clear-commands",
    ]);

    expect(sent().body).toEqual({ iceBreakers: [], commands: [] });
  });

  it("refuses to send nothing", async () => {
    const run = await runCommand(WhatsappComponentsUpdate, [NUMBER]);

    expect(run.exitCode).toBe(1);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("refuses a --command without a description", async () => {
    const run = await runCommand(WhatsappComponentsUpdate, [
      NUMBER,
      "--command",
      "quote",
    ]);

    expect(run.exitCode).toBe(1);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(run.stderr).toContain("name=description");
  });

  it("refuses a list and its clear flag together", async () => {
    const run = await runCommand(WhatsappComponentsUpdate, [
      NUMBER,
      "--ice-breaker",
      "Hi",
      "--clear-ice-breakers",
    ]);

    expect(run.exitCode).toBe(1);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("keeps invalid_request and the API's message", async () => {
    setOutputFormat("json");
    mockFetch.mockResolvedValueOnce(
      respond(400, {
        error: "invalid_request",
        message: "At most 4 ice breakers are allowed.",
      }),
    );

    const run = await runCommand(WhatsappComponentsUpdate, [
      NUMBER,
      "--ice-breaker",
      "a",
    ]);

    const out = JSON.parse(run.stderr);
    expect(out.code).toBe("invalid_request");
    expect(out.message).toBe("At most 4 ice breakers are allowed.");
  });

  it("prints the API object in --json", async () => {
    setOutputFormat("json");
    mockFetch.mockResolvedValueOnce(respond(200, COMPONENTS));

    const run = await runCommand(WhatsappComponentsUpdate, [
      NUMBER,
      "--ice-breaker",
      "Book a repair",
    ]);

    expect(JSON.parse(run.stdout)).toEqual(COMPONENTS);
  });
});
