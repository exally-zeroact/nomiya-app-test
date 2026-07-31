/* supa-from-config.mjs — 「アプリが実際に見ている倉庫」を js/supa-config.js から読み取る。
 * ------------------------------------------------------------------------------
 * 検証スクリプトが自分で倉庫を書くと、アプリと違う所を試すことになる。
 * だから必ず配る物と同じ1本(js/supa-config.js)から読む。
 *
 * ★本番倉庫では検証を走らせない。テストはテスト、本番は本番。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PROD_WAREHOUSE = "tnfwipbgfgjaymlszeid"; // 本番倉庫＝ここでは絶対に走らせない

export function readSupaConfig() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const src = fs.readFileSync(path.join(root, "js", "supa-config.js"), "utf8");
  const url = (src.match(/url:\s*"([^"]+)"/) || [])[1];
  const key = (src.match(/key:\s*"([^"]+)"/) || [])[1];
  if (!url || !key) {
    console.error("中止: js/supa-config.js から倉庫を読めません");
    process.exit(1);
  }
  if (url.includes(PROD_WAREHOUSE)) {
    console.error("中止: ここは本番倉庫です。検証は本番倉庫では走らせません。");
    console.error("      テストは nomiya-app-test（DB-test）で走らせてください。");
    process.exit(1);
  }
  return { url, key };
}
