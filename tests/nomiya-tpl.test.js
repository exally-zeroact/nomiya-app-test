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
