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

import WhatsappWindow from "../../../src/commands/whatsapp/window.js";
import { setOutputFormat } from "../../../src/lib/output.js";
import { respond, runCommand } from "../../helpers/run-command.js";

const TO = "+14155550177";
const FROM = "+14155550123";

function sender(phoneNumber: string, status = "active") {
  return {
    phoneNumber,
    displayName: null,
    status,
    qualityRating: null,
    createdAt: "2026-09-12T09:41:07.004Z",
  };
}

beforeEach(() => {
  mockFetch.mockReset();
  setOutputFormat("human");
});

afterEach(() => {
  setOutputFormat("human");
});

describe("sendly whatsapp window", () => {
  it("asks GET /api/v1/whatsapp/window with from and to and prints the JSON as sent", async () => {
    setOutputFormat("json");
    const body = { open: true, expiresAt: "2026-11-14T09:00:00.000Z" };
    mockFetch.mockResolvedValueOnce(respond(200, body));

    const run = await runCommand(WhatsappWindow, [TO, "--from", FROM, "--json"]);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    const parsed = new URL(String(url));
    expect(init.method).toBe("GET");
    expect(parsed.pathname).toBe("/api/v1/whatsapp/window");
    expect(parsed.searchParams.get("from")).toBe(FROM);
    expect(parsed.searchParams.get("to")).toBe(TO);
    expect(JSON.parse(run.stdout)).toEqual(body);
  });

  it("shows an open window and when it closes", async () => {
    mockFetch.mockResolvedValueOnce(
      respond(200, { open: true, expiresAt: "2026-11-14T09:00:00.000Z" }),
    );
    const run = await runCommand(WhatsappWindow, [TO, "--from", FROM]);
    expect(run.exitCode ?? 0).toBe(0);
    expect(run.stdout).toContain("open");
    expect(run.stdout).toContain("Closes:");
  });

  it("points a closed window at templates", async () => {
    mockFetch.mockResolvedValueOnce(
      respond(200, { open: false, expiresAt: "2026-11-12T09:00:00.000Z" }),
    );
    const run = await runCommand(WhatsappWindow, [TO, "--from", FROM]);
    expect(run.stdout).toContain("closed");
    expect(run.stdout).toContain("Closed:");
    expect(run.stdout).toContain("--template");
  });

  it("says when there is no window on record", async () => {
    mockFetch.mockResolvedValueOnce(respond(200, { open: false, expiresAt: null }));
    const run = await runCommand(WhatsappWindow, [TO, "--from", FROM]);
    expect(run.stdout).toContain("no window on record");
    expect(run.stdout).not.toContain("Closed:");
  });

  it("uses the only active sender when --from is left out", async () => {
    setOutputFormat("json");
    mockFetch
      .mockResolvedValueOnce(
        respond(200, { senders: [sender("+14155550142", "pending"), sender(FROM)] }),
      )
      .mockResolvedValueOnce(respond(200, { open: false, expiresAt: null }));

    await runCommand(WhatsappWindow, [TO]);

    expect(new URL(String(mockFetch.mock.calls[0][0])).pathname).toBe(
      "/api/v1/whatsapp/senders",
    );
    const windowUrl = new URL(String(mockFetch.mock.calls[1][0]));
    expect(windowUrl.pathname).toBe("/api/v1/whatsapp/window");
    expect(windowUrl.searchParams.get("from")).toBe(FROM);
  });

  it("asks for --from when more than one sender is active", async () => {
    setOutputFormat("json");
    mockFetch.mockResolvedValueOnce(
      respond(200, { senders: [sender(FROM), sender("+442079460123")] }),
    );
    const run = await runCommand(WhatsappWindow, [TO]);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(run.exitCode).toBe(1);
    const out = JSON.parse(run.stderr);
    expect(out.message).toContain("--from");
    expect(out.senders).toEqual([FROM, "+442079460123"]);
  });

  it("says to connect a number when no sender is active", async () => {
    setOutputFormat("json");
    mockFetch.mockResolvedValueOnce(respond(200, { senders: [] }));
    const run = await runCommand(WhatsappWindow, [TO]);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(run.exitCode).toBe(1);
    expect(JSON.parse(run.stderr).hint).toContain("sendly whatsapp connect");
  });

  it("reports WhatsApp switched off for the account", async () => {
    setOutputFormat("json");
    mockFetch.mockResolvedValueOnce(respond(404, { error: "not_found" }));
    const run = await runCommand(WhatsappWindow, [TO, "--from", FROM]);
    expect(run.exitCode).toBe(1);
    expect(JSON.parse(run.stderr).message).toContain("isn't enabled");
  });
});
