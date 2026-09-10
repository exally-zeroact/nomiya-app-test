/* 知らせの箱（トースト）を ★濃い色でベタ塗りしない★ の見張り
 * ------------------------------------------------------------------------------
 * ★決まり★ 司さん 2026-09-10「全アプリでこんな濃い色使うなって言うてなかったか？」
 *   →直した形を見て「★絶対これがええ★」→「他のアプリで前みたいな重たい感じに
 *     なってる所あったら★先に直せ★」（Exally 経由で全アプリへ）
 *
 * ★何を守るか★
 *   ① 知らせの箱の 塗り（background）が ★暗くない★
 *      ＝色を ★値に直して★ 明るさ 0.299R+0.587G+0.114B を出し、★170未満なら赤★
 *      （字で "#070f22" を探す形にしない＝prettier が #ffffff→#fff に縮める・
 *        var(--x) で書かれる・大文字小文字が混ざる、で ★壊せていないのに緑★ になる）
 *   ② 塗りをやめた代わりの ★左の帯（border-left）を 必ず持つ★
 *      ＝白い箱が 背景に溶けないようにする物。★本数は焼き込まない★（増えても減っても、
 *        「塗りを持つ知らせは 帯も持つ」で見る）
 *   ③ ★薄い覆い（alpha<0.5）は 赤にしない★＝窓の後ろの黒幕まで赤くすると
 *      見張りが「狼少年」になり、切られる
 *   ④ ボタンは免除。ただし ★免除に逃げていない事★も 下の自己試験で見る
 *
 * ★この見張り自身の自己試験★（下の describe）＝
 *   わざと暗い値・薄い覆い・大文字・var() を食わせて、★捕まえる／見逃す★を両方 確かめる。
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./app-source.mjs";

/* ── 色を「値」に直す道具（字で比べない） ───────────────────────────── */
const NAMED = { white: "#ffffff", black: "#000000" };

/** #rgb / #rrggbb / rgb() / rgba() / var(--x) を {r,g,b,a} に直す。分からなければ null */
export function toRgb(value, vars = {}, depth = 0) {
  if (typeof value !== "string" || depth > 5) return null;
  let s = value.trim().toLowerCase();
  const mv = s.match(/var\(\s*(--[\w-]+)\s*(?:,([^)]*))?\)/);
  if (mv) return toRgb(vars[mv[1]] !== undefined ? vars[mv[1]] : mv[2], vars, depth + 1);
  if (NAMED[s]) s = NAMED[s];
  let m = s.match(/#([0-9a-f]{3,8})\b/);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4)
      h = h
        .slice(0, 3)
        .split("")
        .map((c) => c + c)
        .join("");
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: 1,
    };
  }
  m = s.match(/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[,/]\s*([\d.]+))?\s*\)/);
  if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
  return null;
}
export const brightness = (c) => 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
const DARK = 170; // これ未満を「濃い」とする（Exally と同じ物差し）

/* ── アプリの css / html を全部 読む（手で並べない＝足した物を見落とさない） ── */
function sources(dir = ROOT, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (
      ["node_modules", ".git", "vendor", "test-results", "playwright-report", "tests"].includes(
        e.name
      )
    )
      continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) sources(p, out);
    else if (/\.(css|html)$/i.test(e.name)) out.push(p);
  }
  return out;
}
const FILES = sources();
if (FILES.length < 2) throw new Error("css/html が読めていない（空を検査して緑にしない）");

const TEXT = FILES.map((f) => ({ file: path.relative(ROOT, f), text: fs.readFileSync(f, "utf8") }));

/** :root などに書かれた色の名前 → 値 */
const VARS = {};
for (const { text } of TEXT)
  for (const m of text.matchAll(/(--[\w-]+)\s*:\s*([^;{}]+);/g))
    if (VARS[m[1]] === undefined) VARS[m[1]] = m[2].trim();

/** 「知らせの箱」の規則を 機械で 全部 拾う（.toast / #toast / .toast-undo なども） */
export function toastRules(list = TEXT) {
  const out = [];
  for (const { file, text } of list) {
    for (const m of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const sel = m[1].trim().replace(/\s+/g, " ");
      if (!/(^|[\s,>+~(])[#.]toast[\w-]*/i.test(" " + sel)) continue;
      if (/\bbutton\b|\.btn/i.test(sel)) continue; // ボタンは免除（下で「逃げていない事」も見る）
      out.push({ file, sel, body: m[2], line: text.slice(0, m.index).split("\n").length });
    }
  }
  return out;
}
const RULES = toastRules();

const decl = (body, name) =>
  [...body.matchAll(new RegExp(`(?:^|;|\\s)${name}\\s*:\\s*([^;]+)`, "gi"))].map((x) =>
    x[1].trim()
  );

describe("知らせの箱を 濃い色で ベタ塗りしない（値で数える）", () => {
  it("★そもそも 知らせの箱の規則が 見つかっている★（0本なら 何も見ていない）", () => {
    expect(RULES.length, "toast の規則が1本も拾えていない＝見張りが空振り").toBeGreaterThan(0);
  });

  it("★塗りが 暗くない（明るさ170未満が 0件）★", () => {
    const dark = [];
    for (const r of RULES)
      for (const v of decl(r.body, "background(?:-color)?")) {
        const c = toRgb(v, VARS);
        if (!c || c.a < 0.5) continue; // 薄い覆いは 赤にしない
        if (brightness(c) < DARK)
          dark.push(`${r.file}:${r.line} ${r.sel} = ${v} → 明るさ${Math.round(brightness(c))}`);
      }
    expect(dark, `濃い塗りの知らせ ${dark.length} 件:\n` + dark.join("\n")).toEqual([]);
  });

  it("★塗りを持つ知らせは 左の帯も持つ（数は焼き込まない）★", () => {
    const naked = [];
    for (const r of RULES) {
      const bg = decl(r.body, "background(?:-change)?(?:-color)?").filter((v) => {
        const c = toRgb(v, VARS);
        return c && c.a >= 0.5;
      });
      if (!bg.length) continue;
      const hasBar = /border-left\s*:\s*[^;]*\d+px/i.test(r.body);
      if (!hasBar) naked.push(`${r.file}:${r.line} ${r.sel}`);
    }
    expect(naked, `塗りは在るのに 左の帯が無い ${naked.length} 件:\n` + naked.join("\n")).toEqual(
      []
    );
  });
});

describe("見張り自身の自己確認（★捕まえる／見逃す を 両方 見る★）", () => {
  const mk = (body, sel = ".toast") => [{ file: "＜作り物＞", text: `${sel}{${body}}` }];
  const darkCount = (list) => {
    let n = 0;
    for (const r of toastRules(list))
      for (const v of decl(r.body, "background(?:-color)?")) {
        const c = toRgb(v, VARS);
        if (c && c.a >= 0.5 && brightness(c) < DARK) n++;
      }
    return n;
  };

  it("★書き方が変わっても 捕まえる★（#rrggbb／縮めた#fff級／rgb()／RGBA大文字／var()）", () => {
    expect(darkCount(mk("background:#0f1728;")), "#rrggbb").toBe(1);
    expect(darkCount(mk("background:#123;")), "縮めた3桁").toBe(1);
    expect(darkCount(mk("background: rgb(15, 23, 40);")), "rgb()").toBe(1);
    expect(darkCount(mk("BACKGROUND: RGBA(15,23,40,1);")), "大文字").toBe(1);
    expect(darkCount(mk("background-color:var(--c-hd);")), "var() を :root までたどる").toBe(1);
    expect(darkCount(mk("background:#070F22;", "#toast")), "#toast も見る").toBe(1);
    expect(darkCount(mk("background:#0f1728;", ".toast-undo")), "★.toast-undo も見る★").toBe(1);
  });

  it("★見逃してよい物は 赤にしない★（白／薄い覆い／ボタン）", () => {
    expect(darkCount(mk("background:#fff;")), "白").toBe(0);
    expect(darkCount(mk("background:var(--c-card);")), "白（名前ごし）").toBe(0);
    expect(darkCount(mk("background:rgba(0,0,0,.3);")), "薄い覆いは狼少年にしない").toBe(0);
    expect(darkCount(mk("background:#0f1728;", ".toast .btn")), "ボタンは免除").toBe(0);
  });

  it("★免除に逃げていない★＝ボタン免除は「.btn/button を含む規則」だけ", () => {
    // 免除の当たり判定が広すぎると、知らせ本体まで素通りする
    expect(toastRules(mk("background:#0f1728;", ".toast")).length, "本体は免除しない").toBe(1);
    expect(toastRules(mk("background:#0f1728;", ".toast-bar")).length, "似た名前も本体扱い").toBe(
      1
    );
    expect(toastRules(mk("background:#0f1728;", ".toast button")).length, "ボタンだけ免除").toBe(0);
  });

  it("★色の名前（var）が 解けなければ 黙って通さない★", () => {
    expect(toRgb("var(--no-such-color)", VARS), "知らない名前は null＝『分かった』と言わない").toBe(
      null
    );
  });
});
