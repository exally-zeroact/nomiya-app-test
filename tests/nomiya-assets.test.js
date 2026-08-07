/* 配るページが読む js/css の「版」を見張る。
 * ------------------------------------------------------------------------------
 * ★何を守るか★
 *   ① 同じrepoの js/css は、必ず ?v=<中身のハッシュ> 付きで読む
 *   ② その版が、いまのファイルの中身と一致している
 *      （中身を直したのに版を押し忘れる＝古い物を掴んだままになる、を止める）
 *   ③ HTMLが読んでいるファイルが、実際に置いてある
 *
 * ★直し方★  npm run stamp
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ROOT, HTML } from "./app-source.mjs";
import { assetRefs, versionOf } from "../scripts/stamp-assets.mjs";

const REFS = assetRefs(HTML);

/** PNGの実寸を、余計な物を入れずに読む（先頭のIHDRに書いてある） */
function pngSize(rel) {
  const b = fs.readFileSync(path.join(ROOT, rel));
  if (b.slice(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error(rel + " はPNGでない");
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), bytes: b.length };
}

describe("配る js/css の版（?v=）", () => {
  it("同じrepoの js/css を1本以上読んでいる（読み方を変えたら気づく）", () => {
    expect(REFS.length, "js/css の読み込みが1本も見つからない").toBeGreaterThanOrEqual(5);
  });

  it("読んでいるファイルが、実際に置いてある", () => {
    const missing = REFS.filter((r) => !fs.existsSync(path.join(ROOT, r.file))).map((r) => r.file);
    expect(missing, "HTMLが読んでいるのに置いていない: " + missing.join(" ")).toEqual([]);
  });

  it("★全部に ?v= が付いている★", () => {
    const bare = REFS.filter((r) => !/\?v=[0-9a-f]{8}$/.test(r.raw)).map((r) => r.raw);
    expect(bare, "版が付いていない: " + bare.join(" ") + "（npm run stamp）").toEqual([]);
  });

  it("★版が、いまの中身と一致している（押し忘れたら赤）★", () => {
    const stale = [];
    for (const r of REFS) {
      if (!fs.existsSync(path.join(ROOT, r.file))) continue;
      const want = versionOf(ROOT, r.file);
      const got = (r.raw.match(/\?v=([0-9a-f]{8})$/) || [])[1];
      if (got !== want) stale.push(`${r.file} は ?v=${got} だが 中身は ${want}`);
    }
    expect(stale, stale.join(" / ") + "（npm run stamp で直る）").toEqual([]);
  });

  /* ★2026-08-07 実測★
     分割した直後、8本のJSが ★完全に直列★ で取られていた（1本25msずつ順番待ち＝312ms）。
     初めて開く人の DOMContentLoaded が 484ms → 720ms に悪化した。
     defer を付けると、並び順は保ったまま同時に取りに行くので、この待ちが消える。
     ★誰かが defer を外すと、また遅くなる。だからここで縛る★ */
  it("★配るJSは全部 defer（並び順は保ったまま同時に取る＝初回が遅くならない）★", () => {
    const tags = [...HTML.matchAll(/<script\b([^>]*)>/gi)].map((m) => m[1]);
    const withSrc = tags.filter((a) => /\bsrc\s*=/.test(a));
    expect(withSrc.length, "読み込んでいるJSが無い").toBeGreaterThanOrEqual(5);
    const noDefer = withSrc.filter((a) => !/\bdefer\b/.test(a));
    expect(
      noDefer.map((a) => (a.match(/src\s*=\s*"([^"]+)"/) || [])[1]),
      "defer が付いていない（初回の読み込みが直列になって遅くなる）"
    ).toEqual([]);
  });

  /* ★2026-08-07 実測★
     ログインのロゴは 512x512・250KB だったが、画面では ★82px の高さ★ でしか出していない。
     いちばん細かい端末(DPR3)でも 246px あれば足りる＝512は倍以上の無駄だった。
     256x256 に直したら 250KB → 88KB（66%減）。
     ★実際に出す大きさ(164px/246px)で1画素ずつ突き合わせて「ずれ0」を確認済み★＝見た目は変えていない。
     ここで縛るのは「また大きい画像を積まない」ため。
     ※ホーム画面用の icons/icon-*.png は別物（512のままで正しい）。 */
  it("★ログインのロゴは、画面で出す大きさに見合っている（大きい画像を積まない）★", () => {
    const rel = "icons/logo-castally.png";
    expect(fs.existsSync(path.join(ROOT, rel)), rel + " が無い").toBe(true);
    const { w, h, bytes } = pngSize(rel);
    // 画面は 82px（exally-login.js の .login-mark）。DPR3 でも 246px で足りる
    expect(w, `ロゴが大きすぎる（${w}px）。画面は82px＝DPR3でも246pxで足りる`).toBeLessThanOrEqual(
      256
    );
    expect(h).toBeLessThanOrEqual(256);
    expect(w, "ロゴが小さすぎる（DPR3でぼやける）").toBeGreaterThanOrEqual(246);
    expect(bytes, `ロゴが重い（${Math.round(bytes / 1024)}KB）`).toBeLessThanOrEqual(120000);
  });

  it("ホーム画面のアイコンは 512 のまま（ロゴと一緒に縮めない）", () => {
    const { w, h } = pngSize("icons/icon-512.png");
    expect([w, h], "ホーム画面のアイコンが512でない").toEqual([512, 512]);
  });

  it("★画面のJS(nomiya-ui-*.js)は、起動(boot)を最後に読む★", () => {
    const ui = REFS.map((r) => r.file).filter((f) => f.startsWith("nomiya-ui-"));
    expect(ui.length, "画面のJSを1本も読んでいない").toBeGreaterThanOrEqual(2);
    expect(ui[ui.length - 1], "起動が最後に読まれていない: " + ui.join(" → ")).toBe(
      "nomiya-ui-boot.js"
    );
  });
});
