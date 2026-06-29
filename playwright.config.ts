import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

// Authenticated tests need the Supabase service-role key (server-only secret).
dotenv.config({ path: ".env.local" });

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
  projects: [
    // Public, unauthenticated surface — runs anywhere, no secrets needed.
    {
      name: "smoke",
      testMatch: /auth-smoke\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    // Mints a session for a test user and saves it to storageState.
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    // Authenticated tests reuse the saved session. Need .env.local locally.
    {
      name: "authed",
      testMatch: /.*\.authed\.spec\.ts/,
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/user.json",
      },
    },
  ],
});
