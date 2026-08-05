/* 監査（実際に操作して見つけた分）の直し — 計算の芯だけ先に固める。
   ①先の日付は「止めずに注意する」②どの欄が悪いかを返す③知らない支払い方法を落とさない */
import { describe, it, expect } from "vitest";
import C from "../nomiya-core.js";

describe("㉖-① 先の日付は止めずに、注意だけ出す", () => {
  it("今日より後の日付なら、注意の言葉を返す", () => {
    const w = C.dateNote("2030-01-01", "2026-08-05");
    expect(w).toContain("先の日付");
    expect(w).toContain("2030");
  });
  it("今日・昨日・去年は何も言わない（普通に打ち直す日）", () => {
    expect(C.dateNote("2026-08-05", "2026-08-05")).toBe("");
    expect(C.dateNote("2026-08-04", "2026-08-05")).toBe("");
    expect(C.dateNote("2025-12-31", "2026-08-05")).toBe("");
  });
  it("★境界：明日ちょうどから言う（今日は言わない）", () => {
    expect(C.dateNote("2026-08-06", "2026-08-05")).not.toBe("");
    expect(C.dateNote("2026-08-05", "2026-08-05")).toBe("");
  });
  it("★境界：月またぎ・年またぎでも明日から", () => {
    expect(C.dateNote("2026-09-01", "2026-08-31")).not.toBe("");
    expect(C.dateNote("2026-08-31", "2026-08-31")).toBe("");
    expect(C.dateNote("2027-01-01", "2026-12-31")).not.toBe("");
  });
  it("ずっと昔（打ち間違いの1990年）も、止めずに注意だけ", () => {
    const w = C.dateNote("1990-01-01", "2026-08-05");
    expect(w).toContain("ずいぶん前");
  });
  it("★境界：1年前ちょうどは言わない／1年と1日前から言う", () => {
    expect(C.dateNote("2025-08-05", "2026-08-05")).toBe("");
    expect(C.dateNote("2025-08-04", "2026-08-05")).not.toBe("");
  });
  it("日付が無いときは何も言わない（別の注意が出る）", () => {
    expect(C.dateNote("", "2026-08-05")).toBe("");
  });
});

describe("㉖-② 断られたとき、どの欄が悪いかを返す", () => {
  const base = { date: "2026-08-01", name: "田中", people: 2, amount: 8000, pay: "cash" };
  it("金額が空なら amount を返す", () => {
    const v = C.validateSale({ ...base, amount: "" });
    expect(v.ok).toBe(false);
    expect(v.fields).toEqual(["amount"]);
  });
  it("人数0なら people を返す", () => {
    expect(C.validateSale({ ...base, people: 0 }).fields).toEqual(["people"]);
  });
  it("名前が空なら name を返す", () => {
    expect(C.validateSale({ ...base, name: "  " }).fields).toEqual(["name"]);
  });
  it("いくつも悪ければ、悪い欄を全部返す", () => {
    const v = C.validateSale({ date: "", name: "", people: 0, amount: -1, pay: "x" });
    expect(v.fields.sort()).toEqual(["amount", "date", "name", "pay", "people"]);
  });
  it("正しければ空", () => {
    const v = C.validateSale(base);
    expect(v.ok).toBe(true);
    expect(v.fields).toEqual([]);
  });
});

describe("㉖-③ 知らない支払い方法を、内訳から落とさない", () => {
  const mk = (pay, amount) => ({
    id: pay + amount,
    date: "2026-08-01",
    name: "客",
    people: 1,
    amount,
    pay,
    receipt: "na",
  });
  it("知らない方法があると「その他」の行になり、行の合計が全体と合う", () => {
    const sales = [mk("cash", 1000), mk("emoney", 2000), mk("なにこれ", 3000)];
    const rows = C.byPayMethod(sales);
    const other = rows.filter((r) => r.key === "_other");
    expect(other.length, "その他の行が出ていない").toBe(1);
    expect(other[0].amount).toBe(5000); // 2000 + 3000
    expect(other[0].count).toBe(2);
    const sum = rows.reduce((a, r) => a + r.amount, 0);
    expect(sum, "行の合計が全体と合わない").toBe(6000);
    const cnt = rows.reduce((a, r) => a + r.count, 0);
    expect(cnt, "組数の合計が合わない").toBe(3);
  });
  it("知らない方法が1つも無ければ「その他」は出さない（普通の店の画面を汚さない）", () => {
    const rows = C.byPayMethod([mk("cash", 1000), mk("credit", 2000)]);
    expect(rows.filter((r) => r.key === "_other").length).toBe(0);
  });
  it("領収書の内訳も、行の合計が全体と合う", () => {
    const sales = [mk("cash", 1000), mk("なにこれ", 3000)];
    const rows = C.byReceipt(sales);
    expect(rows.reduce((a, r) => a + r.amount, 0)).toBe(4000);
  });
});
