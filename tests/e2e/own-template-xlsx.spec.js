import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { covering } from "../lib/check-kit.mjs";
// アプリ本体と同じ物を読む（CommonJS なのでそのまま既定の書き出しが入口）
import T from "../../nomiya-xlsx-tpl.js";

/* ★お店のテンプレが「Excel」のとき★ を、実UIで最後まで通す。
 * ------------------------------------------------------------------------------
 *   Excelを入れる → 画面にそのExcelが出る → マスを選ぶ → 紙に値が出る →
 *   ★お店のExcelに入れて書き出し、その中身を読み戻して確かめる★
 *
 * ここが通らないと「そのExcelのまま」が嘘になる。
 * 見本の tpl-invoice.xlsx は ★本物のExcelで作った物★（作り物のXMLでは測らない）。
 */

const PAGE = "/nomiya-uriage.html";
const FIX = "tests/e2e/fixtures/tpl-invoice.xlsx";

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

/* 請求書送りの売上を1件入れる。
   ★請求書送りだけは「登録した宛先」からしか選べない★（無ければその場で登録する）。
   ここを飛ばすと2件目が黙って保存されず、あとの数が合わなくなる（前に踏んだ）。 */
async function addSale(page, { date, name, amount, people = 2, memo = "" }) {
  await page.locator(".nav-item[data-scr='input']").click();
  await expect(page.locator("#scr-input")).toBeVisible();
  await page.locator("#inDate").fill(date);
  await page.locator('#payChips button[data-pay="invoice"]').click();
  if ((await page.locator(`#inNameSel option[value="${name}"]`).count()) === 0) {
    await page.locator("#inNameSel").selectOption("__new");
    await page.locator("#ptName").fill(name);
    await page.locator("#ptOk").click();
  }
  await page.locator("#inNameSel").selectOption(name);
  await page.locator("#inPeople").fill(String(people));
  await page.locator("#inAmount").fill(String(amount));
  if (memo) await page.locator("#inMemo").fill(memo);
  await page.locator("#btnSave").click();
  await expect(page.locator("#inErr"), "保存できていない").toHaveText("");
}

/** 請求する相手を選ぶ（選ばないと見本のまま） */
async function pickCompany(page, name) {
  await page.locator(".nav-item[data-scr='inv']").click();
  await expect(page.locator("#scr-inv")).toBeVisible();
  await page.locator("#invName").selectOption(name);
}

async function openLook(page) {
  await page.locator(".nav-item[data-scr='inv']").click();
  await expect(page.locator("#scr-inv")).toBeVisible();
  const sum = page.locator("summary", { hasText: "見た目を変える" });
  if (await sum.count()) await sum.first().click();
}

/** Excelのテンプレを入れて、表が出るまで待つ */
async function putXlsx(page) {
  await page.locator("#invTpl [data-tpl='own']").click();
  await expect(page.locator("#ownTplRow")).toBeVisible();
  await page.locator("#ownTplFile").setInputFiles(FIX);
  await expect(page.locator("#ownTplNote"), "Excelが入っていない").toContainText(
    "Excelが入っています",
    { timeout: 30000 }
  );
}

/** 項目を押してから、マスを押す */
async function assign(page, key, ref) {
  await page.locator(`#xlFields [data-cf='${key}']`).click();
  await page.locator(`#xlWrap td[data-r='${ref}']`).click();
}

test.describe("自社テンプレ（お店のExcel）", () => {
  test("★Excelを入れると、そのExcelが画面に出る★", async ({ page }) => {
    const errors = await open(page);
    await openLook(page);
    await putXlsx(page);

    // 紙の中に、そのExcelの表が出ている
    const grid = page.locator("#invSheets .xl-grid");
    await expect(grid, "Excelの表が出ていない").toBeVisible();
    await expect(grid, "テンプレの文字が出ていない").toContainText("御 請 求 書");
    await expect(grid).toContainText("お振込先");
    await expect(grid).toContainText("○○銀行 △△支店 普通 1234567");

    // 結合・列幅・罫線が効いている（Excelの見た目をそのまま出している証拠）
    const look = await page.evaluate(() => {
      const t = document.querySelector("#invSheets .xl-grid");
      const title = t.querySelector('td[data-r="A1"]');
      const cell = t.querySelector('td[data-r="A10"]');
      const cols = [...t.querySelectorAll("col")].map((c) => parseInt(c.style.width, 10));
      return {
        colspan: title.getAttribute("colspan"),
        bold: getComputedStyle(title).fontWeight,
        border: getComputedStyle(cell).borderBottomStyle,
        cols,
      };
    });
    expect(look.colspan, "結合が効いていない").toBe("6");
    expect(+look.bold, "太字が効いていない").toBeGreaterThanOrEqual(700);
    expect(look.border, "明細の枠の罫線が出ていない").toBe("solid");
    expect(look.cols[0], "A列の幅が効いていない").toBeGreaterThan(look.cols[1]);

    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("★マスを選ぶと、紙のその場所に値が出る★", async ({ page }) => {
    const errors = await open(page);
    await addSale(page, { date: "2026-08-01", name: "山田商事", amount: 44000, memo: "ボトル" });
    await pickCompany(page, "山田商事");
    await openLook(page);
    await putXlsx(page);

    await page.locator("#btnOwnPlace").click();
    await expect(page.locator("#xlWrap")).toBeVisible();

    await covering("入れられる項目", 18, async (c) => {
      const chips = page.locator("#xlFields [data-cf]");
      const n = await chips.count();
      for (let i = 0; i < n; i++) c.seen(await chips.nth(i).getAttribute("data-cf"));
    });

    await assign(page, "to", "B4");
    await assign(page, "total", "E33");
    await assign(page, "cDate", "A10");
    await assign(page, "cName", "C10");
    await assign(page, "cAmount", "E10");
    await assign(page, "lastRow", "A29");

    // 選んだマスに印が付く
    await expect(page.locator("#xlWrap td[data-r='B4']"), "選んだ印が出ていない").toHaveClass(
      /xl-set/
    );
    await expect(page.locator("#xlNote"), "明細の始まりを知らせていない").toContainText(
      "10 行目から"
    );

    await page.locator("#xlcOk").click();
    await expect(page.locator("#modalOv")).not.toHaveClass(/open/);

    const saved = await page.evaluate(() => window.__NOMIYA.settings.ownCells);
    expect(saved.to).toBe("B4");
    expect(saved.cAmount).toBe("E10");

    // ★紙（画面）に、そのマスの場所で出ている★
    const seen = await page.evaluate(() => {
      const t = document.querySelector("#invSheets .xl-grid");
      const g = (r) => (t.querySelector(`td[data-r="${r}"]`) || {}).textContent || "";
      return { to: g("B4"), total: g("E33"), d1: g("A10"), n1: g("C10"), a1: g("E10") };
    });
    expect(seen.to, "宛名が出ていない").toContain("山田商事");
    expect(seen.total, "合計が出ていない").toContain("44,000");
    expect(seen.d1, "明細の日付が出ていない").toBe("8/1");
    expect(seen.n1).toBe("ご飲食代");
    expect(seen.a1).toBe("44,000");

    // ★紙（PDF）にも出る＝Excelのテンプレでも今までの刷り方がそのまま使える★
    const pdf = await page.evaluate(async () => {
      const blob = await window.__NOMIYA.buildPdf("invSheets");
      const u8 = new Uint8Array(await blob.arrayBuffer());
      let head = "";
      for (let k = 0; k < 5; k++) head += String.fromCharCode(u8[k]);
      const b =
        (new TextDecoder("latin1").decode(u8).match(/\/MediaBox\s*\[([^\]]+)\]/) || [])[1] ||
        "0 0 0 0";
      return { head, size: u8.length, w: Math.round(parseFloat(b.split(" ")[2])) };
    });
    expect(pdf.head, "PDFになっていない").toBe("%PDF-");
    expect(pdf.w, "A4の幅でない").toBe(595);
    expect(pdf.size, "紙が空っぽ").toBeGreaterThan(20000);

    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("★書き出したExcelに、値が入っていて、元の形が残っている★", async ({ page }, info) => {
    const errors = await open(page);
    await addSale(page, { date: "2026-08-01", name: "山田商事", amount: 44000 });
    await addSale(page, { date: "2026-08-05", name: "山田商事", amount: 33000 });
    await pickCompany(page, "山田商事");
    await openLook(page);
    await putXlsx(page);

    await page.locator("#btnOwnPlace").click();
    await assign(page, "to", "B4");
    await assign(page, "total", "E33");
    await assign(page, "cDate", "A10");
    await assign(page, "cAmount", "E10");
    await assign(page, "lastRow", "A29");
    await page.locator("#xlcOk").click();

    const btn = page.locator("#btnOwnXlsx");
    await expect(btn, "Excelで出すボタンが出ていない").toBeVisible();
    await btn.click();
    await expect(page.locator("#oxName"), "ファイル名の案が出ていない").toHaveValue(
      /請求書_山田商事/
    );

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.locator("#oxOk").click(),
    ]);
    const out = path.join(info.outputDir, "out.xlsx");
    await download.saveAs(out);
    const bytes = new Uint8Array(fs.readFileSync(out));

    // ★書き出した物を読み戻す★
    const book = await T.open(bytes);
    const s = book.sheets[0];
    expect(T.cellText(book, s, "B4"), "宛名が入っていない").toContain("山田商事");
    expect(T.cellText(book, s, "E33"), "合計が入っていない").toBe("77,000");
    expect(T.cellText(book, s, "A10"), "明細1件目の日付が入っていない").toBe("8/1");
    expect(T.cellText(book, s, "A11"), "明細2件目の日付が入っていない").toBe("8/5");
    // ★金額は「数字」で入っている（文字で入れるとExcelで足せない）★
    expect(s.cells.E10.v, "金額が数字で入っていない").toBe("44000");
    expect(s.cells.E10.t, "金額を文字として入れている").toBe(null);
    expect(s.cells.E11.v).toBe("33000");
    // ★テンプレの中身は消えていない★
    expect(T.cellText(book, s, "A1")).toBe("御 請 求 書");
    expect(T.cellText(book, s, "A37")).toBe("○○銀行 △△支店 普通 1234567");
    expect(s.merges.length, "結合が消えている").toBeGreaterThanOrEqual(1);
    expect(s.cols.length, "列幅が消えている").toBe(6);
    expect(s.cells.E34.f, "計算式が消えている").toBe(true);
    expect(book.workbookXml, "開いたとき計算し直す印が無い").toMatch(/fullCalcOnLoad="1"/);
    // 判子の図形・書式は、中の物を数えて確かめる（消えていたら本数が減る）
    const names = T._readZip(bytes).entries.map((e) => e.name);
    expect(names, "図形が消えている").toContain("xl/drawings/drawing1.xml");
    expect(names, "書式が消えている").toContain("xl/styles.xml");

    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("マスを決めていなければ、理由を出して止まる", async ({ page }) => {
    const errors = await open(page);
    await addSale(page, { date: "2026-08-01", name: "山田商事", amount: 44000 });
    await pickCompany(page, "山田商事");
    await openLook(page);
    await putXlsx(page);
    await page.locator("#btnOwnXlsx").click();
    await expect(page.locator("#toast"), "理由が出ていない").toContainText("どのマスに入れるか");
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("Excelのテンプレから、紙のテンプレへ入れ替えられる（閉じ込めない）", async ({ page }) => {
    const errors = await open(page);
    await openLook(page);
    await putXlsx(page);
    await page.locator("#ownTplFile").setInputFiles({
      name: "t.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
        "base64"
      ),
    });
    await expect(page.locator("#ownTplNote")).toContainText("紙が入っています");
    const st = await page.evaluate(() => window.__NOMIYA.settings);
    expect(st.ownXlsx, "★Excelと紙を両方持ったままにしている★").toBe("");
    await expect(page.locator("#invSheets .iv-own-bg")).toBeVisible();
    await expect(page.locator("#btnOwnXlsx"), "Excelのボタンが残っている").toBeHidden();
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });
});
