import { test, expect } from "@playwright/test";

/* ★打つ物は「入力」タブに在る★（司さん 2026-08-21）
 * ------------------------------------------------------------------------------
 *   「入力ってタブがあったらそこからしか入力しないって思うのがほとんどやないか？」
 * 出金は締めタブにしか入口が無かった。入力タブにも入口を作る。
 *
 * ★いちばん危ないのは「別の日に付く」こと★（黙って数字がずれる）。
 * 入口が2つでも、付く日は1つ・窓も1つ（openOut）・一覧の描き方も1つ（drawOuts）。
 */
const PAGE = "/nomiya-uriage.html";

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

async function setDay(page, ymd) {
  await page.locator(".nav-item[data-scr='input']").click();
  await page.locator("#inDate").fill(ymd);
  await page.locator("#inDate").dispatchEvent("change");
  await expect(page.locator("#inOutLabel")).toContainText("の出金");
}

async function addOut(page, { amount, memo }) {
  await page.locator("#btnInOutAdd").click();
  await expect(page.locator("#outAmt")).toBeVisible();
  await page.locator("#outAmt").fill(String(amount));
  await page.locator("#outMemo").fill(memo);
  await page.locator("#outOk").click();
  await expect(page.locator("#modalOv")).not.toHaveClass(/open/);
}

test.describe("入力タブから出金を打つ", () => {
  test("★打った出金は、入力タブで選んでいる日に付く（締めタブでも同じ日）★", async ({ page }) => {
    const errors = await open(page);
    await setDay(page, "2026-08-15");
    await expect(page.locator("#inOutLabel")).toContainText("2026年8月15日");
    await addOut(page, { amount: 3000, memo: "氷とおしぼり" });
    await expect(page.locator("#inOuts")).toContainText("氷とおしぼり");
    await expect(page.locator("#inOuts")).toContainText("−¥3,000");

    // 締めタブも同じ日・同じ額（＝2か所で別々に持っていない）
    await page.locator(".nav-item[data-scr='close']").click();
    await expect(page.locator("#periodClose")).toContainText("2026年8月15日");
    await expect(page.locator("#clOuts")).toContainText("氷とおしぼり");
    await expect(page.locator("#clOut")).toHaveText("−¥3,000");
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("★別の日には付かない★", async ({ page }) => {
    const errors = await open(page);
    await setDay(page, "2026-08-15");
    await addOut(page, { amount: 3000, memo: "氷とおしぼり" });
    await setDay(page, "2026-08-16");
    await expect(page.locator("#inOuts")).toContainText("ありません");
    await expect(page.locator("#inOuts")).not.toContainText("氷とおしぼり");
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("★窓の題に「どの日か」が出る／入力タブから直せる・消せる★", async ({ page }) => {
    const errors = await open(page);
    await setDay(page, "2026-08-15");
    await page.locator("#btnInOutAdd").click();
    await expect(page.locator("#modalTitle"), "どの日に付くか分からない").toContainText("8/15");
    await page.locator("#outAmt").fill("3000");
    await page.locator("#outOk").click();

    await page.locator("#inOuts [data-out]").first().click();
    await expect(page.locator("#modalTitle")).toContainText("出金を直す");
    await expect(page.locator("#modalTitle")).toContainText("8/15");
    await page.locator("#outAmt").fill("4500");
    await page.locator("#outOk").click();
    await expect(page.locator("#inOuts")).toContainText("−¥4,500");

    await page.locator("#inOuts [data-out]").first().click();
    await page.locator("#outDel").click();
    await expect(page.locator("#inOuts")).toContainText("ありません");
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("★締めた日は、入力タブからも足せない（灰色＋理由）★", async ({ page }) => {
    const errors = await open(page);
    await setDay(page, "2026-08-15");
    /* ★見ている日は1つ★（2026-08-21 指示役の裁定）＝入力タブで選べば 締めタブも同じ日。 */
    await page.locator(".nav-item[data-scr='close']").click();
    await expect(page.locator("#periodClose")).toContainText("2026年8月15日");
    await page.locator("#clCount").fill("0");
    await page.locator("#clCount").dispatchEvent("input");
    await page.locator("#btnClose").click();
    await expect(page.locator("#clState")).toContainText("に締めました");

    await setDay(page, "2026-08-15");
    const b = page.locator("#btnInOutAdd");
    await expect(b, "締めた日なのに足せてしまう").toBeDisabled();
    await expect(b).toContainText("この日はもう締めています");
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });
  /* ★見ている日は1つ★（指示役 2026-08-21「同じ状態を2画面で別々に持つな」）
     前は 入力タブと締めタブが別々の日を持ち、出金を打った時だけ揃っていた＝2通りあった。 */
  test("★入力タブと締めタブは いつも同じ日を見る（どちらから動かしても）★", async ({ page }) => {
    const errors = await open(page);
    await setDay(page, "2026-08-15");
    await page.locator(".nav-item[data-scr='close']").click();
    await expect(page.locator("#periodClose"), "入力で選んだ日に締めが付いてこない").toContainText(
      "2026年8月15日"
    );

    // 締めタブから前の日へ動かすと、入力タブも同じ日になる
    await page.locator("#periodClose [data-cmv='-1']").click();
    await expect(page.locator("#periodClose")).toContainText("2026年8月14日");
    await page.locator(".nav-item[data-scr='input']").click();
    await expect(page.locator("#inDate"), "締めで動かした日に入力が付いてこない").toHaveValue(
      "2026-08-14"
    );
    await expect(page.locator("#inOutLabel")).toContainText("2026年8月14日");

    // 「今日」を押せば、両方が今日に戻る
    await page.locator("#btnToday").click();
    const today = await page.evaluate(() => new Date().toISOString().slice(0, 10));
    await expect(page.locator("#inDate")).toHaveValue(today);
    await page.locator(".nav-item[data-scr='close']").click();
    await expect(page.locator("#periodClose")).toContainText("日");
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });
});
