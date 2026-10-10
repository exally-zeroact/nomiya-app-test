/* kinshi-ji.test.mjs — ★公開 repo に 実在の 字（司さん・会社・お客さんの 本物）を 戻さない★
 *
 * なぜ要るか（2026-10-10）:
 *   公開 repo の 試験と 見本に、司さんの 住所・実名（xlsx の 作者の欄）・本物の 取引先の 名前が 残っていた。
 *   作り物に 替えたが、見張りが 無いと また 戻る（台本で xlsx を 作り直すと 作者名が 戻る 等）。
 *
 * ★禁止の 字の 一覧は repo に 置かない★（ここに 書くと 名前を もう一度 公開する）
 *   CI      … GitHub Actions の secret KINSHI_JI（1行に 1語）
 *   手元    … ~/.tsukurimono/kinshi-ji.txt（repo の 外）
 *   ★どちらも 無い 時は「未測定」で 赤★（緑に 倒さない）
 *   出しに 一覧の 指紋（揃えた 一覧の sha256 の 頭8字）を 出す＝secret と 手元が 同じかを 照らせる
 *
 * ★当たった 時に 字を 出さない★（公開の CI ログは 誰でも 読める）
 *   出すのは「どこ・行・一覧の 何番目か」だけ。★ファイル名・部品名に 一覧の 字が あれば 名前も 番号に 替える★
 *
 * 見る所:
 *   ・git が 追跡している 全部の ファイル。1行ずつ と、改行を 消して つないだ 字（行またぎ）
 *   ・zip（PK で 始まる 物。拡張子では 選ばない）は 全部 ほどく。中の zip も ほどく（3段まで）
 *     XML は タグを 外して つないだ 字にも 当てる（字が <t> に 分かれていても 拾う）
 *   ・PNG は 字の 入る 塊（tEXt・zTXt・iTXt）を ほどいて 当てる
 *   ・字の 読み分け：BOM（UTF-8・UTF-16LE・UTF-16BE）→ 無ければ UTF-8 として 厳しく 読む
 *   ・揃え方：&#..; を 戻す → NFKC → 幅の 無い 字を 消す → ハイフンの 仲間と「ー」を - に
 *       日本語の 語 … 空白を 全部 消して 含むか
 *       英字だけの 語 … 空白を 1つに 揃え、大文字小文字を 区別し、語の 境目で（識別子の 一部に 当てない）
 *   ・作者・会社・利用者の 欄（creator・lastModifiedBy・author・Company・Manager・userName・userId・
 *     displayName・initials・cmAuthor/userInfo/fileSharing の name・absPath の url・custom.xml の 値）は
 *     「空か 見本」だけ 通す
 *   ・ほどけない zip・鍵の かかった zip・読めない 追跡物・作者の 欄が 読めない core.xml は 赤
 * 見ない所（★未測定★と 出しに 書く）:
 *   ・字として 読めない バイナリ（PDF の 圧縮された 中身・Shift_JIS 等）／base64・\uXXXX・%XX・字の つなぎ
 *   ・git の 過去の 版（見張りは 今の 木だけ）
 *
 * 使い方: node tests/kinshi-ji.test.mjs
 *         node tests/kinshi-ji.test.mjs --self-test
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOCAL_LIST = path.join(os.homedir(), ".tsukurimono", "kinshi-ji.txt");
const OK_NAMES = new Set(["", "見本"]);
const ZIP_DEPTH = 3;

/* ---------- 揃える ---------- */
function safeCp(n, orig) {
  try {
    return String.fromCodePoint(n);
  } catch {
    return orig;
  }
}
function normBase(s) {
  return String(s)
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => safeCp(parseInt(h, 16), m))
    .replace(/&#(\d+);/g, (m, d) => safeCp(parseInt(d, 10), m))
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\u2060\u00AD\uFEFF]/g, "")
    .replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D\u30FC]/g, "-");
}
export const normJa = (s) => normBase(s).replace(/\s+/g, "");
export const normAscii = (s) => normBase(s).replace(/\s+/g, " ").trim();
const isAscii = (s) => /^[\x20-\x7e]+$/.test(s);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/* ---------- 一覧 ---------- */
export function loadWords({ env = process.env, file = LOCAL_LIST } = {}) {
  let raw = null;
  let from = null;
  if (env.KINSHI_JI && env.KINSHI_JI.trim()) {
    raw = env.KINSHI_JI;
    from = "secret KINSHI_JI";
  } else if (file && fs.existsSync(file)) {
    raw = fs.readFileSync(file, "utf8");
    from = "手元の一覧";
  }
  if (raw === null) return { words: [], from: null, finger: null };
  const seen = new Set();
  const words = [];
  for (const line of raw.split(/\r?\n/)) {
    const a = normAscii(line);
    if (!a) continue;
    const w = isAscii(a)
      ? { ascii: true, key: a, re: new RegExp("(?<![A-Za-z0-9])" + esc(a) + "(?![A-Za-z0-9])") }
      : { ascii: false, key: normJa(line) };
    if (!w.key || seen.has(w.key)) continue;
    seen.add(w.key);
    words.push(w);
  }
  const finger = crypto
    .createHash("sha256")
    .update(
      words
        .map((w) => w.key)
        .sort()
        .join("\n")
    )
    .digest("hex")
    .slice(0, 8);
  return { words, from, finger };
}

function matchIdx(text, words) {
  const ja = normJa(text);
  const as = normAscii(text);
  const out = [];
  if (!ja && !as) return out;
  words.forEach((w, i) => {
    if (w.ascii ? w.re.test(as) : ja.includes(w.key)) out.push(i);
  });
  return out;
}

/* ---------- zip を ほどく（central directory から・読めなければ throw） ---------- */
export function unzip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("zip の 終わりの 印が 無い");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = [];
  for (let k = 0; k < count; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("zip の 目録が 壊れている");
    const flag = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28);
    const xlen = buf.readUInt16LE(p + 30);
    const clen = buf.readUInt16LE(p + 32);
    const lho = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nlen).toString("utf8");
    p += 46 + nlen + xlen + clen;
    if (flag & 1) throw new Error("鍵の かかった 部品（" + (k + 1) + " 番目）");
    if (buf.readUInt32LE(lho) !== 0x04034b50)
      throw new Error("部品の 頭が 壊れている（" + (k + 1) + " 番目）");
    const start = lho + 30 + buf.readUInt16LE(lho + 26) + buf.readUInt16LE(lho + 28);
    const comp = buf.slice(start, start + csize);
    let data;
    if (method === 0) data = comp;
    else if (method === 8) data = zlib.inflateRawSync(comp);
    else throw new Error("知らない 圧縮の 形 " + method + "（" + (k + 1) + " 番目）");
    out.push({ name, data });
  }
  if (count === 0) throw new Error("zip の 部品が 0");
  return out;
}
const isZip = (b) => b.length >= 4 && b.readUInt32LE(0) === 0x04034b50;
const isPng = (b) =>
  b.length >= 8 &&
  b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

/* ---------- 字として 読む（読めなければ null） ---------- */
export function decodeText(buf) {
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return buf.slice(3).toString("utf8");
  if (buf[0] === 0xff && buf[1] === 0xfe) return buf.slice(2).toString("utf16le");
  if (buf[0] === 0xfe && buf[1] === 0xff) {
    const sw = Buffer.from(buf.slice(2));
    sw.swap16 && sw.length % 2 === 0 ? sw.swap16() : null;
    return sw.toString("utf16le");
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return null;
  }
}

/* ---------- PNG の 字の 塊 ---------- */
export function pngTexts(buf) {
  const texts = [];
  let p = 8;
  while (p + 8 <= buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.slice(p + 4, p + 8).toString("latin1");
    const d = buf.slice(p + 8, p + 8 + len);
    if (type === "tEXt") texts.push(d.toString("latin1").replace("\0", " "));
    else if (type === "zTXt") {
      const z = d.indexOf(0);
      texts.push(
        d.slice(0, z).toString("latin1") + " " + zlib.inflateSync(d.slice(z + 2)).toString("latin1")
      );
    } else if (type === "iTXt") {
      const z = d.indexOf(0);
      const comp = d[z + 1];
      let q = z + 3;
      q = d.indexOf(0, q) + 1;
      q = d.indexOf(0, q) + 1;
      const body = d.slice(q);
      texts.push(
        d.slice(0, z).toString("latin1") +
          " " +
          (comp ? zlib.inflateSync(body) : body).toString("utf8")
      );
    } else if (type === "eXIf") texts.push(null);
    if (type === "IEND") break;
    p += 12 + len;
  }
  return texts;
}

/* ---------- 作者・会社・利用者の 欄 ---------- */
const NAME_TAGS =
  /<(?:[\w-]+:)?(creator|lastModifiedBy|Company|Manager|initial-creator|author)\b[^>]*?(?:\/>|>([\s\S]*?)<\/(?:[\w-]+:)?\1>)/g;
const NAME_ATTRS =
  /\s(?:[\w-]+:)?(author|displayName|initials|userName|userId)\s*=\s*(["'])([\s\S]*?)\2/g;
const NAME_ELEM_ATTR =
  /<(?:[\w-]+:)?(cmAuthor|userInfo|fileSharing|absPath)\b[^>]*?\s(name|url)\s*=\s*(["'])([\s\S]*?)\3/g;
const CUSTOM_VAL = /<vt:(?:lpwstr|lpstr|bstr)>([\s\S]*?)<\/vt:(?:lpwstr|lpstr|bstr)>/g;
export function nameFields(partName, xml) {
  const out = [];
  for (const m of xml.matchAll(NAME_TAGS)) out.push([m[1], (m[2] || "").replace(/<[^>]*>/g, "")]);
  for (const m of xml.matchAll(NAME_ATTRS)) out.push([m[1], m[3]]);
  for (const m of xml.matchAll(NAME_ELEM_ATTR)) out.push([m[1] + "@" + m[2], m[4]]);
  if (/(^|\/)docProps\/custom\.xml$/i.test(partName))
    for (const m of xml.matchAll(CUSTOM_VAL)) out.push(["custom", m[1]]);
  return out.map(([k, v]) => [k, normJa(v)]);
}

/* ---------- 本体 ---------- */
export function scan({ root, files, words }) {
  const hits = [];
  const notes = [];
  const reds = [];
  const c = { files: 0, zips: 0, parts: 0, pngTexts: 0, unreadable: 0, nameChecks: 0 };
  const named = (name, alt) => (matchIdx(name, words).length ? alt : name);

  function scanText(label, text) {
    const seen = new Set();
    text.split(/\r?\n/).forEach((line, i) => {
      for (const w of matchIdx(line, words)) {
        seen.add(w);
        hits.push(label + ":" + (i + 1) + ": 一覧の " + (w + 1) + " 番目");
      }
    });
    for (const w of matchIdx(text.replace(/\r?\n/g, ""), words))
      if (!seen.has(w)) hits.push(label + ":(行またぎ): 一覧の " + (w + 1) + " 番目");
  }

  function scanBlob(label, buf, depth) {
    if (isZip(buf)) {
      c.zips++;
      if (depth >= ZIP_DEPTH)
        return reds.push(label + ": zip の 入れ子が 深すぎて 見ていない（未測定＝赤）");
      let parts;
      try {
        parts = unzip(buf);
      } catch (e) {
        return reds.push(label + ": zip を ほどけない（見ないまま 緑に しない）… " + e.message);
      }
      parts.forEach((part, k) => {
        c.parts++;
        for (const w of matchIdx(part.name, words))
          hits.push(
            label +
              " の " +
              (k + 1) +
              " 番目の 部品名: 一覧の " +
              (w + 1) +
              " 番目（名前は 出さない）"
          );
        const pl = label + "!" + named(part.name, "(" + (k + 1) + " 番目の 部品)");
        scanBlob(pl, part.data, depth + 1);
        const text = decodeText(part.data);
        if (text === null) return;
        if (/\.(xml|rels|vml)$/i.test(part.name)) {
          const joined = text.replace(/<[^>]*>/g, "");
          for (const w of matchIdx(joined, words))
            hits.push(pl + ":(タグを 外して つないだ 字): 一覧の " + (w + 1) + " 番目");
          for (const [kind, v] of nameFields(part.name, text)) {
            c.nameChecks++;
            if (!OK_NAMES.has(v))
              hits.push(
                pl +
                  ": 作者・会社・利用者の 欄（" +
                  kind +
                  "）が「空か 見本」でない（字は 出さない）"
              );
          }
        }
        if (/(^|\/)docProps\/core\.xml$/i.test(part.name)) {
          const has = (t) => new RegExp("<(?:[\\w-]+:)?" + t + "\\b").test(text);
          if (!has("creator") || !has("lastModifiedBy"))
            reds.push(pl + ": 作者の 欄が 読めない（未測定＝赤）");
        }
      });
      return;
    }
    if (isPng(buf)) {
      for (const t of pngTexts(buf)) {
        if (t === null) {
          notes.push(label + ": PNG の EXIF は 見ていない（未測定）");
          continue;
        }
        c.pngTexts++;
        scanText(label + "(PNG の 字の 塊)", t);
      }
      return;
    }
    const text = decodeText(buf);
    if (text === null) {
      c.unreadable++;
      notes.push(label + ": 字として 読めない（未測定・ASCII の 部分だけ 当てた）");
      scanText(label, buf.toString("latin1"));
      return;
    }
    scanText(label, text);
  }

  files.forEach((rel, idx) => {
    c.files++;
    for (const w of matchIdx(rel, words))
      hits.push(
        "追跡物の " + (idx + 1) + " 本目の 道・名前: 一覧の " + (w + 1) + " 番目（名前は 出さない）"
      );
    const label = named(rel, "(追跡物の " + (idx + 1) + " 本目)");
    const abs = path.join(root, rel);
    let st;
    try {
      st = fs.lstatSync(abs);
    } catch {
      return reds.push(label + ": 追跡物が 手元に 無い（未測定＝赤）");
    }
    if (!st.isFile())
      return reds.push(label + ": ふつうの ファイルでない（submodule・リンク 等＝未測定＝赤）");
    scanBlob(label, fs.readFileSync(abs), 0);
  });
  return { hits, notes, reds, c };
}

function gitFiles(root) {
  return execFileSync("git", ["-C", root, "ls-files", "-z"], { encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
}

/* ---------- 走らせる（終わり値と 出しを 返す＝自己確認から 呼べる） ---------- */
export function run({ env = process.env, file = LOCAL_LIST, root = ROOT, files } = {}) {
  const { words, from, finger } = loadWords({ env, file });
  if (!words.length)
    return {
      code: 1,
      lines: [
        "✗ 未測定＝禁止の 字の 一覧が 無い（secret KINSHI_JI も 手元の 一覧も 無い）。緑には しない。",
      ],
    };
  const list = files || gitFiles(root);
  const r = scan({ root, files: list, words });
  const lines = [
    "一覧＝" +
      from +
      "・" +
      words.length +
      "語・指紋 " +
      finger +
      " ／ 追跡物 " +
      r.c.files +
      " 本・zip " +
      r.c.zips +
      " 本（部品 " +
      r.c.parts +
      "）・作者の欄 " +
      r.c.nameChecks +
      " 個・PNG の 字の塊 " +
      r.c.pngTexts +
      " 個・字として 読めない " +
      r.c.unreadable +
      " 本",
  ];
  for (const n of r.notes) lines.push("  未測定: " + n);
  for (const x of r.reds) lines.push("  赤: " + x);
  for (const h of r.hits) lines.push("  赤: " + h);
  if (r.c.files === 0) {
    lines.push("✗ 追跡物が 0 本＝何も 見ていない");
    return { code: 1, lines, r };
  }
  if (r.hits.length || r.reds.length) {
    lines.push("✗ 赤 " + (r.hits.length + r.reds.length) + " 件");
    return { code: 1, lines, r };
  }
  lines.push(
    "✓ 実在の 字 0 件（" +
      r.c.files +
      " 本・zip の 部品 " +
      r.c.parts +
      " 個を 見た）※git の 過去の 版は 見ていない"
  );
  return { code: 0, lines, r };
}

/* ---------- 自己確認（★作り物の 語だけで 仕組みを 確かめる★） ---------- */
function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function makeZip(entries) {
  const locals = [];
  const cds = [];
  let off = 0;
  for (const [name, content] of entries) {
    const raw = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8");
    const comp = zlib.deflateRawSync(raw);
    const nb = Buffer.from(name, "utf8");
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0x800, 6);
    lh.writeUInt16LE(8, 8);
    lh.writeUInt32LE(crc32(raw), 14);
    lh.writeUInt32LE(comp.length, 18);
    lh.writeUInt32LE(raw.length, 22);
    lh.writeUInt16LE(nb.length, 26);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0x800, 8);
    cd.writeUInt16LE(8, 10);
    cd.writeUInt32LE(crc32(raw), 16);
    cd.writeUInt32LE(comp.length, 20);
    cd.writeUInt32LE(raw.length, 24);
    cd.writeUInt16LE(nb.length, 28);
    cd.writeUInt32LE(off, 42);
    locals.push(lh, nb, comp);
    cds.push(cd, nb);
    off += 30 + nb.length + comp.length;
  }
  const cdBuf = Buffer.concat(cds);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cdBuf.length, 12);
  end.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cdBuf, end]);
}
function makePng(chunks) {
  const parts = [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])];
  for (const [type, data] of [...chunks, ["IEND", Buffer.alloc(0)]]) {
    const h = Buffer.alloc(8);
    h.writeUInt32BE(data.length, 0);
    h.write(type, 4, "latin1");
    parts.push(h, data, Buffer.alloc(4));
  }
  return Buffer.concat(parts);
}

function selfTest() {
  let pass = 0;
  let fail = 0;
  const T = (n, fn) => {
    try {
      fn();
      pass++;
      console.log("  ✓ " + n);
    } catch (e) {
      fail++;
      console.log("  ✗ " + n + " … " + e.message);
    }
  };
  const must = (v, m) => {
    if (!v) throw new Error(m);
  };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kinshi-"));
  const W_RAW = ["見本台ためし語", "９９－８－７７", "カレホン ためし", "Fakeco Lounge"];
  const listFile = path.join(tmp, "list.txt");
  fs.writeFileSync(listFile, W_RAW.join("\n") + "\n");
  const ENV = {};
  const core = (who) =>
    '<cp:coreProperties xmlns:cp="x" xmlns:dc="y"><dc:creator>' +
    who +
    "</dc:creator><cp:lastModifiedBy>見本</cp:lastModifiedBy></cp:coreProperties>";
  let n = 0;
  const put = (name, data) => {
    const rel = "c" + ++n + "/" + name;
    fs.mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true });
    fs.writeFileSync(path.join(tmp, rel), data);
    return rel;
  };
  const go = (files) => run({ env: ENV, file: listFile, root: tmp, files });
  const leaks = (x) => {
    const all = x.lines.join("\n");
    return W_RAW.some(
      (w) => all.includes(w) || normJa(all).includes(normJa(w)) || all.includes("Fakeco")
    );
  };

  T("一覧が 無ければ 終わり値 1（未測定で 赤）", () => {
    must(
      run({ env: {}, file: path.join(tmp, "nai.txt"), root: tmp, files: [] }).code === 1,
      "一覧が 無いのに 緑"
    );
    must(
      loadWords({ env: { KINSHI_JI: "あ\nい" }, file: null }).words.length === 2,
      "secret から 読めない"
    );
    must(
      loadWords({ env: { KINSHI_JI: "  " }, file: path.join(tmp, "nai.txt") }).words.length === 0,
      "空の secret で 語が 出た"
    );
  });
  T("追跡物が 0 本なら 終わり値 1", () => must(go([]).code === 1, "0 本で 緑"));
  T("きれいな 物は 終わり値 0・分母が 出る・指紋が 出る", () => {
    const x = go([
      put("a.txt", "なにもない\nFakecoX MyFakeco Lounge\n"),
      put(
        "ok.xlsx",
        makeZip([
          ["docProps/core.xml", core("見本")],
          ["xl/a.xml", "<t>ふつう</t>"],
        ])
      ),
    ]);
    must(x.code === 0, "赤: " + x.lines.join(" / "));
    must(
      x.r.c.files === 2 && x.r.c.zips === 1 && x.r.c.parts === 2 && x.r.c.nameChecks === 2,
      "分母が 違う " + JSON.stringify(x.r.c)
    );
    must(/指紋 [0-9a-f]{8}/.test(x.lines[0]), "指紋が 無い");
  });
  T("当たれば 終わり値 1・行と 番号が 出る・字は 出ない", () => {
    const x = go([put("b.js", "x\nconst a = '見本台ためし語';\n")]);
    must(
      x.code === 1 && x.r.hits[0].includes("b.js:2") && x.r.hits[0].includes("1 番目"),
      "当たらない"
    );
    must(!leaks(x), "出しに 字が 出た");
  });
  T("全角・空白・ハイフン・「ー」・&#..;・幅の 無い 字でも 当たる", () => {
    const x = go([
      put(
        "c.html",
        "99-8-77\n99ー8ー77\nカレホン　ためし\n見本&#21488;ためし語\n見本\u200B台ためし語\n"
      ),
    ]);
    must(x.r.hits.length === 5, "5件 当たらない: " + x.r.hits.length);
    must(!leaks(x), "出しに 字が 出た");
  });
  T("英字の 語は 大文字小文字と 語の 境目を 守る", () => {
    must(go([put("d.txt", "Fakeco  Lounge\n")]).code === 1, "空白違いで 当たらない");
    must(
      go([put("d.txt", "fakeco lounge\nXFakeco Lounge2\n")]).code === 0,
      "小文字・識別子の 一部に 当たった"
    );
  });
  T("行を またいだ 字も 当たる", () => {
    const x = go([put("e.txt", "見本台\nためし語\n")]);
    must(
      x.r.hits.some((h) => h.includes("行またぎ")),
      "行またぎを 拾わない"
    );
  });
  T("zip の 中（deflate）・<t> に 分かれた 字・入れ子の zip", () => {
    const inner = makeZip([["x.xml", "<a>見本台ためし語</a>"]]);
    const x = go([
      put(
        "f.xlsx",
        makeZip([
          ["docProps/core.xml", core("見本")],
          ["xl/s.xml", "<si><r><t>見本台</t></r><r><t>ためし語</t></r></si>"],
          ["word/embeddings/e.xlsx", inner],
        ])
      ),
    ]);
    must(
      x.r.hits.some((h) => h.includes("タグを 外して")),
      "分かれた 字を 拾わない"
    );
    must(
      x.r.hits.some((h) => h.includes("e.xlsx!x.xml")),
      "入れ子を ほどかない"
    );
    must(!leaks(x), "出しに 字が 出た");
  });
  T("作者・会社・利用者の 欄（core・単引用・cmAuthor・absPath・custom）", () => {
    for (const [nm, xml] of [
      ["docProps/core.xml", core("他人")],
      ["word/comments.xml", "<w:comment w:author = '他人' />"],
      ["ppt/commentAuthors.xml", '<p:cmAuthor id="0" name="他人" initials=""/>'],
      ["xl/workbook.xml", '<x15ac:absPath url="C:\\Users\\tanin\\" />'],
      ["docProps/custom.xml", "<property><vt:lpwstr>他人</vt:lpwstr></property>"],
    ]) {
      const parts = [[nm, xml]];
      if (nm !== "docProps/core.xml") parts.push(["docProps/core.xml", core("見本")]);
      const x = go([put("g.zip", makeZip(parts))]);
      must(
        x.code === 1 && x.r.hits.some((h) => h.includes("作者・会社・利用者")),
        nm + " を 見ていない"
      );
      must(
        !x.lines.join("\n").includes("他人") && !x.lines.join("\n").includes("tanin"),
        nm + " の 字が 出た"
      );
    }
  });
  T("拡張子が 違っても zip なら ほどく", () => {
    const x = go([put("h.bin", makeZip([["x.xml", "<a>見本台ためし語</a>"]]))]);
    must(x.r.c.zips === 1 && x.code === 1, "名前で 選んでいる");
  });
  T("ほどけない zip・鍵の かかった zip は 赤", () => {
    const z = makeZip([["x.xml", "<a>ふつう</a>"]]);
    z.writeUInt16LE(99, z.readUInt32LE(z.length - 6) + 10);
    must(
      go([put("i.xlsx", z)]).r.reds.some((h) => h.includes("ほどけない")),
      "壊れた zip が 緑"
    );
    const k = makeZip([["x.xml", "<a>ふつう</a>"]]);
    const cd = k.readUInt32LE(k.length - 6);
    k.writeUInt16LE(k.readUInt16LE(cd + 8) | 1, cd + 8);
    must(go([put("j.xlsx", k)]).code === 1, "鍵付き zip が 緑");
  });
  T("名前に 字が あっても 出さない（中身にも 字・バイナリ・フォルダ・部品名）", () => {
    const a = put("見本台ためし語.txt", "見本台ためし語\n");
    const b = put("見本台ためし語.bin", Buffer.from([0xff, 0x00, 0x81]));
    const d = put("見本台ためし語/x.txt", "見本台ためし語");
    const e = put("k.xlsx", makeZip([["見本台ためし語.xml", "<a>見本台ためし語</a>"]]));
    for (const f of [a, b, d, e]) {
      const x = go([f]);
      must(x.code === 1, f.length + " 字の 名前で 赤に ならない");
      must(!leaks(x), "出しに 名前が 出た");
    }
  });
  T("作者の 欄が 無い core.xml は 赤", () => {
    must(
      go([put("l.xlsx", makeZip([["docProps/core.xml", "<cp:coreProperties/>"]]))]).code === 1,
      "読めないのに 緑"
    );
  });
  T("UTF-16（LE・BE の BOM）・UTF-8 の BOM でも 当たる", () => {
    const s = "見本台ためし語";
    const le = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(s, "utf16le")]);
    const be = Buffer.from(le);
    be.swap16();
    const u8 = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(s)]);
    for (const [nm, b] of [
      ["le", le],
      ["be", be],
      ["u8", u8],
    ])
      must(go([put(nm + ".txt", b)]).code === 1, nm + " で 当たらない");
  });
  T("PNG の 字の 塊（tEXt・zTXt・iTXt）を 見る・字の 無い PNG は 黙って 緑", () => {
    const t = Buffer.from("Author\0Fakeco Lounge", "latin1");
    must(go([put("m.png", makePng([["tEXt", t]]))]).code === 1, "tEXt を 見ていない");
    const z = Buffer.concat([
      Buffer.from("Comment\0\0", "latin1"),
      zlib.deflateSync(Buffer.from("Fakeco Lounge")),
    ]);
    must(go([put("n.png", makePng([["zTXt", z]]))]).code === 1, "zTXt を 見ていない");
    const it = Buffer.concat([
      Buffer.from("Title\0\0\0\0\0", "latin1"),
      Buffer.from("見本台ためし語"),
    ]);
    must(go([put("o.png", makePng([["iTXt", it]]))]).code === 1, "iTXt を 見ていない");
    const x = go([put("p.png", makePng([["IHDR", Buffer.alloc(13)]]))]);
    must(x.code === 0 && x.r.notes.length === 0, "字の 無い PNG で 未測定");
  });
  T("字として 読めない 物は 未測定と 書く（ASCII の 部分は 当てる）", () => {
    const x = go([
      put(
        "q.dat",
        Buffer.concat([
          Buffer.from([0xff, 0xfe, 0x00]).slice(2),
          Buffer.from([0x81, 0x00]),
          Buffer.from(" Fakeco Lounge "),
        ])
      ),
    ]);
    must(x.r.c.unreadable === 1 && x.r.notes.length === 1, "黙っている");
    must(x.code === 1, "ASCII の 部分を 当てていない");
  });
  T("手元に 無い 追跡物は 赤", () => must(go(["nai/nai.txt"]).code === 1, "無いのに 緑"));

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("自己確認: " + pass + "/" + (pass + fail));
  return fail ? 1 : 0;
}

if (process.argv.includes("--self-test")) process.exit(selfTest());
else {
  const { code, lines } = run();
  for (const l of lines) console.log(l);
  process.exit(code);
}
