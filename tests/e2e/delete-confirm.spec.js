import { test, expect } from "@playwright/test";

/* 消す前に必ず確かめる（指示役 2026-08-28 裁定1〜3）
 * ------------------------------------------------------------------------------
 *  前は ★売上だけ窓が在って、出金・出勤は 押した瞬間に消えていた★＝
 *  同じアプリで 消し方が2通り。客は「消す前に聞いてくれる」と一度 覚えるので、
 *  ★約束を破る所が在る★のが害。
 *
 *  ここで見るのは ★振る舞い★（変数名ではない）:
 *    ① 消すボタンを押しただけでは ★まだ消えない★（窓の返事を待っている）
 *    ② 窓の出口は ★「やめる」1つ★（窓の×と2つ在ると、どちらが取り消しか分からない）
 *    ③ やめる を押したら 残っている／もう一度 消す で 消える
 *    ④ ★窓に書いた戻し方が 本当か★＝書き出す→消す→読み込む を実際に押して数える
 *       （2026-08-28 実測：出金1件・出勤1件とも 戻った。ただし出金・出勤は
 *         ★書き出した時点に戻る★＝後から足した分は消える。窓にもそう書いてある）
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

/** 端末の中の数を、画面ではなく元のデータから数える（画面の見落としに引っかからない） */
function counts(page) {
  return page.evaluate(() => {
    const N = window.__NOMIYA;
    const cl = N.closes || {};
    let outs = 0;
    Object.keys(cl).forEach((k) => (outs += ((cl[k] || {}).outs || []).length));
    return {
      sales: (N.sales || []).filter((s) => !s.deletedAt).length,
      works: (N.works || []).filter((w) => !w.deletedAt).length,
      outs,
    };
  });
}

async function addSale(page) {
  await page.locator(".nav-item[data-scr='input']").click();
  await page.locator("#inName").fill("田中");
  await page.locator("#inPeople").fill("2");
  await page.locator("#inAmount").fill("8000");
  await page.locator("#btnSave").click();
}

async function addStaffAndWork(page) {
  await page.locator("#btnGear").click();
  await page.locator("#setSeg [data-sseg='staff']").click();
  await page.locator("#btnStaffAdd").click();
  await page.locator("#st_name").fill("あかり");
  await page.locator("#st_hourly").fill("1500");
  await page.locator("#st_ok").click();
  await page.locator("#btnGear").click();
  await page.locator(".nav-item[data-scr='pay']").click();
  await page.locator("#btnWorkAdd").click();
  await page.locator("#wk_staff").selectOption({ label: "あかり" });
  await page.locator("#wk_in").fill("20:00");
  await page.locator("#wk_out").fill("01:00");
  await page.locator("#wk_ok").click();
}

async function addOut(page) {
  await page.locator(".nav-item[data-scr='close']").click();
  await page.locator("#btnOutAdd").click();
  await page.locator("#outAmt").fill("3000");
  await page.locator("#outOk").click();
}

/** 窓が出ている事・出口が1つな事・言葉が入っている事 */
async function expectConfirmWindow(page, title) {
  await expect(page.locator("#modalOv")).toHaveClass(/open/);
  await expect(page.locator("#modalTitle")).toHaveText(title);
  const body = page.locator("#modalBody");
  await expect(body, "戻し方が書いていない").toContainText("読み込む");
  await expect(body, "この画面から戻せる、と誤解させている").toContainText(
    "この画面からは戻せません"
  );
  // ★出口は「やめる」1つ★（窓の×は出さない）
  await expect(page.locator("#modalX"), "出口が2つ在る（×と やめる）").toBeHidden();
  await expect(page.locator("#mdNo")).toBeVisible();
  await expect(page.locator("#mdYes")).toBeVisible();
}

test.describe("消す前に必ず確かめる（売上・出金・出勤）", () => {
  test("売上：押しただけでは消えない／やめるで残る／消すで消える", async ({ page }) => {
    const errors = await open(page);
    await addSale(page);
    await page.locator(".nav-item[data-scr='list']").click();
    await page.locator("#listRows [data-id]").first().click();

    await page.locator("#btnDelete").click();
    await expectConfirmWindow(page, "この売上を消す");
    expect((await counts(page)).sales, "窓の返事を待たずに消えている").toBe(1);

    await page.locator("#mdNo").click();
    expect((await counts(page)).sales, "やめる を押したのに消えている").toBe(1);

    await page.locator("#btnDelete").click();
    await page.locator("#mdYes").click();
    expect((await counts(page)).sales, "消す を押したのに消えていない").toBe(0);
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("出金：押しただけでは消えない／やめるで残る／消すで消える", async ({ page }) => {
    const errors = await open(page);
    await addOut(page);
    expect((await counts(page)).outs).toBe(1);

    await page.locator("[data-out]:visible").first().click();
    await page.locator("#outDel").click();
    await expectConfirmWindow(page, "この出金を消す");
    expect((await counts(page)).outs, "窓の返事を待たずに消えている").toBe(1);

    await page.locator("#mdNo").click();
    expect((await counts(page)).outs, "やめる を押したのに消えている").toBe(1);

    await page.locator("[data-out]:visible").first().click();
    await page.locator("#outDel").click();
    await page.locator("#mdYes").click();
    expect((await counts(page)).outs, "消す を押したのに消えていない").toBe(0);
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("出勤：押しただけでは消えない／やめるで残る／消すで消える", async ({ page }) => {
    const errors = await open(page);
    await addStaffAndWork(page);
    expect((await counts(page)).works).toBe(1);

    await page.locator("#payDayList [data-work]").first().click();
    await page.locator("#wk_del").click();
    await expectConfirmWindow(page, "この出勤を消す");
    expect((await counts(page)).works, "窓の返事を待たずに消えている").toBe(1);

    await page.locator("#mdNo").click();
    expect((await counts(page)).works, "やめる を押したのに消えている").toBe(1);

    await page.locator("#payDayList [data-work]").first().click();
    await page.locator("#wk_del").click();
    await page.locator("#mdYes").click();
    expect((await counts(page)).works, "消す を押したのに消えていない").toBe(0);
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("★窓に書いた戻し方が本当か：書き出す→消す→読み込む で 出金も出勤も戻る★", async ({
    page,
  }) => {
    test.setTimeout(120000);
    const errors = await open(page);
    await addStaffAndWork(page);
    await addOut(page);
    expect(await counts(page)).toMatchObject({ works: 1, outs: 1 });

    // 書き出す
    await page.locator("#btnGear").click();
    await page.locator("#setSeg [data-sseg='acct']").click();
    const [dl] = await Promise.all([
      page.waitForEvent("download"),
      page.locator("#btnExport").click(),
    ]);
    const file = await dl.path();
    await page.locator("#btnGear").click();

    // 消す（窓の通り）
    await page.locator(".nav-item[data-scr='close']").click();
    await page.locator("[data-out]:visible").first().click();
    await page.locator("#outDel").click();
    await page.locator("#mdYes").click();
    await page.locator(".nav-item[data-scr='pay']").click();
    await page.locator("#payDayList [data-work]").first().click();
    await page.locator("#wk_del").click();
    await page.locator("#mdYes").click();
    expect(await counts(page)).toMatchObject({ works: 0, outs: 0 });

    // 窓に書いた通りに戻す
    await page.locator("#btnGear").click();
    await page.locator("#setSeg [data-sseg='acct']").click();
    await page.locator("#fileImport").setInputFiles(file);
    await page.locator("#mdAdd").click();
    await page.waitForTimeout(400);
    expect(await counts(page), "窓に書いた戻し方で戻らない").toMatchObject({ works: 1, outs: 1 });

    // ★窓に書いてある「書き出した時点に戻る」も本当か★（後から足した分は消える）
    await page.locator("#btnGear").click();
    await page.locator(".nav-item[data-scr='pay']").click();
    await page.locator("#btnWorkAdd").click();
    await page.locator("#wk_staff").selectOption({ label: "あかり" });
    await page.locator("#wk_in").fill("18:00");
    await page.locator("#wk_out").fill("22:00");
    await page.locator("#wk_ok").click();
    expect((await counts(page)).works).toBe(2);

    await page.locator("#btnGear").click();
    await page.locator("#setSeg [data-sseg='acct']").click();
    await page.locator("#fileImport").setInputFiles(file);
    await page.locator("#mdAdd").click();
    await page.waitForTimeout(400);
    expect(
      (await counts(page)).works,
      "窓には『書き出した時点に戻る』と書いてあるのに、後から足した分が残っている"
    ).toBe(1);
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });
});
