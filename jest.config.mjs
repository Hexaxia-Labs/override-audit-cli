import { createDefaultEsmPreset } from "ts-jest";

const preset = createDefaultEsmPreset({
  tsconfig: "./tsconfig.test.json",
});

export default {
  ...preset,
  testEnvironment: "node",
  globalSetup: "<rootDir>/tests/e2e/global-setup.mjs",
  roots: ["<rootDir>/tests"],
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/**/*.d.ts",
  ],
};
