import { defineConfig, devices } from "@playwright/test";

// E2E(画面回帰)設定。静的ファイルを http-server で配信し、実ブラウザで各画面を開いて
// 実行時JSエラー(pageerror)が無いか・主要要素が出るか・操作でクラッシュしないかを自動検証する。
// vitest(tests/**/*.test.js)とは別系統: こちらは tests/e2e/**/*.spec.js のみ対象。
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.spec.js",
  timeout: 30000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "list" : "list",
  use: {
    baseURL: "http://localhost:8080",
    headless: true,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npx http-server -p 8080 -c-1 -s .",
    url: "http://localhost:8080/home.html",
    timeout: 60000,
    reuseExistingServer: !process.env.CI,
  },
});
