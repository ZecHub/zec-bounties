import { defineConfig } from "@playwright/test";
import baseConfig from "./playwright.config";

// Feeds and share metadata, following the shape of playwright.pagination.config.ts:
// its own testDir and its own port, so it can run alongside the other suites
// without fighting over a dev server.
export default defineConfig({
  ...baseConfig,
  testDir: "./tests/features",
  workers: 1,
  use: {
    ...baseConfig.use,
    baseURL: "http://127.0.0.1:3128",
    serviceWorkers: "block",
  },
  webServer: {
    command: "yarn dev --hostname 127.0.0.1 --port 3128",
    url: "http://127.0.0.1:3128/home",
    reuseExistingServer: false,
    timeout: 120000,
  },
});
