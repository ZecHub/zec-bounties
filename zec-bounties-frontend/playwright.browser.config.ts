import { defineConfig, devices } from "@playwright/test";
import baseConfig from "./playwright.config";

// Both suites share one dev server and run one test at a time, as their separate configs did.
export default defineConfig({
  ...baseConfig,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  use: {
    ...baseConfig.use,
    baseURL: "http://127.0.0.1:3127",
    serviceWorkers: "block",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "pagination", testDir: "./tests/pagination", use: { ...devices["Desktop Chrome"] } },
    { name: "status-sync", testDir: "./tests/status-sync", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "yarn dev --hostname 127.0.0.1 --port 3127",
    url: "http://127.0.0.1:3127/home",
    reuseExistingServer: false,
    timeout: 120000,
  },
});
