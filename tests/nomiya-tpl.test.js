import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expectNoneOf, covering } from "./lib/check-kit.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const T = createRequire(import.meta.url)(path.join(ROOT, "nomiya-tpl.js"));

/* ★自社テンプレの「置き方」を決める計算★
 * ここが狂うと ★画面では見えているのに紙に出ない★ という一番困る形になる。
 * だから「紙の外に出さない」を1つずつ確かめる。
 */
describe("自社テンプレ：項目の置き方", () => {
  it("置ける項目がそろっている（請求書の部品と同じ名前）", async () => {
    await covering("置ける項目", 11, async (c) => {
      [
        "meta",
        "to",
        "lead",
        "grand",
        "cap",
        "table",
        "sum",
        "bank",
        "thanks",
        "issuer",
        "logoTop",
      ].forEach((k) => {
        const f = T.FIELDS.find((x) => x.key === k);
        expect(f, k + " が置ける項目に無い").toBeTruthy();
        expect(f.label, k + " に日本語の名前が無い").toBeTruthy();
        c.seen(f.label);
      });
    });
  });

  it("★はじめて使うとき、全部が紙の中に収まっている★", () => {
    const d = T.defaults();
    const out = Object.keys(d).filter(
      (k) => d[k].x < 0 || d[k].y < 0 || d[k].x + d[k].w > 100 || d[k].y > 100
    );
    expect(out, "既定の置き場所が紙からはみ出している: " + out.join(" ")).toEqual([]);
  });

  it("★はじめて使うとき、項目が重なっていない（上から順に並ぶ）★", () => {
    const d = T.defaults();
    const ys = T.FIELDS.map((f) => d[f.key].y);
    expect(new Set(ys).size, "同じ高さに置かれた項目がある").toBeGreaterThan(6);
  });

  it("★右へはみ出したら、紙の中へ戻す★", () => {
    const p = T.fixOne({ x: 90, y: 10, w: 40 }, { x: 0, y: 0, w: 30 });
    expect(p.x + p.w, "はみ出したまま").toBeLessThanOrEqual(100);
    expect(p.w, "幅を勝手に縮めている").toBe(40);
    expect(p.x).toBe(60);
  });

  it("★0より小さい・100より大きいは、必ず戻す★", () => {
    expect(T.fixOne({ x: -50, y: -10, w: 30 }, {}).x).toBe(0);
    expect(T.fixOne({ x: -50, y: -10, w: 30 }, {}).y).toBe(0);
    expect(T.fixOne({ x: 10, y: 500, w: 30 }, {}).y).toBe(100);
    expect(T.fixOne({ x: 10, y: 10, w: 999 }, {}).w).toBe(100);
    expect(T.fixOne({ x: 10, y: 10, w: 0 }, {}).w, "細すぎて掴めない幅").toBe(5);
  });

  it("数字でない物が入っていたら、既定に戻す（壊れた設定で紙を壊さない）", () => {
    const p = T.fixOne({ x: "あ", y: null, w: undefined }, { x: 7, y: 8, w: 9 });
    expect([p.x, p.y, p.w]).toEqual([7, 8, 9]);
  });

  it("保存が空でも、まっさらな置き方になる", () => {
    expect(Object.keys(T.normalize(null)).length).toBe(T.FIELDS.length);
    expect(Object.keys(T.normalize(undefined)).length).toBe(T.FIELDS.length);
  });

  it("★あとから項目が増えても、前の設定は消えない★", () => {
    const saved = { to: { x: 1, y: 2, w: 20, show: true } };
    const n = T.normalize(saved);
    expect([n.to.x, n.to.y, n.to.w], "前に置いた場所が消えた").toEqual([1, 2, 20]);
    expect(n.grand, "増えた項目に既定の場所が入らない").toBeTruthy();
    expect(Object.keys(n).length, "項目の数が合わない").toBe(T.FIELDS.length);
  });

  it("「出さない」は覚える（テンプレに印刷済みの項目を消せる）", () => {
    const n = T.normalize({ bank: { x: 5, y: 5, w: 20, show: false } });
    expect(n.bank.show).toBe(false);
    expect(n.to.show, "触っていない項目まで消えている").toBe(true);
  });

  it("出す項目だけを、上から順に返す", () => {
    // normalize は「置ける項目ぜんぶ」を埋めるので、
    // ここでは他を「出さない」にしてから、3つの並びだけを見る
    const saved = {};
    T.FIELDS.forEach((f) => (saved[f.key] = { x: 0, y: 5, w: 20, show: false }));
    saved.to = { x: 0, y: 50, w: 20 };
    saved.grand = { x: 0, y: 10, w: 20 };
    saved.bank = { x: 0, y: 30, w: 20, show: false };
    const v = T.visible(T.normalize(saved)).map((f) => f.key);
    expect(v, "出す物が2つになっていない").toEqual(["grand", "to"]);
    expect(v, "出さない項目が混ざっている").not.toContain("bank");
  });

  it("指で動かした px を ％ に直せる（紙の実寸で割る）", () => {
    expect(T.fromPx(397, 561.5, 794, 1123)).toEqual({ x: 50, y: 50 });
    expect(T.fromPx(0, 0, 794, 1123)).toEqual({ x: 0, y: 0 });
    expect(T.fromPx(10, 10, 0, 0), "紙の大きさが取れないのに答えを返している").toBe(null);
  });

  it("style は ％ で書く（px で書くと端末でズレる）", () => {
    const s = T.styleOf({ x: 12.5, y: 30, w: 40 });
    expect(s).toContain("left:12.5%");
    expect(s).toContain("top:30%");
    expect(s).toContain("width:40%");
    expect(s, "★px が混ざっている（端末でズレる）★").not.toMatch(/\d(px)/);
  });

  it("★どの項目も、置き方に穴が無い（元が空なら赤）★", () => {
    const d = T.defaults();
    expectNoneOf(
      Object.keys(d),
      (k) => typeof d[k].x !== "number" || typeof d[k].y !== "number" || typeof d[k].w !== "number",
      "置き方が数字になっていない項目がある",
      { min: 11 }
    );
  });
});

/* ★自社テンプレが「Excel」のとき★
 * お店のExcelは、位置(％)ではなく ★どのマスに入れるか★ で決める。
 * ここが狂うと、日付と金額が別の行に出る／明細がテンプレの枠からあふれる。
 */
describe("自社テンプレ：Excelのどのマスに入れるか", () => {
  const D = {
    date: "2026-08-09",
    dateText: "2026年8月9日",
    no: "2026-08-01",
    to: "山田商事　御中",
    grand: 132000,
    net: 120000,
    tax: 12000,
    total: 132000,
    store: "Lounge Castally",
    bank: "○○銀行 △△支店 普通 1234567",
    rows: [
      { date: "2026-08-01", dateText: "8/1", name: "ご飲食代", people: 3, amount: 44000, memo: "" },
      {
        date: "2026-08-05",
        dateText: "8/5",
        name: "ご飲食代",
        people: 2,
        amount: 44000,
        memo: "ボトル",
      },
      { date: "2026-08-09", dateText: "8/9", name: "ご飲食代", people: 4, amount: 44000, memo: "" },
    ],
  };
  const CELLS = {
    date: "E3",
    no: "E4",
    to: "B4",
    grand: "B7",
    net: "E31",
    tax: "E32",
    total: "E33",
    store: "D36",
    bank: "A37",
    cDate: "A10",
    cName: "C10",
    cPeople: "D10",
    cAmount: "E10",
    cMemo: "F10",
    lastRow: "A29",
  };

  it("入れられる項目がそろっている", async () => {
    await covering("Excelに入れる項目", 18, async (c) => {
      T.CELL_FIELDS.forEach((f) => c.seen(f.key));
    });
  });

  it("おかしい番地は覚えない（打ち間違い・古い設定）", () => {
    const n = T.normalizeCells({ to: "b4", grand: "あ1", tax: "", cDate: "A10", ゴミ: "A1" });
    expect(n, "小文字は直す／おかしい物は捨てる").toEqual({ to: "B4", cDate: "A10" });
  });

  it("★明細の列が別々の行を指していたら、明細を書かない★", () => {
    const bad = { cDate: "A10", cAmount: "E12" }; // 10行目と12行目
    expect(T.detailStart(bad), "バラバラなのに始まりを決めている").toBe(0);
    const p = T.planEdits(bad, D);
    expect(p.edits.length, "バラバラのまま並べている").toBe(0);
    expect(p.warn.join(""), "理由を出していない").toContain("別々の行");
  });

  it("明細は、選んだ行から下へ並ぶ", () => {
    const p = T.planEdits(CELLS, D);
    const refs = p.edits.map((e) => e.ref);
    expect(refs).toContain("A10");
    expect(refs).toContain("A11");
    expect(refs).toContain("A12");
    expect(refs, "4件目は無いのに書いている").not.toContain("A13");
    const amt = p.edits.filter((e) => /^E1[012]$/.test(e.ref));
    expect(amt.length, "金額が3行ぶん入っていない").toBe(3);
    expect(
      amt.every((e) => e.kind === "number"),
      "金額が数字で入っていない"
    ).toBe(true);
  });

  it("★テンプレの枠に入りきらない分は、書かずに知らせる★", () => {
    const many = { ...D, rows: [] };
    for (let i = 0; i < 30; i++)
      many.rows.push({ date: "2026-08-01", dateText: "8/1", name: "x", people: 1, amount: 1000 });
    const cells = { ...CELLS, lastRow: "A14" }; // 10〜14行＝5行しか無い
    expect(T.detailCapacity(cells), "入る行数を数え違えている").toBe(5);
    const p = T.planEdits(cells, many);
    expect(p.over, "あふれた件数が合わない").toBe(25);
    expect(p.warn.join(""), "あふれたことを知らせていない").toContain("25 件");
    // 明細の日付の列だけを数える（A37=振込先は明細ではないので混ぜない）
    const detailDates = p.edits.filter((e) => e.kind === "date" && /^A\d+$/.test(e.ref));
    expect(detailDates.length, "枠を越えて書いている").toBe(5);
    expect(
      detailDates.map((e) => e.ref),
      "並べる行が違う"
    ).toEqual(["A10", "A11", "A12", "A13", "A14"]);
    expect(
      p.edits.some((e) => e.ref === "A15"),
      "★最終行の下まで書いている★"
    ).toBe(false);
  });

  it("最終行を決めていなければ、件数ぶんそのまま並べる", () => {
    const cells = { ...CELLS };
    delete cells.lastRow;
    expect(T.detailCapacity(cells)).toBe(0);
    const p = T.planEdits(cells, D);
    expect(p.over).toBe(0);
    expect(p.warn).toEqual([]);
  });

  it("金額は数字・日付は日付・宛名は文字で入れる（型を取り違えない）", () => {
    const p = T.planEdits(CELLS, D);
    const by = {};
    p.edits.forEach((e) => (by[e.ref] = e));
    expect(by.E33.kind, "合計が数字でない").toBe("number");
    expect(by.E33.value).toBe(132000);
    expect(by.E3.kind, "請求日が日付でない").toBe("date");
    expect(by.E3.text, "日付の見え方を持たせていない").toBe("2026年8月9日");
    expect(by.B4.kind, "宛名が文字でない").toBe("text");
    expect(by.A10.kind, "明細の日付が日付でない").toBe("date");
    expect(by.A10.text).toBe("8/1");
  });

  it("★割り当てたマスは「上書きしてよい」印を付ける（式でも入る）★", () => {
    const p = T.planEdits(CELLS, D);
    expect(p.edits.length).toBeGreaterThan(5);
    expect(
      p.edits.filter((e) => e.force !== true).map((e) => e.ref),
      "★印の付いていない物がある＝そのマスが式だと入らない★"
    ).toEqual([]);
  });

  it("割り当てていない項目には、何も書かない", () => {
    const p = T.planEdits({ to: "B4" }, D);
    expect(p.edits.length, "決めていないマスにも書いている").toBe(1);
    expect(p.edits[0].ref).toBe("B4");
  });

  it("★中身が空の項目は、マスを空けたまま触らない★", () => {
    const p = T.planEdits(CELLS, { ...D, bank: "", store: null, rows: [] });
    expectNoneOf(p.edits, (e) => e.ref === "A37" || e.ref === "D36", "空の項目", { min: 3 });
  });
});
