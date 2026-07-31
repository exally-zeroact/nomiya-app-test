import { defineConfig, devices } from "@playwright/test";

// E2E(画面回帰)設定。このrepoのファイルを http-server で配信し、実ブラウザで画面を開いて
// 実行時JSエラー(pageerror)が無いか・主要要素が出るか・操作でクラッシュしないかを自動検証する。
// vitest(tests/**/*.test.js)とは別系統: こちらは tests/e2e/**/*.spec.js のみ対象。
//
// ★事故った実話（2026-08-01）:
//   前は 8080 を使い、reuseExistingServer で「既に立っているサーバー」を使い回していた。
//   別repoのサーバーが 8080 に残っていたせいで、こっちのファイルを1つも試さないまま
//   「70件ぜんぶ緑」と出た＝偽の緑。
//   なので (1)このrepo専用のポートを使い (2)使い回しをやめ
//   (3)このrepoにしか無いファイルで「ちゃんと自分の物を配信しているか」を確かめる。
const PORT = 8123; // 飲み屋アプリ専用（他repoと重ねない）
const BASE = "http://localhost:" + PORT;

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.spec.js",
  timeout: 30000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: BASE,
    headless: true,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npx http-server -p " + PORT + " -c-1 -s .",
    // ★このrepoにしか無いファイルで健康確認する（別repoのサーバーを掴んだら気付ける）
    url: BASE + "/js/supa-config.js",
    timeout: 60000,
    reuseExistingServer: false, // 使い回さない。ポートが埋まっていたら黙って通さず落ちる
  },
});
