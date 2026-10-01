import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

vi.mock("../../../src/lib/config.js", () => ({
  isAuthenticated: vi.fn(() => true),
  getAuthToken: vi.fn(() => "sk_live_v1_enterprise"),
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

import EnterpriseProvision from "../../../src/commands/enterprise/provision.js";
import { setOutputFormat } from "../../../src/lib/output.js";
import { respond, runCommand } from "../../helpers/run-command.js";

const SRC = "5b0f8c7e-1d2a-4c3b-9e8f-0a1b2c3d4e5f";
const POOL = "6c1a9d8f-2e3b-4d4c-8f9a-1b2c3d4e5f60";
const PERSONAL = "7d2b0e9a-3f4c-4e5d-9a0b-2c3d4e5f6071";
const FOREIGN = "8e3c1fab-4a5d-4f6e-8b1c-3d4e5f607182";
const UNVERIFIED = "9f4d2abc-5b6e-4a7f-9c2d-4e5f60718293";
const NO_PROFILE = "a05e3bcd-6c7f-4b80-8d3e-5f60718293a4";

const POOL_BALANCE = 1000;

const WORKER_ONLY = ["verification", "verificationOverrides", "inheritWithNewNumber", "keyName", "generateOptInPage", "webhookUrl"];

interface Verification {
  status: string;
  messagingProfileId: string | null;
}

const APPROVED: Verification = { status: "approved", messagingProfileId: "mp_1" };

const PENDING = "b16f4cde-7d80-4c91-9e4f-60718293a4b5";

const OWNED_ORGS: Record<string, Verification | null> = {
  [SRC]: APPROVED,
  [POOL]: APPROVED,
  [UNVERIFIED]: null,
  [NO_PROFILE]: { status: "pending", messagingProfileId: null },
  [PENDING]: { status: "pending", messagingProfileId: "mp_2" },
};

function slugOf(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function validateBulk(items: Record<string, any>[]): string | null {
  if (!Array.isArray(items) || items.length === 0) return "workspaces array is required";
  if (items.length > 100) return "Maximum 100 workspaces per bulk provision";
  const names = items.map((w) => (typeof w?.name === "string" ? w.name.trim() : "")).filter(Boolean);
  if (new Set(names).size !== names.length) return "Duplicate workspace names in request";
  for (const w of items) {
    if (w == null || typeof w !== "object" || Array.isArray(w)) return "Each workspace must be an object";
    if (w.creditAmount != null && (!Number.isInteger(w.creditAmount) || w.creditAmount <= 0)) {
      return `Invalid creditAmount for workspace "${w.name}": must be a positive integer`;
    }
    if (w.creditSourceWorkspaceId != null && (typeof w.creditSourceWorkspaceId !== "string" || !/^[0-9a-f-]{36}$/i.test(w.creditSourceWorkspaceId))) {
      return `Invalid creditSourceWorkspaceId for workspace "${w.name}": must be a valid UUID`;
    }
  }
  return null;
}

function serve(options: { workerConfigured?: boolean; accountVerification?: Verification | null } = {}) {
  const created: string[] = [];
  const slugs = new Set(["b", "source"]);
  const accountVerification =
    options.accountVerification === undefined ? APPROVED : options.accountVerification;
  const publicVerification = (v: Verification | null) =>
    v && { status: v.status, type: "toll_free", tollFreeNumber: null, businessName: "Acme" };

  mockFetch.mockImplementation(async (url: string, init: RequestInit) => {
    const { pathname } = new URL(url);
    const body = init.body ? JSON.parse(String(init.body)) : undefined;

    const workspace = pathname.match(/^\/api\/v1\/enterprise\/workspaces\/([^/]+)$/);
    if (workspace && init.method === "GET") {
      const id = workspace[1];
      if (id in OWNED_ORGS) {
        return respond(200, {
          id,
          name: "Source",
          slug: "source",
          createdAt: "2026-09-01T00:00:00.000Z",
          verification: publicVerification(OWNED_ORGS[id]),
          credits: 0,
          keyCount: 1,
        });
      }
      if (id === PERSONAL) {
        return respond(403, { error: "invalid_workspace", message: "Cannot operate on personal workspaces via enterprise API" });
      }
      if (id === FOREIGN) {
        return respond(403, { error: "not_workspace_owner", message: "You do not own this workspace" });
      }
      return respond(404, { error: "workspace_not_found", message: "Workspace not found" });
    }

    if (pathname === "/api/organizations" && init.method === "GET") {
      return respond(200, [
        { id: PERSONAL, name: "Personal", slug: "personal", isPersonal: true, role: "owner", ownerId: "usr_1" },
        { id: SRC, name: "Source", slug: "source", isPersonal: false, role: "owner", ownerId: "usr_1" },
      ]);
    }

    if (pathname === "/api/v1/account" && init.method === "GET") {
      return respond(200, {
        user: { id: "usr_1", email: "owner@example.com", createdAt: "2026-01-01T00:00:00.000Z" },
        organization: null,
        credits: { balance: "0", reservedBalance: "0" },
        verification: accountVerification && {
          status: accountVerification.status,
          type: "toll_free",
          region: "us",
          submittedAt: "2026-01-02T00:00:00.000Z",
          updatedAt: "2026-01-03T00:00:00.000Z",
        },
        apiKey: { id: "key_master", name: "Enterprise Master Key", type: "live", scopes: ["enterprise:master"] },
        limits: { messagesPerMinute: 60, messagesPerDay: 10000 },
      });
    }

    if (pathname === "/api/v1/enterprise/workspaces/provision") {
      if (!body.name || typeof body.name !== "string") return respond(400, { error: "name is required" });
      if (!body.sourceWorkspaceId && !body.verification) {
        return respond(400, { error: "Either sourceWorkspaceId (inherit) or verification (independent) is required" });
      }
      const slug = slugOf(body.name);
      if (slugs.has(slug)) {
        return respond(409, { error: "A workspace with a similar name already exists" });
      }
      slugs.add(slug);
      created.push(body.name);

      const source = body.sourceWorkspaceId;
      if (source !== PERSONAL && !(source in OWNED_ORGS)) {
        return respond(403, { error: "You must own the source workspace" });
      }
      const sourceVerification = source === PERSONAL ? accountVerification : OWNED_ORGS[source];
      if (!sourceVerification || !sourceVerification.messagingProfileId) {
        return respond(400, { error: "Source workspace has no active verification" });
      }

      const result: Record<string, unknown> = {
        workspace: { id: "ws_new", name: body.name, slug },
        verification: { id: "ver_1", status: sourceVerification.status, type: "toll_free", tollFreeNumber: null, inherited: true },
      };
      if (body.creditAmount && body.creditSourceWorkspaceId) {
        const amount = parseInt(body.creditAmount, 10);
        if (amount > 0 && body.creditSourceWorkspaceId in OWNED_ORGS) {
          result.credits =
            amount > POOL_BALANCE
              ? { error: "Insufficient credits" }
              : { transferred: amount, balance: amount };
        }
      }
      if (body.keyName) {
        result.key = { id: "key_1", name: body.keyName, key: "sk_test_v1_newkey", keyPrefix: "sk_test_v1_ne", type: body.keyType === "live" ? "live" : "test" };
      }
      if (body.webhookUrl) {
        if (!body.webhookUrl.startsWith("https://")) {
          return respond(400, { error: "Webhook URL must use HTTPS" });
        }
        result.webhook = body.webhookUrl.includes("unsaved")
          ? { error: "Failed to save the enterprise webhook" }
          : { url: body.webhookUrl };
      }
      return respond(201, result);
    }

    if (pathname === "/api/v1/enterprise/workspaces/provision/bulk") {
      const raw = body.workspaces as Record<string, unknown>[];
      if (raw.some((item) => WORKER_ONLY.some((field) => item[field] != null))) {
        if (options.workerConfigured) return respond(202, { jobId: "job_123", status: "queued" });
        return respond(400, { error: "Bulk provisioning cannot apply webhookUrl right now. Provision these workspaces one at a time with POST /api/v1/enterprise/workspaces/provision." });
      }
      const items = raw.map((item) => ({
        ...item,
        sourceWorkspaceId: item.sourceWorkspaceId ?? item.source_workspace_id ?? item.inheritVerificationFrom ?? undefined,
        creditAmount: item.creditAmount ?? item.credit_amount ?? undefined,
        creditSourceWorkspaceId: item.creditSourceWorkspaceId ?? item.credit_source_workspace_id ?? undefined,
      })) as Record<string, any>[];
      const invalid = validateBulk(items);
      if (invalid) return respond(400, { error: invalid });

      const results = items.map((item, i) => {
        const name = String(item.name ?? "").trim();
        if (!name) return { name: item.name, status: "failed", success: false, error: "name is required" };
        if (slugs.has(slugOf(name))) {
          return { name, status: "failed", success: false, error: "Workspace with similar name exists" };
        }
        slugs.add(slugOf(name));
        created.push(name);
        let creditError: string | null = null;
        if (item.creditAmount && item.creditAmount > 0 && item.creditSourceWorkspaceId) {
          if (!(item.creditSourceWorkspaceId in OWNED_ORGS)) creditError = "source workspace not found";
          else if (item.creditAmount > POOL_BALANCE) creditError = "Insufficient credits";
        }
        return {
          name,
          status: creditError ? "partial" : "success",
          success: true,
          workspaceId: `w${i + 1}`,
          slug: slugOf(name),
          ...(creditError && { warning: `Credit transfer failed: ${creditError}` }),
        };
      });
      const createdCount = results.filter((r) => r.success).length;
      return respond(201, {
        results,
        summary: { total: items.length, succeeded: createdCount, failed: items.length - createdCount },
        totalRequested: items.length,
        totalCreated: createdCount,
        totalFailed: items.length - createdCount,
      });
    }

    return respond(404, { error: "not_found" });
  });
  return created;
}

function posted(pathname: string) {
  return mockFetch.mock.calls
    .filter(([url, init]) => new URL(url).pathname === pathname && init.method === "POST")
    .map(([, init]) => JSON.parse(String(init.body)));
}

let dir: string;

function bulkFile(items: unknown): string {
  const file = path.join(dir, `bulk-${Math.random().toString(36).slice(2)}.json`);
  fs.writeFileSync(file, JSON.stringify(items));
  return file;
}

describe("sendly enterprise provision", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    setOutputFormat("human");
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "sendly-provision-"));
  });

  afterEach(() => {
    setOutputFormat("human");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  describe("single", () => {
    it("sends the fields the API reads and shows the key and credits", async () => {
      serve();

      const run = await runCommand(EnterpriseProvision, [
        "--name",
        "Acme",
        "--inherit-from",
        SRC,
        "--credits",
        "500",
        "--credits-from",
        POOL,
        "--create-key",
      ]);

      expect(run.stderr).toBe("");
      expect(run.exitCode).toBeUndefined();
      expect(posted("/api/v1/enterprise/workspaces/provision")).toEqual([
        {
          name: "Acme",
          sourceWorkspaceId: SRC,
          creditAmount: 500,
          creditSourceWorkspaceId: POOL,
          keyName: "Acme key",
          keyType: "test",
        },
      ]);
      expect(run.stdout).toContain("sk_test_v1_newkey");
      expect(run.stdout).toContain("500 credits");
    });

    it("refuses --credits without --credits-from before any request", async () => {
      serve();

      const run = await runCommand(EnterpriseProvision, [
        "--name",
        "Acme",
        "--inherit-from",
        SRC,
        "--credits",
        "500",
      ]);

      expect(run.exitCode).toBe(1);
      expect(run.stderr).toContain("--credits-from");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("refuses a missing --inherit-from before any request", async () => {
      serve();

      const run = await runCommand(EnterpriseProvision, ["--name", "Acme"]);

      expect(run.exitCode).toBe(1);
      expect(run.stderr).toContain("--inherit-from");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("does not create a workspace when the source isn't yours", async () => {
      const created = serve();

      const run = await runCommand(EnterpriseProvision, [
        "--name",
        "Acme",
        "--inherit-from",
        FOREIGN,
      ]);

      expect(run.exitCode).toBe(1);
      expect(created).toEqual([]);
      expect(posted("/api/v1/enterprise/workspaces/provision")).toEqual([]);
    });

    it("inherits from your own personal workspace", async () => {
      serve();

      const run = await runCommand(EnterpriseProvision, [
        "--name",
        "Acme",
        "--inherit-from",
        PERSONAL,
      ]);

      expect(run.stderr).toBe("");
      expect(run.exitCode).toBeUndefined();
      expect(posted("/api/v1/enterprise/workspaces/provision")).toEqual([
        { name: "Acme", sourceWorkspaceId: PERSONAL },
      ]);
    });

    it("does not create a workspace when your personal workspace has no verification to inherit", async () => {
      const created = serve({ accountVerification: null });

      const run = await runCommand(EnterpriseProvision, [
        "--name",
        "Acme",
        "--inherit-from",
        PERSONAL,
      ]);

      expect(created).toEqual([]);
      expect(posted("/api/v1/enterprise/workspaces/provision")).toEqual([]);
      expect(run.exitCode).toBe(1);
      expect(run.stderr).toMatch(/no verification/i);
    });

    it("does not create a workspace when the source workspace has no verification", async () => {
      const created = serve();

      const run = await runCommand(EnterpriseProvision, [
        "--name",
        "Acme",
        "--inherit-from",
        UNVERIFIED,
      ]);

      expect(run.exitCode).toBe(1);
      expect(run.stderr).toMatch(/no verification/i);
      expect(created).toEqual([]);
    });

    it("provisions from a source whose verification is still pending, which the API accepts", async () => {
      const created = serve();

      const run = await runCommand(EnterpriseProvision, [
        "--name",
        "Acme",
        "--inherit-from",
        PENDING,
      ]);

      expect(run.stderr).toBe("");
      expect(run.exitCode).toBeUndefined();
      expect(created).toEqual(["Acme"]);
    });

    it("says what the API refused, and that the workspace may be left behind, when the source fails after creation", async () => {
      const created = serve();

      const run = await runCommand(EnterpriseProvision, [
        "--name",
        "Acme",
        "--inherit-from",
        NO_PROFILE,
      ]);

      expect(created).toEqual(["Acme"]);
      expect(run.exitCode).toBe(1);
      expect(run.stderr).toContain("Source workspace has no active verification");
      expect(run.stderr).toContain('"Acme"');
      expect(run.stderr).toContain("sendly enterprise workspaces list");
      expect(run.stderr).toContain("sendly enterprise workspaces delete");
      expect(run.stderr).not.toContain("--help");
    });

    it("does not say a workspace may be left behind when the name is taken", async () => {
      serve();

      const run = await runCommand(EnterpriseProvision, [
        "--name",
        "Source",
        "--inherit-from",
        SRC,
      ]);

      expect(run.exitCode).toBe(1);
      expect(run.stderr).toContain("A workspace with a similar name already exists");
      expect(run.stderr).not.toContain("workspaces delete");
    });

    it("refuses a webhook URL that isn't https before creating anything", async () => {
      const created = serve();

      const run = await runCommand(EnterpriseProvision, [
        "--name",
        "Acme",
        "--inherit-from",
        SRC,
        "--webhook-url",
        "http://example.com/hook",
      ]);

      expect(run.exitCode).toBe(1);
      expect(created).toEqual([]);
    });

    it("says so when the credits could not be moved", async () => {
      serve();

      const run = await runCommand(EnterpriseProvision, [
        "--name",
        "Acme",
        "--inherit-from",
        SRC,
        "--credits",
        "500",
        "--credits-from",
        FOREIGN,
      ]);

      expect(run.exitCode).toBeUndefined();
      expect(run.stdout).toMatch(/not moved/i);
    });

    it("shows the API's reason when the credits transfer fails", async () => {
      serve();

      const run = await runCommand(EnterpriseProvision, [
        "--name",
        "Acme",
        "--inherit-from",
        SRC,
        "--credits",
        "5000",
        "--credits-from",
        POOL,
      ]);

      expect(run.stderr).toBe("");
      expect(run.exitCode).toBeUndefined();
      expect(run.stdout).toMatch(/Credits:?\s+not moved: Insufficient credits/);
    });

    it("shows the API's reason when the webhook can't be saved", async () => {
      serve();

      const run = await runCommand(EnterpriseProvision, [
        "--name",
        "Acme",
        "--inherit-from",
        SRC,
        "--webhook-url",
        "https://unsaved.example.com/hook",
      ]);

      expect(run.stderr).toBe("");
      expect(run.exitCode).toBeUndefined();
      expect(run.stdout).toMatch(/Webhook:?\s+not set: Failed to save the enterprise webhook/);
    });

    it("shows the webhook it set", async () => {
      serve();

      const run = await runCommand(EnterpriseProvision, [
        "--name",
        "Acme",
        "--inherit-from",
        SRC,
        "--webhook-url",
        "https://example.com/hook",
      ]);

      expect(run.exitCode).toBeUndefined();
      expect(posted("/api/v1/enterprise/workspaces/provision")[0].webhookUrl).toBe(
        "https://example.com/hook",
      );
      expect(run.stdout).toMatch(/Webhook:?\s+https:\/\/example\.com\/hook/);
    });
  });

  describe("bulk", () => {
    it("sends credits as creditAmount from --credits-from and shows each result", async () => {
      serve();
      const file = bulkFile([{ name: "A", credits: 100 }, { name: "B" }]);

      const run = await runCommand(EnterpriseProvision, [
        "--bulk",
        file,
        "--credits-from",
        POOL,
      ]);

      expect(run.stderr).toBe("");
      expect(run.exitCode).toBeUndefined();
      expect(posted("/api/v1/enterprise/workspaces/provision/bulk")).toEqual([
        {
          workspaces: [
            { name: "A", creditAmount: 100, creditSourceWorkspaceId: POOL },
            { name: "B" },
          ],
        },
      ]);
      expect(run.stdout).toContain("Workspace with similar name exists");
      expect(run.stdout).toContain("w1");
    });

    it("sends an item's own credit source with its credits", async () => {
      serve();
      const file = bulkFile([{ name: "A", credits: 100, creditSourceWorkspaceId: POOL }]);

      const run = await runCommand(EnterpriseProvision, ["--bulk", file]);

      expect(run.exitCode).toBeUndefined();
      expect(posted("/api/v1/enterprise/workspaces/provision/bulk")[0].workspaces).toEqual([
        { name: "A", creditAmount: 100, creditSourceWorkspaceId: POOL },
      ]);
    });

    it("creates an item whose credits name no source without them, as before, and says so", async () => {
      const created = serve();
      const file = bulkFile([{ name: "A", credits: 100 }, { name: "C" }]);

      const run = await runCommand(EnterpriseProvision, ["--bulk", file]);

      expect(run.exitCode).toBeUndefined();
      expect(posted("/api/v1/enterprise/workspaces/provision/bulk")[0].workspaces).toEqual([
        { name: "A" },
        { name: "C" },
      ]);
      expect(created).toEqual(["A", "C"]);
      expect(run.stdout).toMatch(/credits was dropped for: A\b/);
      expect(run.stdout).toContain("--credits-from");
    });

    it("sends credits: 0 as no credits instead of a creditAmount the API refuses", async () => {
      const created = serve();
      const file = bulkFile([{ name: "A", credits: 0 }, { name: "C" }]);

      const withSource = await runCommand(EnterpriseProvision, ["--bulk", file, "--credits-from", POOL]);

      expect(withSource.stderr).toBe("");
      expect(withSource.exitCode).toBeUndefined();
      expect(posted("/api/v1/enterprise/workspaces/provision/bulk")[0].workspaces).toEqual([
        { name: "A" },
        { name: "C" },
      ]);
      expect(created).toEqual(["A", "C"]);
      expect(withSource.stdout).not.toContain("dropped");

      mockFetch.mockClear();
      const other = bulkFile([{ name: "D", credits: 0 }]);
      const withoutSource = await runCommand(EnterpriseProvision, ["--bulk", other]);

      expect(withoutSource.exitCode).toBeUndefined();
      expect(posted("/api/v1/enterprise/workspaces/provision/bulk")[0].workspaces).toEqual([
        { name: "D" },
      ]);
    });

    it("drops credits that aren't a positive whole number, says so, and provisions the batch", async () => {
      const created = serve();
      const file = bulkFile([
        { name: "A", credits: -5 },
        { name: "C", credits: 1.5 },
        { name: "D", credits: "100" },
        { name: "E", credits: 100 },
      ]);

      const run = await runCommand(EnterpriseProvision, ["--bulk", file, "--credits-from", POOL]);

      expect(run.stderr).toBe("");
      expect(run.exitCode).toBeUndefined();
      expect(posted("/api/v1/enterprise/workspaces/provision/bulk")[0].workspaces).toEqual([
        { name: "A" },
        { name: "C" },
        { name: "D" },
        { name: "E", creditAmount: 100, creditSourceWorkspaceId: POOL },
      ]);
      expect(created).toEqual(["A", "C", "D", "E"]);
      expect(run.stdout).toMatch(/credits was dropped for: A, C, D\b/);
    });

    it("keeps an item's own creditAmount when it also sets credits, as the API always did", async () => {
      serve();
      const file = bulkFile([{ name: "A", credits: 100, creditAmount: 50 }]);

      const run = await runCommand(EnterpriseProvision, ["--bulk", file, "--credits-from", POOL]);

      expect(run.exitCode).toBeUndefined();
      expect(posted("/api/v1/enterprise/workspaces/provision/bulk")[0].workspaces).toEqual([
        { name: "A", creditAmount: 50, creditSourceWorkspaceId: POOL },
      ]);
    });

    it("fills the source of an item's creditAmount from --credits-from, and leaves one without a source as it was", async () => {
      serve();
      const file = bulkFile([
        { name: "A", creditAmount: 100 },
        { name: "C", creditAmount: 50, creditSourceWorkspaceId: SRC },
      ]);

      const run = await runCommand(EnterpriseProvision, ["--bulk", file, "--credits-from", POOL]);
      expect(run.exitCode).toBeUndefined();
      expect(posted("/api/v1/enterprise/workspaces/provision/bulk")[0].workspaces).toEqual([
        { name: "A", creditAmount: 100, creditSourceWorkspaceId: POOL },
        { name: "C", creditAmount: 50, creditSourceWorkspaceId: SRC },
      ]);

      mockFetch.mockClear();
      const unchanged = bulkFile([{ name: "A", creditAmount: 100 }]);
      const second = await runCommand(EnterpriseProvision, ["--bulk", unchanged]);
      expect(second.exitCode).toBeUndefined();
      expect(posted("/api/v1/enterprise/workspaces/provision/bulk")[0].workspaces).toEqual([
        { name: "A", creditAmount: 100 },
      ]);
    });

    it("refuses a webhookUrl item and points to single provisioning", async () => {
      serve();
      const file = bulkFile([{ name: "A", webhookUrl: "https://example.com/hook" }]);

      const run = await runCommand(EnterpriseProvision, ["--bulk", file]);

      expect(run.exitCode).toBe(1);
      expect(run.stderr).toContain("--webhook-url");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("drops createApiKey with a warning", async () => {
      serve();
      const file = bulkFile([{ name: "A", createApiKey: true }]);

      const run = await runCommand(EnterpriseProvision, ["--bulk", file]);

      expect(run.exitCode).toBeUndefined();
      expect(posted("/api/v1/enterprise/workspaces/provision/bulk")[0].workspaces).toEqual([
        { name: "A" },
      ]);
      expect(run.stdout).toMatch(/createApiKey/);
    });

    it("marks a workspace whose credits didn't move as partial and shows the API's warning", async () => {
      serve();
      const file = bulkFile([
        { name: "A", credits: 5000, creditSourceWorkspaceId: POOL },
        { name: "C", credits: 100, creditSourceWorkspaceId: FOREIGN },
        { name: "D", credits: 100, creditSourceWorkspaceId: POOL },
      ]);

      const run = await runCommand(EnterpriseProvision, ["--bulk", file]);

      expect(run.stderr).toBe("");
      expect(run.exitCode).toBeUndefined();
      const rows = run.stdout.split("\n");
      const row = (name: string) => rows.find((line) => line.includes(` ${name} `)) ?? "";
      expect(row("A")).toContain("partial");
      expect(row("A")).toContain("Credit transfer failed: Insufficient credits");
      expect(row("C")).toContain("partial");
      expect(row("C")).toContain("Credit transfer failed: source workspace not found");
      expect(row("D")).toContain("created");
      expect(run.stdout).not.toContain("failed to provision");
    });

    it("prints an accepted worker job instead of crashing", async () => {
      serve({ workerConfigured: true });
      const file = bulkFile([{ name: "A", generateOptInPage: true }]);

      const run = await runCommand(EnterpriseProvision, ["--bulk", file]);

      expect(run.stderr).toBe("");
      expect(run.exitCode).toBeUndefined();
      expect(run.stdout).toContain("job_123");
    });

    it("accepts up to 100 workspaces", async () => {
      serve();
      const items = Array.from({ length: 100 }, (_, i) => ({ name: `W${i}` }));
      const file = bulkFile(items);

      const run = await runCommand(EnterpriseProvision, ["--bulk", file]);

      expect(run.stderr).toBe("");
      expect(run.exitCode).toBeUndefined();
      expect(posted("/api/v1/enterprise/workspaces/provision/bulk")[0].workspaces).toHaveLength(100);
    });
  });
});
