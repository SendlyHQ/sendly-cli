import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("node:fs", () => ({
  realpathSync: vi.fn((p: string) => p),
}));

import * as fs from "node:fs";
import {
  detectInstallPath,
  upgradeCommandFor,
} from "../../src/lib/detect-install-path.js";

const realpathMock = fs.realpathSync as unknown as ReturnType<typeof vi.fn>;

describe("detectInstallPath", () => {
  const originalArgv = process.argv;
  const originalEnv = process.env;

  beforeEach(() => {
    process.argv = [...originalArgv];
    process.env = { ...originalEnv };
    delete process.env.HOMEBREW_CELLAR;
    realpathMock.mockReset().mockImplementation((p: string) => p);
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.env = originalEnv;
  });

  it("identifies Apple-Silicon Homebrew installs", () => {
    process.argv[1] = "/opt/homebrew/Cellar/sendly/3.33.0/libexec/bin/sendly";
    expect(detectInstallPath()).toBe("homebrew");
  });

  it("identifies Intel Homebrew installs", () => {
    process.argv[1] = "/usr/local/Cellar/sendly/3.33.0/libexec/bin/sendly";
    expect(detectInstallPath()).toBe("homebrew");
  });

  it("identifies linuxbrew installs", () => {
    process.argv[1] =
      "/home/linuxbrew/.linuxbrew/Cellar/sendly/3.33.0/libexec/bin/sendly";
    expect(detectInstallPath()).toBe("homebrew");
  });

  it("identifies npm-global installs", () => {
    process.argv[1] =
      "/usr/local/lib/node_modules/@sendly/cli/bin/run.js";
    expect(detectInstallPath()).toBe("npm");
  });

  it("identifies nvm installs after symlink resolution", () => {
    // Symlinked entry — nvm typically drops a symlink in bin/ pointing
    // to the installed module under lib/node_modules.
    process.argv[1] = "/Users/dev/.nvm/versions/node/v22.22.0/bin/sendly";
    realpathMock.mockReturnValueOnce(
      "/Users/dev/.nvm/versions/node/v22.22.0/lib/node_modules/@sendly/cli/bin/run.js",
    );
    expect(detectInstallPath()).toBe("npm");
  });

  it("does NOT misclassify npm installs as homebrew when HOMEBREW_CELLAR is set", () => {
    // Regression test: a user with Homebrew on PATH inherits HOMEBREW_CELLAR
    // in every shell, but that does NOT mean this CLI was installed by
    // brew. The path is authoritative.
    process.env.HOMEBREW_CELLAR = "/opt/homebrew/Cellar";
    process.argv[1] =
      "/usr/local/lib/node_modules/@sendly/cli/bin/run.js";
    expect(detectInstallPath()).toBe("npm");
  });

  it("returns unknown when the path is inconclusive, even with HOMEBREW_CELLAR set", () => {
    // The env var only proves Homebrew exists on the machine; it is NOT
    // a signal of how THIS binary was installed. Better to return
    // "unknown" (which prints both upgrade options) than guess wrong.
    process.env.HOMEBREW_CELLAR = "/opt/homebrew/Cellar";
    process.argv[1] = "/some/odd/install/path/sendly";
    expect(detectInstallPath()).toBe("unknown");
  });

  it("returns unknown when neither signal applies", () => {
    process.argv[1] = "/some/odd/install/path/sendly";
    expect(detectInstallPath()).toBe("unknown");
  });

  it("survives realpath failures by falling back to argv[1]", () => {
    realpathMock.mockImplementationOnce(() => {
      throw new Error("ENOENT");
    });
    process.argv[1] =
      "/usr/local/lib/node_modules/@sendly/cli/bin/run.js";
    expect(detectInstallPath()).toBe("npm");
  });
});

describe("upgradeCommandFor", () => {
  it("maps homebrew to brew upgrade", () => {
    expect(upgradeCommandFor("homebrew")).toBe("brew upgrade sendly");
  });

  it("maps npm to npm install -g", () => {
    expect(upgradeCommandFor("npm")).toBe(
      "npm install -g @sendly/cli@latest",
    );
  });

  it("maps unknown to a both-options hint", () => {
    expect(upgradeCommandFor("unknown")).toContain("npm install -g");
    expect(upgradeCommandFor("unknown")).toContain("brew upgrade");
  });
});
