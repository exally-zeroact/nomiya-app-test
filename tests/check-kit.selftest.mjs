/* check-kit.selftest.mjs — ★部品そのものが効いているかを、素の node で確かめる★
 * ==============================================================================
 *   走らせ方:  node tests/check-kit.selftest.mjs      （npm run selftest）
 *   落ちたら exit 1。最後に「見た N/N」と件数を出す。
 *
 * ★なぜ vitest を使わないか（2026-08-08 実際に詰まった）★
 *   最初は tests/check-kit.test.js（vitest）で書いていた。
 *   これをアマかせへ配ったら ★vitest が入っていない★ ので ERR_MODULE_NOT_FOUND、
 *   ＝★見張りの見張りが1回も走らないまま repo に居る★ ことになった。
 *   それは check-kit が無くそうとしている形そのもの。だから
 *   ★どのアプリでも素の node だけで走る形★ に作り直した。
 *   （使うのは node 内蔵の assert だけ。外から入れる物は1つも要らない）
 *
 * ★置き場所の決まり★
 *   部品     … tests/lib/check-kit.mjs   ← `tests/*.mjs` の glob に入らない場所
 *   自己確認 … tests/check-kit.selftest.mjs ← ★拾われて走ってほしい方★
 *   （アマかせのCIは tests/*.mjs を回すので、部品が「何も確かめないテスト」として
 *     列に並んでしまうのを避けるため、この置き分けにしている）
 */
import assert from "node:assert/strict";
import { expectNoneOf, expectCountOf, covering } from "./lib/check-kit.mjs";

const cases = [];
const test = (name, fn) => cases.push({ name, fn });

/** 落ちること・落ち方（言い方）まで確かめる */
function mustThrow(fn, re, why) {
  let err = null;
  try {
    fn();
  } catch (e) {
    err = e;
  }
  assert.ok(err, why + "：落ちるはずが落ちなかった");
  assert.match(String(err.message), re, why + "：言い方が違う → " + err.message);
}
async function mustReject(p, re, why) {
  let err = null;
  try {
    await p;
  } catch (e) {
    err = e;
  }
  assert.ok(err, why + "：落ちるはずが落ちなかった");
  assert.match(String(err.message), re, why + "：言い方が違う → " + err.message);
}

const 消す系 = (s) => /drop|truncate|delete/i.test(s);

/* ── expectNoneOf ─────────────────────────────────────────────── */
test("元が空なら赤（ここが今までの穴だった）", () =>
  mustThrow(() => expectNoneOf([], 消す系, "棚のDDL"), /元が 0 件しかありません/, "空"));

test("min より少なければ赤", () =>
  mustThrow(
    () => expectNoneOf(["create table x"], 消す系, "棚のDDL", { min: 20 }),
    /元が 1 件しかありません（20 件以上あるはず）/,
    "min"
  ));

test("配列でなければ赤（undefined）", () =>
  mustThrow(
    () => expectNoneOf(undefined, 消す系, "棚のDDL"),
    /元が配列ではありません/,
    "undefined"
  ));

test("配列でなければ赤（null）", () =>
  mustThrow(() => expectNoneOf(null, 消す系, "棚のDDL"), /元が配列ではありません/, "null"));

test("当てはまる物が在れば赤（中身も出る）", () =>
  mustThrow(
    () => expectNoneOf(["create table a", "drop table b"], 消す系, "棚のDDL"),
    /1 件 見つかりました[\s\S]*drop table b/,
    "見つかった"
  ));

test("たくさん在るときは5件まで出して「…ほか」を付ける", () =>
  mustThrow(
    () =>
      expectNoneOf(
        Array.from({ length: 8 }, (_, i) => "drop t" + i),
        消す系,
        "棚のDDL"
      ),
    /…ほか3件/,
    "省略"
  ));

test("きれいなら、見た件数を返す", () => {
  const n = expectNoneOf(["create table a", "create table b"], 消す系, "棚のDDL");
  assert.equal(n, 2, "見た件数が違う");
});

test("★昔の書き方は緑・新しい書き方は赤（前は素通りしていた証拠）★", () => {
  const stmts = [];
  // 昔の書き方：元が空でも「当てはまる物は無い」で通ってしまう
  assert.deepEqual(
    stmts.filter(消す系),
    [],
    "昔の書き方は空でも通る（この行が落ちたら前提が変わった）"
  );
  // 新しい書き方：その場で落ちる
  mustThrow(() => expectNoneOf(stmts, 消す系, "棚のDDL"), /元が 0 件/, "新しい書き方");
});

/* ── expectCountOf ────────────────────────────────────────────── */
test("数が合えば その件数を返す", () => {
  assert.equal(
    expectCountOf(["a1", "a2", "b1"], (s) => s.startsWith("a"), 2, "aの数"),
    2
  );
});
test("数が合わなければ赤", () =>
  mustThrow(
    () => expectCountOf(["a1"], (s) => s.startsWith("a"), 2, "aの数"),
    /2 件あるはずが 1 件です/,
    "数違い"
  ));
test("元が空なら当然 赤（0件になる）", () =>
  mustThrow(
    () => expectCountOf([], (s) => s.startsWith("a"), 8, "棚の数"),
    /8 件あるはずが 0 件です/,
    "空"
  ));
test("配列でなければ赤", () =>
  mustThrow(() => expectCountOf("なにか", (s) => s, 1, "x"), /元が配列ではありません/, "非配列"));

/* ── covering ─────────────────────────────────────────────────── */
test("数が合えば通り、見た物を返す", async () => {
  const r = await covering("紙", 2, async (c) => {
    c.seen("売上帳");
    c.seen("請求書");
  });
  assert.deepEqual(r.seen, ["売上帳", "請求書"]);
});
test("★足りなければ赤（黙って飛ばせない）★", () =>
  mustReject(
    covering("紙", 7, async (c) => c.seen("売上帳")),
    /見た 1\/7[\s\S]*名乗り\(7\)と実物\(1\)が合っていません/,
    "足りない"
  ));
test("飛ばした物は名前と理由が出る", () =>
  mustReject(
    covering("紙", 2, async (c) => {
      c.seen("売上帳");
      c.skip("給与明細", "中身が無い");
    }),
    /見ていない: 給与明細\(中身が無い\)/,
    "skip"
  ));
test("多すぎても赤（二重に数えたを見逃さない）", () =>
  mustReject(
    covering("紙", 1, async (c) => {
      c.seen("a");
      c.seen("b");
    }),
    /見た 2\/1/,
    "数えすぎ"
  ));
test("中で落ちたら そのまま落ちる（報告で握りつぶさない）", () =>
  mustReject(
    covering("紙", 1, async () => {
      throw new Error("中の確認が落ちた");
    }),
    /中の確認が落ちた/,
    "握りつぶさない"
  ));

/* ── 走らせる ─────────────────────────────────────────────────── */
const failed = [];
try {
  await covering("check-kit の自己確認", cases.length, async (c) => {
    for (const t of cases) {
      try {
        await t.fn();
        c.seen(t.name);
      } catch (e) {
        failed.push(`${t.name} … ${e.message}`);
      }
    }
  });
} catch (e) {
  /* 数の食い違い＝下で中身を出す */
}

if (failed.length) {
  console.error("\n★落ちた確認★");
  failed.forEach((f) => console.error("  - " + f));
  console.error(`\nSELFTEST RESULT: NG（${failed.length}/${cases.length} 件が落ちました）`);
  process.exit(1);
}
console.log(`SELFTEST RESULT: OK（${cases.length}/${cases.length} 件）`);
