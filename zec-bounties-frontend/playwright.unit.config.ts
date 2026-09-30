import { defineConfig } from "@playwright/test";

// Pure-logic unit tests. These exercise plain functions (no page, no browser),
// so unlike the accessibility suite they need neither a dev server nor a
// browser project. Kept in a separate config so `test:unit` stays fast and can
// run in CI without starting the app.
export default defineConfig({
  testDir: "./lib/__tests__",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: [["list"]],
});
