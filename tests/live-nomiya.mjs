/* live-nomiya.mjs — 本物のSupabase（テスト用DB）に往復して、棚とRLSが効いているか確かめる
 * ------------------------------------------------------------------------------
 *  使い方:  node tests/live-nomiya.mjs
 *  前提:
 *   ① supabase/schema-nomiya.sql を DB-test の SQL Editor で1回 Run してある
 *      （確認は node tests/probe-nomiya-db.mjs が 7表とも HTTP 200 を出すこと）
 *   ② 検証用アカウントの合言葉が %TEMP%\nomiya-test-cred.json にある
 *      { "email": "exally.supoort+nomiya@gmail.com", "password": "…" }
 *
 *  ★どの倉庫を触るかは自分では書かない。配る物と同じ js/supa-config.js から読む。
 *    そこが本番倉庫だったら即中止する＝テストが本番に1バイトも書かない。
 *  安全のため:
 *   - 決めた検証用メール以外では即中止（本物のお店のデータに触らない）
 *   - RLS(account_id = auth.uid())で、触れるのはこの検証用アカウントの行だけ
 *   - 自分が作った行だけ、最後に必ず片付ける
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { readSupaConfig } from "./supa-from-config.mjs";

const { url: URL, key: KEY } = readSupaConfig(); // 本番倉庫ならこの中で止まる
const ALLOW_EMAIL = /^exally\.supoort\+nomiya@gmail\.com$/;
const CRED = path.join(os.tmpdir(), "nomiya-test-cred.json");

const TAG = "LIVE-" + Date.now(); // このセッションで作った行の目印

let ok = 0;
let ng = 0;
function check(name, cond, extra) {
  if (cond) {
    ok++;
    console.log("  ✓ " + name);
  } else {
    ng++;
    console.log("  ✗ " + name + (extra ? "  → " + JSON.stringify(extra) : ""));
  }
}

function die(msg) {
  console.error("中止: " + msg);
  process.exit(1);
}

if (!fs.existsSync(CRED)) die("合言葉のファイルがありません: " + CRED);
const cred = JSON.parse(fs.readFileSync(CRED, "utf8"));
if (!ALLOW_EMAIL.test(String(cred.email || ""))) die("このメールでは走らせません: " + cred.email);

const sb = createClient(URL, KEY, { auth: { persistSession: false } });

const li = await sb.auth.signInWithPassword({ email: cred.email, password: cred.password });
if (li.error) die("ログインできません: " + li.error.message);
const ACC = li.data.user.id;
console.log("ログイン: " + cred.email + " (" + ACC + ")");

/* ── 棚があるか ─────────────────────────────────────────── */
for (const t of [
  "nomiya_sales",
  "nomiya_partners",
  "nomiya_settings",
  "nomiya_invoices",
  "nomiya_closes",
  "nomiya_staff",
  "nomiya_work",
]) {
  const r = await sb.from(t).select("*", { count: "exact" }).range(0, 0);
  check("棚 " + t + " がある", !r.error, r.error && r.error.message);
  if (r.error) die("先に supabase/schema-nomiya.sql を SQL Editor で Run してください");
}

/* ── 売上の往復 ─────────────────────────────────────────── */
const cid1 = TAG + "-a";
const cid2 = TAG + "-b";
const now = new Date().toISOString();
let r = await sb.from("nomiya_sales").upsert(
  [
    {
      account_id: ACC,
      cid: cid1,
      ymd: "2026-07-01",
      name: "テスト商事",
      people: 4,
      amount: 32000,
      pay: "invoice",
      receipt: "na",
      memo: TAG,
      created_at: now,
      updated_at: now,
    },
    {
      account_id: ACC,
      cid: cid2,
      ymd: "2026-07-02",
      name: "テスト太郎",
      people: 2,
      amount: 8000,
      pay: "cash",
      receipt: "none",
      memo: TAG,
      created_at: now,
      updated_at: now,
    },
  ],
  { onConflict: "account_id,cid" }
);
check("売上を2件送れる", !r.error, r.error && r.error.message);

r = await sb.from("nomiya_sales").select("*").eq("memo", TAG);
check(
  "送った2件が読める",
  !r.error && r.data && r.data.length === 2,
  r.error || (r.data || []).length
);
const got = (r.data || []).find((x) => x.cid === cid1);
check(
  "金額・人数・支払い方法がそのまま",
  got && got.amount === 32000 && got.people === 4 && got.pay === "invoice",
  got
);

/* 同じ cid で送り直す＝増えずに上書き（二重登録しない） */
r = await sb.from("nomiya_sales").upsert(
  [
    {
      account_id: ACC,
      cid: cid1,
      ymd: "2026-07-01",
      name: "テスト商事",
      people: 4,
      amount: 33000,
      pay: "invoice",
      receipt: "na",
      memo: TAG,
      created_at: now,
      updated_at: new Date().toISOString(),
    },
  ],
  { onConflict: "account_id,cid" }
);
check("同じ売上を送り直しても増えない", !r.error, r.error && r.error.message);
r = await sb.from("nomiya_sales").select("*").eq("memo", TAG);
check(
  "上書きされて2件のまま・金額が新しい方",
  !r.error && r.data.length === 2 && r.data.find((x) => x.cid === cid1).amount === 33000,
  (r.data || []).map((x) => [x.cid, x.amount])
);

/* ── 宛先の往復 ─────────────────────────────────────────── */
const pname = TAG + " 株式会社";
r = await sb
  .from("nomiya_partners")
  .upsert([{ account_id: ACC, name: pname, honor: "御中", person: "総務部 テスト様" }], {
    onConflict: "account_id,name",
  });
check("宛先を送れる", !r.error, r.error && r.error.message);
r = await sb.from("nomiya_partners").select("*").eq("name", pname);
check(
  "宛先が読める・担当者も入る",
  !r.error && r.data.length === 1 && r.data[0].person === "総務部 テスト様",
  r.data
);

/* ── 設定（1アカウント1行）の往復 ───────────────────────── */
r = await sb
  .from("nomiya_settings")
  .upsert(
    { account_id: ACC, config: { store: TAG, rate: 0.1 }, updated_at: new Date().toISOString() },
    { onConflict: "account_id" }
  );
check("設定を送れる", !r.error, r.error && r.error.message);
r = await sb.from("nomiya_settings").select("config, updated_at").maybeSingle();
check(
  "設定が1行だけ返る・中身が合う",
  !r.error && r.data && r.data.config.store === TAG,
  r.error || r.data
);

/* ── RLS: 他人のアカウントには書けない ──────────────────── */
r = await sb.from("nomiya_sales").upsert(
  [
    {
      account_id: "00000000-0000-0000-0000-000000000000",
      cid: TAG + "-x",
      ymd: "2026-07-03",
      name: "よその店",
      people: 1,
      amount: 1,
      pay: "cash",
      receipt: "none",
      memo: TAG,
    },
  ],
  { onConflict: "account_id,cid" }
);
check("他人のアカウントでは書けない（RLSが効いている）", !!r.error, r.error && r.error.message);

/* ── 請求書番号の台帳（機種を替えても番号が続く） ───────────────── */
{
  const key = TAG + "|2026-07-01|2026-07-31";
  let r0 = await sb.from("nomiya_invoices").upsert(
    [
      {
        account_id: ACC,
        key: key,
        no: "209907-001",
        name: TAG,
        ymd_from: "2026-07-01",
        ymd_to: "2026-07-31",
      },
    ],
    { onConflict: "account_id,key" }
  );
  check("請求書番号を送れる", !r0.error, r0.error && r0.error.message);
  r0 = await sb.from("nomiya_invoices").select("*").eq("key", key);
  check(
    "番号が読める（機種を替えても続く）",
    !r0.error && r0.data.length === 1 && r0.data[0].no === "209907-001",
    r0.error || r0.data
  );
  const d0 = await sb.from("nomiya_invoices").delete().eq("key", key);
  check("自分が作った番号台帳を片付けられる", !d0.error, d0.error && d0.error.message);
}

/* ── スタッフと出勤の往復（％バック・売った額まで本当に入るか） ───── */
{
  const sid = TAG + "-st";
  const wid = TAG + "-wk";
  const rs = await sb.from("nomiya_staff").upsert(
    [
      {
        account_id: ACC,
        sid,
        name: "LIVEあかり",
        hourly: 1200,
        back: { shimei: 2000 },
        back_pct: { bottle: 15 },
        cycle: "daily",
        employ: "employee",
        memo: TAG,
        updated_at: new Date().toISOString(),
      },
    ],
    { onConflict: "account_id,sid" }
  );
  check("スタッフを入れられる（％バックの棚がある）", !rs.error, rs.error && rs.error.message);

  const rw = await sb.from("nomiya_work").upsert(
    [
      {
        account_id: ACC,
        wid,
        ymd: "2026-07-30",
        staff_id: sid,
        in_at: "20:00",
        out_at: "01:00",
        count: { shimei: 2, bottle: 1 },
        amount: { bottle: 80000 },
        memo: TAG,
        updated_at: new Date().toISOString(),
      },
    ],
    { onConflict: "account_id,wid" }
  );
  check("出勤を入れられる（売った額の棚がある）", !rw.error, rw.error && rw.error.message);

  const g1 = await sb.from("nomiya_staff").select("back, back_pct").eq("sid", sid).maybeSingle();
  check(
    "円のバックと％のバックが、そのまま戻ってくる",
    !g1.error && g1.data && g1.data.back.shimei === 2000 && g1.data.back_pct.bottle === 15,
    g1.error || g1.data
  );
  const g2 = await sb.from("nomiya_work").select("count, amount").eq("wid", wid).maybeSingle();
  check(
    "売った額が、そのまま戻ってくる",
    !g2.error && g2.data && g2.data.amount.bottle === 80000 && g2.data.count.shimei === 2,
    g2.error || g2.data
  );

  const dw = await sb.from("nomiya_work").delete().eq("wid", wid);
  const ds = await sb.from("nomiya_staff").delete().eq("sid", sid);
  check(
    "出勤とスタッフを片付けられる",
    !dw.error && !ds.error,
    (dw.error || ds.error || {}).message
  );
}

/* ── RLS: ログアウトすると自分の行も見えない（他人からは覗けない） ───── */
{
  const anon = createClient(URL, KEY, { auth: { persistSession: false } });
  const r1 = await anon.from("nomiya_sales").select("*").eq("memo", TAG);
  check(
    "ログインしていない人には1行も見えない（RLSの読み取り隔離）",
    !r1.error && (r1.data || []).length === 0,
    r1.error || r1.data
  );
  const r2 = await anon.from("nomiya_sales").insert([
    {
      account_id: ACC,
      cid: TAG + "-anon",
      ymd: "2026-07-04",
      name: "よその人",
      people: 1,
      amount: 1,
      pay: "cash",
      receipt: "none",
      memo: TAG,
    },
  ]);
  check("ログインしていない人は書けない", !!r2.error, r2.error && r2.error.message);
}

/* ── 片付け（自分が作った行だけ） ───────────────────────── */
const d1 = await sb.from("nomiya_sales").delete().eq("memo", TAG);
const d2 = await sb.from("nomiya_partners").delete().eq("name", pname);
check("自分が作った売上を片付けられる", !d1.error, d1.error && d1.error.message);
check("自分が作った宛先を片付けられる", !d2.error, d2.error && d2.error.message);
r = await sb.from("nomiya_sales").select("cid").eq("memo", TAG);
check("片付いている", !r.error && r.data.length === 0, r.data);

await sb.auth.signOut();
console.log("\n合計 " + (ok + ng) + " 件中 " + ok + " 件OK / " + ng + " 件NG");
process.exit(ng ? 1 : 0);
