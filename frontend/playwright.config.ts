import { defineConfig } from "@playwright/test";
import path from "node:path";

const output =
  process.env.E2E_OUTPUT_DIR ||
  path.resolve(__dirname, "../test-results/browser");
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 240000,
  expect: { timeout: 15000 },
  workers: 1,
  retries: 0,
  outputDir: output,
  reporter: [
    ["list", { printSteps: true }],
    ["json", { outputFile: path.join(output, "results.json") }],
  ],
  use: {
    actionTimeout: 15000,
    navigationTimeout: 30000,
    baseURL: process.env.E2E_UI_URL || "http://localhost:3000",
    headless: true,
    viewport: { width: 1440, height: 1000 },
    screenshot: "only-on-failure",
    trace: "off",
  },
});
