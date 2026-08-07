/* stamp-assets.mjs — 配るページが読む js/css に「版」を押す。
 * ------------------------------------------------------------------------------
 *  使い方:  npm run stamp
 *
 * ★何をするか★
 *   nomiya-uriage.html の <script src> と <link href> のうち、同じrepoの物に
 *   `?v=<中身のハッシュ8桁>` を付け直す。中身が変われば版も変わる。
 *
 * ★なぜ要るか★
 *   ① 画面のJSを7本に分けたので、「HTMLだけ新しくてJSが古い」組合せが増えた。
 *      版が付いていれば、古い物を掴んだままにならない。
 *   ② 版が付いていると、その1本を ずっと持っていてよい物として扱える
 *      （vercel.json で immutable にしてある）＝★2回目からは取りに行かない＝速い★
 *
 * ★手で書かない★
 *   版を手で書くと、必ずどこかで書き忘れて「古い版のまま中身だけ変わった」が起きる。
 *   だから機械で押して、機械で見張る（tests/nomiya-assets.test.js が食い違いを赤くする）。
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "nomiya-uriage.html";

/** そのファイルの中身から版を作る（中身が同じなら版も同じ） */
export function versionOf(root, rel) {
  const buf = fs.readFileSync(path.join(root, rel));
  return crypto.createHash("sha256").update(buf).digest("hex").slice(0, 8);
}

/** HTMLの中の「同じrepoの js/css への参照」を全部見つける */
export function assetRefs(html) {
  const out = [];
  const re = /(<script\b[^>]*\bsrc\s*=\s*"|<link\b[^>]*\bhref\s*=\s*")([^"]+)"/gi;
  let m;
  while ((m = re.exec(html))) {
    const raw = m[2];
    if (/^https?:|^\/\//i.test(raw)) continue; // 外のCDNは対象外
    const file = raw.split("?")[0];
    if (!/\.(js|css)$/i.test(file)) continue; // manifest や画像は対象外
    if (file.startsWith("/")) continue; // 絶対パスは触らない
    out.push({ raw, file, at: m.index + m[1].length });
  }
  return out;
}

export function stamp(root = ROOT) {
  const p = path.join(root, PAGE);
  const html = fs.readFileSync(p, "utf8");
  const refs = assetRefs(html);
  let out = html;
  const done = [];
  for (const r of refs) {
    const v = versionOf(root, r.file);
    const want = r.file + "?v=" + v;
    if (r.raw !== want) out = out.split('"' + r.raw + '"').join('"' + want + '"');
    done.push({ file: r.file, v, changed: r.raw !== want });
  }
  if (out !== html) fs.writeFileSync(p, out);
  return done;
}

// 直接動かされたときだけ実行する（試験から import しても走らない）
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const done = stamp();
  for (const d of done) {
    console.log(`  ${d.changed ? "押した" : "そのまま"}  ${d.file}?v=${d.v}`);
  }
  console.log(
    `\n${done.length} 本に版を押しました（変えたのは ${done.filter((d) => d.changed).length} 本）`
  );
}
