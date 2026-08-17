import { test, expect } from "@playwright/test";

/* ★B-1のうち「端末の控えが満杯のとき」だけを、ここに切り出した★（heavy = 重い試験）
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
const FIX2 = "tests/e2e/fixtures/tpl-invoice.xlsx";

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

test.describe("お店のExcelは、機種を変えても残る（重い方）", () => {
  /* ★入らない物は、入れる前の姿に戻して止まる★
     控えが満杯のときに「入れました」と出して、実は保存できていない＝★黙って消える★
     （2026-08-16 実測。JSエラーは0なので、これを見張らないと誰も気づけない） */
  test("★端末の空きが足りないときは「入れました」と言わず、前のテンプレを残す★", async ({
    page,
  }) => {
    const errors = await open(page);
    await openOwnTplRow(page);
    // 先に ★小さいほう★ を入れておく（この店は もう使えている状態）
    await page.locator("#ownTplFile").setInputFiles(FIX2);
    await expect(page.locator("#ownTplNote")).toContainText("Excelが入っています", {
      timeout: 30000,
    });
    const before = await deviceTpl(page);
    expect(before.len).toBeGreaterThan(1000);

    // 端末の控えを ★隙間まで★ 埋める（判子・写真・売上で埋まった店と同じ状態）
    const filled = await page.evaluate(() => {
      let bytes = 0;
      for (const chunk of [64 * 1024, 4 * 1024, 512]) {
        for (let i = 0; i < 600; i++) {
          try {
            localStorage.setItem("__ballast" + chunk + "_" + i, "x".repeat(chunk));
            bytes += chunk;
          } catch (e) {
            break;
          }
        }
      }
      return Math.round(bytes / 1024);
    });
    // ★本当に満杯でなければ、この確認は何も見ていない★
    expect(filled, "端末の控えを埋められていない").toBeGreaterThan(1000);
    const full = await page.evaluate(() => {
      try {
        localStorage.setItem("__t", "x".repeat(4 * 1024));
        localStorage.removeItem("__t");
        return false;
      } catch (e) {
        return true;
      }
    });
    expect(full, "★控えがまだ空いている＝満杯を再現できていない★").toBe(true);

    // ★もっと大きいテンプレ★ に入れ替えようとする（増える分は入らない）
    await page.locator("#ownTplFile").setInputFiles(FIX);
    await expect(page.locator("#toast"), "★空きが無いことを知らせていない★").toContainText(
      "端末の空きが足りません",
      { timeout: 30000 }
    );
    // ★「入れました」と言っていない★
    const toastText = await page.locator("#toast").textContent();
    expect(toastText, "★入っていないのに「入れました」と出している★").not.toContain(
      "Excelを入れました"
    );

    // ★前のテンプレがそのまま残っている（画面も中身も）★
    const nowDev = await deviceTpl(page);
    expect(nowDev.name, "★前のテンプレが壊れた★").toBe(before.name);
    const inMem = await page.evaluate(() => ({
      len: (window.__NOMIYA.settings.ownXlsx || "").length,
      name: window.__NOMIYA.settings.ownXlsxName || "",
    }));
    expect(inMem.name, "★画面の中だけ新しい物になっている（開き直すと消える）★").toBe(before.name);
    expect(inMem.len, "★画面の中だけ新しい物になっている（開き直すと消える）★").toBe(before.len);

    // 開き直しても、画面で見えていた物と同じ物が残る（嘘にならない）
    await page.evaluate(() =>
      Object.keys(localStorage)
        .filter((k) => k.startsWith("__ballast") || k.startsWith("__fine"))
        .forEach((k) => localStorage.removeItem(k))
    );
    await page.reload({ waitUntil: "load" });
    await expect(page.locator("#scr-input")).toBeVisible();
    const after = await page.evaluate(() => ({
      len: (window.__NOMIYA.settings.ownXlsx || "").length,
      name: window.__NOMIYA.settings.ownXlsxName || "",
    }));
    expect(after.name, "★開き直したらテンプレが消えた★").toBe(before.name);
    expect(after.len, "★開き直したらテンプレが消えた★").toBe(before.len);
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });
});
