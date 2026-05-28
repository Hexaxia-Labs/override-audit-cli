import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { scanProjectForPackageUsage } from "../src/usage/scanner.js";

describe("scanProjectForPackageUsage", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cve-lite-usage-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function createTestFile(filePath: string, content: string) {
    const fullPath = path.join(tempDir, filePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  }

  it("should find imports and requires", () => {
    createTestFile("src/index.js", `
      import { someMethod } from 'lodash';
      import * as utils from "my-utils";
      const express = require('express');
      await import('dynamic-pkg');
      export { something } from 'exported-pkg';
    `);

    createTestFile("src/other.ts", `
      import 'side-effect-pkg';
      import type { Foo } from '@scope/types';
    `);

    const packagesToLookFor = new Set([
      "lodash", "my-utils", "express", "dynamic-pkg", "exported-pkg", "side-effect-pkg", "@scope/types", "not-found-pkg"
    ]);

    const results = scanProjectForPackageUsage(tempDir, packagesToLookFor);

    expect(results["lodash"].length).toBe(1);
    expect(results["lodash"][0]).toMatch(/src.index\.js/);

    expect(results["my-utils"].length).toBe(1);
    expect(results["express"].length).toBe(1);
    expect(results["dynamic-pkg"].length).toBe(1);
    expect(results["exported-pkg"].length).toBe(1);
    
    expect(results["side-effect-pkg"].length).toBe(1);
    expect(results["side-effect-pkg"][0]).toMatch(/src.other\.ts/);
    
    expect(results["@scope/types"].length).toBe(1);

    expect(results["not-found-pkg"].length).toBe(0);
  });

  it("should ignore node_modules and other configured directories", () => {
    createTestFile("node_modules/bad-pkg/index.js", "import 'lodash';");
    createTestFile(".git/hooks/pre-commit", "import 'lodash';");
    createTestFile("dist/bundle.js", "require('lodash');");
    createTestFile("build/index.js", "require('lodash');");
    createTestFile("src/index.js", "import 'lodash';");

    const results = scanProjectForPackageUsage(tempDir, new Set(["lodash"]));
    
    expect(results["lodash"].length).toBe(1);
    expect(results["lodash"][0]).toMatch(/src.index\.js/);
  });

  it("should extract bare module names correctly", () => {
    createTestFile("src/index.js", `
      import { x } from 'lodash/fp/map';
      require('@scope/pkg/submodule/file.js');
      import './local-file.js';
      import '../parent.js';
      import '/absolute/path.js';
    `);

    const packages = new Set(["lodash", "@scope/pkg", "local-file"]);
    const results = scanProjectForPackageUsage(tempDir, packages);

    expect(results["lodash"].length).toBe(1);
    expect(results["@scope/pkg"].length).toBe(1);
    expect(results["local-file"].length).toBe(0); // Because relative paths return ""
  });
});
