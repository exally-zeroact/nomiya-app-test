/* supa-config-env-matches-repo.test.mjs — ★repo の 素性と 倉庫の 向き先が 食い違ったら 赤★
 * =============================================================================
 * ★なぜ 要るか（2026-09-12 Rakunally で 実際に 客に 見えた）★
 *   本番へ 運んだ時に ★テスト線の js/supa-config.js が 本番に 紛れ込み★、
 *   本番の 入口に「テスト環境」の 帯が 出て、★客の 書き込み先が 試験用の 倉庫★に なった。
 *   飲み屋(Castally)は ★2つの repo で 違うのは この紙 1本だけ★なので、同じ事が 起きうる。
 *
 * ★env だけを 見ても 捕まらない★
 *   紙の 中だけ 見ると、url も env も ★丸ごと★ 入れ替わった時は 中で 辻褄が 合う。
 *   ⇒ ★外から 来る 事実＝git の origin の 名前★ と 突き合わせる。
 *        …-test で 終わる → テスト線（env=test・倉庫=khawd…）
 *        それ以外        → 本番    （env=prod・倉庫=tnfwip…）
 *
 * ★「反対側の 名前が 在る＝悪い」では ない★
 *   本番の 紙の 頭には 説明として テスト倉庫の ref が 書いてある（逆も 同じ）。
 *   ⇒ ★覚書は 数えない★。window.SUPA の 中身だけを 見る（scripts/repo-env.mjs）。
 *     素朴に 字を 拾う 道具は ここで 偽の赤を 出す（2026-09-14 実測）。
 *
 * 使い方: node tests/supa-config-env-matches-repo.test.mjs
 *         node tests/supa-config-env-matches-repo.test.mjs --self-test
 *   ★わざと壊すのは 仮の場所(os.tmpdir)だけ★＝この repo の 紙は 1バイトも 触らない。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { envOf, refOf, keyOf, refInKey } from "../scripts/repo-env.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/* ★この線が 向く べき 倉庫★（公開鍵と同じく 客の画面に 出ている 値＝隠し事では ない） */
export const KURA = { prod: "tnfwipbgfgjaymlszeid", test: "khawdrnvssdenumbiwfg" };

/* ★origin の 名前★（.git を 落とす）。読めなければ 空 */
export function originName(root) {
  try {
    const u = execFileSync("git", ["-C", root, "remote", "get-url", "origin"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const last = u.split("/").pop() || "";
    return last.replace(/[.]git$/, "");
  } catch {
    return "";
  }
}

/* ★物差しそのもの★＝名前と 紙の中身を 渡すと「よいか」を 返す（git を 使わずに 確かめられる 形） */
export function au(name, env, ref, kagiRef) {
  if (!name) return { ok: false, naze: "origin の 名前が 読めない（★読めない物を 緑に しない★）" };
  const hoshii = /-test$/.test(name) ? "test" : "prod";
  const hoshiiKura = KURA[hoshii];
  if (env !== "test" && env !== "prod")
    return { ok: false, hoshii, naze: "env が test でも prod でも ない: " + JSON.stringify(env) };
  if (env !== hoshii)
    return {
      ok: false,
      hoshii,
      naze: "★repo は " + name + " なのに 名札が " + env + "★（欲しい " + hoshii + "）",
    };
  if (!ref) return { ok: false, hoshii, naze: "★倉庫の url が 読めない★（未測定を 緑に しない）" };
  if (ref !== hoshiiKura)
    return {
      ok: false,
      hoshii,
      naze: "★repo は " + name + " なのに 倉庫が " + ref + "★（欲しい " + hoshiiKura + "）",
    };
  /* 鍵が JWT の時だけ 見る＝url だけ 差し替えた 時に 捕まえる。JWT でなければ 見ない */
  if (kagiRef && kagiRef !== ref)
    return {
      ok: false,
      hoshii,
      naze: "★url の 倉庫(" + ref + ")と 鍵の中の 倉庫(" + kagiRef + ")が 食い違う★",
    };
  return { ok: true, hoshii };
}

/* 紙1枚から まとめて 測る（実物でも 仮の紙でも 同じ道を 通す） */
export function miru(name, src) {
  return au(name, envOf(src), refOf(src), refInKey(keyOf(src)));
}

if (process.argv.includes("--self-test")) {
  console.log("[supa-config-env-matches-repo --self-test] わざと 食い違わせたら 赤に なるか");
  let ng = 0;
  const iu = (nm, good) => {
    if (!good) ng++;
    console.log("  " + (good ? "OK" : "NG") + " " + nm + (good ? "" : "  ★思っていたのと 違う★"));
  };

  /* ── ①物差しだけで ─────────────────────────────────────────── */
  iu("本番 x 本番 … 緑（★狼少年に しない★）", au("nomiya-app", "prod", KURA.prod).ok);
  iu("テスト線 x テスト線 … 緑", au("nomiya-app-test", "test", KURA.test).ok);
  iu("★env だけ 入れ替わり … 赤★", !au("nomiya-app", "test", KURA.prod).ok);
  iu("★url だけ 入れ替わり … 赤★", !au("nomiya-app", "prod", KURA.test).ok);
  iu("★丸ごと 入れ替わり(09-12 の 形) … 赤★", !au("nomiya-app", "test", KURA.test).ok);
  iu("origin が 読めない … 赤（★未測定を 緑に しない★）", !au("", "prod", KURA.prod).ok);
  iu("名札が 空 … 赤", !au("nomiya-app", "", KURA.prod).ok);
  iu("知らない 名札 … 赤", !au("nomiya-app", "staging", KURA.prod).ok);
  iu("url が 読めない … 赤", !au("nomiya-app", "prod", "").ok);
  iu("★鍵の中の 倉庫だけ 違う … 赤★", !au("nomiya-app", "prod", KURA.prod, KURA.test).ok);
  iu("鍵が JWT で ない(空) … 見ない＝緑", au("nomiya-app-test", "test", KURA.test, "").ok);

  /* ── ②本物の 紙を 使って（★覚書に 相手の ref が 在る 紙★で 偽の赤が 出ないか）──── */
  const honmono = fs.readFileSync(path.join(ROOT, "js", "supa-config.js"), "utf8");
  const nakami = honmono.indexOf("window.SUPA");
  const oboegaki = honmono.slice(0, nakami);
  const aite = originName(ROOT).match(/-test$/) ? KURA.prod : KURA.test;
  iu("★本物の 紙の 覚書に 相手の 倉庫の 名前が 在る（前提の 確認）★", oboegaki.indexOf(aite) >= 0);
  iu("★それでも 緑（覚書を 数えない）★", miru(originName(ROOT), honmono).ok);

  /* ── ③仮の repo を 作って 紙ごと 入れ替える（★本物は 触らない★）─────────── */
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "supacfg-"));
  const D = String.fromCharCode(34);
  const nl = String.fromCharCode(10);
  const kami = (env, ref) =>
    "/* テスト用DB(" + (ref === KURA.prod ? KURA.test : KURA.prod) + ")とは別の倉庫 */" + nl +
    "window.SUPA = {" + nl +
    "  env: " + D + env + D + "," + nl +
    "  url: " + D + "https://" + ref + ".supabase.co" + D + "," + nl +
    "  key: " + D + "sb_publishable_dummy" + D + "," + nl +
    "};" + nl;
  const tsukuru = (namae, env, ref) => {
    const d = path.join(tmp, namae);
    fs.mkdirSync(path.join(d, "js"), { recursive: true });
    fs.writeFileSync(path.join(d, "js", "supa-config.js"), kami(env, ref));
    execFileSync("git", ["-C", d, "init", "-q"], { stdio: "ignore" });
    execFileSync("git", ["-C", d, "remote", "add", "origin", "https://github.com/x/" + namae + ".git"], {
      stdio: "ignore",
    });
    return d;
  };
  const yomu = (d) => miru(originName(d), fs.readFileSync(path.join(d, "js", "supa-config.js"), "utf8"));
  const honban = tsukuru("nomiya-app", "prod", KURA.prod);
  const tesuto = tsukuru("nomiya-app-test", "test", KURA.test);
  iu("仮の 本番 … 緑", yomu(honban).ok);
  iu("仮の テスト線 … 緑", yomu(tesuto).ok);
  /* ★09-12 と 同じ手＝テスト線の 紙を 本番へ そのまま 置く★ */
  fs.copyFileSync(path.join(tesuto, "js", "supa-config.js"), path.join(honban, "js", "supa-config.js"));
  iu("★テスト線の 紙を 本番に 置いたら 赤★", !yomu(honban).ok);
  fs.rmSync(tmp, { recursive: true, force: true });

  console.log(ng ? "★自己確認 " + ng + "件 おかしい★" : "自己確認 OK（わざと 壊すと 赤に なる）");
  process.exit(ng ? 1 : 0);
}

const name = originName(ROOT);
const src = fs.readFileSync(path.join(ROOT, "js", "supa-config.js"), "utf8");
const r = miru(name, src);
console.log("[supa-config-env-matches-repo] repo の 素性と 倉庫の 向き先が 合っているか");
console.log("  origin の 名前 … " + (name || "（読めない）"));
console.log("  名札 env … " + (envOf(src) || "（読めない）"));
console.log("  倉庫 url … " + (refOf(src) || "（読めない）"));
console.log("  欲しい … " + (r.hoshii ? r.hoshii + " / " + KURA[r.hoshii] : "（決められない）"));
if (r.ok) {
  console.log("  OK 合っている");
  process.exit(0);
}
console.log("  NG " + r.naze);
console.log("    ★直し方★ この repo の js/supa-config.js を この線の 値に 戻す。");
console.log("    ★この紙は 2つの repo で 違ってよい 3か所の 1つ★＝運ぶ時に 持ち込まない。");
process.exit(1);
