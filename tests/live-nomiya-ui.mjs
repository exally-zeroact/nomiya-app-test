/* live-nomiya-ui.mjs — 本物のテストURL＋本物のテスト用DBで、実UIの往復を確かめる
 * ------------------------------------------------------------------------------
 *  使い方:  node tests/live-nomiya-ui.mjs
 *  ★このrepo(nomiya-app-test)はテスト用DBを向いている。本番倉庫だったら即中止する。
 *  前提:
 *   ① supabase/schema-nomiya.sql を DB-test に適用済み（node tests/probe-nomiya-db.mjs が OK）
 *   ② %TEMP%\nomiya-test-cred.json に
 *      { "email": "exally.supoort+nomiya@gmail.com", "password": "…" }
 *      ＝テスト用アカウント。お店のアカウントでは絶対に走らせない
 *   ③ もう1つ別アカウントがあれば email2/password2 も入れる（他店から見えないことの確認に使う）
 *  やること:
 *   1. テストURLを開く → ログイン画面が出る → ログインできる
 *   2. 売上を1件入れる → 「同期済み」になる
 *   3. 端末の控えを全部消して開き直す → クラウドから戻ってくる（＝本当に保存されている）
 *   4. 別アカウントで入る → さっきの売上が1件も見えない（RLSの隔離）
 *  片付け: 入れた売上は最後に「全部消す」で消し、クラウドにも消したことを伝える
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { readSupaConfig } from "./supa-from-config.mjs";

readSupaConfig(); // 配る物が本番倉庫を向いていたら、ここで止まる

const SITE = process.env.NOMIYA_URL || "https://nomiya-app-test.vercel.app/nomiya-uriage.html";
const CRED = path.join(os.tmpdir(), "nomiya-test-cred.json");
const ALLOW = /^exally\.supoort\+nomiya@gmail\.com$/;

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

if (!fs.existsSync(CRED)) die("合言葉のファイルがありません: " + CRED);
const cred = JSON.parse(fs.readFileSync(CRED, "utf8"));
if (!ALLOW.test(String(cred.email || ""))) die("このメールでは走らせません: " + cred.email);

const TAG = "UI" + Date.now();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

async function login(email, password) {
  await page.goto(SITE + "?t=" + Date.now(), { waitUntil: "load" });
  await page.waitForTimeout(1500);
  const open = await page
    .locator("#loginOv")
    .evaluate((el) => el.classList.contains("open"))
    .catch(() => false);
  if (!open) return "already";
  await page.locator("#loginEmail").fill(email);
  await page.locator("#loginPass").fill(password);
  await page.locator("#btnLogin").click();
  await page.waitForTimeout(2500);
  return await page.locator("#loginOv").evaluate((el) => !el.classList.contains("open"));
}

async function acctLine() {
  await page.locator(".nav-item[data-scr='set']").click();
  await page.waitForTimeout(400);
  return (await page.locator("#acctInfo").textContent()) || "";
}

/* 1. ログイン */
const li = await login(cred.email, cred.password);
check("テストURLでログインできる（ログイン画面が閉じる）", li === true || li === "already", li);

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

/* 4. 別アカウントでは見えない（RLSの隔離） */
if (cred.email2 && cred.password2) {
  await page.locator(".nav-item[data-scr='set']").click();
  await page.locator("#btnLogout").click();
  await page.waitForTimeout(1500);
  const li2 = await login(cred.email2, cred.password2);
  check("別のアカウントでログインできる", li2 === true, li2);
  await page.waitForTimeout(2500);
  const seen = await page.evaluate(
    (tag) => window.__NOMIYA.sales.filter((s) => s.name === tag).length,
    TAG
  );
  check("別のアカウントからは、さっきの売上が1件も見えない（RLS）", seen === 0, seen);
  // 元のアカウントに戻る
  await page.locator(".nav-item[data-scr='set']").click();
  await page.locator("#btnLogout").click();
  await page.waitForTimeout(1500);
  await login(cred.email, cred.password);
  await page.waitForTimeout(2500);
} else {
  console.log("  – 別アカウント(email2/password2)が無いので、隔離の確認はスクリプトでは省略");
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
