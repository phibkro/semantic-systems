import { defineConfig, devices } from "@playwright/test";

const baseUrl = "http://127.0.0.1:4173/";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.pw.ts",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  reporter: "line",
  use: {
    baseURL: baseUrl,
    serviceWorkers: "allow",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "bun run preview",
    url: baseUrl,
    reuseExistingServer: false,
  },
  projects: [{ name: "mobile-chromium", use: { ...devices["Pixel 7"] } }],
});
