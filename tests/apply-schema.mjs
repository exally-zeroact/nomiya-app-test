/* apply-schema.mjs — 棚（テーブル）を当てる。手でSQLを貼らなくていいようにするための道具。
 * ------------------------------------------------------------------------------
 *  使い方:  npm run db:apply            … このrepoの倉庫に当てる
 *
 *  前提: 合言葉のファイルが置いてあること
 *          テストrepo → %TEMP%\nomiya-db-url.json
 *          本番repo   → %TEMP%\nomiya-db-url-prod.json
 *
 *        どちらか一方の形で書く（トークンの方が楽・おすすめ）:
 *          { "token": "sbp_…" }   ← Supabase の Account → Access Tokens で作る鍵
 *          { "url":   "postgresql://postgres:…@….supabase.com:5432/postgres" }
 *
 *  ★安全（当てる前に自分で確かめて、駄目なら当てない）:
 *   - schema-nomiya.sql は冪等（if not exists）。何度当てても同じ
 *   - 「消す系」(drop table / truncate / delete / update) が1文でもあれば中止
 *   - 飲み屋の棚(nomiya_*)以外に触る文があれば中止
 *   - repoの向き先と接続先の倉庫が違えば中止（テスト用repoで本番に当てない）
 *   - 当てたあと、棚と列が本当に入ったかを数えて出す
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SQLFILE = path.join(ROOT, "supabase", "schema-nomiya.sql");
const SQL = fs.readFileSync(SQLFILE, "utf8");
const PKG = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const IS_PROD = PKG.name === "nomiya-app";
const CRED = path.join(os.tmpdir(), IS_PROD ? "nomiya-db-url-prod.json" : "nomiya-db-url.json");

function die(m) {
  console.error("中止: " + m);
  process.exit(1);
}

/* ── 1. 当てる前に、SQLの中身が安全か確かめる ── */
const stmts = SQL.split(/\r?\n/)
  .filter((l) => !/^\s*--/.test(l))
  .join("\n")
  .split(";")
  .map((s) => s.trim().replace(/\s+/g, " "))
  .filter(Boolean);

const bad = stmts.filter((s) =>
  /\b(drop\s+table|drop\s+schema|drop\s+database|drop\s+column|truncate|delete\s+from|update\s+\w+\s+set)\b/i.test(
    s
  )
);
if (bad.length) die("消す系のSQLが入っています:\n  " + bad.join("\n  "));

// 2026-08-06 room split: allow only creating the castally room
const other = stmts.filter(
  (s) =>
    !/nomiya_/i.test(s) &&
    !/create extension/i.test(s) &&
    !/^create schema if not exists castally$/i.test(s)
);
if (other.length) die("飲み屋以外の棚に触る文があります:\n  " + other.join("\n  "));

const roomNg = stmts.filter((s) => /(kyuyo|daikome|amakase|daikou|exally)\./i.test(s));
if (roomNg.length) die("hoka no heya ni fureru bun: " + roomNg.join(" | "));

console.log("SQLを確かめた: " + stmts.length + "文 / 消す系 0件 / 飲み屋以外 0件");

/* ── 2. このrepoが向いている倉庫を知る ── */
const conf = fs.readFileSync(path.join(ROOT, "js", "supa-config.js"), "utf8");
const REF = (conf.match(/https:\/\/([a-z0-9]+)\.supabase\.co/) || [])[1];
if (!REF) die("js/supa-config.js から倉庫が読めません");

/* ── 3. 合言葉を読む ── */
if (!fs.existsSync(CRED)) {
  die(
    "合言葉のファイルがありません: " +
      CRED +
      '\n      { "token": "sbp_…" }  … Supabase の Account → Access Tokens' +
      '\n      { "url": "postgresql://…" } でも可'
  );
}
let cred;
try {
  cred = JSON.parse(fs.readFileSync(CRED, "utf8"));
} catch (e) {
  die("合言葉のファイルの形が壊れています（JSON）: " + e.message);
}
const TOKEN = String(cred.token || "").trim();
const URL_ = String(cred.url || "").trim();
if (!TOKEN && !URL_) die('合言葉が空です。{ "token": "sbp_…" } を書いてください');

console.log("倉庫: " + REF + "（" + (IS_PROD ? "本番" : "テスト") + "）に当てます");

/* ── 4. 当てる ──
 *  A) トークン方式: Supabase の Management API に SQL を投げる
 *  B) 直つなぎ方式: Postgres に pg でつなぐ（トークンが無いときだけ）
 */
let run; // (sql) => Promise<rows[]>

if (TOKEN) {
  if (!/^sbp_/.test(TOKEN)) die("トークンの形が違います（sbp_ で始まる物）");
  const API = "https://api.supabase.com/v1/projects/" + REF + "/database/query";
  run = async (sql) => {
    const res = await fetch(API, {
      method: "POST",
      headers: { Authorization: "Bearer " + TOKEN, "Content-Type": "application/json" },
      body: JSON.stringify({ query: sql }),
    });
    const text = await res.text();
    if (!res.ok) {
      let msg = text;
      try {
        msg = JSON.parse(text).message || text;
      } catch {
        /* そのまま */
      }
      if (res.status === 401 || res.status === 403) {
        throw new Error(
          "鍵が通りません(" + res.status + "): " + msg + "\n      トークンを作り直してください"
        );
      }
      if (res.status === 404) {
        throw new Error(
          "倉庫 " + REF + " が見つかりません(404)。そのアカウントの物か確かめてください"
        );
      }
      throw new Error("(" + res.status + ") " + msg);
    }
    try {
      return JSON.parse(text);
    } catch {
      return [];
    }
  };
  console.log("つなぎ方: トークン（Management API）");
} else {
  if (!/^postgres(ql)?:\/\//.test(URL_)) die("接続先の形が違います（postgresql:// で始まる物）");
  if (URL_.indexOf(REF) < 0) {
    die(
      "このrepoの倉庫(" +
        REF +
        ")と、接続先が違います。取り違えているので止めます。\n" +
        "      nomiya-app-test は DB-test、nomiya-app は本番倉庫に当てます。"
    );
  }
  const pg = (await import("pg")).default;
  const client = new pg.Client({ connectionString: URL_, ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
  } catch (e) {
    die("つながりません: " + e.message);
  }
  run = async (sql) => (await client.query(sql)).rows;
  process.on("exit", () => client.end().catch(() => {}));
  console.log("つなぎ方: 直つなぎ（pg）");
}

try {
  await run(SQL);
  console.log("当てました。中身を数えます:\n");

  const t = await run(
    "select tablename, rowsecurity from pg_tables " +
      "where schemaname='castally' and tablename like 'nomiya_%' order by 1"
  );
  console.log("  棚（RLS）");
  t.forEach((r) => console.log("    " + String(r.tablename).padEnd(18) + " RLS=" + r.rowsecurity));

  const c = await run(
    "select table_name, column_name from information_schema.columns " +
      "where table_schema='castally' and table_name like 'nomiya_%' " +
      "and column_name in ('crew','use_items','picks','back_pct','amount','paid_cash','close_wday','pay_after','birth','adj','paid_amount','pay_from','ord','how','paid_by','pay_term') order by 1,2"
  );
  console.log("\n  あとから足した列");
  c.forEach((r) => console.log("    " + String(r.table_name).padEnd(18) + r.column_name));

  const want = [
    ["nomiya_sales", "crew"],
    ["nomiya_staff", "use_items"],
    ["nomiya_work", "picks"],
    ["nomiya_staff", "close_wday"],
    ["nomiya_staff", "pay_after"],
    ["nomiya_staff", "birth"],
    ["nomiya_sales", "adj"],
    ["nomiya_work", "paid_amount"],
    ["nomiya_staff", "pay_from"],
    ["nomiya_staff", "ord"],
    ["nomiya_payments", "how"],
    ["nomiya_sales", "paid_by"],
    ["nomiya_partners", "pay_term"],
  ];
  const miss = want.filter(
    ([tb, col]) => !c.some((r) => r.table_name === tb && r.column_name === col)
  );
  // public の窓口(view)が8つあり、全部「呼んだ人の権利」で開くこと。
  // ここが1つでも欠けると、アプリから棚が見えない／他店のデータが見える、のどちらかになる。
  const v = await run(
    "select c.relname, coalesce(array_to_string(c.reloptions,','),'') opts from pg_class c " +
      "join pg_namespace n on n.oid=c.relnamespace " +
      "where n.nspname='public' and c.relkind='v' and c.relname like 'nomiya_%' order by 1"
  );
  const vBad = v.filter((r) => !/security_invoker/i.test(r.opts) || !/true/i.test(r.opts));
  console.log("");
  console.log("  public の窓口(view)");
  v.forEach((r) => console.log("    " + String(r.relname).padEnd(18) + r.opts));

  console.log("");
  if (t.length === 8 && !miss.length && v.length === 8 && !vBad.length) {
    console.log("APPLY RESULT: OK（棚8つ・窓口8つ・必要な列すべて入った）");
  } else {
    console.log(
      "APPLY RESULT: NG（棚 " +
        t.length +
        "／窓口 " +
        v.length +
        "／呼んだ人の権利でない窓口 " +
        (vBad.map((r) => r.relname).join(", ") || "なし") +
        "／足りない列 " +
        (miss.map((x) => x.join(".")).join(", ") || "なし") +
        "）"
    );
    process.exitCode = 1;
  }
} catch (e) {
  die("SQLで失敗しました: " + e.message);
}
