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

  /* ★枠に入りきらない分は「ほか ◯件」の1行にまとめる★（指示役の裁定(c)・2026-08-16）
     前は「書かずに知らせる」だった。それだと ★紙の明細を足しても請求額にならない紙★ が
     客先へ出る（客が明細を足して合わないと言ってくる＝一番 高くつく型）。
     ここで縛るのは ★紙に出た金額を1行ずつ足したら 請求額と1円もずれない★ こと。 */
  describe("★あふれた明細は「ほか ◯件」にまとめる（紙の合計が必ず合う）★", () => {
    /** 実物と同じ形：明細16行・税抜と消費税の列がある */
    const CELLS16 = {
      ...CELLS,
      cAmount: null,
      cNet: "E10",
      cTax: "F10",
      lastRow: "A25", // 10〜25行＝16行
    };
    delete CELLS16.cAmount;

    /** n件の売上（1件 11,000円＝税抜10,000／消費税1,000） */
    function makeRows(n) {
      const rows = [];
      for (let i = 0; i < n; i++)
        rows.push({
          date: "2026-08-01",
          dateText: "8/1",
          name: "ご飲食代",
          people: 2,
          amount: 11000,
          net: 10000,
          tax: 1000,
          memo: "",
        });
      return rows;
    }
    const data = (n) => {
      const rows = makeRows(n);
      return {
        ...D,
        rows,
        net: 10000 * n,
        tax: 1000 * n,
        total: 11000 * n,
        grand: 11000 * n,
      };
    };
    /** 紙に出た ★明細の行だけ★ を1行ずつ足す（★中の値ではなく、書いた物を足す★）
        10〜25行が明細。E31/E32/E33 は請求の合計欄なので混ぜない（混ぜると 40,000 ずれる） */
    const rowNo = (ref) => +ref.replace(/\D/g, "");
    const sumCol = (p, col) =>
      p.edits
        .filter(
          (e) =>
            e.ref.startsWith(col) &&
            e.kind === "number" &&
            rowNo(e.ref) >= 10 &&
            rowNo(e.ref) <= 25
        )
        .reduce((a, e) => a + e.value, 0);

    it("入る行数を数え違えていない（16行）", () => {
      expect(T.detailCapacity(CELLS16)).toBe(16);
    });

    for (const n of [16, 17, 30]) {
      it(`★${n}件：紙の明細を足した額 ＝ 請求額／16行を1行も超えない★`, () => {
        const d = data(n);
        const p = T.planEdits(CELLS16, d);
        // 明細として使った行は 10〜25 の中だけ（31〜33は請求の合計欄・36〜37は店と振込先）
        const usedRows = p.edits
          .map((e) => rowNo(e.ref))
          .filter((r) => r >= 10 && r <= 30);
        expect(Math.max(...usedRows), "★16行の枠を越えて書いている★").toBeLessThanOrEqual(25);
        // ★恒等式★
        expect(sumCol(p, "E"), "★紙の税抜を足すと 請求の税抜に合わない★").toBe(d.net);
        expect(sumCol(p, "F"), "★紙の消費税を足すと 請求の消費税に合わない★").toBe(d.tax);
        expect(sumCol(p, "E") + sumCol(p, "F"), "★紙の明細の合計 ≠ 請求額★").toBe(d.total);
        // 16件ちょうどは まとめない／超えたらまとめる
        const other = p.edits.filter((e) => /^ほか \d+件$/.test(String(e.value)));
        if (n <= 16) {
          expect(other.length, "まだ入るのに まとめている").toBe(0);
          expect(p.merged.length).toBe(0);
        } else {
          expect(other.length, "★「ほか」の行が無い＝黙って落としている★").toBe(1);
          expect(other[0].value, "まとめた件数が違う").toBe("ほか " + (n - 15) + "件");
          expect(p.merged.length, "まとめた明細を返していない").toBe(n - 15);
          expect(
            p.warn.join(""),
            "★黙ってまとめている（画面に出す言葉が無い）★"
          ).toContain("「ほか」にまとめました");
        }
        expect(p.over, "★捨てた件数が残っている（まとめたのに）★").toBe(0);
      });
    }

    it("★1件ずつ丸めた税の合計がずれても、紙は請求額に合わせる★", () => {
      // 1件 1,000円（税抜909・消費税91）を20件＝丸めで合計がずれる形
      const rows = [];
      for (let i = 0; i < 20; i++)
        rows.push({
          date: "2026-08-01",
          dateText: "8/1",
          name: "ご飲食代",
          people: 1,
          amount: 1000,
          net: 909,
          tax: 91,
          memo: "",
        });
      const d = { ...D, rows, net: 18182, tax: 1818, total: 20000, grand: 20000 };
      const p = T.planEdits(CELLS16, d);
      expect(sumCol(p, "E"), "★紙の税抜が請求の税抜と違う★").toBe(18182);
      expect(sumCol(p, "F"), "★紙の消費税が請求の消費税と違う★").toBe(1818);
      expect(sumCol(p, "E") + sumCol(p, "F"), "★紙の明細の合計 ≠ 請求額★").toBe(20000);
    });

    it("名前も備考の列も決めていない店は、今までどおり知らせるだけ", () => {
      const cells = { ...CELLS16 };
      delete cells.cName;
      delete cells.cMemo;
      const p = T.planEdits(cells, data(30));
      expect(p.over, "置き場所が無いのに まとめている").toBe(14);
      expect(p.warn.join(""), "知らせていない").toContain("入りきりません");
    });
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

/* ★画面が使う設定は、必ず defaultSettings() に在ること★
   足し忘れると、その項目は ★開き直すたびに消える★（load() が拾わない）。
   2026-08-09、判子の動かし量(ownStamp)を足し忘れて、
   ★配信された物では判子が動かせなかった★（手元では動いていた）。 */
import fs2 from "node:fs";
describe("設定の足し忘れ", () => {
  const base = fs2.readFileSync(path.join(ROOT, "nomiya-ui-base.js"), "utf8");
  const ui = ["nomiya-owntpl.js", "nomiya-ui-kami.js", "nomiya-ui-uriage.js"]
    .map((f) => fs2.readFileSync(path.join(ROOT, f), "utf8"))
    .join("\n");
  const defs = /function defaultSettings\(\)[\s\S]*?\n}/.exec(base)[0];

  it("★画面が読み書きする SETTINGS の項目が、全部 既定値に在る★", () => {
    const used = [...ui.matchAll(/SETTINGS\.([A-Za-z_][\w]*)/g)].map((m) => m[1]);
    expect(used.length, "★SETTINGS を1つも使っていない＝この確認は何も見ていない★").toBeGreaterThan(
      20
    );
    const missing = [...new Set(used)].filter((k) => !new RegExp("\\b" + k + ":").test(defs));
    expect(
      missing,
      "★既定値に無い項目がある（開き直すと消える）: " + missing.join(" ") + "★"
    ).toEqual([]);
  });
});
