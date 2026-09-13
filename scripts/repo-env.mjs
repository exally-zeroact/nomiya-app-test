/* repo-env.mjs — ★この repo は テスト線か 本番か★ を1か所で答える道具
 * =============================================================================
 * なぜ要るか（2026-08-26 請求書を本番へ出した日）:
 *   同じ見張りを ★テスト線(rakually-test)と 本番(rakually)の両方★ で走らせる事にした。
 *   見張りの中で「どちらか」を判定する所が増えると、★同じ読み方を何本もコピーする★事になり、
 *   1本だけ直し忘れて ★本番で判定が逆になる★（帯を出す・タイルを出す）。だから1か所に置く。
 *
 * ★覚書の中の env は 数えない★
 *   js/supa-config.js には「本番の supa-config.js は 本番の名札」という★説明の行★が在る。
 *   素朴に字を拾うと ★テスト線なのに 本番と読む★（2026-08-26 実際に踏んだ）。
 *   ⇒ ★window.SUPA の中身だけ★ を見る。
 *
 * ★このファイルには クォート文字を 入れ子で書かない★
 *   見張り(scripts/tests-registered.mjs)は 字を追って文字列を切り分けるので、
 *   文字列の中の ' や 逃がした \' が有ると ★そこから先の一覧を全部 見失う★
 *   （2026-08-26 実測：それで「走らせる一覧が読めません」の赤が出た）。
 *   ⇒ クォートが要る所は 下の Q を足して組み立てる。
 *
 * 使い方:
 *   import { repoEnv } from '../scripts/repo-env.mjs';
 *   const env = repoEnv(ROOT);      // test | prod | 空（読めない）
 *   node scripts/repo-env.mjs            … この repo の名札を出す
 *   node scripts/repo-env.mjs --self-test … わざと紛らわしい物を食わせて 読み違えないか
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const Q = String.fromCharCode(39); /* ' … 入れ子で書かないための逃がし場 */

/* ★window.SUPA の 中身だけ★を 切り出す（覚書は この外に在るので 拾わない） */
export function supaBody(src) {
  const s = String(src == null ? "" : src);
  const i = s.indexOf("window.SUPA");
  if (i < 0) return "";
  const close = s.indexOf("}", i);
  return s.slice(i, close < 0 ? s.length : close);
}

/* ★中身(window.SUPA = { ... })だけを見る★＝覚書に書いた名札は拾わない */
export function envOf(src) {
  /* ★切り出しは supaBody 1か所★＝同じ事を 2通りで 書くと 片方だけ 直し忘れる */
  const body = supaBody(src);
  /* ★飲み屋だけの直し（2026-08-28）★ 正本(Rakually)は ' だけを見る。
     この repo は prettier が二重引用符に揃えるので ★どちらの囲みでも読む★ ようにした。
     （囲みは字で書かず 文字コードから作る＝tests-registered の字読みを壊さない） */
  const D = String.fromCharCode(34);
  const m = body.match(new RegExp("env\\s*:\\s*[" + Q + D + "]([a-z]+)[" + Q + D + "]"));
  return m ? m[1] : "";
}

/* ★倉庫の ref★＝url(https://<ref>.supabase.co) の <ref> だけを返す。
   ★覚書の中の ref は 拾わない★＝本番の supa-config.js の頭には
   テスト倉庫の ref が 説明として 書いてある（2026-09-14 実測）。
   素朴に字を拾うと ★本番から テストの ref も 当たる＝偽の赤★ になる。
   ⇒ envOf と同じく window.SUPA の中身だけを見る。 */
export function refOf(src) {
  const body = supaBody(src);
  if (body.indexOf("url") < 0) return "";
  const atama = "https://", oshiri = ".supabase.co";
  const a = body.indexOf(atama);
  if (a < 0) return "";
  const b = body.indexOf(oshiri, a);
  if (b < 0) return "";
  const ref = body.slice(a + atama.length, b);
  return /^[a-z0-9]+$/.test(ref) ? ref : "";
}

/* ★公開鍵★（中身だけ）。JWT の時は 中に ref が入っているので 突き合わせに使う */
export function keyOf(src) {
  const body = supaBody(src);
  const ki = body.indexOf("key");
  if (ki < 0) return "";
  const c = body.indexOf(":", ki);
  if (c < 0) return "";
  const D = String.fromCharCode(34);
  let k = -1,
    kako = "";
  for (let n = c + 1; n < body.length; n++) {
    const ch = body.charAt(n);
    if (ch === Q || ch === D) {
      k = n;
      kako = ch;
      break;
    }
    if (ch !== " " && ch !== String.fromCharCode(10) && ch !== String.fromCharCode(13)) return "";
  }
  if (k < 0) return "";
  const e = body.indexOf(kako, k + 1);
  return e < 0 ? "" : body.slice(k + 1, e);
}

/* JWT(3つに ピリオドで 割れる)の 真ん中に 入っている ref。JWT でなければ 空＝見ない */
export function refInKey(key) {
  const k = String(key == null ? "" : key);
  const part = k.split(".");
  if (part.length !== 3) return "";
  try {
    const j = JSON.parse(Buffer.from(part[1], "base64").toString("utf8"));
    return String(j.ref || "");
  } catch {
    return "";
  }
}

export function repoEnv(root) {
  const p = path.join(root, "js/supa-config.js");
  if (!fs.existsSync(p)) return "";
  return envOf(fs.readFileSync(p, "utf8"));
}

/* ★test でも prod でもない時は 黙って通さない★ */
export function assertEnv(env) {
  if (env !== "test" && env !== "prod") {
    throw new Error("js/supa-config.js の env が test でも prod でもない: " + JSON.stringify(env));
  }
  return env;
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");

/* ★自分が「呼ばれた本人」の時だけ 道具として動く★
   ＝これを見ないと、--self-test 付きで走らせた ★別の見張りが この中で exit(0) して緑になる★
   （2026-08-26 実測：env-badge と no-hardcoded-supa の自己確認が この道具の自己診断に
     すり替わり、★本体を1つも見ないまま緑★ になっていた）。 */
const IS_MAIN =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

/* ★走らせる物の一覧★（見張りが読める形で 1行に書く） */
const CALLER = "scripts/_repo-env-caller.mjs";

if (IS_MAIN && process.argv.includes("--self-test")) {
  console.log("\n[repo-env --self-test] 紛らわしい物を食わせて 読み違えないか");
  let p = 0,
    f = 0;
  const S = (want, got, why) => {
    if (want === got) {
      p++;
      console.log("  ✓ " + why);
    } else {
      f++;
      console.log(
        "  ✗ " + why + "（欲しい " + JSON.stringify(want) + " / 出た " + JSON.stringify(got) + "）"
      );
    }
  };
  const nl = String.fromCharCode(10);
  const cfg = (e) => "window.SUPA = {" + nl + "  env: " + Q + e + Q + nl + "};";
  const note = (e) => "/* 本番の supa-config.js は env: " + Q + e + Q + " */";
  S("test", envOf(cfg("test")), "ふつうに読める(テスト線)");
  S("prod", envOf(cfg("prod")), "ふつうに読める(本番)");
  /* ★2026-08-26 に踏んだ型★＝覚書に書いた名札を拾って テスト線を本番と読む */
  S("test", envOf(note("prod") + nl + cfg("test")), "★覚書の中の名札に釣られない★");
  S("", envOf(note("prod")), "中身が無ければ 空を返す（勝手に決めない）");
  S("", envOf(""), "空なら 空");
  S("", envOf(null), "null でも落ちない");
  let threw = 0;
  try {
    assertEnv("");
  } catch {
    threw = 1;
  }
  S(1, threw, "★名札が無ければ 赤にする★");
  threw = 0;
  try {
    assertEnv("staging");
  } catch {
    threw = 1;
  }
  S(1, threw, "★知らない名札は 赤にする★");
  /* ── ★倉庫の ref を 読む口★（2026-09-14 追加）─────────────────────── */
  const D2 = String.fromCharCode(34);
  const cfgU = (e, ref) =>
    "window.SUPA = {" + nl + "  env: " + Q + e + Q + "," + nl +
    "  url: " + D2 + "https://" + ref + ".supabase.co" + D2 + "," + nl + "};";
  /* ★本番の紙の 頭には テスト倉庫の ref が 説明として 書いてある（実物と同じ形）★ */
  const noteRef = (ref) => "/* テスト用DB(" + ref + ")とは別の倉庫を指す */";
  S("tnfwipbgfgjaymlszeid", refOf(cfgU("prod", "tnfwipbgfgjaymlszeid")), "url の ref が読める");
  S(
    "tnfwipbgfgjaymlszeid",
    refOf(noteRef("khawdrnvssdenumbiwfg") + nl + cfgU("prod", "tnfwipbgfgjaymlszeid")),
    "★覚書に書いた 相手の ref に 釣られない★"
  );
  S("", refOf("window.SUPA = { env: " + Q + "prod" + Q + " };"), "url が無ければ 空（勝手に決めない）");
  S("", refOf(""), "空なら 空");
  /* ★公開鍵の 中の ref★＝url だけ差し替えた 事故を 捕まえる為 */
  const mkJwt = (ref) =>
    "aaa." + Buffer.from(JSON.stringify({ ref: ref })).toString("base64") + ".bbb";
  S("tnfwipbgfgjaymlszeid", refInKey(mkJwt("tnfwipbgfgjaymlszeid")), "JWT の中の ref が読める");
  S("", refInKey("sb_publishable_xxxxx"), "JWT でない鍵は 空＝見ない（狼少年にしない）");
  S("", refInKey(""), "鍵が空でも 落ちない");

  const here = repoEnv(ROOT);
  S(
    true,
    here === "test" || here === "prod",
    "この repo の名札が 読めている（" + JSON.stringify(here) + "）"
  );
  /* ★取り込まれた時に 勝手に道具として動かない★（別の見張りを緑にすり替えない）
     ＝実際に「--self-test 付きで走る別のファイル」から取り込んで 確かめる。 */
  let out = "";
  try {
    out = execFileSync(process.execPath, [CALLER, "--self-test"], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: "pipe",
    });
  } catch {
    out = String((e.stdout || "") + (e.stderr || ""));
  }
  S(
    true,
    out.indexOf("よそから取り込んだ: test") >= 0,
    "★取り込んだ側が 最後まで走る（途中で exit されない）★"
  );
  S(
    false,
    out.indexOf("[repo-env --self-test]") >= 0,
    "★取り込まれた時は 道具として動かない（別の見張りを緑にすり替えない）★"
  );
  console.log("\n[self-test] " + p + " passed, " + f + " failed");
  process.exit(f ? 1 : 0);
}

if (IS_MAIN) {
  const e = repoEnv(ROOT);
  console.log(
    "この repo の名札(env) = " +
      JSON.stringify(e) +
      (e === "prod" ? "  ★本番★" : e === "test" ? "  ★テスト線★" : "  ★読めない★")
  );
  process.exit(e ? 0 : 1);
}
