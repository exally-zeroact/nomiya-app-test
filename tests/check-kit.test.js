import { describe, it, expect } from "vitest";
import { expectNoneOf, expectCountOf, covering } from "./check-kit.mjs";

/* ★見張りの見張り★
 * check-kit.mjs は「試験が何も見ていないのに緑になる」のを防ぐ部品。
 * ★部品そのものが効いていなければ、全部が嘘になる★ので、ここで実際に動かして確かめる。
 * （他のアプリへ配るときは、この試験も一緒に持っていく）
 */

const 消す系 = (s) => /drop|truncate|delete/i.test(s);

describe("check-kit: expectNoneOf（元が空なら赤にする）", () => {
  it("★元が空なら赤（ここが今までの穴だった）★", () => {
    expect(() => expectNoneOf([], 消す系, "棚のDDL")).toThrow(/元が 0 件しかありません/);
  });

  it("★min より少なければ赤（「1文しか取れていない」も捕まえる）★", () => {
    expect(() => expectNoneOf(["create table x"], 消す系, "棚のDDL", { min: 20 })).toThrow(
      /元が 1 件しかありません（20 件以上あるはず）/
    );
  });

  it("配列でなければ赤（undefined を渡してしまった、を見逃さない）", () => {
    expect(() => expectNoneOf(undefined, 消す系, "棚のDDL")).toThrow(/元が配列ではありません/);
    expect(() => expectNoneOf(null, 消す系, "棚のDDL")).toThrow(/元が配列ではありません/);
  });

  it("当てはまる物が在れば赤（中身も出る）", () => {
    expect(() =>
      expectNoneOf(["create table a", "drop table b", "create table c"], 消す系, "棚のDDL")
    ).toThrow(/1 件 見つかりました.*drop table b/s);
  });

  it("たくさん在るときは 5件まで出して「…ほか」を付ける", () => {
    const many = Array.from({ length: 8 }, (_, i) => "drop table t" + i);
    expect(() => expectNoneOf(many, 消す系, "棚のDDL")).toThrow(/…ほか3件/);
  });

  it("きれいなら、見た件数を返す（何件見たかを報告に使える）", () => {
    const n = expectNoneOf(["create table a", "create table b"], 消す系, "棚のDDL");
    expect(n).toBe(2);
  });

  it("★これが本題：元が空だと、昔の書き方は緑・新しい書き方は赤★", () => {
    const stmts = [];
    // 昔の書き方（空でも通ってしまう）
    const bad = stmts.filter(消す系);
    expect(bad).toEqual([]); // ← 何も見ていないのに緑
    // 新しい書き方
    expect(() => expectNoneOf(stmts, 消す系, "棚のDDL")).toThrow();
  });
});

describe("check-kit: covering（N個ぜんぶ見たか）", () => {
  it("数が合えば通り、見た物を返す", async () => {
    const r = await covering("紙", 2, async (c) => {
      c.seen("売上帳");
      c.seen("請求書");
    });
    expect(r.seen).toEqual(["売上帳", "請求書"]);
  });

  it("★足りなければ赤（黙って飛ばせない）★", async () => {
    await expect(
      covering("紙", 7, async (c) => {
        c.seen("売上帳");
      })
    ).rejects.toThrow(/見た 1\/7.*名乗り\(7\)と実物\(1\)が合っていません/s);
  });

  it("★飛ばした物は名前と理由が出る★", async () => {
    await expect(
      covering("紙", 2, async (c) => {
        c.seen("売上帳");
        c.skip("給与明細", "中身が無い");
      })
    ).rejects.toThrow(/見ていない: 給与明細\(中身が無い\)/);
  });

  it("多すぎても赤（数えすぎ・二重に数えたを見逃さない）", async () => {
    await expect(
      covering("紙", 1, async (c) => {
        c.seen("a");
        c.seen("b");
      })
    ).rejects.toThrow(/見た 2\/1/);
  });

  it("中で落ちたら、そのまま落ちる（報告で握りつぶさない）", async () => {
    await expect(
      covering("紙", 1, async () => {
        throw new Error("中の確認が落ちた");
      })
    ).rejects.toThrow("中の確認が落ちた");
  });
});

describe("check-kit: expectCountOf（ちょうど N 件あるか）", () => {
  it("数が合えば その件数を返す", () => {
    expect(expectCountOf(["a1", "a2", "b1"], (s) => s.startsWith("a"), 2, "aの数")).toBe(2);
  });
  it("数が合わなければ赤", () => {
    expect(() => expectCountOf(["a1"], (s) => s.startsWith("a"), 2, "aの数")).toThrow(
      /2 件あるはずが 1 件です/
    );
  });
  it("★元が空なら当然 赤（0 件になる）★", () => {
    expect(() => expectCountOf([], (s) => s.startsWith("a"), 8, "棚の数")).toThrow(
      /8 件あるはずが 0 件です/
    );
  });
  it("配列でなければ赤", () => {
    expect(() => expectCountOf("なにか", (s) => s, 1, "x")).toThrow(/元が配列ではありません/);
  });
});
