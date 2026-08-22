/* 客に出る字に ★ を出さない（指示役 2026-08-22 裁定）
 * ------------------------------------------------------------------------------
 * ★は うちの覚え書きの印であって、客の字ではない。
 * 大事さは ★太字・色・大きさ★ で出す（この注釈のような ★ は コメントなので構わない）。
 *
 * ★なぜ見張りが要るか（2026-08-22 実際に起きた）★
 *   自社テンプレの知らせが「✅ 書く場所が…★12コ 当てておきました★」と出ていた。
 *   ＝ 覚え書きの印が そのまま 客の画面（上から694px・高さ74px）に出ていた。
 *   コメントには ★ を書くので、★ソースを丸ごと grep しても見分けられない★。
 *   ここでは ★コメントを外してから、文字列の中だけ★ を数える。
 *
 * ★2層のうちの「素の字」側★
 *   もう1層は tests/e2e/star-free.spec.js＝★描き終わった画面から数える★（指示役の数え方）。
 *   画面の方は「押さないと出ない知らせ」までは追えないので、ここで元の字を押さえる。
 */
import { describe, it, expect } from "vitest";
import { expectNoneOf } from "./lib/check-kit.mjs";
import { HTML, PAGE_JS, LAZY_JS } from "./app-source.mjs";

/** コメント（ブロック・行・HTMLの3種）を外す。★はコメントには書いてよい。 */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/(^|[^:"'\\])\/\/[^\n]*/g, "$1 ");
}

/** 文字列リテラル（"…" と '…'）を全部 集める＝これが「客に出るかもしれない字」 */
function literalsOf(src, where) {
  const out = [];
  for (const m of stripComments(src).matchAll(/"([^"\n]*)"|'([^'\n]*)'/g)) {
    const lit = m[1] !== undefined ? m[1] : m[2];
    if (lit) out.push({ where, text: lit });
  }
  return out;
}

/** HTMLの地の文（タグの外に直に書いた字）も客に出る */
function bareTextOf(html) {
  return stripComments(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, "\n")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((text) => ({ where: "nomiya-uriage.html(地の文)", text }));
}

describe("客に出る字に ★ を出さない", () => {
  const items = [
    ...literalsOf(HTML, "nomiya-uriage.html"),
    ...bareTextOf(HTML),
    ...literalsOf(PAGE_JS, "画面のJS"),
    ...LAZY_JS.flatMap((f) => literalsOf(f.text, f.file)),
  ];

  it("見ている字が0本ではない＝何も見ていない緑にならない", () => {
    // ★あとから読むJS（自社テンプレ等）も範囲に入っているか★＝ここが抜けると今回の穴を見逃す
    expect(LAZY_JS.length, "あとから読むJSが範囲に入っていない").toBeGreaterThan(2);
    expect(items.length).toBeGreaterThan(2000);
  });

  // 落ちた時に「どのファイルの どの字か」がそのまま読めるように、文字にしてから渡す
  const lines = items.map((x) => `${x.where}: ${x.text}`);

  it("★ が1つも無い（コメントは除く）", () => {
    const seen = expectNoneOf(lines, (t) => t.includes("★"), "客に出る字の★", { min: 2000 });
    expect(seen).toBeGreaterThan(2000);
  });

  it("わざと1本 混ぜたら赤くなる（この見張りが空振りしていない証拠）", () => {
    const clean = Array.from({ length: 2000 }, (_, i) => `見本: ふつうの字 ${i}`);
    expect(() => expectNoneOf(clean, (t) => t.includes("★"), "見本", { min: 2000 })).not.toThrow();
    const dirty = [...clean, "わざと: ★大事★"];
    expect(() => expectNoneOf(dirty, (t) => t.includes("★"), "見本", { min: 2000 })).toThrow(
      /1 件 見つかりました/
    );
  });
});
