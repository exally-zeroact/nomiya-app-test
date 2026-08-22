import { test, expect } from "@playwright/test";

/* 客に出る字に ★ を出さない ── ★描き終わった画面から数える★（指示役 2026-08-22 裁定）
 * ------------------------------------------------------------------------------
 *  ソースの字で数えると コメントの ★ まで拾う。だから ★描かれた後の画面★ から数える。
 *  もう1層（元の字を押さえる方）は tests/nomiya-star.test.js。
 *
 *  ★2026-08-22 実際に出ていた物★
 *    「✅ 書く場所が入っていなかったので、★12コ 当てておきました★」（知らせ）
 *    「書く場所は ★12コ 当ててあります★」（設定の中）
 *    ＝ 覚え書きの印が そのまま 客の画面に出ていた。
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

/** いま出ている画面の字を、描き終わった後から読む */
async function shownText(page) {
  return await page.evaluate(() => {
    const parts = [];
    document.querySelectorAll(".screen.active, .modal-ov.open, #toast.show").forEach((el) => {
      parts.push(el.innerText || "");
    });
    return parts.join("\n");
  });
}

test.describe("客に出る字に ★ を出さない（画面から数える）", () => {
  test("どの画面・どの面・どの窓にも ★ が出ない", async ({ page }) => {
    test.setTimeout(120000);
    const errors = await open(page);

    // 中身を入れる（空の画面だけ見て「★は無い」と言わない）
    await page.locator("#inName").fill("田中");
    await page.locator("#inPeople").fill("2");
    await page.locator("#inAmount").fill("8000");
    await page.locator("#inMemo").fill("ボトル");
    await page.locator("#btnSave").click();

    const seen = [];
    const look = async (name) => {
      await page.waitForTimeout(150);
      const t = await shownText(page);
      expect(t.length, `${name}: 画面の字が空＝何も見ていない`).toBeGreaterThan(10);
      seen.push({ name, star: t.includes("★"), text: t });
    };

    // 下ナビの6画面
    for (const [scr, name] of [
      ["input", "入力"],
      ["list", "一覧"],
      ["sum", "集計タブ"],
      ["inv", "請求書"],
      ["pay", "給料"],
      ["close", "締め"],
    ]) {
      await page.locator(`.nav-item[data-scr='${scr}']`).click();
      await look(name);
    }

    // 集計タブの中（売上帳 / 集計 / 税理士の紙）
    await page.locator(".nav-item[data-scr='sum']").click();
    for (const [seg, name] of [
      ["ledger", "売上帳"],
      ["sum", "集計"],
      ["tax", "税理士の紙"],
    ]) {
      await page.locator(`#sumSeg [data-mseg='${seg}']`).click();
      await look(name);
    }

    // 請求書の中（請求書 / 未回収 / 入金）
    await page.locator(".nav-item[data-scr='inv']").click();
    for (const [seg, name] of [
      ["inv", "請求書(発行)"],
      ["due", "未回収"],
      ["paid", "入金"],
    ]) {
      await page.locator(`#invSeg [data-iseg='${seg}']`).click();
      await look(name);
    }

    // 設定の中（自社情報 / 会社 / 従業員 / 商品 / アカウント）
    await page.locator("#btnGear").click();
    for (const [seg, name] of [
      ["self", "設定:自社情報"],
      ["partner", "設定:会社"],
      ["staff", "設定:従業員"],
      ["item", "設定:商品"],
      ["acct", "設定:アカウント"],
    ]) {
      await page.locator(`#setSeg [data-sseg='${seg}']`).click();
      await look(name);
    }

    // 窓（消す・期間・出金）＝押した時にだけ出る字も数える
    await page.locator("#btnGear").click();
    await page.locator(".nav-item[data-scr='list']").click();
    await page.locator("#listRows [data-id]").first().click();
    await page.locator("#btnDelete").click();
    await look("窓:この売上を消す");
    await page.locator("#mdNo").click();
    await page.locator("#btnCancelEdit").click();

    await page.locator(".nav-item[data-scr='list']").click();
    await page.locator(".period-lb:visible").click();
    await look("窓:期間を指定");
    await page.locator("#mdCancel, #mdNo, #modalX").first().click();

    await page.locator(".nav-item[data-scr='close']").click();
    await page.locator("#btnOutAdd").click();
    await look("窓:出金");
    await page.locator("#modalX").click();

    // 「売上を全部消す」の窓（1回 書き出してから開く鍵）
    await page.locator("#btnGear").click();
    await page.locator("#setSeg [data-sseg='acct']").click();
    await Promise.all([page.waitForEvent("download"), page.locator("#btnExport").click()]);
    await page.locator("#btnWipe").click();
    await look("窓:売上を全部消す");
    await page.locator("#mdNo").click();

    // ★数えた場所が減っていないこと★（画面を減らして緑にする、を防ぐ）
    expect(seen.length, "見た場所が少ない＝範囲が縮んでいる").toBeGreaterThanOrEqual(21);
    const bad = seen.filter((s) => s.star);
    expect(
      bad.map((b) => b.name + " → " + (b.text.match(/[^\n]*★[^\n]*/) || [""])[0]).join(" / "),
      "客に出る字に ★ が出ている"
    ).toBe("");
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });
});
