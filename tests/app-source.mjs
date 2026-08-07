/* app-source.mjs — 「アプリの中身はどこに書いてあるか」を1か所に集める。
 * ------------------------------------------------------------------------------
 * ★なぜ要るか★
 *   見た目や名前の見張り（nomiya-brand / nomiya-deploy）は、これまで
 *   nomiya-uriage.html を「文字として」読み、その中を indexOf / 正規表現で切っていた。
 *   画面のCSSやJSを別ファイルへ出すと、
 *       HTML.indexOf("<style>")            → -1
 *       HTML.slice(HTML.indexOf("</style>")) → 空文字
 *       matchAll(/var K_\w+ = "…"/)        → 0件
 *   になり、★何も見ていないのに緑になる★。空を検査しても赤くならないからだ。
 *   （司さんの決まり: 空の 200+[] は「安全」ではなく「未検査」）
 *
 * ★この道具の約束★
 *   ① 中身が1ファイルでも複数ファイルでも、同じ物を返す
 *   ② ★中身が取れなかったら、その場で例外を投げて赤くする★（空を返さない）
 *   ③ HTMLが読み込んでいる分割ファイルと、実際に置いてある分割ファイルが
 *      食い違っていたら赤くする（片方だけ足した／消したを見逃さない）
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

/** 空だったら黙って通さない。取れなかった物は必ず赤にする。 */
function must(name, text, min) {
  if (typeof text !== "string" || text.length < min) {
    throw new Error(
      `${name} が取れない（${text ? text.length : 0}文字 / ${min}文字以上あるはず）。` +
        `分割でファイルの置き場所が変わったのに、この道具を直していない可能性がある。`
    );
  }
  return text;
}

export const HTML = must("nomiya-uriage.html", read("nomiya-uriage.html"), 10000);

/* ── HTML の中の <script> を、src 付き（外を読む）と 中身入り に分ける ───────── */
const SCRIPT_TAGS = [...HTML.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
/** HTML が読んでいる同じrepo内のJSファイル（?v=… は外して見る・読んでいる順） */
export const SCRIPT_SRCS = SCRIPT_TAGS.map((m) => (m[1].match(/\bsrc\s*=\s*"([^"]+)"/i) || [])[1])
  .filter(Boolean)
  .map((s) => s.split("?")[0]) // ★?v=<SHA> が付いても同じに見えるようにする★
  .filter((s) => !/^https?:/i.test(s)); // 外のCDNは対象外
/** HTML に直接書いてある JS（分割前はここに全部入っている） */
const INLINE_JS = SCRIPT_TAGS.filter((m) => !/\bsrc\s*=/i.test(m[1]))
  .map((m) => m[2])
  .join("\n");

/* ── 画面のCSS ────────────────────────────────────────────────────────────────
   分割前 = HTML の最初の <style>〜</style>
   分割後 = nomiya-uriage.css
   ※A4の紙のCSS(SHEET_CSS)は別物。ここには含めない（紙は白地に黒のままにする決まり）。 */
const CSS_FILE = "nomiya-uriage.css";
export const HAS_CSS_FILE = fs.existsSync(path.join(ROOT, CSS_FILE));
export const SCREEN_CSS = must(
  "画面のCSS",
  HAS_CSS_FILE
    ? read(CSS_FILE)
    : (() => {
        const i = HTML.indexOf("<style>");
        const j = HTML.indexOf("</style>", i);
        return i < 0 || j < 0 ? "" : HTML.slice(i + 7, j);
      })(),
  20000
);

/* ── 画面を作っているJS ───────────────────────────────────────────────────────
   分割前 = HTML の中に直接書いてある塊
   分割後 = nomiya-ui-*.js（HTMLが読んでいる順）
   ※もともと外に出ていた物（supa-config / exally-login / hanko / nomiya-core）は
     この見張りの対象ではないので入れない（分割前と同じ範囲を保つ）。 */
const UI_PREFIX = "nomiya-ui-";
export const UI_FILES = SCRIPT_SRCS.filter((s) => path.basename(s).startsWith(UI_PREFIX));

// ★HTMLが読んでいる物と、実際に置いてある物が食い違っていたら赤★
const ON_DISK = fs
  .readdirSync(ROOT)
  .filter((f) => f.startsWith(UI_PREFIX) && f.endsWith(".js"))
  .sort();
{
  const loaded = UI_FILES.map((f) => path.basename(f)).sort();
  const missing = loaded.filter((f) => !ON_DISK.includes(f));
  const orphan = ON_DISK.filter((f) => !loaded.includes(f));
  if (missing.length || orphan.length) {
    throw new Error(
      "分割ファイルの食い違い: " +
        (missing.length ? "HTMLが読んでいるのに無い[" + missing.join(",") + "] " : "") +
        (orphan.length ? "置いてあるのにHTMLが読んでいない[" + orphan.join(",") + "]" : "")
    );
  }
}

export const PAGE_JS = must(
  "画面を作っているJS",
  UI_FILES.length ? UI_FILES.map((f) => read(f)).join("\n") : INLINE_JS,
  100000
);

/* ── 「画面のCSSより後ろ、ぜんぶ」──────────────────────────────────────────────
   前は HTML.slice(HTML.indexOf("</style>")) で作っていた範囲。
   画面の飾り(sheetCss/invSkin)・body・JS が入る。分割後も同じ範囲になるように、
   HTMLの残り＋分割したJS をつないで返す。 */
export const REST = must(
  "画面のCSSより後ろ",
  (HAS_CSS_FILE ? HTML : HTML.slice(HTML.indexOf("</style>"))) + "\n" + PAGE_JS,
  100000
);

/** 分割が済んでいるか（数字を報告に出すため） */
export const LAYOUT = {
  split: HAS_CSS_FILE || UI_FILES.length > 0,
  cssFile: HAS_CSS_FILE ? CSS_FILE : "(HTMLの中)",
  uiFiles: UI_FILES.length ? UI_FILES : ["(HTMLの中)"],
  htmlLines: HTML.split(/\r?\n/).length,
  cssChars: SCREEN_CSS.length,
  jsChars: PAGE_JS.length,
};
