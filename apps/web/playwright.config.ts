import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  workers: 3,
  use: {
    baseURL: "http://127.0.0.1:42931",
    channel: "chrome",
    viewport: { width: 1440, height: 1000 },
    timezoneId: "America/Los_Angeles",
    trace: "retain-on-failure",
  },
  webServer: {
    command:
      "bun run build && bunx vite preview --host 127.0.0.1 --port 42931 --strictPort",
    url: "http://127.0.0.1:42931",
    reuseExistingServer: false,
  },
});
