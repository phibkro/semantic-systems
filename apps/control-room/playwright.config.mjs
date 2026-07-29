import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  reporter: "line",
  use: {
    baseURL: "http://127.0.0.1:4173/semantic-systems/",
    serviceWorkers: "allow",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "bun run serve:preview",
    url: "http://127.0.0.1:4173/semantic-systems/",
    reuseExistingServer: false,
  },
  projects: [
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"] },
    },
  ],
});
