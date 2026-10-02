import { defineConfig } from "@playwright/test";
import baseConfig from "./playwright.config";

export default defineConfig({
  ...baseConfig,
  testDir: "./tests/pagination",
  workers: 1,
  use: {
    ...baseConfig.use,
    baseURL: "http://127.0.0.1:3127",
    serviceWorkers: "block",
    video: "on",
  },
  webServer: {
    command: "yarn dev --hostname 127.0.0.1 --port 3127",
    url: "http://127.0.0.1:3127/home",
    reuseExistingServer: false,
    timeout: 120000,
  },
});
