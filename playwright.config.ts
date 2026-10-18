import { defineConfig, devices } from "@playwright/test";
// Requires: `supabase start` (local only) and .env.local pointing at http://127.0.0.1:54321
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  workers: 1,
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  reporter: [["list"]],
  use: { baseURL: "http://localhost:8080", trace: "retain-on-failure",
    // fake camera/mic so WebRTC calls can be tested end-to-end
    launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"] } },
  webServer: [
    { command: "npm run dev -- --port 8080 --strictPort", url: "http://localhost:8080", reuseExistingServer: true, timeout: 60_000 },
    // voice agent (FastAPI) — reads the local Supabase URL/anon key from .env.local
    // Edge Functions (payments) on the local stack: GET payments-create-order is a health check
    { command: "supabase functions serve", url: "http://127.0.0.1:54321/functions/v1/payments-create-order", reuseExistingServer: true, timeout: 180_000 },
    { command: "services/agent/run.sh", url: "http://127.0.0.1:8787/agent/health", reuseExistingServer: true, timeout: 120_000, env: { AGENT_STT_PROVIDER: "mock" } },
  ],
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { viewport: { width: 1366, height: 820 } } },
  ],
});
