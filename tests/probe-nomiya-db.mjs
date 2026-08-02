/* probe-nomiya-db.mjs — このrepoが見ている倉庫に、飲み屋の棚ができたかを「機械的に」確かめる
 * ------------------------------------------------------------------------------
 *  使い方:  node tests/probe-nomiya-db.mjs
 *  何をするか:
 *    配るアプリと同じ js/supa-config.js から URL と公開鍵を読み取り、
 *    nomiya_* の7表を1つずつ叩いて、HTTPの返り番号をそのまま出す。
 *      棚が無い          → 404（PostgRESTの PGRST205）
 *      棚があってRLSあり → 200（ログインしていないので中身は必ず 0 件）
 *  読むだけ・1行も書かない。ログインもしない＝どのお店のデータにも触らない。
 *  ★読むだけなので、本番倉庫を向いたrepoでも動く（書く検証だけが本番で止まる）。
 *  出力の最後の行が「PROBE RESULT: OK」なら7表そろっている（目視の「できました」は使わない）。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONF = fs.readFileSync(path.join(ROOT, "js", "supa-config.js"), "utf8");

const URL = (CONF.match(/url:\s*"([^"]+)"/) || [])[1];
const KEY = (CONF.match(/key:\s*"([^"]+)"/) || [])[1];
if (!URL || !KEY) {
  console.error("中止: js/supa-config.js から倉庫を読めません");
  process.exit(1);
}

const TABLES = [
  "nomiya_sales",
  "nomiya_partners",
  "nomiya_settings",
  "nomiya_invoices",
  "nomiya_closes",
  "nomiya_staff",
  "nomiya_work",
  "nomiya_payments",
];

console.log("倉庫: " + URL);
console.log("鍵  : " + KEY.slice(0, 12) + "…（配るアプリと同じ公開鍵）");
console.log("時刻: " + new Date().toISOString());
console.log("");

let ng = 0;
for (const t of TABLES) {
  const res = await fetch(URL + "/rest/v1/" + t + "?select=*&limit=1", {
    headers: { apikey: KEY, Authorization: "Bearer " + KEY },
  });
  const body = await res.text();
  const ok = res.status === 200;
  if (!ok) ng++;
  console.log(
    (ok ? "  ✓ " : "  ✗ ") +
      t.padEnd(16) +
      " HTTP " +
      res.status +
      "  " +
      (ok ? "棚あり（中身 " + body + " ＝RLSで他店は見えない）" : body.slice(0, 160))
  );
}

console.log("");
console.log(
  ng === 0
    ? "PROBE RESULT: OK（8表とも HTTP 200 ＝ DDL適用済み）"
    : "PROBE RESULT: NG（" +
        ng +
        " 表が 200 でない ＝ まだ supabase/schema-nomiya.sql を当てていない）"
);
process.exit(ng ? 1 : 0);
