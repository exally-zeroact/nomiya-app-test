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
  /* ★紙(A4)を作る試験は html2canvas で本当に写すので、同時に何本も走ると数十秒かかる★
     （WebKitでは実測34〜55秒）。30秒だと ★中身は正しいのに時間切れで赤★ になる。
     ★時間切れは「遅い」しか意味しない★＝本物の壊れは assert で落ちるので、待つ側を長くする。 */
  timeout: 60000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  /* ★手元でも1回やり直す★＝落ちたら trace（on-first-retry）が残る＝
     「重かったから」と推測で片づけずに、中身を見て切り分けられる（2026-08-17 指示役） */
  retries: 1,
  reporter: "list",
  use: {
    baseURL: BASE,
    headless: true,
    /* ★落ちた時の中身を残す★（2026-08-17 指示役）。
       やり直し(retries:1)のときに trace を録るので、落ちれば必ず中身が残る。
       ★retain-on-failure（毎回録って成功したら捨てる）は やめた★＝
       全部の試験に記録の重さが乗り、★紙の試験6件が時間切れで落ちた（実測 3.6分→6.8分）★。
       ＝「新しい試験が5MB埋めるから重い」という前の見立ては ★間違い★ だった。 */
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  /* ★重い試験（端末の控えを5MB埋める物）は別の組にして、ふつうの試験が全部 終わってから走らせる★
     2026-08-16、これを混ぜて走らせた1回目だけ 紙のPDFの2件が時間切れで落ちた。
     ★「重いから」で流さないために、混ざらない形にして 切り分けられるようにする★
     （dependencies を書くと、chromium が終わってからこの組が走る＝同時に走らない）。
     ★次に heavy 以外がまた落ちたら、それは「重いから」では説明できない★
     重い方だけ走らせたいとき: npx playwright test --project=heavy --no-deps */
  projects: [
    {
      name: "chromium",
      testIgnore: /heavy-.*\.spec\.js$/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "heavy",
      testMatch: /heavy-.*\.spec\.js$/,
      fullyParallel: false,
      dependencies: ["chromium"],
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npx http-server -p " + PORT + " -c-1 -s .",
    // ★このrepoにしか無いファイルで健康確認する（別repoのサーバーを掴んだら気付ける）
    url: BASE + "/js/supa-config.js",
    timeout: 60000,
    reuseExistingServer: false, // 使い回さない。ポートが埋まっていたら黙って通さず落ちる
  },
});
