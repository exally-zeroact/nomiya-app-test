import { test, expect } from "@playwright/test";

/* ★司さんの実機で出た「押しても何も起きない」の4件（指示役 2026-08-17 の①〜④）★
 * ------------------------------------------------------------------------------
 * 司さん（iPhone実機）
 *   テンプレのプレビューは出ているのに ★「⚠ 書く場所が決まっていません」★／★押しても何も起きない★
 * 指示役が司さんのPCで押した結果は 12コ 当たっていた＝★食い違いではなく
 * 「司さんの端末の控えに 当てが無い」★（自動で当てる仕組みより前に入れたテンプレ）。
 *
 * ここで縛る4つ
 *   ① 当ての無いテンプレを開いたら ★その場で自動で当てる★（入れた時と同じ処理）＋黙って直さない
 *   ② 押せない物は ★灰色＋理由（理由はボタンの中）★＝「押しても何も起きない」を作らない
 *   ③ その理由から ★1回押せば「書く場所をたしかめる」に着く★（畳みの中に置き去りにしない）
 *   ④ ボタンの言葉は ★何が手に入るか★（「入れて出す」＝中の動きは書かない）
 */

const PAGE = "/nomiya-uriage.html";
const FIX = "tests/e2e/fixtures/tpl-real-like.xlsx";

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

/** 請求書タブ →「見た目を変える」→ 自社のテンプレ（実際の道順） */
async function openOwnTplRow(page) {
  await page.locator(".nav-item[data-scr='inv']").click();
  await expect(page.locator("#scr-inv")).toBeVisible();
  const sum = page.locator("summary", { hasText: "見た目を変える" });
  if (await sum.count()) await sum.first().click();
  await page.locator("#invTpl [data-tpl='own']").click();
  await expect(page.locator("#ownTplRow")).toBeVisible();
}

/** ★司さんの端末と同じ「当てが無い古い控え」を作る★
 *  （自動で当てる仕組みより前に入れたテンプレ＝ownXlsx は在るが ownCells が無い） */
async function makeLegacyState(page) {
  await page.evaluate(() => {
    const k = "nomiya_settings_v1";
    const s = JSON.parse(localStorage.getItem(k) || "{}");
    delete s.ownCells;
    delete s.ownNoGuess;
    localStorage.setItem(k, JSON.stringify(s));
    // 倉庫の側も同じ形にする（開いたときに倉庫から戻ってきても当てが無い）
    const db = JSON.parse(localStorage.getItem("__fake_supa_db__") || "{}");
    const rows = ((db.tables || {}).nomiya_settings || []);
    if (rows[0] && rows[0].config) {
      delete rows[0].config.ownCells;
      delete rows[0].config.ownNoGuess;
      localStorage.setItem("__fake_supa_db__", JSON.stringify(db));
    }
  });
}

/** 請求書送りの売上を1件入れて、その相手を選ぶ（窓を開けるのに要る） */
async function addSaleAndPick(page, name) {
  await page.locator(".nav-item[data-scr='input']").click();
  await page.locator("#inDate").fill("2026-08-01");
  await page.locator('#payChips button[data-pay="invoice"]').click();
  if ((await page.locator(`#inNameSel option[value="${name}"]`).count()) === 0) {
    await page.locator("#inNameSel").selectOption("__new");
    await page.locator("#ptName").fill(name);
    await page.locator("#ptOk").click();
  }
  await page.locator("#inNameSel").selectOption(name);
  await page.locator("#inPeople").fill("2");
  await page.locator("#inAmount").fill("44000");
  await page.locator("#btnSave").click();
  await expect(page.locator("#inErr"), "保存できていない").toHaveText("");
  await page.locator(".nav-item[data-scr='inv']").click();
  await page.locator("#invName").selectOption(name);
}

const cellCount = (page) =>
  page.evaluate(() => Object.keys(window.__NOMIYA.settings.ownCells || {}).length);

test.describe("テンプレは在るのに当てが無い（司さんの実機の状態）", () => {
  test("★① 開くだけで自動で当たり、黙って直さない★", async ({ page }) => {
    const errors = await open(page);
    await openOwnTplRow(page);
    await page.locator("#ownTplFile").setInputFiles(FIX);
    await expect(page.locator("#ownTplNote")).toContainText("Excelが入っています", {
      timeout: 30000,
    });
    const before = await cellCount(page);
    expect(before, "入れた時点で当たっていない＝前提が崩れている").toBeGreaterThanOrEqual(10);

    // ★当てだけ消した古い控えにする★
    await makeLegacyState(page);
    /* ★作れたことを、控えのバイトで確かめる★（消えていなければ この確認は何も見ていない）
       ※アプリの中の値で見てはいけない。開き直した瞬間に直るので、直ったのか
         そもそも消えていなかったのかが分からなくなる。 */
    const legacy = await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem("nomiya_settings_v1") || "{}");
      const db = JSON.parse(localStorage.getItem("__fake_supa_db__") || "{}");
      const c = (((db.tables || {}).nomiya_settings || [])[0] || {}).config || {};
      return {
        控えの当て: Object.keys(s.ownCells || {}).length,
        倉庫の当て: Object.keys(c.ownCells || {}).length,
        控えのテンプレ: (s.ownXlsx || "").length,
      };
    });
    expect(legacy.控えの当て, "★古い控えを作れていない（控えに当てが残っている）★").toBe(0);
    expect(legacy.倉庫の当て, "★倉庫にも当てが残っている★").toBe(0);
    expect(legacy.控えのテンプレ, "テンプレまで消してしまっている").toBeGreaterThan(1000);

    await page.reload({ waitUntil: "load" });
    await expect(page.locator("#scr-input")).toBeVisible();

    // ★開けば（請求書に行かなくても、起動しただけで）当て直す★
    await expect
      .poll(async () => await cellCount(page), { timeout: 20000 })
      .toBeGreaterThanOrEqual(10);
    expect(await cellCount(page), "★当て直した数が入れた時と違う★").toBe(before);
    // ★黙って直さない★
    await expect(page.locator("#toast"), "★当て直したことを知らせていない★").toContainText(
      "当てておきました"
    );
    // 画面の言葉も直っている（請求書タブを開いて見る）
    await openOwnTplRow(page);
    await expect(page.locator("#ownTplNote")).toContainText("コ 当ててあります");
    await expect(page.locator("#btnOwnXlsx"), "直ったのに押せないまま").toBeEnabled();
    // 端末の控えにも残る（開き直しても当てがある）
    await page.reload({ waitUntil: "load" });
    await expect(page.locator("#scr-input")).toBeVisible();
    expect(await cellCount(page), "★当て直した結果を保存していない★").toBe(before);
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("★②③ 当てが無い間は 灰色＋理由。理由から1回で「書く場所をたしかめる」に着く★", async ({
    page,
  }) => {
    const errors = await open(page);
    await openOwnTplRow(page);
    await page.locator("#ownTplFile").setInputFiles(FIX);
    await expect(page.locator("#ownTplNote")).toContainText("Excelが入っています", {
      timeout: 30000,
    });
    const out = page.locator("#btnOwnXlsx");
    await expect(out, "Excelにするボタンが出ていない").toBeVisible();
    await expect(out, "当たっているのに押せない").toBeEnabled();

    // 人が「全部 空にする」を押した状態＝当てが無い（ここは自動で当て直さない）
    await page.locator("#btnOwnPlace").click();
    await expect(page.locator("#xlWrap")).toBeVisible();
    await page.locator("#xlcClear").click();
    await page.locator("#xlcOk").click();
    await page.waitForTimeout(500);
    expect(await cellCount(page), "空にできていない").toBe(0);

    // ★② 灰色＋理由（理由はボタンの中）★
    await expect(out, "★当てが無いのに押せる＝押しても何も起きない形★").toBeDisabled();
    await expect(out, "★理由がボタンの中に無い★").toContainText("書く場所が決まっていません");

    // ★③ 理由から1回で placer に着く★
    const go = page.locator("#ownTplFix");
    await expect(go, "★理由から行ける入口が無い★").toBeVisible();
    await go.click();
    await expect(page.locator("#xlWrap"), "★1回で「書く場所をたしかめる」に着かない★").toBeVisible({
      timeout: 15000,
    });

    // 当て直せば、また押せるようになる
    await page.locator("#xlcAuto").click();
    await page.locator("#xlcOk").click();
    await page.waitForTimeout(400);
    await expect(out, "★当て直したのに押せないまま★").toBeEnabled();
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("★③ 畳んである所に置き去りにしない（畳みが開いた状態で着く）★", async ({ page }) => {
    const errors = await open(page);
    await openOwnTplRow(page);
    await page.locator("#ownTplFile").setInputFiles(FIX);
    await expect(page.locator("#ownTplNote")).toContainText("Excelが入っています", {
      timeout: 30000,
    });
    await page.locator("#btnOwnPlace").click();
    await page.locator("#xlcClear").click();
    await page.locator("#xlcOk").click();
    await page.waitForTimeout(400);

    // ★「見た目を変える」を畳んで、別の画面へ行って戻ってくる（司さんの道順）★
    await page.evaluate(() => {
      document.querySelectorAll("#scr-inv details.look").forEach((d) => (d.open = false));
    });
    await page.locator(".nav-item[data-scr='input']").click();
    await page.locator(".nav-item[data-scr='inv']").click();
    await page.waitForTimeout(300);

    // 畳んだままでも、理由と入口は見える所に出ている
    const go = page.locator("#ownTplFix");
    await expect(go, "★畳んだら 理由も入口も消えた＝たどり着けない★").toBeVisible();
    await go.click();
    await expect(page.locator("#xlWrap")).toBeVisible({ timeout: 15000 });
    // 畳みも開いている（閉じたまま裏で開くと、閉じた後に迷子になる）
    const opened = await page.evaluate(() =>
      [...document.querySelectorAll("#scr-inv details.look")].some((d) => d.open)
    );
    expect(opened, "★畳みが開いていない★").toBe(true);
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("★④ ボタンの言葉は「何が手に入るか」（中の動きを書かない）★", async ({ page }) => {
    const errors = await open(page);
    await addSaleAndPick(page, "山田商事");
    await openOwnTplRow(page);
    await page.locator("#ownTplFile").setInputFiles(FIX);
    await expect(page.locator("#ownTplNote")).toContainText("Excelが入っています", {
      timeout: 30000,
    });
    const out = page.locator("#btnOwnXlsx");
    await expect(out, "★言葉が「Excelにする（お店の様式）」でない★").toContainText(
      "Excelにする（お店の様式）"
    );
    // 隣（印刷）と形がそろっている
    await expect(page.locator("#btnPrintInv")).toContainText("印刷 / PDFにする");
    // 画面のどこにも「入れて出す／入れて渡す」を出さない
    const bad = await page.evaluate(() => {
      const t = document.body.innerText;
      return ["入れて出す", "入れて渡す"].filter((w) => t.includes(w));
    });
    expect(bad, "★人に見せる字に「" + bad.join("・") + "」が残っている★").toEqual([]);
    // 押して出る窓の題も同じ言葉
    await out.click();
    await expect(page.locator("#modalTitle")).toContainText("Excelにする");
    const inModal = await page.evaluate(() => document.getElementById("modalOv").innerText);
    expect(
      ["入れて出す", "入れて渡す"].filter((w) => inModal.includes(w)),
      "★窓の中に「入れて出す／入れて渡す」が残っている★"
    ).toEqual([]);
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });
});
