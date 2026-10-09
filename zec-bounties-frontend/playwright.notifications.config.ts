import { defineConfig } from "@playwright/test";
import baseConfig from "./playwright.config";

export default defineConfig({
  ...baseConfig,
  testDir: "./tests/notifications",
  workers: 1,
  use: {
    ...baseConfig.use,
    baseURL: "http://127.0.0.1:3128",
    serviceWorkers: "block",
    video: "off",
  },
  webServer: {
    command: "yarn dev --hostname 127.0.0.1 --port 3128",
    url: "http://127.0.0.1:3128/home",
    reuseExistingServer: false,
    timeout: 120000,
  },
});
