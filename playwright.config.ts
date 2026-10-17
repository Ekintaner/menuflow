import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  use: { baseURL: "http://127.0.0.1:5198", trace: "retain-on-failure" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: [
    {
      command: "npm run dev:web -- --port 5198 --strictPort",
      url: "http://127.0.0.1:5198",
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "npm run dev:api",
      url: "http://127.0.0.1:8798/api/v1/health",
      reuseExistingServer: !process.env.CI,
    },
  ],
});
