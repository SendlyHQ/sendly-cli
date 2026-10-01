import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

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

import AnalyticsMessages from "../../../src/commands/enterprise/analytics/messages.js";
import AnalyticsCredits from "../../../src/commands/enterprise/analytics/credits.js";
import AnalyticsDelivery from "../../../src/commands/enterprise/analytics/delivery.js";
import { setOutputFormat } from "../../../src/lib/output.js";
import { respond, runCommand } from "../../helpers/run-command.js";

describe("sendly enterprise analytics", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    setOutputFormat("human");
  });

  afterEach(() => {
    setOutputFormat("human");
  });

  describe("messages", () => {
    it("totals the daily series", async () => {
      mockFetch.mockResolvedValueOnce(
        respond(200, {
          period: "7d",
          data: [
            { date: "2026-09-20", sent: 3, delivered: 2, failed: 1 },
            { date: "2026-09-21", sent: 1, delivered: 1, failed: 0 },
          ],
        }),
      );

      const run = await runCommand(AnalyticsMessages, []);

      expect(run.stderr).toBe("");
      expect(run.exitCode).toBeUndefined();
      expect(run.stdout).toContain("Totals: 4 sent, 3 delivered, 1 failed");
      expect(run.stdout).toContain("2026-09-20");
    });

    it("shows zeros when there are no workspaces", async () => {
      mockFetch.mockResolvedValueOnce(respond(200, { period: "7d", data: [] }));

      const run = await runCommand(AnalyticsMessages, []);

      expect(run.stderr).toBe("");
      expect(run.exitCode).toBeUndefined();
      expect(run.stdout).toContain("Totals: 0 sent, 0 delivered, 0 failed");
      expect(run.stdout).toContain("No data to display");
    });
  });

  describe("credits", () => {
    it("shows the all-time totals the API returns", async () => {
      mockFetch.mockResolvedValueOnce(
        respond(200, {
          period: "7d",
          totalBalance: 500,
          totalLifetime: 2000,
          totalUsed: 1500,
          workspaceCount: 3,
        }),
      );

      const run = await runCommand(AnalyticsCredits, []);

      expect(run.stderr).toBe("");
      expect(run.exitCode).toBeUndefined();
      expect(run.stdout).toContain("1,500 credits");
      expect(run.stdout).toContain("2,000 credits");
      expect(run.stdout).toContain("500 credits");
      expect(run.stdout).toMatch(/Workspaces\s+3/);
      expect(run.stdout).toContain("all time");
    });
  });

  describe("delivery", () => {
    it("lists each workspace from the array the API returns", async () => {
      mockFetch.mockResolvedValueOnce(
        respond(200, [
          {
            workspaceId: "org_one",
            workspaceName: "Acme East",
            totalMessages: 200,
            delivered: 190,
            deliveryRate: 95,
            name: "Acme East",
            sent: 200,
            failed: 10,
            rate: 95,
          },
          {
            workspaceId: "org_two",
            workspaceName: "Acme West",
            totalMessages: 50,
            delivered: 40,
            deliveryRate: 80,
            name: "Acme West",
            sent: 50,
            failed: 10,
            rate: 80,
          },
        ]),
      );

      const run = await runCommand(AnalyticsDelivery, []);

      expect(run.stderr).toBe("");
      expect(run.exitCode).toBeUndefined();
      expect(run.stdout).toContain("Acme East");
      expect(run.stdout).toContain("200");
      expect(run.stdout).toContain("95.0%");
      expect(run.stdout).toContain("Acme West");
      expect(run.stdout).toContain("80.0%");
    });

    it("shows zeros for a workspace that has sent nothing", async () => {
      mockFetch.mockResolvedValueOnce(
        respond(200, [
          {
            workspaceId: "org_three",
            workspaceName: "Acme North",
            totalMessages: 0,
            delivered: 0,
            deliveryRate: 0,
            name: "Acme North",
            sent: 0,
            failed: 0,
            rate: 0,
          },
        ]),
      );

      const run = await runCommand(AnalyticsDelivery, []);

      expect(run.stderr).toBe("");
      expect(run.exitCode).toBeUndefined();
      expect(run.stdout).toContain("Acme North");
      expect(run.stdout).toContain("0.0%");
      expect(run.stdout).not.toContain("NaN");
      expect(run.stdout).not.toMatch(/│\s+-\s+│/);
    });
  });
});
