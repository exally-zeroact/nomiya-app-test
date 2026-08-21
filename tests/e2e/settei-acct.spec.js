import { test, expect } from "@playwright/test";

/* ★危ない物を、毎日 触る物と同じ画面に置かない★（指示役 2026-08-21）
 * ------------------------------------------------------------------------------
 *  前は「お店の情報」「アカウント」「データ（全部消す）」が 1画面に縦に並んでいた。
 *  ・アカウントとデータは 別の面（設定＞アカウント）へ
 *  ・★全部消すは、1回でも書き出すまで押せない★（戻せない物を作らない）
 *  ・★押す前に「何が」「いくつ」消えるかを数で見せる★（残る物も書く）
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

async function addSale(page, amount) {
  await page.locator(".nav-item[data-scr='input']").click();
  await page.locator("#inName").fill("田中さん");
  await page.locator("#inPeople").fill("2");
  await page.locator("#inAmount").fill(String(amount));
  await page.locator("#btnSave").click();
  await expect(page.locator("#inErr")).toHaveText("");
}

test.describe("設定：お店の情報と、アカウント・データを分ける", () => {
  test("★「全部消す」「ログアウト」は お店の情報の面に出さない★", async ({ page }) => {
    const errors = await open(page);
    await page.locator("#btnGear").click();
    await expect(page.locator("#pane-self")).toBeVisible();
    const inSelf = await page.evaluate(() =>
      [...document.querySelectorAll("#pane-self button")]
        .filter((b) => b.checkVisibility())
        .map((b) => b.innerText.trim())
    );
    expect(inSelf.join(" / "), "危ない物が お店の情報と同じ面に在る").not.toContain("全部消す");
    expect(inSelf.join(" / ")).not.toContain("ログアウト");

    await page.locator("[data-sseg='acct']").click();
    await expect(page.locator("#pane-acct")).toBeVisible();
    await expect(page.locator("#pane-acct")).toContainText("今すぐ同期する");
    await expect(page.locator("#pane-acct")).toContainText("書き出す");
    await expect(page.locator("#btnWipe")).toBeVisible();
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("★1回も書き出していないうちは「全部消す」を押せない（灰色＋理由）★", async ({ page }) => {
    const errors = await open(page);
    await addSale(page, 22000);
    await page.locator("#btnGear").click();
    await page.locator("[data-sseg='acct']").click();
    const wipe = page.locator("#btnWipe");
    await expect(wipe, "書き出す前なのに押せる").toBeDisabled();
    await expect(wipe).toContainText("先に書き出してください");

    const [dl] = await Promise.all([
      page.waitForEvent("download"),
      page.locator("#btnExport").click(),
    ]);
    expect(dl.suggestedFilename()).toContain(".json");
    await expect(wipe, "書き出したのに押せないまま").toBeEnabled();
    await expect(wipe).toHaveText("全部消す");
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("★押す前に、消える数と 残る物を見せる★", async ({ page }) => {
    const errors = await open(page);
    await addSale(page, 22000);
    await addSale(page, 15000);
    await page.locator("#btnGear").click();
    await page.locator("[data-sseg='acct']").click();
    await Promise.all([page.waitForEvent("download"), page.locator("#btnExport").click()]);
    await page.locator("#btnWipe").click();
    const body = page.locator("#modalBody");
    await expect(body, "消える数が出ていない").toContainText("売上 2 件");
    await expect(body, "残る物が書いていない").toContainText("残るもの");
    await expect(body).toContainText("取り消せません");
    // やめる を押したら 1件も消えない
    await page.locator("#mdNo").click();
    expect(await page.evaluate(() => window.__NOMIYA.sales.filter((s) => !s.deletedAt).length)).toBe(2);
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("★書き出したファイルに 入金も入っている（戻せない物を作らない）★", async ({ page }) => {
    const errors = await open(page);
    // ツケ → 入金を1件
    await page.locator(".nav-item[data-scr='input']").click();
    await page.locator('#payChips button[data-pay="tsuke"]').click();
    await page.locator("#inName").fill("山田商事");
    await page.locator("#inPeople").fill("2");
    await page.locator("#inAmount").fill("45000");
    await page.locator("#btnSave").click();
    await page.locator(".nav-item[data-scr='inv']").click();
    await page.locator("[data-iseg='due']").click();
    await page.locator("[data-due-name]").first().click();
    await page.locator("#pyAmount").fill("20000");
    await page.locator("#pyOk").click();

    await page.locator("#btnGear").click();
    await page.locator("[data-sseg='acct']").click();
    const [dl] = await Promise.all([
      page.waitForEvent("download"),
      page.locator("#btnExport").click(),
    ]);
    const path = await dl.path();
    const fs = await import("node:fs");
    const data = JSON.parse(fs.readFileSync(path, "utf8"));
    expect(Array.isArray(data.payments), "★書き出しに入金が入っていない★").toBe(true);
    expect(data.payments.length, "入金が1件も書き出されていない").toBe(1);
    expect(data.payments[0].amount).toBe(20000);
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });
});
