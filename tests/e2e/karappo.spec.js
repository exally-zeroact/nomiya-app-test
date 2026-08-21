import { test, expect } from "@playwright/test";

/* ★入れたばかりの店（データ0件）で、その時できない物は「押す前に」分かること★
 * ------------------------------------------------------------------------------
 * 2026-08-19 実測：入れたばかりの画面で、押してから「⚠️ ありません」と出る物が3つ、
 * 押しても意味がない物（ロゴも判子も無いのに「外す」）が2つ出ていた。
 * ＝「ごちゃごちゃして分かりにくい」の中身。
 *
 * 決めた形（請求書の「📊 Excelに書き出す（書く場所が決まっていません）」と同じ）:
 *   できない時は ★灰色＋理由をボタンの中★／そもそも意味の無い物は ★出さない★。
 * ★戻るところまで見る★＝データを入れたら黒に戻る（灰色のまま戻らない事故を止める）。
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

/** 灰色で、できない理由がボタンの中に書いてあること */
async function gray(page, id, why) {
  const b = page.locator("#" + id);
  await expect(b, id + " が灰色になっていない").toBeDisabled();
  await expect(b, id + " に理由が書いていない").toContainText(why);
}

async function addSale(page, { pay, name, amount }) {
  await page.locator(".nav-item[data-scr='input']").click();
  await page.locator("#inDate").fill("2026-08-18");
  await page.locator(`#payChips button[data-pay="${pay}"]`).click();
  if (pay === "invoice") {
    await page.locator("#inNameSel").selectOption("__new");
    await page.locator("#ptName").fill(name);
    await page.locator("#ptOk").click();
    await page.locator("#inNameSel").selectOption(name);
  } else if (await page.locator("#inName").isVisible().catch(() => false)) {
    await page.locator("#inName").fill(name);
  }
  await page.locator("#inPeople").fill("2");
  await page.locator("#inAmount").fill(String(amount));
  await page.locator("#btnSave").click();
  await expect(page.locator("#inErr")).toHaveText("");
}

test.describe("入れたばかりの店（できない物は押す前に分かる）", () => {
  test("★一覧：0件のときは 紙もExcelも灰色＋理由／売上を入れたら黒に戻る★", async ({ page }) => {
    const errors = await open(page);
    await page.locator(".nav-item[data-scr='sum']").click(); // 売上帳は集計タブ（2026-08-21）
    await gray(page, "btnPrintList", "この期間に売上がありません");
    await gray(page, "btnXlsxList", "この期間に売上がありません");
    await addSale(page, { pay: "cash", name: "田中さん", amount: 22000 });
    await page.locator(".nav-item[data-scr='sum']").click(); // 売上帳は集計タブ（2026-08-21）
    await expect(page.locator("#btnPrintList")).toBeEnabled();
    await expect(page.locator("#btnXlsxList")).toBeEnabled();
    await expect(page.locator("#btnXlsxList")).toHaveText("📊 Excelに書き出す");
    expect(errors, errors.join(" | ")).toEqual([]);
  });

  test("★請求書：相手を選ぶまで「入金済みにする」は灰色＋理由★", async ({ page }) => {
    const errors = await open(page);
    await page.locator(".nav-item[data-scr='inv']").click();
    await gray(page, "btnPaid", "先に請求する相手を選んでください");
    await addSale(page, { pay: "invoice", name: "サンプル商事", amount: 38500 });
    await page.locator(".nav-item[data-scr='inv']").click();
    await page.locator("#invName").selectOption("サンプル商事");
    await expect(page.locator("#btnPaid")).toBeEnabled();
    expect(errors, errors.join(" | ")).toEqual([]);
  });

  test("★給料：スタッフが居ないうちは「出勤を入れる」「印刷」が灰色＋理由★", async ({ page }) => {
    const errors = await open(page);
    await page.locator(".nav-item[data-scr='pay']").click();
    await gray(page, "btnWorkAdd", "先にスタッフを足してください");
    await gray(page, "btnPrintPay", "この月はまだ出勤がありません");
    // スタッフを足すと「出勤を入れる」は黒に戻る（印刷は出勤が入るまで灰色のまま）
    await page.locator("#btnGear").click();
    await page.locator("[data-sseg='staff']").click();
    await page.locator("#btnStaffAdd").click();
    await page.locator("#st_name").fill("あかり");
    await page.locator("#st_hourly").fill("1200");
    await page.locator("#st_ok").click();
    await page.locator(".nav-item[data-scr='pay']").click();
    await expect(page.locator("#btnWorkAdd")).toBeEnabled();
    await expect(page.locator("#btnPrintPay")).toBeDisabled();
    expect(errors, errors.join(" | ")).toEqual([]);
  });

  test("★締め：数えた実数を入れるまで「この日を締める」は灰色＋理由★", async ({ page }) => {
    const errors = await open(page);
    await page.locator(".nav-item[data-scr='close']").click();
    await gray(page, "btnClose", "数えた実数を入れてください");
    await page.locator("#clCount").fill("10000");
    await page.locator("#clCount").dispatchEvent("input");
    await expect(page.locator("#btnClose")).toBeEnabled();
    await expect(page.locator("#btnClose")).toHaveText("この日を締める");
    expect(errors, errors.join(" | ")).toEqual([]);
  });

  test("★設定：入れていない物の「外す」は出さない（入れたら出る）★", async ({ page }) => {
    const errors = await open(page);
    await page.locator("#btnGear").click();
    await expect(page.locator("#btnLogoClear"), "ロゴが無いのに「外す」が出ている").toBeHidden();
    await expect(page.locator("#btnHankoClear"), "判子が無いのに「外す」が出ている").toBeHidden();
    // ★hidden と書いた物が本当に消えているか（class の display に負けていないか）を実測する
    const box = await page.locator("#btnLogoClear").boundingBox();
    expect(box, "hidden なのに場所を取っている").toBeNull();
    await page.evaluate(() => {
      window.__NOMIYA.settings.logo = "data:image/png;base64,iVBORw0KGgo=";
      window.renderSettings();
    });
    await expect(page.locator("#btnLogoClear"), "ロゴを入れたのに「外す」が出ない").toBeVisible();
    expect(errors, errors.join(" | ")).toEqual([]);
  });
});
