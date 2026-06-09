import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for extension contract E2E tests.
 * Loads the built extension from web/dist/ as an unpacked extension.
 * No Vite dev server — tests run against the production build artifact.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "extension-lua.contract.spec.ts",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    // No baseURL — tests navigate to chrome-extension:// directly
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    headless: true,
  },
  // No webServer — we load the unpacked extension directly
  projects: [
    {
      name: "chromium-extension",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
