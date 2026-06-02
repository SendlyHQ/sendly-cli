/**
 * Keypress / clipboard helper tests
 * Covers the shared press-[c]-to-copy + [q]-to-cancel handler that backs
 * both `sendly login` and `sendly numbers buy`.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Output module is the only dependency; stub the color helpers.
vi.mock("../../src/lib/output.js", () => ({
  colors: {
    dim: (s: string) => s,
    success: (s: string) => s,
    warning: (s: string) => s,
  },
}));

import {
  attachLoginKeypressHandler,
  copyToClipboard,
} from "../../src/lib/keypress.js";

describe("keypress helpers", () => {
  describe("attachLoginKeypressHandler", () => {
    const originalStdin = process.stdin;

    afterEach(() => {
      // Restore stdin shape after each test
      Object.defineProperty(process, "stdin", {
        value: originalStdin,
        configurable: true,
      });
    });

    it("no-ops and returns a callable cleanup when stdin is not a TTY", () => {
      Object.defineProperty(process, "stdin", {
        value: { isTTY: false },
        configurable: true,
      });

      const cleanup = attachLoginKeypressHandler("https://sendly.live/x");
      expect(typeof cleanup).toBe("function");
      // Should not throw when called (and can be called twice safely)
      expect(() => {
        cleanup();
        cleanup();
      }).not.toThrow();
    });

    it("no-ops when setRawMode is unavailable", () => {
      Object.defineProperty(process, "stdin", {
        value: { isTTY: true },
        configurable: true,
      });

      const cleanup = attachLoginKeypressHandler("https://sendly.live/x");
      expect(typeof cleanup).toBe("function");
      expect(() => cleanup()).not.toThrow();
    });

    it("wires a raw-mode listener and cleans it up on a TTY", () => {
      const listeners: Array<(k: string) => void> = [];
      const fakeStdin = {
        isTTY: true,
        isRaw: false,
        setRawMode: vi.fn(),
        resume: vi.fn(),
        pause: vi.fn(),
        setEncoding: vi.fn(),
        on: vi.fn((event: string, cb: (k: string) => void) => {
          if (event === "data") listeners.push(cb);
        }),
        removeListener: vi.fn(),
      };
      Object.defineProperty(process, "stdin", {
        value: fakeStdin,
        configurable: true,
      });

      const cleanup = attachLoginKeypressHandler("https://sendly.live/x");

      expect(fakeStdin.setRawMode).toHaveBeenCalledWith(true);
      expect(fakeStdin.resume).toHaveBeenCalled();
      expect(listeners.length).toBe(1);

      cleanup();
      expect(fakeStdin.removeListener).toHaveBeenCalled();
      // restores the previous raw mode (false)
      expect(fakeStdin.setRawMode).toHaveBeenLastCalledWith(false);
    });
  });

  describe("copyToClipboard", () => {
    it("returns a boolean and never throws", async () => {
      const result = await copyToClipboard("hello");
      expect(typeof result).toBe("boolean");
    });
  });
});
