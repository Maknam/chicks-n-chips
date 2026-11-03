import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
    channel: process.platform === "win32" ? "msedge" : undefined,
  },
  webServer: {
    command: "npm run dev -- --port 3100",
    url: "http://localhost:3100/api/health",
    reuseExistingServer: false,
    timeout: 120000,
    // Runs against the database in DATABASE_URL (.env.local or CI secret): use a Neon
    // dev/preview branch seeded with `npm run db:seed -- --demo`, never production.
    env: {
      APP_ORIGIN: "http://localhost:3100",
      DEMO_MODE: "true",
    },
  },
});
