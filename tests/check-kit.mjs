/* check-kit.mjs — 試験が「何も見ていないのに緑」になるのを、書き方で防ぐ小さな部品。
 * ==============================================================================
 * ★他のアプリにそのまま持っていける形にしてある★
 *   ・依存なし（vitest も @playwright/test も import しない）
 *   ・失敗は ただの Error を投げる＝どちらの試験でもそのまま赤になる
 *   ・置く場所は tests/check-kit.mjs。この1ファイルを配るだけで動く
 *
 * ★なぜ要るか（2026-08-08 飲み屋で実際に起きたこと）★
 *   1) 「消す系SQLが1つも無い」という★最後の砦★が、
 *      元の配列が空でも緑になっていた。
 *          const bad = stmts.filter(消す系);
 *          expect(bad).toEqual([]);   ← stmts が空なら bad も空＝素通り
 *      「今 空にならないのは、ファイルが無ければ読み込みで落ちるから」という
 *      ★偶然に頼っていた★。
 *   2) 「A4の紙5種」という試験が、実物7種のうち5種しか見ていなかった。
 *      黙って飛ばしても、誰にも分からなかった。
 *
 *   探して回る道具（静的解析）も考えたが、
 *   ★誤検出だらけになり、いちばん大事な1件も捕まえられなかった★ のでやめた。
 *   代わりに ★そう書けば自動で赤になる★ 形にする。誤検出ゼロ・判定作業ゼロ。
 */

/**
 * ★「当てはまる物が1つも無い」を、元が空でも通らない形で確かめる★
 *
 *   前:  const bad = stmts.filter(消す系); expect(bad).toEqual([]);
 *        → stmts が空でも緑
 *   後:  expectNoneOf(stmts, 消す系, "棚のDDLに消す系");
 *        → ★stmts が空なら その場で赤★
 *
 * @param {Array} items    調べる元（空なら赤）
 * @param {(x:any)=>boolean} match  「これが在ったら困る」物の見分け方
 * @param {string} label   何を見ているか（落ちたときに出る）
 * @param {{min?:number}} [opt] min: 元が最低これだけ在るはず（既定 1）
 * @returns {number} 実際に見た件数（報告に使える）
 */
export function expectNoneOf(items, match, label, opt) {
  const min = (opt && opt.min) || 1;
  if (!Array.isArray(items)) {
    throw new Error(
      `${label}: ★元が配列ではありません（${typeof items}）＝この確認は成立していません★`
    );
  }
  if (items.length < min) {
    throw new Error(
      `${label}: ★元が ${items.length} 件しかありません（${min} 件以上あるはず）` +
        `＝この確認は何も見ていません★`
    );
  }
  const hit = items.filter(match);
  if (hit.length) {
    const shown = hit.slice(0, 5).map((x) => String(x).slice(0, 120));
    throw new Error(
      `${label}: ★${hit.length} 件 見つかりました★ → ${shown.join(" / ")}` +
        (hit.length > 5 ? ` …ほか${hit.length - 5}件` : "")
    );
  }
  return items.length;
}

/**
 * ★「N個ぜんぶ見た」を、黙って飛ばせない形で確かめる★
 *
 *   前:  for (...) { if (中身が無い) continue; ...確かめる... }
 *        → 何個 見たのか誰にも分からない（5個しか見ていなくても「7種とも」と名乗れた）
 *   後:  await covering("A4の紙", 7, async (c) => {
 *          ... c.seen("売上帳") ...
 *          ... c.skip("給与明細", "中身が無い") ...
 *        });
 *        → ★必ず「見た 6/7 ／見ていない: 給与明細(中身が無い)」と出て、数が合わなければ赤★
 *
 * ★呼び忘れられない形にしてある★：確かめる中身を body として渡すので、
 * 最後の報告と数の突き合わせは この部品が必ず実行する。
 *
 * @param {string} title  何を数えているか（例 "A4の紙"）
 * @param {number} expected  いくつ在るはずか
 * @param {(c:{seen:(n:string)=>string, skip:(n:string,why?:string)=>void})=>any} body
 * @returns {{seen:string[], skipped:string[]}}
 */
export async function covering(title, expected, body) {
  const seen = [];
  const skipped = [];
  const c = {
    seen(name) {
      seen.push(String(name));
      return name;
    },
    skip(name, why) {
      skipped.push(String(name) + (why ? `(${why})` : ""));
    },
  };
  await body(c);
  const line =
    `${title}: 見た ${seen.length}/${expected}` +
    (seen.length ? `: ${seen.join("・")}` : "") +
    (skipped.length ? ` ／見ていない: ${skipped.join("・")}` : "");
  // ★必ず出す（黙って飛ばせない）★
  console.log("  " + line);
  if (seen.length !== expected) {
    throw new Error(`★${line}★ ＝名乗り(${expected})と実物(${seen.length})が合っていません`);
  }
  return { seen, skipped };
}

/**
 * ★「当てはまる物が ちょうど N 件ある」を確かめる★（数が合っているかを見たいとき）
 * 元が空なら当然赤になる（0 !== N）ので、こちらは min を持たない。
 */
export function expectCountOf(items, match, n, label) {
  if (!Array.isArray(items)) {
    throw new Error(`${label}: ★元が配列ではありません（${typeof items}）★`);
  }
  const hit = items.filter(match);
  if (hit.length !== n) {
    throw new Error(`${label}: ★${n} 件あるはずが ${hit.length} 件です★`);
  }
  return hit.length;
}
