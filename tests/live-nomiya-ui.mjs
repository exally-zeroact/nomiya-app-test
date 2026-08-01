/* live-nomiya-ui.mjs — 本物のテストURL＋本物のテスト用DBで、実UIの往復を確かめる
 * ------------------------------------------------------------------------------
 *  使い方:  node tests/live-nomiya-ui.mjs
 *  ★このrepo(nomiya-app-test)はテスト用DBを向いている。本番倉庫だったら即中止する。
 *  前提:
 *   ① supabase/schema-nomiya.sql を DB-test に適用済み（node tests/probe-nomiya-db.mjs が OK）
 *   ② DB-test で「匿名サインイン」が有効（Authentication > Sign In / Providers）
 *
 *  ★合言葉(パスワード)は要らない。
 *    匿名サインインで、その場かぎりの本物のアカウントを2つ作って使う。
 *    お店のアカウントには最初から触れない（別人なのでRLSが弾く）。
 *  やること:
 *   1. テストURLを開く → 使い捨てのアカウントで入った状態にする
 *   2. 売上を1件入れる → 「同期済み」になる
 *   3. 端末の控えを全部消して開き直す → クラウドから戻ってくる（＝本当に保存されている）
 *   4. もう1つの使い捨てアカウントで入る → さっきの売上が1件も見えない（RLSの隔離）
 *  片付け: 入れた売上は最後に「全部消す」で消し、クラウドにも消したことを伝える
 */
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { readSupaConfig } from "./supa-from-config.mjs";

const { url: SUPA_URL, key: SUPA_KEY } = readSupaConfig(); // 本番倉庫ならこの中で止まる

const SITE = process.env.NOMIYA_URL || "https://nomiya-app-test.vercel.app/nomiya-uriage.html";

let ok = 0;
let ng = 0;
function check(name, cond, extra) {
  if (cond) {
    ok++;
    console.log("  ✓ " + name);
  } else {
    ng++;
    console.log("  ✗ " + name + (extra ? "  → " + JSON.stringify(extra) : ""));
  }
}
function die(m) {
  console.error("中止: " + m);
  process.exit(1);
}

// 使い捨ての本物のログインを作る（合言葉なし）。人のアカウントなら即中止。
async function makeAnonSession(label) {
  const sb = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false } });
  const r = await sb.auth.signInAnonymously();
  if (r.error) {
    die(
      "使い捨てのログインが作れません: " +
        r.error.message +
        "（DB-test の Authentication > Sign In / Providers で「Allow anonymous sign-ins」を有効に）"
    );
  }
  if (String(r.data.user.email || "") !== "") {
    die("匿名ではないアカウントで入りました。人のデータに触る恐れがあるので止めます。");
  }
  console.log("  使い捨てのログイン" + label + "（匿名・合言葉なし）: " + r.data.user.id);
  return { sb, session: r.data.session, id: r.data.user.id };
}

const TAG = "UI" + Date.now();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

// 画面に「もう入っている」状態で開かせる（アプリのログイン画面は素通り＝合言葉を打たない）
async function login(sess) {
  const projectRef = new URL(SUPA_URL).hostname.split(".")[0];
  await page.goto(SITE + "?t=" + Date.now(), { waitUntil: "load" });
  await page.evaluate(
    ([ref, s]) => {
      localStorage.setItem("sb-" + ref + "-auth-token", JSON.stringify(s));
    },
    [projectRef, sess]
  );
  await page.goto(SITE + "?t=" + Date.now(), { waitUntil: "load" });
  await page.waitForTimeout(2500);
  const open = await page
    .locator("#loginOv")
    .evaluate((el) => el.classList.contains("open"))
    .catch(() => true);
  return !open;
}

async function acctLine() {
  await page.locator(".nav-item[data-scr='set']").click();
  await page.waitForTimeout(400);
  return (await page.locator("#acctInfo").textContent()) || "";
}

/* 1. 使い捨てのアカウントで入った状態にする */
const a1 = await makeAnonSession("①");
const li = await login(a1.session);
check("テストURLで入った状態になる（ログイン画面が出ない）", li === true, li);

/* 前の残骸を消しておく（この端末の控えも） */
await page.evaluate(() => {
  ["nomiya_sales_v1", "nomiya_partners_v1", "nomiya_sync_at_v1", "nomiya_sync_ok_v1"].forEach((k) =>
    localStorage.removeItem(k)
  );
});
await page.reload({ waitUntil: "load" });
await page.waitForTimeout(2500);

/* 2. 売上を1件入れる */
await page.locator(".nav-item[data-scr='input']").click();
await page.locator("#inDate").fill("2026-07-15");
await page.locator("#payChips button[data-pay='cash']").click();
await page.locator("#inName").fill(TAG);
await page.locator("#inPeople").fill("2");
await page.locator("#inAmount").fill("8000");
await page.locator("#btnSave").click();
await page.waitForTimeout(2500);
let line = await acctLine();
check("打った売上がクラウドに送られる（未送信が残らない）", /同期済み/.test(line), line);

/* 3. 端末の控えを消して開き直す＝新しいスマホと同じ */
await page.evaluate(() => {
  ["nomiya_sales_v1", "nomiya_partners_v1", "nomiya_sync_at_v1", "nomiya_sync_ok_v1"].forEach((k) =>
    localStorage.removeItem(k)
  );
});
await page.reload({ waitUntil: "load" });
await page.waitForTimeout(3000);
const back = await page.evaluate(
  (tag) => window.__NOMIYA.sales.filter((s) => s.name === tag && !s.deletedAt).length,
  TAG
);
check("端末の控えを消しても、クラウドから戻ってくる", back === 1, back);

/* 4. 別のお店（別アカウント）からは見えない（RLSの隔離） */
{
  await page.locator(".nav-item[data-scr='set']").click();
  await page.locator("#btnLogout").click();
  await page.waitForTimeout(1500);
  const a2 = await makeAnonSession("②");
  const li2 = await login(a2.session);
  check("別のお店として入り直せる", li2 === true, li2);
  await page.waitForTimeout(2500);
  const seen = await page.evaluate(
    (tag) => window.__NOMIYA.sales.filter((s) => s.name === tag).length,
    TAG
  );
  check("別のお店からは、さっきの売上が1件も見えない（RLS）", seen === 0, seen);
  // 元のお店に戻る
  await page.locator(".nav-item[data-scr='set']").click();
  await page.locator("#btnLogout").click();
  await page.waitForTimeout(1500);
  await login(a1.session);
  await page.waitForTimeout(2500);
}

/* 片付け: 入れた分を消してクラウドにも伝える */
await page.locator(".nav-item[data-scr='set']").click();
await page.locator("#btnWipe").click();
await page.locator("#mdYes").click();
await page.waitForTimeout(2500);
const left = await page.evaluate(() => window.__NOMIYA.sales.filter((s) => !s.deletedAt).length);
check("片付いた（消した印がクラウドにも送られる）", left === 0, left);

check("画面のエラーが1件も出ていない", errors.length === 0, errors);
await browser.close();
console.log("\n合計 " + (ok + ng) + " 件中 " + ok + " 件OK / " + ng + " 件NG");
process.exit(ng ? 1 : 0);
