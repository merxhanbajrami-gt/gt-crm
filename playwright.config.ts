import { defineConfig, devices } from "@playwright/test";

// Smoke tests run against a deployed (or local) instance. Defaults to prod;
// override with PLAYWRIGHT_BASE_URL=http://localhost:3000 to test locally.
const baseURL =
  process.env.PLAYWRIGHT_BASE_URL ?? "https://gt-crm.onrender.com";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
