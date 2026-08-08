import { test, expect } from "@playwright/test";
import { covering } from "../lib/check-kit.mjs";

/* ★自社テンプレ（お店が持っている紙）を、実UIで最後まで通す★
 * ------------------------------------------------------------------------------
 *   紙を入れる → 項目を置く → 画面に出る → ★PDFにも同じ場所で出る★
 * 位置は「A4に対する％」で持つので、画面の縮小表示でも紙でも同じ場所に出るはず。
 * ここを確かめないと「画面では合っているのに刷るとズレる」を見逃す。
 */

const PAGE = "/nomiya-uriage.html";

/* 小さな白いPNG（1x1）。テンプレの中身は問題ではないので、いちばん軽い物で通す */
const PNG_1x1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";

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

/** 設定 → 請求書の見た目 を開く */
async function openLook(page) {
  await page.locator(".nav-item[data-scr='inv']").click();
  await expect(page.locator("#scr-inv")).toBeVisible();
  const sum = page.locator("summary", { hasText: "見た目を変える" });
  if (await sum.count()) await sum.first().click();
}

test.describe("自社テンプレ（お店の紙に載せる）", () => {
  test("★紙を入れて・項目を置いて・画面とPDFの両方に同じ場所で出る★", async ({ page }) => {
    const errors = await open(page);
    await openLook(page);

    // 「自社のテンプレ」を選ぶ → その行と部品が出る
    await page.locator("#invTpl [data-tpl='own']").click();
    await expect(page.locator("#ownTplRow")).toBeVisible();
    await expect(page.locator("#btnOwnPick"), "紙を選ぶボタンが出ていない").toBeVisible();

    // 紙（絵）を入れる。※PDFの読み込みは別の試験で見る
    await page.locator("#ownTplFile").setInputFiles({
      name: "template.png",
      mimeType: "image/png",
      buffer: Buffer.from(PNG_1x1, "base64"),
    });
    await expect(page.locator("#ownTplNote"), "紙が入っていない").toContainText("紙が入っています");

    // 置き場所を決める画面
    await page.locator("#btnOwnPlace").click();
    await expect(page.locator("#opPaper")).toBeVisible();

    await covering("置ける項目の箱", 11, async (c) => {
      const boxes = page.locator("#opPaper .op-f");
      const n = await boxes.count();
      for (let i = 0; i < n; i++) {
        const k = await boxes.nth(i).getAttribute("data-f");
        c.seen(k);
      }
    });

    // ★宛名を、指で動かす（つまんで運ぶ）★
    const paper = page.locator("#opPaper");
    const box = await paper.boundingBox();
    const to = page.locator("#opPaper .op-f[data-f='to']");
    const before = await to.boundingBox();
    await page.mouse.move(before.x + 20, before.y + 10);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.6, { steps: 8 });
    await page.mouse.up();

    // 「振込先」はテンプレにもう刷ってある想定＝出さない
    await page.locator("#opShow [data-show='bank']").click();

    await page.locator("#opOk").click();
    await expect(page.locator("#modalOv")).not.toHaveClass(/open/);

    // ★覚えた置き方が％で入っている（pxで持っていない）★
    const saved = await page.evaluate(() => window.__NOMIYA.settings.ownFields);
    expect(saved.to.x, "動かしたのに位置が覚えられていない").toBeGreaterThan(30);
    expect(saved.to.y).toBeGreaterThan(40);
    expect(saved.to.x + saved.to.w, "紙からはみ出している").toBeLessThanOrEqual(100);
    expect(saved.bank.show, "出さないにしたのに覚えていない").toBe(false);

    // ★画面の紙に、その場所で出ている★
    const onScreen = await page.evaluate(() => {
      const sheet = document.querySelector("#invSheets .iv-own");
      if (!sheet) return null;
      const f = sheet.querySelector('.iv-own-f[data-f="to"]');
      if (!f) return null;
      const s = f.style;
      return {
        left: s.left,
        top: s.top,
        width: s.width,
        bankOut: !sheet.querySelector('.iv-own-f[data-f="bank"]'),
        hasBg: !!sheet.querySelector(".iv-own-bg"),
      };
    });
    expect(onScreen, "自社テンプレの紙が出ていない").not.toBe(null);
    expect(onScreen.left, "★位置がpxで書かれている（端末でズレる）★").toContain("%");
    expect(onScreen.top).toContain("%");
    expect(onScreen.width).toContain("%");
    expect(onScreen.left).toBe(saved.to.x + "%");
    expect(onScreen.bankOut, "出さないにした振込先が紙に出ている").toBe(true);
    expect(onScreen.hasBg, "テンプレの絵が敷かれていない").toBe(true);

    // ★PDFにも出る（紙が空にならない）★
    const pdf = await page.evaluate(async () => {
      const blob = await window.__NOMIYA.buildPdf("invSheets");
      const u8 = new Uint8Array(await blob.arrayBuffer());
      let head = "";
      for (let k = 0; k < 5; k++) head += String.fromCharCode(u8[k]);
      const all = new TextDecoder("latin1").decode(u8);
      const b = (all.match(/\/MediaBox\s*\[([^\]]+)\]/) || [])[1] || "0 0 0 0";
      return {
        head,
        size: u8.length,
        w: Math.round(parseFloat(b.split(" ")[2])),
        h: Math.round(parseFloat(b.split(" ")[3])),
      };
    });
    expect(pdf.head, "PDFになっていない").toBe("%PDF-");
    expect(pdf.w, "A4の幅でない").toBe(595);
    expect(pdf.h, "A4の高さでない").toBe(842);
    expect(pdf.size, "紙が空っぽ").toBeGreaterThan(20000);

    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("★はじめの置き方に戻せる★", async ({ page }) => {
    const errors = await open(page);
    await openLook(page);
    await page.locator("#invTpl [data-tpl='own']").click();
    await page.locator("#ownTplFile").setInputFiles({
      name: "t.png",
      mimeType: "image/png",
      buffer: Buffer.from(PNG_1x1, "base64"),
    });
    await page.locator("#btnOwnPlace").click();
    // 動かす
    const to = page.locator("#opPaper .op-f[data-f='to']");
    const b = await to.boundingBox();
    await page.mouse.move(b.x + 20, b.y + 10);
    await page.mouse.down();
    await page.mouse.move(b.x + 120, b.y + 200, { steps: 5 });
    await page.mouse.up();
    await page.locator("#opOk").click();
    const moved = await page.evaluate(() => window.__NOMIYA.settings.ownFields.to);

    // 戻す
    await page.locator("#btnOwnPlace").click();
    await page.locator("#opReset").click();
    await expect(page.locator("#opPaper")).toBeVisible();
    await page.locator("#opOk").click();
    const back = await page.evaluate(() => window.__NOMIYA.settings.ownFields.to);
    expect(back, "はじめの置き方に戻っていない").not.toEqual(moved);
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  /* ★PDFを実際に読ませる★
     お店が持っているのはたいてい PDF。ここが通らないと、この機能は使えない。
     PDFを読む部品は1.7MBあるが ★登録のときだけ★ 読む（登録後は絵になる）。 */
  test("★PDFのテンプレを入れられる（1ページ目が絵になる）★", async ({ page }) => {
    const errors = await open(page);
    await openLook(page);
    await page.locator("#invTpl [data-tpl='own']").click();

    // 入れる前は、PDFを読む部品を読んでいない
    const before = await page.evaluate(() =>
      [...document.querySelectorAll("script")].some((s) => /pdf\.min\.mjs/.test(s.src || ""))
    );
    expect(before, "起動の時点でPDFの部品を読んでいる").toBe(false);

    await page.locator("#ownTplFile").setInputFiles("tests/e2e/fixtures/tpl-sample.pdf");
    // 1.7MBを読んで絵にするので、少し待つ
    await expect(page.locator("#ownTplNote"), "PDFから紙を作れていない").toContainText(
      "紙が入っています",
      { timeout: 30000 }
    );

    const tpl = await page.evaluate(() => window.__NOMIYA.settings.ownTpl);
    expect(tpl, "テンプレが覚えられていない").toBeTruthy();
    expect(tpl.slice(0, 22), "★絵になっていない（PDFのまま覚えている）★").toBe(
      "data:image/jpeg;base64"
    );

    // ★A4の形になっている（縦長）★
    const size = await page.evaluate(
      (src) =>
        new Promise((ok) => {
          const i = new Image();
          i.onload = () => ok({ w: i.naturalWidth, h: i.naturalHeight });
          i.src = src;
        }),
      tpl
    );
    expect(size.w, "覚える絵が大きすぎる（端末とクラウドを圧迫する）").toBeLessThanOrEqual(1240);
    expect(size.h / size.w, "A4の縦長になっていない").toBeGreaterThan(1.3);

    // 画面の紙に、その絵が敷かれている
    await expect(page.locator("#invSheets .iv-own-bg"), "テンプレが敷かれていない").toBeVisible();
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("テンプレを入れる前でも、画面が壊れない（理由が出る）", async ({ page }) => {
    const errors = await open(page);
    await openLook(page);
    await page.locator("#invTpl [data-tpl='own']").click();
    await expect(page.locator("#invSheets .iv-own-none"), "理由が出ていない").toContainText(
      "自社のテンプレがまだありません"
    );
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("★他のデザインに戻せる（自社テンプレに閉じ込めない）★", async ({ page }) => {
    const errors = await open(page);
    await openLook(page);
    await page.locator("#invTpl [data-tpl='own']").click();
    await expect(page.locator("#ownTplRow")).toBeVisible();
    await page.locator("#invTpl [data-tpl='card']").click();
    await expect(page.locator("#ownTplRow"), "戻したのに自社テンプレの行が残っている").toBeHidden();
    await expect(
      page.locator("#invSheets .iv-card"),
      "カードのデザインに戻っていない"
    ).toBeVisible();
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });
});
