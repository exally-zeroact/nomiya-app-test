/* 「どのマスに入れるか」を、こちらで当てる所を測る。
 * ==============================================================================
 * ★なぜ要るか（司さんの声 2026-08-10）★
 *   「どのマスに入れるかとか意味が分かりにくい」
 *   「入ってからこんだけ項目あるけどなんなん」
 *   ＝ 18個の空欄を人に埋めさせているのが間違い。紙に刷ってある言葉から機械で当てる。
 *
 * ★作り物のXMLでは測らない★
 *   使う見本は ★本物のExcelで作った★ 2つ。
 *     tpl-real-like.xlsx … 司さんの実物と同じ形（金額=税抜／消費税が別の列／御中つき／
 *                          日付のラベルが無い／小計・合計は下・共有の式）
 *     tpl-invoice.xlsx  … 素直な形（請求日/請求番号のラベルあり／金額（税込）1本／御中が別のマス）
 *   ★この2つは作りが正反対★なので、どちらか片方に合わせただけの当て方は必ず落ちる。
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { covering } from "./lib/check-kit.mjs";
import { ROOT } from "./app-source.mjs";

const require = createRequire(import.meta.url);
const XL = require("../nomiya-xlsx-tpl.js");
const TL = require("../nomiya-tpl.js");

const fix = (n) => path.join(ROOT, "tests/e2e/fixtures/" + n);
const guessOf = async (name) => {
  const book = await XL.open(new Uint8Array(fs.readFileSync(fix(name))));
  return { book, g: TL.guessCells(XL.sheetView(book, 0)) };
};

describe("紙に刷ってある言葉から、入れ場所を当てる", () => {
  it("★司さんの実物と同じ形（tpl-real-like）を当てる★", async () => {
    const { g } = await guessOf("tpl-real-like.xlsx");
    /* 実物の作り（見本を作った台本 tests/fixtures-src/make-tpl-real-like.ps1 が正）
         I2  日付（ラベル無し・日付の書式だけ）
         A3  「エスプリ アマン 御中」＝間は全角の空き（A3:D4 の結合）
         A8  「ご請求金額(税込)」→ C8 に ¥34,000（C8:E8 の結合）
         10行目 見出し  A項目 C数量 D単位 E金額 F消費税 G備考
         11〜26行 明細（1行おきに色・行の高さあり）
         A27 お振込先 ／ H27小計 H28消費税 H29合計 → I27 I28 I29 */
    expect(g.cells).toEqual({
      date: "I2",
      to: "A3",
      grand: "C8",
      cName: "A11",
      cPeople: "C11",
      // ★「金額」は税抜★（同じ行に「消費税」の列があるから）
      cNet: "E11",
      cTax: "F11",
      cMemo: "G11",
      lastRow: "A26",
      net: "I27",
      tax: "I28",
      total: "I29",
    });
    expect(g.headRow, "見出しの行").toBe(10);
    expect(g.start, "明細の1行目").toBe(11);
  });

  it("★「金額」を税込と取り違えない（消費税ぶん多い請求書になる）★", async () => {
    const { g } = await guessOf("tpl-real-like.xlsx");
    expect(g.cells.cAmount, "★税込に入れてはいけない★").toBeUndefined();
    expect(g.cells.cNet).toBe("E11");
  });

  it("★素直な形（tpl-invoice）も当てる★", async () => {
    const { g } = await guessOf("tpl-invoice.xlsx");
    /* D3請求日→E3 ／ D4請求番号→E4 ／ B5「御中」だけ→左のA5が名前 ／
       A7ご請求金額（税込）→B7 ／ 9行目見出し 日付・曜・内容・人数・金額（税込）・備考 ／
       D31小計（税抜） D32消費税 D33合計 → E31 E32 E33 */
    expect(g.cells).toEqual({
      date: "E3",
      no: "E4",
      toName: "A5",
      grand: "B7",
      cDate: "A10",
      cName: "C10",
      cPeople: "D10",
      // ★こちらは「消費税」の列が無い＝金額は税込★
      cAmount: "E10",
      cMemo: "F10",
      lastRow: "A29",
      net: "E31",
      tax: "E32",
      total: "E33",
    });
    expect(g.cells.cNet, "税抜の列は無い紙").toBeUndefined();
  });

  it("★明細の枠からはみ出さない（罫線のある所までを最後の行にする）★", async () => {
    const { g } = await guessOf("tpl-invoice.xlsx");
    /* 罫線は A9:F29。小計は31行目にあるので、素朴に「小計の1つ上」にすると
       ★30行目＝枠の外に1行書く★ ことになる。29で止まっていることを見る。 */
    expect(g.last).toBe(29);
  });

  it("★見出しの『消費税』を、下の合計欄の『消費税』と取り違えない★", async () => {
    const { g } = await guessOf("tpl-real-like.xlsx");
    expect(g.cells.cTax, "見出しの列は明細の1行目を指す").toBe("F11");
    expect(g.cells.tax, "合計欄は下のマスを指す").toBe("I28");
  });

  it("★当てた物は、そのまま『入れる計画』として通る（列がバラバラでない）★", async () => {
    const { g } = await guessOf("tpl-real-like.xlsx");
    expect(TL.detailStart(g.cells), "明細の列が別々の行を指している").toBe(11);
    expect(TL.detailCapacity(g.cells), "明細に使える行数").toBe(16);
    const plan = TL.planEdits(g.cells, {
      date: new Date(2026, 7, 1),
      dateText: "2026年8月1日",
      to: "山田商事　御中",
      grand: 44000,
      net: 40000,
      tax: 4000,
      total: 44000,
      rows: [
        {
          date: new Date(2026, 7, 2),
          dateText: "8/2",
          name: "ご飲食代",
          people: 3,
          net: 20000,
          tax: 2000,
          amount: 22000,
          memo: "",
        },
      ],
    });
    expect(plan.warn, "当てた結果に文句が出てはいけない").toEqual([]);
    const refs = plan.edits.map((e) => e.ref);
    expect(refs).toContain("C8"); // ご請求金額
    expect(refs).toContain("E11"); // 明細1行目の税抜
    expect(refs).toContain("F11"); // 明細1行目の消費税
    expect(refs, "★税込を税抜の列に入れていないか★").not.toContain("D11");
  });

  it("★店名と振込先は当てない（紙にもう刷ってある物を消さない）★", async () => {
    await covering("当ててはいけない物", 4, async (c) => {
      for (const name of ["tpl-real-like.xlsx", "tpl-invoice.xlsx"]) {
        const { g } = await guessOf(name);
        c.seen(name + ":店名");
        expect(g.cells.store, name + " の店名を勝手に上書きしている").toBeUndefined();
        c.seen(name + ":振込先");
        expect(g.cells.bank, name + " の振込先を勝手に上書きしている").toBeUndefined();
      }
    });
  });

  it("★空の紙では、何も当てずに黙って返す（作り話をしない）★", () => {
    const g = TL.guessCells({ maxRow: 0, maxCol: 0, cells: {}, merges: [], ruled: [] });
    expect(g.cells).toEqual({});
    expect(g.start).toBe(0);
    expect(TL.guessCells(null).cells).toEqual({});
  });

  /* ★司さんの実物で出た罠（2026-08-10 実測）★
     G2・H2 は「日付の書式だけ付いた空のマス」で、実際に日付が入っているのは I2。
     素朴に「上のほうで いちばん左の日付マス」を選ぶと G2 になり、
     ★紙に日付が2つ（G2に今日・I2に元の日付）出る★。 */
  it("★空の日付マスより、すでに日付が入っているマスを選ぶ★", () => {
    const g = TL.guessCells({
      maxRow: 12,
      maxCol: 9,
      merges: [],
      ruled: [],
      cells: {
        G2: { text: "", date: true },
        H2: { text: "", date: true },
        I2: { text: "2026/8/1", date: true },
        A10: { text: "項目" },
        C10: { text: "数量" },
        E10: { text: "金額" },
      },
    });
    expect(g.cells.date, "空の日付マスを選んでいる＝紙に日付が2つ出る").toBe("I2");
  });

  it("★見出しが1語しかない紙を、明細と決めつけない★", () => {
    const g = TL.guessCells({
      maxRow: 5,
      maxCol: 3,
      cells: { A1: { text: "金額" }, A2: { text: "1,000" } },
      merges: [],
      ruled: [],
    });
    expect(g.start, "1語だけで明細の場所を決めてはいけない").toBe(0);
  });

  it("★束(group)は全部の項目に付いている（画面の並びが穴あきにならない）★", () => {
    const gs = TL.CELL_GROUPS.map((g) => g.key);
    expect(TL.CELL_FIELDS.length).toBe(18);
    TL.CELL_FIELDS.forEach((f) => {
      expect(gs, f.key + " の束が無い").toContain(f.group);
      expect(typeof f.short, f.key + " の短い名前が無い").toBe("string");
      expect(f.short.length, f.key + " の短い名前が空").toBeGreaterThan(0);
    });
  });
});
