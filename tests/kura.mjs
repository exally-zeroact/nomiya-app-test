/* kura.mjs — ★倉庫の 名前は ここが 正（値だけ）★
 * =============================================================================
 * なぜ 分けたか（2026-09-14 実測）:
 *   値は tests/supa-from-config.mjs に 置いていたが、★画面の試験(playwright)から 取り込めない★。
 *   あの紙は 根を 探す為に `import.meta.url` を 使っており、playwright は spec を
 *   ★昔ながらの形(CJS)★ に 直して 読むので ★import.meta が 使えない★＝
 *   「SyntaxError: Cannot use import.meta outside a module」で ★試験が 1本も 見つからなく なる★。
 *   ⇒ ★値だけ★を この紙に 分けた（ここには import を 1つも 置かない）。
 *
 * ★ここを 直す時は 引っ越しの日★。直したら 門(tests/supa-config-env-matches-repo.test.mjs)の
 *   teisuu() が 形を 見て、nomiya-deploy.test.js の 145行が ★字が 残っているか★ を 見る。
 */
export const PROD_WAREHOUSE = "tnfwipbgfgjaymlszeid"; // 本番倉庫
export const TEST_WAREHOUSE = "khawdrnvssdenumbiwfg"; // テスト用DB
