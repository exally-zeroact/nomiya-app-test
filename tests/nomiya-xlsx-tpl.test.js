/* お店の Excel の請求書に「値だけ差し込む」道具を確かめる。
 * ------------------------------------------------------------------------------
 * ★作り物のXMLでは測らない★
 *   ここで使う tests/e2e/fixtures/tpl-invoice.xlsx は ★本物のExcelで作った★ 物。
 *   自分で書いたXMLで試すと、自分の思い込みごと通ってしまう（実際に踏んだ）。
 *
 * ★2026-08-09 に踏んだ本物の罠★
 *   Excelは中身の無いセルを `<c r="A10" s="5"/>` と書く。タグの切り出しを欲張りにすると
 *   その行のセルが丸ごと消える。原本のセルが ★148個 → 19個★ になっていた。
 *   下の「空のセルを飲み込まない」が、それを二度と通さないための見張り。
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { expectNoneOf, covering } from "./lib/check-kit.mjs";
import { ROOT } from "./app-source.mjs";

const require = createRequire(import.meta.url);
const T = require("../nomiya-xlsx-tpl.js");

const FIX = path.join(ROOT, "tests/e2e/fixtures/tpl-invoice.xlsx");
const bytes = () => new Uint8Array(fs.readFileSync(FIX));

/** その .xlsx の中の1本を、圧縮されたままの姿で取り出す */
function rawMap(u8) {
  const zip = T._readZip(u8);
  const m = {};
  zip.entries.forEach((e) => {
    m[e.name] = Buffer.from(T._rawOf(zip, e)).toString("base64");
  });
  return m;
}

describe("お店のExcelを開く", () => {
  it("★本物のExcelで作った請求書が開ける★", async () => {
    expect(fs.existsSync(FIX), "見本のExcelが無い").toBe(true);
    const book = await T.open(bytes());
    expect(book.sheets.length, "シートが読めていない").toBe(1);
    expect(book.sheets[0].name).toBe("請求書");
    expect(book.sheets[0].maxRow).toBeGreaterThanOrEqual(36);
    expect(book.sheets[0].maxCol).toBe(6);
  });

  /* ★これが落ちると、明細の行が全部消える★ */
  it("★中身の無いセル `<c/>` を飲み込まない（148個ぜんぶ読める）★", async () => {
    const book = await T.open(bytes());
    const cells = book.sheets[0].cells;
    expect(Object.keys(cells).length, "セルの読み落としがある").toBeGreaterThanOrEqual(140);
    // 明細の1行（枠だけで中身が無い＝ぜんぶ `<c/>`）が丸ごと読めていること
    await covering("明細1行目のセル", 6, async (c) => {
      ["A10", "B10", "C10", "D10", "E10", "F10"].forEach((r) => {
        if (cells[r]) c.seen(r);
        else c.skip(r, "★読めていない★");
      });
    });
    // 値のあるセルの後ろに並ぶセルも消えていないこと
    expect(cells.A4, "A4（宛名）が消えている").toBeTruthy();
    expect(cells.D31, "D31（小計）が消えている").toBeTruthy();
    expect(cells.D33, "D33（合計）が消えている").toBeTruthy();
  });

  it("見えている文字が、そのまま読める", async () => {
    const book = await T.open(bytes());
    const s = book.sheets[0];
    const t = (r) => T.cellText(book, s, r);
    expect(t("A1")).toBe("御 請 求 書"); // 結合＋共有文字列
    expect(t("A4")).toBe("宛名");
    expect(t("A9")).toBe("日付");
    expect(t("D33")).toBe("合計");
    expect(t("A37")).toBe("○○銀行 △△支店 普通 1234567");
    expect(t("Z99"), "無いセルは空にする").toBe("");
  });

  it("結合・列幅・罫線を持って帰っている（画面に出すのに要る）", async () => {
    const book = await T.open(bytes());
    const s = book.sheets[0];
    expect(s.merges.length, "結合が読めていない").toBeGreaterThanOrEqual(1);
    expect(s.merges[0]).toEqual({ r1: 0, c1: 0, r2: 0, c2: 5 });
    expect(s.cols.length, "列幅が読めていない").toBe(6);
    expect(Math.round(s.cols[0].width), "A列の幅が違う").toBe(11); // 10.5 → 端数はExcelが足す
    const bd = book.styles.border[book.styles.xf[+s.cells.A10.s].borderId];
    expect(bd, "罫線が読めていない").toBeTruthy();
    expect(bd.b, "明細の枠に下罫線が無い").toBe(true);
  });

  it("日付の飾りが付いているセルを見分ける", async () => {
    const book = await T.open(bytes());
    const s = book.sheets[0];
    expect(T.isDateStyle(book, s.cells.E3.s), "E3は日付の飾り").toBe(true);
    expect(T.isDateStyle(book, s.cells.A10.s), "A10は日付の飾りではない").toBe(false);
  });
});

describe("値を差し込む", () => {
  const EDITS = [
    { ref: "E3", kind: "date", value: "2026-08-09", text: "2026年8月9日" },
    { ref: "B4", kind: "text", value: "山田商事" },
    { ref: "A10", kind: "date", value: "2026-08-01", text: "8/1" },
    { ref: "C10", kind: "text", value: "ご飲食代" },
    { ref: "E10", kind: "number", value: 44000 },
    { ref: "E33", kind: "number", value: 132000 },
    { ref: "E34", kind: "number", value: 999 }, // ここは数式
  ];

  it("狙ったセルだけ変わり、他は元のまま", async () => {
    const book = await T.open(bytes());
    const out = T.fill(book, 0, EDITS);
    const back = await T.open(out.bytes);
    const s = back.sheets[0];
    expect(T.cellText(back, s, "B4")).toBe("山田商事");
    expect(T.cellText(back, s, "C10")).toBe("ご飲食代");
    // ★E10には表示形式が付いていない＝本物のExcelでも「44000」と出る（COMで確認）★
    expect(T.cellText(back, s, "E10")).toBe("44000");
    expect(T.cellText(back, s, "E33")).toBe("132,000");
    // 触っていない所
    expect(T.cellText(back, s, "A1")).toBe("御 請 求 書");
    expect(T.cellText(back, s, "A37")).toBe("○○銀行 △△支店 普通 1234567");
    expect(T.cellText(back, s, "D33")).toBe("合計");
  });

  it("★何も言われなければ、数式のセルには書かない（合計の式を壊さない）★", async () => {
    const book = await T.open(bytes());
    const out = T.fill(book, 0, EDITS);
    expect(out.skipped, "数式のセルを避けていない").toEqual(["E34"]);
    expect(out.overwritten, "頼んでいないのに式を消している").toEqual([]);
    const back = await T.open(out.bytes);
    expect(back.sheets[0].cells.E34.f, "数式そのものが消えている").toBe(true);
  });

  /* ★お店の紙は、明細の行そのものに式が書いてあることがある★
     司さんの実物は E11 が `=8500/1.1*4`（単価÷1.1×数量）。
     ここを触らないと ★明細が1つも入らない★。だから「お店が指したマス」は上書きする。
     ただし合計の式を指してしまうと壊れるので、★上書きした分は必ず返して知らせる★。 */
  it("★お店が指したマスなら、計算式でも上書きする（そして必ず知らせる）★", async () => {
    const book = await T.open(bytes());
    const before = book.sheets[0].cells.E34;
    expect(before.f, "見本のE34が数式でない＝この確認は無効").toBe(true);
    const out = T.fill(book, 0, [{ ref: "E34", kind: "number", value: 999, force: true }]);
    expect(out.overwritten, "上書きしたことを知らせていない").toEqual(["E34"]);
    expect(out.skipped).toEqual([]);
    const back = await T.open(out.bytes);
    expect(back.sheets[0].cells.E34.f, "式が残っている＝値が入っていない").toBe(false);
    expect(back.sheets[0].cells.E34.v).toBe("999");
  });

  it("★開いたとき計算し直す印を立てる（合計が古いまま出ない）★", async () => {
    const book = await T.open(bytes());
    const out = T.fill(book, 0, EDITS);
    const back = await T.open(out.bytes);
    expect(back.workbookXml, "計算し直す印が立っていない").toMatch(/fullCalcOnLoad="1"/);
    // 二重に付けない
    expect(
      (T._withFullCalc(T._withFullCalc(back.workbookXml)).match(/fullCalcOnLoad/g) || []).length
    ).toBe(1);
  });

  /* ★これが「そのExcelのまま」の中身★
     触っていない物は、圧縮されたバイト列のまま積み直す＝図形も罫線も列幅も変わりようがない。 */
  it("★触っていない部分は1バイトも変えない★", async () => {
    const src = bytes();
    const book = await T.open(src);
    const out = T.fill(book, 0, EDITS);
    const a = rawMap(src);
    const b = rawMap(out.bytes);
    expect(Object.keys(b).sort(), "中に入っている物の顔ぶれが変わった").toEqual(
      Object.keys(a).sort()
    );
    const changed = Object.keys(a).filter((k) => a[k] !== b[k]);
    expect(changed.sort(), "差し替えたはずのない物が変わった").toEqual([
      "xl/workbook.xml",
      "xl/worksheets/sheet1.xml",
    ]);
    // 変えていない物が0本なら、この確認は何も見ていない
    expect(Object.keys(a).length - changed.length, "比べた本数が少なすぎる").toBeGreaterThanOrEqual(
      10
    );
  });

  it("★原本のバイト列を書き換えていない★", async () => {
    const src = bytes();
    const before = Buffer.from(src).toString("base64");
    const book = await T.open(src);
    T.fill(book, 0, EDITS);
    expect(Buffer.from(src).toString("base64"), "原本を書き換えている").toBe(before);
  });

  it("日付は、飾りのあるセルには通し番号・無いセルには文字で入れる", async () => {
    const book = await T.open(bytes());
    const out = T.fill(book, 0, EDITS);
    const back = await T.open(out.bytes);
    const s = back.sheets[0];
    expect(s.cells.E3.v, "日付のセルに通し番号が入っていない").toBe("46243");
    // ★14番の書式は「その国の短い日付」。日本のExcelは 2026/8/9 と出す（実測）★
    expect(T.cellText(back, s, "E3")).toBe("2026/8/9");
    // 飾りの無いセルに通し番号を入れると「46235」と出てしまうので、文字で入れる
    expect(s.cells.A10.t, "飾りの無いセルに通し番号を入れている").toBe("inlineStr");
    expect(T.cellText(back, s, "A10")).toBe("8/1");
  });

  it("セルが無い所にも書ける（行ごと足して、番号の順に並べる）", async () => {
    const book = await T.open(bytes());
    const out = T.fill(book, 0, [
      { ref: "C60", kind: "text", value: "あと足し" },
      { ref: "A60", kind: "number", value: 5 },
    ]);
    const back = await T.open(out.bytes);
    expect(T.cellText(back, back.sheets[0], "C60")).toBe("あと足し");
    const xml = back.sheets[0].xml;
    const rows = [...xml.matchAll(/<row\b[^>]*?\br="(\d+)"/g)].map((m) => +m[1]);
    expect(rows, "行の並びが番号順でない").toEqual([...rows].sort((a, b) => a - b));
    const row60 = /<row\b[^>]*?\br="60"[^>]*>([\s\S]*?)<\/row>/.exec(xml)[1];
    const cols = [...row60.matchAll(/<c\b[^>]*?\br="([A-Z]+)\d+"/g)].map((m) => m[1]);
    expect(cols, "セルの並びが列の順でない").toEqual(["A", "C"]);
  });

  it('文字の中の < & " を、そのまま持たせない（ファイルが壊れる）', async () => {
    const book = await T.open(bytes());
    const out = T.fill(book, 0, [{ ref: "B4", kind: "text", value: '<&"株式会社' }]);
    const back = await T.open(out.bytes);
    expect(T.cellText(back, back.sheets[0], "B4")).toBe('<&"株式会社');
  });
});

describe("読めないファイルは、分かる言葉で断る", () => {
  it("Excelでない物", () => {
    expect(() => T._readZip(new Uint8Array([1, 2, 3, 4, 5]))).toThrow(/Excelのファイル/);
  });

  it("★断り文句に、機械の言葉を混ぜない★", () => {
    const msgs = [];
    try {
      T._readZip(new Uint8Array([1, 2, 3, 4, 5]));
    } catch (e) {
      msgs.push(e.message);
    }
    try {
      const b = bytes();
      b[b.length - 5] = 0; // 目録の場所を壊す
      T._readZip(b);
    } catch (e) {
      msgs.push(e.message);
    }
    expect(msgs.length, "★壊れた物を2つとも受け付けてしまった＝この確認は何も見ていない★").toBe(2);
    expectNoneOf(msgs, (m) => /EOCD|ZIP|undefined|null|Cannot|TypeError/.test(m), "断り文句", {
      min: 2,
    });
  });
});

/* ★本物のExcelが出す文字と、1マスずつ突き合わせる★
   ------------------------------------------------------------------------------
   司さんの実物（飲み屋(ZEROact.xlsx）を読ませたら、画面が別物になった（2026-08-09）:
     ・「請求書セイキュウショ」… ★ふりがな(rPh)を本文に混ぜていた★
     ・「30,909.09」          … ★表示形式(#,##0_)を当てていなかった★
     ・空の明細に「0」が並ぶ  … ★ゼロを表示しない設定を見ていなかった★
     ・日付が「2026-08-01」   … ★yyyy/m/d を当てていなかった★
   実物はrepoに入れられない（会社の住所・口座・判子が入っている）ので、
   ★同じ罠を持つ見本を本物のExcelで作り直し★、その表示を excel-truth.json に記録した。
   ★実物では 50/50 マス一致まで確認済み★ */
describe("本物のExcelと、1マスずつ突き合わせる", () => {
  const TRUTH = JSON.parse(
    fs.readFileSync(path.join(ROOT, "tests/e2e/fixtures/excel-truth.json"), "utf8")
  );
  const openFix = (name) =>
    T.open(new Uint8Array(fs.readFileSync(path.join(ROOT, "tests/e2e/fixtures/" + name))));

  it("★記録そのものが空でない（空なら、この確認は何も見ていない）★", () => {
    expect(Object.keys(TRUTH).sort()).toEqual(["tpl-invoice.xlsx", "tpl-real-like.xlsx"]);
    Object.keys(TRUTH).forEach((n) => {
      expect(Object.keys(TRUTH[n].cells).length, n + " の記録が空").toBeGreaterThanOrEqual(15);
    });
  });

  for (const name of ["tpl-invoice.xlsx", "tpl-real-like.xlsx"]) {
    it(name + "：出す文字が、本物のExcelと同じ", async () => {
      const book = await openFix(name);
      const s = book.sheets[0];
      const truth = TRUTH[name].cells;
      const ng = [];
      Object.keys(truth).forEach((ref) => {
        const got = T.cellText(book, s, ref);
        if (got.trim() !== String(truth[ref]).trim())
          ng.push(ref + ": Excel=[" + truth[ref] + "] こちら=[" + got + "]");
      });
      expect(ng, ng.join(" / ")).toEqual([]);
    });
  }

  it("★ふりがなを本文に混ぜない（請求書セイキュウショ にしない）★", async () => {
    const bytes2 = new Uint8Array(
      fs.readFileSync(path.join(ROOT, "tests/e2e/fixtures/tpl-real-like.xlsx"))
    );
    const ss = await T._textOf(T._readZip(bytes2), "xl/sharedStrings.xml");
    expect(
      (ss.match(/<rPh\b/g) || []).length,
      "★見本にふりがなが入っていない＝この確認は何も見ていない★"
    ).toBeGreaterThanOrEqual(3);
    /* ★「読みが混ざっているか」は、読みの字面で探しても分からない★
       読みが本文の一部と同じことがある（エスプリ／エアコン）。実際に誤検知した。
       そこで ★「中の <t> を全部つないだ物（＝混ざった姿）」と突き合わせる★。
       ふりがなを落としていれば、必ず違う物になる。 */
    const sis = [...ss.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((m) => m[1]);
    const naive = sis.map((x) =>
      [...x.matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((y) => y[1]).join("")
    );
    const withRuby = sis.map((x, i) => (/<rPh\b/.test(x) ? i : -1)).filter((i) => i >= 0);
    expect(
      withRuby.length,
      "★見本にふりがな付きの文字が無い＝この確認は何も見ていない★"
    ).toBeGreaterThanOrEqual(3);
    const book = await T.open(bytes2);
    expectNoneOf(withRuby, (i) => book.shared[i] === naive[i], "ふりがなが混ざったままの文字", {
      min: 3,
    });
    expect(T.cellText(book, book.sheets[0], "A1")).toBe("請求書");
  });

  it("★ゼロを表示しない設定を守る（空の明細に 0 を並べない）★", async () => {
    const book = await openFix("tpl-real-like.xlsx");
    const s = book.sheets[0];
    expect(s.showZeros, "★見本が「ゼロを表示しない」になっていない＝この確認は無効★").toBe(false);
    /* ★見本に「値が0のマス」が本当にあること★
       これが無いと、ただの空のマスを見て「0を出していない」と言っているだけになる
       （2026-08-09、実際にそうなっていた。壊しても赤にならず気づいた）。
       本物のExcelで .Value2=0 かつ .Text="" を確かめて excel-truth.json に記録してある。 */
    const zeros = TRUTH["tpl-real-like.xlsx"].zeroCells || [];
    expect(
      zeros.length,
      "★見本に 値が0のマス が無い＝この確認は何も見ていない★"
    ).toBeGreaterThanOrEqual(3);
    zeros.forEach((z) => {
      expect(s.cells[z.ref], z.ref + " のマスが無い").toBeTruthy();
      expect(s.cells[z.ref].v, z.ref + " の値が0でない").toBe("0");
      expect(T.cellText(book, s, z.ref), z.ref + " に 0 を出している").toBe(z.text);
    });
  });

  it("★テーマ色の塗り・行そのものの書式を読む（縞が消えない）★", async () => {
    const book = await openFix("tpl-real-like.xlsx");
    const s = book.sheets[0];
    expect(book.theme.length, "テーマの色表が読めていない").toBeGreaterThanOrEqual(10);
    const filled = book.styles.fill.filter((x) => x);
    expect(
      filled.length,
      "★塗りが1つも読めていない（テーマ色を解けていない）★"
    ).toBeGreaterThanOrEqual(1);
    expect(filled[0]).toMatch(/^#[0-9a-f]{6}$/i);
    expect(Object.keys(s.rowStyle).length, "行そのものの書式が読めていない").toBeGreaterThanOrEqual(
      1
    );
  });

  it("★貼ってある絵（判子）を、大きさごと読む★", async () => {
    const book = await openFix("tpl-real-like.xlsx");
    const im = (book.sheets[0].images || [])[0];
    expect(im, "★絵が1枚も読めていない★").toBeTruthy();
    expect(im.src.slice(0, 15)).toBe("data:image/png;");
    const want = TRUTH["tpl-real-like.xlsx"].shape;
    expect(
      Math.abs(Math.round(im.w) - want.w),
      "絵の幅 Excel=" + want.w + " こちら=" + Math.round(im.w)
    ).toBeLessThanOrEqual(2);
    expect(
      Math.abs(Math.round(im.h) - want.h),
      "絵の高さ Excel=" + want.h + " こちら=" + Math.round(im.h)
    ).toBeLessThanOrEqual(2);
  });

  /* ★Excelは同じ形の式を「親1つ＋子（親を指すだけ）」で持つ★
       親  <c r="F12"><f t="shared" ref="F12:F26" si="0">E12*0.1</f><v>0</v></c>
       子  <c r="F13"><f t="shared" si="0"/><v>0</v></c>
     ★親を消すと子が迷子になり、Excelが「壊れています」と言って開けない★
     （2026-08-09、司さんの紙で実際に開けなくなった）。
     だから親を消す前に、子へ式を書き下ろす。★書き下ろす式がズレたら、静かに金額が狂う★ */
  it("★共有の式の親を消すとき、子に正しい式を書き下ろす★", async () => {
    const bytes2 = new Uint8Array(
      fs.readFileSync(path.join(ROOT, "tests/e2e/fixtures/tpl-real-like.xlsx"))
    );
    const raw = await T._textOf(T._readZip(bytes2), "xl/worksheets/sheet1.xml");
    expect(
      (raw.match(/t="shared"[^>]*ref=/g) || []).length,
      "★見本に共有の式が無い＝この確認は何も見ていない★"
    ).toBeGreaterThanOrEqual(1);
    expect((raw.match(/<f t="shared" si="\d+"\s*\/>/g) || []).length).toBeGreaterThanOrEqual(5);

    const book = await T.open(bytes2);
    const master = "F12"; // 親（=E12*0.1）
    expect(book.sheets[0].cells[master].f, "見本のF12が式でない").toBe(true);
    const out = T.fill(book, 0, [{ ref: master, kind: "number", value: 4000, force: true }]);
    expect(out.overwritten).toEqual([master]);

    const back = await T.open(out.bytes);
    const xml2 = back.sheets[0].xml;
    expect((xml2.match(/t="shared"/g) || []).length, "★共有の式が残っている＝子が迷子のまま★").toBe(
      0
    );
    const fOf = (ref) => {
      const c = new RegExp('<c\\b[^>]*?\\br="' + ref + '"[^>]*?>([\\s\\S]*?)<\\/c>').exec(xml2);
      return c ? (/<f[^>]*>([^<]*)<\/f>/.exec(c[1]) || [])[1] : null;
    };
    expect(fOf("F13"), "F13の式がズレている").toBe("E13*0.1");
    expect(fOf("F14"), "F14の式がズレている").toBe("E14*0.1");
    expect(fOf("F26"), "F26の式がズレている").toBe("E26*0.1");
    expect(fOf(master), "親のマスに式が残っている").toBe(undefined);

    /* ★式を消したら「計算の順番表」も外す★（残すとExcelが開けない） */
    const names = T._readZip(out.bytes).entries.map((e) => e.name);
    expect(names, "calcChain を外していない").not.toContain("xl/calcChain.xml");
    expect(back.contentTypes, "目録から calcChain を消していない").not.toMatch(/calcChain/);
    expect(back.workbookRels, "繋ぎから calcChain を消していない").not.toMatch(/calcChain/);
  });

  it("★式の番地のずらし方（$ が付いた所は動かさない）★", () => {
    expect(T._shiftFormula("E12*0.1", 2, 0)).toBe("E14*0.1");
    expect(T._shiftFormula("SUM(E11:E26)", 1, 0)).toBe("SUM(E12:E27)");
    expect(T._shiftFormula("$E$12*A1", 3, 1)).toBe("$E$12*B4");
    expect(T._shiftFormula("$E12+E$12", 1, 1)).toBe("$E13+F$12");
    expect(T._shiftFormula("A1", -5, 0), "紙の外へ出たら #REF!").toBe("#REF!");
  });

  /* ★列幅の換算がズレると、判子や合計欄が横へ寄る（実物で59pxズレた）★ */
  it("★列の幅の換算が、本物のExcelと合っている★", async () => {
    const book = await openFix("tpl-real-like.xlsx");
    const s = book.sheets[0];
    const mdw = 8; // 游ゴシック11の1文字ぶん（実測）
    const px = (w) => Math.trunc(((256 * w + Math.trunc(128 / mdw)) / 256) * mdw);
    const wide = new Array(9).fill(0);
    s.cols.forEach((cc) => {
      for (let j = cc.min; j <= Math.min(cc.max, 9); j++) if (cc.width) wide[j - 1] = cc.width;
    });
    const want = TRUTH["tpl-real-like.xlsx"].colPx;
    const ng = [];
    "ABCDEFGHI".split("").forEach((L, i) => {
      const got = px(wide[i]);
      if (Math.abs(got - want[L]) > 1)
        ng.push(L + "列: Excel=" + want[L] + "px こちら=" + got + "px");
    });
    expect(ng, ng.join(" / ")).toEqual([]);
  });
});

describe("番地", () => {
  it("A1 と 行・列 を行き来できる", () => {
    expect(T.parseRef("A1")).toEqual({ col: 0, row: 0 });
    expect(T.parseRef("B7")).toEqual({ col: 1, row: 6 });
    expect(T.parseRef("AA10")).toEqual({ col: 26, row: 9 });
    expect(T.refOf(0, 0)).toBe("A1");
    expect(T.refOf(26, 9)).toBe("AA10");
    expect(T.parseRef("あ1"), "おかしい番地は null").toBe(null);
    expect(T.parseRef("A0"), "0行目は無い").toBe(null);
  });

  /* ★端は本物のExcelで測った（2026-08-09・yyyy-mm-dd で表示させて読んだ）★
       1→1900-01-01 ／ 2→1900-01-02 ／ 59→1900-02-28 ／
       60→1900-02-29（★実在しない日。Excelが1900年をうるう年だと思い込んでいる★）／
       61→1900-03-01 ／ 46235→2026-08-01 ／ 46243→2026-08-09
     ここを勘で書くと「自分の勘違いごと固定する」ので、実測値をそのまま置く。 */
  const MEASURED = [
    [1, "1900-01-01"],
    [2, "1900-01-02"],
    [59, "1900-02-28"],
    [60, "1900-02-29"],
    [61, "1900-03-01"],
    [62, "1900-03-02"],
    [46235, "2026-08-01"],
    [46243, "2026-08-09"],
  ];

  it("★Excelの通し番号 → 日付（端まで実測どおり）★", async () => {
    await covering("実測した通し番号", MEASURED.length, async (c) => {
      MEASURED.forEach(([n, ymd]) => {
        expect(T.fromSerial(n), "通し番号 " + n).toBe(ymd);
        c.seen(String(n));
      });
    });
    expect(T.fromSerial(0), "0 より前は日付でない").toBe("");
  });

  it("★日付 → 通し番号 も、同じ端で合う（1900-02-29 だけは戻せない）★", () => {
    const X = require("../nomiya-xlsx.js");
    MEASURED.forEach(([n, ymd]) => {
      if (n === 60) return; // 実在しない日なので入り口が無い
      expect(X.serial(ymd), "日付 " + ymd).toBe(n);
    });
    expect(X.serial("1899-12-31"), "Excelに無い日は null").toBe(null);
  });
});
