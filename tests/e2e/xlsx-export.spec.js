import { test, expect } from "@playwright/test";
import { covering } from "../lib/check-kit.mjs";

/* ★Excel書き出しを、実際に押して・出来た物を開き直して確かめる★
 * ------------------------------------------------------------------------------
 * バイト数だけ見て緑にしない。ダウンロードされた .xlsx を ZIP としてほどき、
 * 中の sheet1.xml から ★1マスずつ★ 読み戻す。
 * （書き出す側は圧縮しない ZIP で書いているので、外の部品なしでほどける）
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

/* 売上を1件足す。★実物の道順どおり★
   「請求書送り」だけは自由入力ではなく、登録した宛先から選ぶ作りなので そこも同じにする
   （ここを手抜きすると「名前を入れてください」で保存されず、
     ★書き出しが1件しか出ていないのに気づけない★） */
async function addSale(page, s) {
  await page.locator(".nav-item[data-scr='input']").click();
  await page.locator("#inDate").fill(s.date);
  await page.locator(`#payChips button[data-pay="${s.pay}"]`).click();
  if (s.pay === "invoice") {
    if ((await page.locator(`#inNameSel option[value="${s.name}"]`).count()) === 0) {
      await page.locator("#inNameSel").selectOption("__new");
      await page.locator("#ptName").fill(s.name);
      await page.locator("#ptOk").click();
    }
    await page.locator("#inNameSel").selectOption(s.name);
  } else {
    await page.locator("#inName").fill(s.name);
  }
  await page.locator("#inPeople").fill(String(s.people));
  await page.locator("#inAmount").fill(String(s.amount));
  if (s.memo) await page.locator("#inMemo").fill(s.memo);
  await page.locator("#btnSave").click();
  await page.waitForTimeout(250);
  // ★保存できたことを確かめる（黙って落ちていたら、その場で気づく）★
  await expect(page.locator("#inErr"), "保存できていない").toHaveText("");
}

/** ダウンロードされた .xlsx をほどいて、マスの位置→中身にする */
function readXlsx(buf) {
  const bytes = new Uint8Array(buf);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const files = {};
  let p = 0;
  while (p + 4 <= bytes.length && dv.getUint32(p, true) === 0x04034b50) {
    const method = dv.getUint16(p + 8, true);
    const size = dv.getUint32(p + 18, true);
    const nameLen = dv.getUint16(p + 26, true);
    const extraLen = dv.getUint16(p + 28, true);
    const name = new TextDecoder().decode(bytes.subarray(p + 30, p + 30 + nameLen));
    const start = p + 30 + nameLen + extraLen;
    if (method !== 0) throw new Error(name + " が圧縮されている");
    files[name] = new TextDecoder().decode(bytes.subarray(start, start + size));
    p = start + size;
  }
  const sheet = files["xl/worksheets/sheet1.xml"] || "";
  const cells = {};
  const re = /<c r="([A-Z]+\d+)"([^>]*)>([\s\S]*?)<\/c>/g;
  let m;
  while ((m = re.exec(sheet))) {
    const inline = /t="inlineStr"/.test(m[2]);
    cells[m[1]] = {
      v: inline
        ? (m[3].match(/<t[^>]*>([\s\S]*?)<\/t>/) || [])[1]
        : (m[3].match(/<v>([\s\S]*?)<\/v>/) || [])[1],
      inline,
      style: (m[2].match(/ s="(\d+)"/) || [])[1] || "0",
    };
  }
  return { files, sheet, cells };
}

test.describe("Excelに書き出す（一覧タブ）", () => {
  test("★押すと .xlsx が出て、中身が1マスずつ正しい★", async ({ page }) => {
    const errors = await open(page);
    await addSale(page, {
      date: "2026-08-07",
      name: "田中様",
      people: 2,
      amount: 12345,
      pay: "cash",
      memo: "ボトル入れ",
    });
    await addSale(page, {
      date: "2026-08-08",
      name: "山本商事",
      people: 4,
      amount: 88000,
      pay: "invoice",
    });

    await page.locator(".nav-item[data-scr='sum']").click(); // 売上帳は集計タブ（2026-08-21）
    await expect(page.locator("#scr-sum")).toBeVisible();

    // ★押す道順を実際になぞる★
    await page.locator("#btnXlsxList").click();
    await expect(page.locator("#modalOv")).toHaveClass(/open/);

    // ★保存の名前の案が、中身から作られて出ている（そして直せる）★
    const suggested = await page.locator("#xlName").inputValue();
    expect(suggested, "名前の案が出ていない").toMatch(/売上帳/);
    expect(suggested, "拡張子が付いていない").toMatch(/\.xlsx$/);
    await page.locator("#xlName").fill("売上帳しらべ");

    const [dl] = await Promise.all([page.waitForEvent("download"), page.locator("#xlOk").click()]);
    // ★直した名前が使われる／.xlsx が自動で付く★
    expect(dl.suggestedFilename()).toBe("売上帳しらべ.xlsx");

    const path = await dl.path();
    const fs = await import("node:fs");
    const { cells, files } = readXlsx(fs.readFileSync(path));

    await covering("Excelの中身", 8, async (c) => {
      // 見出し
      expect(cells.A1.v).toBe("日付");
      expect(cells.D1.v).toBe("金額");
      c.seen("見出し");
      // ★金額は数字（文字ではない）＝Excelで足せる★
      expect(cells.D2.inline, "金額が文字で入っている").toBe(false);
      expect(cells.D2.v).toBe("12345");
      c.seen("金額が数字");
      // ★日付は日付（並べ替えできる）★
      expect(cells.A2.inline, "日付が文字で入っている").toBe(false);
      expect(Number(cells.A3.v) - Number(cells.A2.v), "1日ぶん進んでいない").toBe(1);
      c.seen("日付が日付");
      // 人数
      expect(cells.C2.v).toBe("2");
      c.seen("人数が数字");
      // 名前・支払い方法は画面と同じ言い方
      expect(cells.B2.v).toBe("田中様");
      expect(cells.E2.v).toBe("現金");
      expect(cells.E3.v).toBe("請求書送り");
      c.seen("支払い方法の言い方");
      // 領収書は紙と同じ2区分
      expect(["あり", "なし"]).toContain(cells.F2.v);
      c.seen("領収書2区分");
      // 備考
      expect(cells.H2.v).toBe("ボトル入れ");
      c.seen("備考");
      // Excelが開くのに要る物がそろっている
      expect(files["[Content_Types].xml"], "Content_Types が無い").toBeTruthy();
      expect(files["xl/styles.xml"], "styles が無い").toBeTruthy();
      c.seen("Excelが開く形");
    });

    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("★出すのは「いま画面に出している分」だけ（絞り込みが効く）★", async ({ page }) => {
    const errors = await open(page);
    await addSale(page, {
      date: "2026-08-07",
      name: "現金の人",
      people: 1,
      amount: 1000,
      pay: "cash",
    });
    await addSale(page, {
      date: "2026-08-07",
      name: "ツケの人",
      people: 1,
      amount: 2000,
      pay: "tsuke",
    });

    await page.locator(".nav-item[data-scr='sum']").click(); // 売上帳は集計タブ（2026-08-21）
    // 現金だけに絞る
    await page.locator("#filPay [data-fp='cash']").click();
    await page.locator("#btnXlsxList").click();
    // ★絞り込みが名前の案にも出る（何を出したか後で分かる）★
    expect(await page.locator("#xlName").inputValue()).toContain("現金");

    const [dl] = await Promise.all([page.waitForEvent("download"), page.locator("#xlOk").click()]);
    const fs = await import("node:fs");
    const { cells } = readXlsx(fs.readFileSync(await dl.path()));
    expect(cells.B2.v, "絞ったのに違う人が出ている").toBe("現金の人");
    expect(cells.B3, "★絞り込みが効いていない（ツケの人まで出ている）★").toBeUndefined();
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("売上が1件も無い期間では、★押す前から灰色＋理由★（空のファイルを作らない）", async ({ page }) => {
    /* 2026-08-19 に変えた：前は押してからトーストで理由が出ていた＝遅い。 */
    const errors = await open(page);
    await page.locator(".nav-item[data-scr='sum']").click(); // 売上帳は集計タブ（2026-08-21）
    const b = page.locator("#btnXlsxList");
    await expect(b, "灰色になっていない").toBeDisabled();
    await expect(b, "理由がボタンの中に無い").toContainText("この期間に売上がありません");
    await b.click({ force: true }).catch(() => {});
    await expect(page.locator("#modalOv")).not.toHaveClass(/open/);
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("★部品は押すまで読まない（ふだんの起動を重くしない）★", async ({ page }) => {
    const errors = await open(page);
    const before = await page.evaluate(() =>
      [...document.querySelectorAll("script[src]")].some((s) => /nomiya-xlsx/.test(s.src))
    );
    expect(before, "起動の時点で Excel の部品を読んでいる").toBe(false);
    await addSale(page, { date: "2026-08-07", name: "客", people: 1, amount: 100, pay: "cash" });
    await page.locator(".nav-item[data-scr='sum']").click(); // 売上帳は集計タブ（2026-08-21）
    await page.locator("#btnXlsxList").click();
    await Promise.all([page.waitForEvent("download"), page.locator("#xlOk").click()]);
    const after = await page.evaluate(() =>
      [...document.querySelectorAll("script[src]")].some((s) => /nomiya-xlsx/.test(s.src))
    );
    expect(after, "押しても部品を読んでいない").toBe(true);
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });
});
