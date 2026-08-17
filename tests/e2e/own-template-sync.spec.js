import { test, expect } from "@playwright/test";

/* ★B-1：お店のExcelは「倉庫へ行って、別の端末で出てくる」か★
 * ------------------------------------------------------------------------------
 * 指示役（2026-08-16）:
 *   「出ないと『スマホを変えたらテンプレが消えた』になります＝一番 怖い壊れ方」
 *
 * ここで見るのは3つ。
 *   ① 端末の控えと ★倉庫の両方★ に入る（画面の見た目だけで判断しない）
 *   ② ★別の入れ物（新しいスマホ相当）★ で、テンプレも「書く場所」も出てくる
 *   ③ ★入らない時は、入れる前の姿に戻して止まる★（「入れました」と言わない・黙って消えない）
 *
 * ③は 2026-08-16 に実際に起きていた:
 *   端末の控えが満杯だと「✅ Excelを入れました。書く場所も12コ当てておきました」と出るのに
 *   控えは空・開き直すと ★テンプレが消えていた★（JSエラーは0＝黙って死ぬ形）。
 */

const PAGE = "/nomiya-uriage.html";
const FIX = "tests/e2e/fixtures/tpl-real-like.xlsx";
/* ★「端末の控えが満杯のとき」は heavy-own-template-storage.spec.js に切り出した★
   （控えを5MB埋めるので、ふつうの試験と同時に走らせない＝2026-08-17 指示役） */

test.setTimeout(90000);

async function open(page) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.route(/cdn\.jsdelivr\.net/, (r) => r.abort());
  await page.addInitScript({ path: "tests/e2e/fake-supabase.js" });
  await page.goto(PAGE, { waitUntil: "load" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "load" });
  await expect(page.locator("#scr-input")).toBeVisible();
  return errors;
}

/** 請求書タブの「見た目を変える」→ 自社のテンプレ を開く（実際の道順） */
async function openOwnTplRow(page) {
  await page.locator(".nav-item[data-scr='inv']").click();
  await expect(page.locator("#scr-inv")).toBeVisible();
  const sum = page.locator("summary", { hasText: "見た目を変える" });
  if (await sum.count()) await sum.first().click();
  await page.locator("#invTpl [data-tpl='own']").click();
  await expect(page.locator("#ownTplRow")).toBeVisible();
}

const cloudTpl = (page) =>
  page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem("__fake_supa_db__") || "{}");
    const r = ((db.tables || {}).nomiya_settings || [])[0];
    const c = (r && r.config) || {};
    return { len: (c.ownXlsx || "").length, name: c.ownXlsxName || "", cells: Object.keys(c.ownCells || {}).length };
  });

const deviceTpl = (page) =>
  page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("nomiya_settings_v1") || "{}");
    return { len: (s.ownXlsx || "").length, name: s.ownXlsxName || "", cells: Object.keys(s.ownCells || {}).length };
  });

test.describe("お店のExcelは、機種を変えても残る", () => {
  test("★端末→倉庫→新しいスマホ で、テンプレも「書く場所」も出てくる★", async ({ page }) => {
    const errors = await open(page);
    await openOwnTplRow(page);
    await page.locator("#ownTplFile").setInputFiles(FIX);
    await expect(page.locator("#ownTplNote")).toContainText("Excelが入っています", {
      timeout: 30000,
    });

    // ① 端末の控え
    const dev = await deviceTpl(page);
    expect(dev.len, "★端末の控えにテンプレが入っていない★").toBeGreaterThan(1000);
    expect(dev.cells, "★書く場所が控えに入っていない★").toBeGreaterThanOrEqual(10);

    // ② 倉庫（届くまで待つ。届く前に消すと「消えた」ように見える）
    await expect
      .poll(async () => (await cloudTpl(page)).len, { timeout: 20000 })
      .toBeGreaterThan(1000);
    const cloud = await cloudTpl(page);
    expect(cloud.len, "★倉庫と端末で中身が違う★").toBe(dev.len);
    expect(cloud.name, "★倉庫にファイル名が入っていない★").toBe(dev.name);
    expect(cloud.cells, "★倉庫に「書く場所」が入っていない★").toBe(dev.cells);

    // ③ 新しいスマホ＝端末の控えだけ消して開き直す（倉庫は残す）
    await page.evaluate(() => {
      Object.keys(localStorage)
        .filter((k) => k.startsWith("nomiya_"))
        .forEach((k) => localStorage.removeItem(k));
    });
    await page.reload({ waitUntil: "load" });
    await expect(page.locator("#scr-input")).toBeVisible();
    await expect
      .poll(
        async () =>
          await page.evaluate(() => (window.__NOMIYA.settings.ownXlsx || "").length),
        { timeout: 20000 }
      )
      .toBe(dev.len);

    // ★画面にも出ること（中の値だけ見て緑にしない）★
    await openOwnTplRow(page);
    await expect(page.locator("#ownTplNote"), "★新しいスマホの画面にテンプレが出ない★").toContainText(
      "Excelが入っています"
    );
    await expect(page.locator("#ownTplNote")).toContainText(dev.name);
    // 書く場所もそのまま（当て直しでなく、当てた結果が残っている）
    const cells2 = await page.evaluate(
      () => Object.keys(window.__NOMIYA.settings.ownCells || {}).length
    );
    expect(cells2, "★新しいスマホで「書く場所」が消えている★").toBe(dev.cells);

    // そのまま書き出しまで行ける（配線が生きている）
    await page.locator("#btnOwnPlace").click();
    await expect(page.locator("#xlWrap")).toBeVisible();
    await page.locator("#xlcOk").click();
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });
});
