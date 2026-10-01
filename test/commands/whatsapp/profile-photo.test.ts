import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";

const settings = vi.hoisted(() => ({
  orgId: undefined as string | undefined,
  maxRetries: 0,
}));

vi.mock("../../../src/lib/config.js", () => ({
  isAuthenticated: vi.fn(() => true),
  getAuthToken: vi.fn(() => "sk_live_v1_mock"),
  getStoredAccessToken: vi.fn(() => undefined),
  setAuthTokens: vi.fn(),
  resolveBaseUrl: vi.fn(() => "https://sendly.live"),
  getConfigValue: vi.fn(() => undefined),
  getEffectiveValue: vi.fn((key: string) => {
    if (key === "maxRetries") return settings.maxRetries;
    if (key === "timeout") return 30000;
    if (key === "currentOrgId") return settings.orgId;
    return undefined;
  }),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

import WhatsappProfileUploadPhoto from "../../../src/commands/whatsapp/profile/upload-photo.js";
import WhatsappProfileRemovePhoto from "../../../src/commands/whatsapp/profile/remove-photo.js";
import { setOutputFormat } from "../../../src/lib/output.js";
import { respond, runCommand } from "../../helpers/run-command.js";

const NUMBER = "+14155550123";
const PHOTO_PATH = `/api/v1/whatsapp/senders/${encodeURIComponent(NUMBER)}/profile/photo`;

const PROFILE = {
  phoneNumber: NUMBER,
  displayName: "Acme Plumbing",
  profilePhotoUrl: "https://pps.whatsapp.net/v/t61.24694-24/455501234_profile.jpg",
  category: "PROF_SERVICES",
  about: "Same-day plumbing in the Bay Area",
  description: "Licensed and insured plumbers. Text us any time.",
  email: "hello@acme-plumbing.example",
  website: "https://acme-plumbing.example",
  address: "100 Example St, San Francisco, CA",
};

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64, 1),
]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 2)]);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sendly-wa-photo-"));
function file(name: string, content: Buffer): string {
  const p = path.join(dir, name);
  fs.writeFileSync(p, content);
  return p;
}

function sent() {
  const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
  const headers = init.headers as Record<string, string>;
  return {
    url,
    method: init.method,
    headers,
    body: Buffer.from(init.body as Buffer).toString("latin1"),
  };
}

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

beforeEach(() => {
  mockFetch.mockReset();
  settings.orgId = undefined;
  settings.maxRetries = 0;
  setOutputFormat("human");
});

afterEach(() => {
  setOutputFormat("human");
});

describe("sendly whatsapp profile upload-photo", () => {
  it("POSTs the image as the multipart field file and shows the new photo", async () => {
    mockFetch.mockResolvedValueOnce(respond(200, PROFILE));

    const run = await runCommand(WhatsappProfileUploadPhoto, [
      NUMBER,
      file("logo.png", PNG),
    ]);

    expect(run.exitCode).toBeUndefined();
    const req = sent();
    expect(req.url).toBe(`https://sendly.live${PHOTO_PATH}`);
    expect(req.method).toBe("POST");
    expect(req.headers["Content-Type"]).toMatch(/^multipart\/form-data; boundary=/);
    expect(req.body).toContain('Content-Disposition: form-data; name="file"; filename="logo.png"');
    expect(req.body).toContain("Content-Type: image/png");
    expect(run.stdout).toContain(PROFILE.profilePhotoUrl);
  });

  it("labels a JPEG by its bytes whatever the file is called", async () => {
    mockFetch.mockResolvedValueOnce(respond(200, PROFILE));

    await runCommand(WhatsappProfileUploadPhoto, [NUMBER, file("photo.bin", JPEG)]);

    expect(sent().body).toContain("Content-Type: image/jpeg");
  });

  it("prints the profile object in --json", async () => {
    setOutputFormat("json");
    mockFetch.mockResolvedValueOnce(respond(200, PROFILE));

    const run = await runCommand(WhatsappProfileUploadPhoto, [
      NUMBER,
      file("logo2.png", PNG),
    ]);

    expect(JSON.parse(run.stdout)).toEqual(PROFILE);
  });

  it("sends the selected workspace with the upload", async () => {
    settings.orgId = "org_7f3e2d1c";
    mockFetch.mockResolvedValueOnce(respond(200, PROFILE));

    await runCommand(WhatsappProfileUploadPhoto, [NUMBER, file("logo3.png", PNG)]);

    expect(sent().headers["X-Organization-Id"]).toBe("org_7f3e2d1c");
  });

  it("refuses a file that is neither JPEG nor PNG before uploading", async () => {
    const run = await runCommand(WhatsappProfileUploadPhoto, [
      NUMBER,
      file("logo.gif", Buffer.from("GIF89a-not-allowed")),
    ]);

    expect(run.exitCode).toBe(1);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(run.stderr).toContain("JPEG or PNG");
  });

  it("refuses a file over 5 MB before uploading, and accepts exactly 5 MB", async () => {
    const big = Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024 - PNG.length + 1)]);
    const tooBig = await runCommand(WhatsappProfileUploadPhoto, [NUMBER, file("big.png", big)]);

    expect(tooBig.exitCode).toBe(1);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(tooBig.stderr).toContain("5 MB");

    mockFetch.mockResolvedValueOnce(respond(200, PROFILE));
    const exact = await runCommand(WhatsappProfileUploadPhoto, [
      NUMBER,
      file("exact.png", big.subarray(0, 5 * 1024 * 1024)),
    ]);
    expect(exact.exitCode).toBeUndefined();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("refuses a missing file", async () => {
    const run = await runCommand(WhatsappProfileUploadPhoto, [
      NUMBER,
      path.join(dir, "missing.png"),
    ]);

    expect(run.exitCode).toBe(1);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("keeps the API's code when WhatsApp refuses the image", async () => {
    setOutputFormat("json");
    mockFetch.mockResolvedValueOnce(
      respond(502, {
        error: "whatsapp_profile_update_failed",
        message:
          "The photo couldn't be uploaded. WhatsApp needs a square JPEG or PNG at least 192 pixels wide. Please try again shortly.",
      }),
    );

    const run = await runCommand(WhatsappProfileUploadPhoto, [NUMBER, file("logo4.png", PNG)]);

    expect(run.exitCode).toBe(1);
    const out = JSON.parse(run.stderr);
    expect(out.code).toBe("whatsapp_profile_update_failed");
    expect(out.hint).toContain("640");
    expect(out.hint).not.toContain("status.sendly.live");
  });

  it("does not retry a 5xx upload", async () => {
    settings.maxRetries = 1;
    mockFetch.mockResolvedValue(
      respond(502, {
        error: "whatsapp_profile_update_failed",
        message:
          "The photo couldn't be uploaded. WhatsApp needs a square JPEG or PNG at least 192 pixels wide. Please try again shortly.",
      }),
    );

    const run = await runCommand(WhatsappProfileUploadPhoto, [NUMBER, file("retry.png", PNG)]);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(run.exitCode).toBe(1);
  });

  it("does not retry a dropped connection", async () => {
    settings.maxRetries = 1;
    mockFetch.mockRejectedValue(new TypeError("fetch failed"));

    const run = await runCommand(WhatsappProfileUploadPhoto, [NUMBER, file("drop.png", PNG)]);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(run.exitCode).toBe(1);
  });

  it("keeps whatsapp_profile_photo_invalid on a 400", async () => {
    setOutputFormat("json");
    mockFetch.mockResolvedValueOnce(
      respond(400, {
        error: "whatsapp_profile_photo_invalid",
        message: "The photo must be a JPEG or PNG image.",
      }),
    );

    const run = await runCommand(WhatsappProfileUploadPhoto, [NUMBER, file("logo5.png", PNG)]);

    expect(JSON.parse(run.stderr).code).toBe("whatsapp_profile_photo_invalid");
  });

  it("points a number that isn't connected at whatsapp connect", async () => {
    mockFetch.mockResolvedValueOnce(
      respond(404, {
        error: "whatsapp_sender_not_connected",
        message: "This number isn't connected to WhatsApp yet.",
      }),
    );

    const run = await runCommand(WhatsappProfileUploadPhoto, [NUMBER, file("logo6.png", PNG)]);

    expect(run.exitCode).toBe(1);
    expect(run.stderr).toContain("isn't connected to WhatsApp");
    expect(run.stderr).toContain(`sendly whatsapp connect --number ${NUMBER}`);
  });

  it("says WhatsApp isn't enabled on the flag-off 404", async () => {
    mockFetch.mockResolvedValueOnce(respond(404, { error: "not_found" }));

    const run = await runCommand(WhatsappProfileUploadPhoto, [NUMBER, file("logo7.png", PNG)]);

    expect(run.exitCode).toBe(1);
    expect(run.stderr).toContain("WhatsApp isn't enabled for your account yet");
  });

  it("says profile edits need an owner or admin when the role is refused", async () => {
    mockFetch.mockResolvedValueOnce(
      respond(403, {
        error: "insufficient_permissions",
        message: "Insufficient permissions: requires settings:write",
      }),
    );

    const run = await runCommand(WhatsappProfileUploadPhoto, [NUMBER, file("logo8.png", PNG)]);

    expect(run.exitCode).toBe(1);
    expect(run.stderr).toContain("owner or admin");
  });
});

describe("sendly whatsapp profile remove-photo", () => {
  it("DELETEs the photo and shows the profile without one", async () => {
    mockFetch.mockResolvedValueOnce(respond(200, { ...PROFILE, profilePhotoUrl: null }));

    const run = await runCommand(WhatsappProfileRemovePhoto, [NUMBER]);

    expect(run.exitCode).toBeUndefined();
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`https://sendly.live${PHOTO_PATH}`);
    expect(init.method).toBe("DELETE");
    expect(run.stdout).toContain("removed");
  });

  it("doesn't blame the image when a removal fails", async () => {
    setOutputFormat("json");
    mockFetch.mockResolvedValueOnce(
      respond(502, {
        error: "whatsapp_profile_update_failed",
        message: "The photo couldn't be removed. Please try again shortly.",
      }),
    );

    const run = await runCommand(WhatsappProfileRemovePhoto, [NUMBER]);

    expect(run.exitCode).toBe(1);
    const out = JSON.parse(run.stderr);
    expect(out.code).toBe("whatsapp_profile_update_failed");
    expect(out.hint).not.toMatch(/pixels|JPEG/);
  });

  it("prints the profile object in --json", async () => {
    setOutputFormat("json");
    const body = { ...PROFILE, profilePhotoUrl: null };
    mockFetch.mockResolvedValueOnce(respond(200, body));

    const run = await runCommand(WhatsappProfileRemovePhoto, [NUMBER]);

    expect(JSON.parse(run.stdout)).toEqual(body);
  });
});
