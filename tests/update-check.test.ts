import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { jest } from "@jest/globals";
import { isNewer, readCache, writeCache, isCacheStale } from "../src/utils/update-check.js";

describe("isNewer", () => {
  it("returns true when latest has a higher major", () => {
    expect(isNewer("2.0.0", "1.17.3")).toBe(true);
  });

  it("returns true when latest has a higher minor", () => {
    expect(isNewer("1.18.0", "1.17.3")).toBe(true);
  });

  it("returns true when latest has a higher patch", () => {
    expect(isNewer("1.17.4", "1.17.3")).toBe(true);
  });

  it("returns false when versions are equal", () => {
    expect(isNewer("1.17.3", "1.17.3")).toBe(false);
  });

  it("returns false when latest is older", () => {
    expect(isNewer("1.16.0", "1.17.3")).toBe(false);
  });

  it("handles v-prefix in either argument", () => {
    expect(isNewer("v1.18.0", "v1.17.3")).toBe(true);
  });

  it("returns false when either version is malformed", () => {
    expect(isNewer("not-a-version", "1.17.3")).toBe(false);
    expect(isNewer("1.18.0", "not-a-version")).toBe(false);
  });
});

describe("readCache", () => {
  it("returns null when cache file does not exist", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cve-test-"));
    expect(readCache(tmpDir)).toBeNull();
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("returns null for a corrupt cache file", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cve-test-"));
    fs.writeFileSync(path.join(tmpDir, "update-check.json"), "not-json", "utf8");
    expect(readCache(tmpDir)).toBeNull();
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("returns null when required fields are missing", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cve-test-"));
    fs.writeFileSync(path.join(tmpDir, "update-check.json"), JSON.stringify({ foo: "bar" }), "utf8");
    expect(readCache(tmpDir)).toBeNull();
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("returns the cache when file is valid", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cve-test-"));
    const payload = { latestVersion: "1.18.0", checkedAt: new Date().toISOString() };
    fs.writeFileSync(path.join(tmpDir, "update-check.json"), JSON.stringify(payload), "utf8");
    expect(readCache(tmpDir)).toEqual(payload);
    fs.rmSync(tmpDir, { recursive: true });
  });
});

describe("writeCache", () => {
  it("writes latestVersion and checkedAt to the cache file", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cve-test-"));
    writeCache("1.18.0", tmpDir);
    const result = readCache(tmpDir);
    expect(result?.latestVersion).toBe("1.18.0");
    expect(typeof result?.checkedAt).toBe("string");
    fs.rmSync(tmpDir, { recursive: true });
  });
});

describe("isCacheStale", () => {
  it("returns false for a cache written now", () => {
    const cache = { latestVersion: "1.18.0", checkedAt: new Date().toISOString() };
    expect(isCacheStale(cache)).toBe(false);
  });

  it("returns true for a cache written 25 hours ago", () => {
    const old = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    expect(isCacheStale({ latestVersion: "1.18.0", checkedAt: old })).toBe(true);
  });
});

import { checkForUpdate } from "../src/utils/update-check.js";

describe("checkForUpdate", () => {
  let tmpDir: string;
  let consoleSpy: ReturnType<typeof jest.spyOn>;
  let savedCI: string | undefined;
  let savedNoUpdateNotifier: string | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cve-test-"));
    consoleSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    savedCI = process.env["CI"];
    savedNoUpdateNotifier = process.env["NO_UPDATE_NOTIFIER"];
    delete process.env["CI"];
    delete process.env["NO_UPDATE_NOTIFIER"];
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    fs.rmSync(tmpDir, { recursive: true });
    if (savedCI !== undefined) process.env["CI"] = savedCI;
    else delete process.env["CI"];
    if (savedNoUpdateNotifier !== undefined) process.env["NO_UPDATE_NOTIFIER"] = savedNoUpdateNotifier;
    else delete process.env["NO_UPDATE_NOTIFIER"];
  });

  it("prints the update box when a newer version is cached", () => {
    writeCache("999.0.0", tmpDir);
    checkForUpdate({ cacheDir: tmpDir });
    expect(consoleSpy).toHaveBeenCalled();
    const output = consoleSpy.mock.calls.map(c => String(c[0])).join("\n");
    expect(output).toContain("Update available!");
    expect(output).toContain("999.0.0");
    expect(output).toContain("npm install -g cve-lite-cli");
  });

  it("does not print a box when cached version is not newer", () => {
    writeCache("0.0.1", tmpDir);
    checkForUpdate({ cacheDir: tmpDir });
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it("does not print a box when cache is missing", () => {
    checkForUpdate({ cacheDir: tmpDir });
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it("is suppressed when json option is true", () => {
    writeCache("999.0.0", tmpDir);
    checkForUpdate({ json: true, cacheDir: tmpDir });
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it("is suppressed when offline option is true", () => {
    writeCache("999.0.0", tmpDir);
    checkForUpdate({ offline: true, cacheDir: tmpDir });
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it("is suppressed when offlineDb is set", () => {
    writeCache("999.0.0", tmpDir);
    checkForUpdate({ offlineDb: "/some/path.db", cacheDir: tmpDir });
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it("is suppressed when CI=true", () => {
    writeCache("999.0.0", tmpDir);
    process.env["CI"] = "true";
    checkForUpdate({ cacheDir: tmpDir });
    delete process.env["CI"];
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it("is suppressed when NO_UPDATE_NOTIFIER is set", () => {
    writeCache("999.0.0", tmpDir);
    process.env["NO_UPDATE_NOTIFIER"] = "1";
    checkForUpdate({ cacheDir: tmpDir });
    delete process.env["NO_UPDATE_NOTIFIER"];
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it("does not throw when the cache file is corrupt", () => {
    fs.writeFileSync(path.join(tmpDir, "update-check.json"), "not-json", "utf8");
    expect(() => checkForUpdate({ cacheDir: tmpDir })).not.toThrow();
    expect(consoleSpy).not.toHaveBeenCalled();
  });
});
