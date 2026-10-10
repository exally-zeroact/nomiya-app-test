/* kinshi-ji.test.mjs — ★公開 repo に 実在の 字（司さん・会社・お客さんの 本物）を 戻さない★
 *
 * なぜ要るか（2026-10-10）:
 *   公開 repo の 試験と 見本に、司さんの 住所・実名（xlsx の 作者の欄）・本物の 取引先の 名前が 残っていた。
 *   作り物に 替えたが、見張りが 無いと また 戻る（台本で xlsx を 作り直すと 作者名が 戻る 等）。
 *
 * ★禁止の 字の 一覧は repo に 置かない★（ここに 書くと 名前を もう一度 公開する）
 *   CI      … GitHub Actions の secret KINSHI_JI（1行に 1語）＋ 変数 KINSHI_JI_FINGER（一覧の 指紋）
 *   手元    … ~/.tsukurimono/kinshi-ji.txt（repo の 外）
 *   ★一覧が 無い 時は「未測定」で 赤★（緑に 倒さない）
 *   ★CI では 指紋（揃えた 一覧の sha256 の 頭8字）を 照らす★＝secret が 縮んだ・壊れた なら 赤
 *
 * ★当たった 時に 字を 出さない★（公開の CI ログは 誰でも 読める）
 *   出すのは「どこ・行・一覧の 何番目か」だけ。道・ファイル名・部品名に 一覧の 字が あれば 番号に 替える
 *
 * 見る所:
 *   ・git が 追跡している 全部の ファイル。1行ずつ・行を またいで つないだ 字・タグを 外して つないだ 字
 *   ・zip（PK で 始まる 物。拡張子では 選ばない）は 全部 ほどく。中の zip も（3段まで・越えたら 赤）
 *   ・PNG の 字の 塊（tEXt・zTXt・iTXt）／PDF の /Author と XMP の creator（「空か 見本」だけ 通す）
 *   ・字の 読み分け：BOM → UTF-8 → NUL を 含む 物は UTF-16（LE・BE）でも → 読めない 物は 壊れた 字を 飛ばして 読む
 *   ・揃え方：&#..; → NFKC → 幅の 無い 字・異体字の 印・向きの 印を 消す → ハイフンの 仲間と「ー」を - に
 *       日本語の 語 … 空白を 全部 消し、カタカナを ひらがなに 揃えて 含むか
 *       英字だけの 語 … 空白・_・%20・&nbsp; を 1つの 空白に。語の 境目で。1語の ふつうの 語だけ 大文字小文字を 区別
 *         （2語 以上・@ . - を 含む 語は 問わず、2語の 間は 空白・. _ + - ・ / でも 無しでも 当てる）
 *   ・作者・会社・利用者の 欄（creator・lastModifiedBy・author・Company・Manager・userName・userId・
 *     displayName・initials・cmAuthor/userInfo/fileSharing の name・absPath の url・custom.xml の 値）は「空か 見本」だけ
 *   ・ほどけない／鍵の かかった zip・読めない 追跡物・submodule・LFS の 指し札・作者の 欄が 読めない core.xml は 赤
 * 見ない所（★未測定★）:
 *   ・base64・\uXXXX・%XX（%20 以外）・字の つなぎ（'名'+'前'）・PDF の 圧縮された 中身・EXIF
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
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SELF = fileURLToPath(import.meta.url);
const ROOT = path.join(path.dirname(SELF), "..");
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
    .replace(/&nbsp;|%20/gi, " ")
    .normalize("NFKC")
    .replace(/[\u200B\u200C\u200E\u200F\u202A-\u202E\u2060-\u2064\u00AD\uFEFF]/g, "")
    .replace(/\u200D/g, "")
    .replace(/[\uFE00-\uFE0F]/g, "")
    .replace(/\uDB40[\uDD00-\uDDEF]/g, "")
    .replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D\u30FC]/g, "-");
}
export const normJa = (s) =>
  normBase(s)
    .replace(/\s+/g, "")
    .replace(/[\u30A1-\u30F6]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
export const normAscii = (s) =>
  normBase(s)
    .replace(/[\s_]+/g, " ")
    .trim();
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
    /* 英字の 語：1語の ふつうの 物は 大文字小文字を 区別（ふつうの 英単語に 当てない）。
       2語 以上・メールや ドメインの 形（@ . - を 含む）は 大文字小文字を 問わない。
       2語 以上は 間が 空白・. _ + - ・ / でも 無しでも 当てる（メール・ドメイン・続け書き） */
    const toks = a.split(" ");
    const w = !isAscii(a)
      ? { ascii: false, key: normJa(line) }
      : toks.length === 1
        ? {
            ascii: true,
            key: a,
            re: new RegExp(
              "(?<![A-Za-z0-9])" + esc(a) + "(?![A-Za-z0-9])",
              /[@.-]/.test(a) ? "i" : ""
            ),
          }
        : {
            ascii: true,
            key: a,
            re: new RegExp(
              "(?<![A-Za-z0-9])" + toks.map(esc).join("[\\s._+/\\u30fb-]*") + "(?![A-Za-z0-9])",
              "i"
            ),
          };
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
/* 道・名前は 区切り（/ \ !）を 外した 形にも 当てる（語が フォルダと ファイルに 分かれても 拾う） */
const nameHits = (name, words) => [
  ...new Set([...matchIdx(name, words), ...matchIdx(name.replace(/[/\\!]/g, ""), words)]),
];

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
const isPdf = (b) => b.slice(0, 5).toString("latin1") === "%PDF-";

const utf16be = (b) => {
  const sw = Buffer.from(b.slice(0, b.length - (b.length % 2)));
  sw.swap16();
  return sw.toString("utf16le");
};

/* ---------- 字として 読む＝当てる 字の 組（ok=false は 読めなかった） ---------- */
export function readTexts(buf) {
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf)
    return { ok: true, texts: [buf.slice(3).toString("utf8")] };
  if (buf[0] === 0xff && buf[1] === 0xfe)
    return { ok: true, texts: [buf.slice(2).toString("utf16le")] };
  if (buf[0] === 0xfe && buf[1] === 0xff) return { ok: true, texts: [utf16be(buf.slice(2))] };
  const utf16s = [
    buf.toString("utf16le"),
    buf.slice(1).toString("utf16le"),
    utf16be(buf),
    utf16be(buf.slice(1)),
  ];
  const strict = (enc) => {
    try {
      return new TextDecoder(enc, { fatal: true }).decode(buf);
    } catch {
      return null;
    }
  };
  /* ESC が あれば JIS（ISO-2022-JP）でも 読む。ほかの ESC 列（色の 印 等）が 混ざっても 飛ばして 読む */
  const jis = buf.includes(0x1b) ? [new TextDecoder("iso-2022-jp").decode(buf)] : [];
  const u8 = strict("utf-8");
  if (u8 !== null) return { ok: true, texts: [u8, ...(buf.includes(0) ? utf16s : []), ...jis] };
  /* UTF-8 で 読めない＝日本の 古い 字コード（Shift_JIS・EUC-JP）と BOM 無しの UTF-16 でも 読んで 当てる */
  const sjis = strict("shift_jis");
  const euc = strict("euc-jp");
  const texts = [
    new TextDecoder("utf-8").decode(buf),
    buf.toString("latin1"),
    new TextDecoder("shift_jis").decode(buf),
    new TextDecoder("euc-jp").decode(buf),
    ...utf16s,
    ...jis,
  ];
  return { ok: Boolean(sjis !== null || euc !== null || utf16s.some(looksLikeText)), texts };
}

/* BOM 無しの UTF-16 として 読んだ 字が「字らしい」か（日本語・英数・句読点が 9割 以上） */
function looksLikeText(s) {
  if (!s || s.includes("\uFFFD")) return false;
  const good = s.match(/[\t\n\r\x20-\x7e\u3000-\u30ff\u4e00-\u9fff\uff00-\uffef]/g);
  return Boolean(good) && good.length >= s.length * 0.9;
}

/* ---------- 字の 無い 形と 分かっている バイナリ（読めなくても 赤に しない） ---------- */
export function knownBinary(label, buf) {
  if (buf.length < 4) return null;
  const h = buf.slice(0, 4).toString("latin1");
  if (isPdf(buf)) return "PDF";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "JPEG";
  if (h === "GIF8") return "GIF";
  if (h === "RIFF") return "RIFF（WebP 等）";
  if (buf.readUInt32BE(0) === 0x00000100) return "ICO";
  if (h === "wOFF" || h === "wOF2" || h === "OTTO" || buf.readUInt32BE(0) === 0x00010000)
    return "字形（フォント）";
  if (label.includes("!") && /printerSettings\d*\.bin$/i.test(label)) return "印刷の 設定";
  return null;
}

/* ---------- PNG の 字の 塊（壊れていたら throw） ---------- */
export function pngTexts(buf) {
  const texts = [];
  let p = 8;
  while (p + 8 <= buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.slice(p + 4, p + 8).toString("latin1");
    const d = buf.slice(p + 8, p + 8 + len);
    if (type === "tEXt") {
      texts.push(d.toString("latin1").replace("\0", " "));
      texts.push(d.toString("utf8").replace("\0", " "));
    } else if (type === "zTXt") {
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

/* ---------- PDF の 作者（/Author と XMP の creator） ---------- */
function pdfString(s) {
  if (s.startsWith("<")) {
    const hex = s.slice(1, -1).replace(/\s+/g, "");
    const b = Buffer.from(hex, "hex");
    return b[0] === 0xfe && b[1] === 0xff ? utf16be(b.slice(2)) : b.toString("latin1");
  }
  const body = s.slice(1, -1).replace(/\\([()\\])/g, "$1");
  const b = Buffer.from(body, "latin1");
  if (b[0] === 0xfe && b[1] === 0xff) return utf16be(b.slice(2));
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(b);
  } catch {
    return body;
  }
}
export function pdfAuthors(buf) {
  const t = buf.toString("latin1");
  const out = [];
  for (const m of t.matchAll(/\/Author\s*(\((?:\\.|[^\\)])*\)|<[0-9A-Fa-f\s]*>)/g))
    out.push(["PDF /Author", pdfString(m[1])]);
  const u = new TextDecoder("utf-8").decode(buf);
  for (const m of u.matchAll(/<dc:creator>([\s\S]*?)<\/dc:creator>/g))
    out.push(["PDF XMP creator", m[1].replace(/<[^>]*>/g, "")]);
  for (const m of u.matchAll(/<pdf:Author>([\s\S]*?)<\/pdf:Author>/g))
    out.push(["PDF XMP Author", m[1]]);
  return { out, packed: /\/ObjStm|\/FlateDecode/.test(t) };
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
  return out;
}

/* ---------- 本体 ---------- */
export function scan({ root, files, words }) {
  const hitSet = new Set();
  const notes = [];
  const reds = [];
  const c = {
    files: 0,
    zips: 0,
    parts: 0,
    pngTexts: 0,
    pdfAuthors: 0,
    unreadable: 0,
    nameChecks: 0,
  };
  const hit = (s) => hitSet.add(s);
  const named = (name, alt) => (nameHits(name, words).length ? alt : name);
  const checkName = (label, kind, v) => {
    c.nameChecks++;
    if (!OK_NAMES.has(normJa(v)))
      hit(
        label + ": 作者・会社・利用者の 欄（" + kind + "）が「空か 見本」でない（字は 出さない）"
      );
  };

  function scanText(label, text) {
    const seen = new Set();
    text.split(/\r?\n/).forEach((line, i) => {
      for (const w of matchIdx(line, words)) {
        seen.add(w);
        hit(label + ":" + (i + 1) + ": 一覧の " + (w + 1) + " 番目");
      }
    });
    const late = (t, why) => {
      for (const w of matchIdx(t, words))
        if (!seen.has(w)) {
          seen.add(w);
          hit(label + ":(" + why + "): 一覧の " + (w + 1) + " 番目");
        }
    };
    late(text.replace(/\r?\n/g, ""), "行またぎ");
    late(text.replace(/\r?\n/g, " "), "行またぎ");
    if (/<[A-Za-z/!?]/.test(text)) {
      late(text.replace(/<[^>]*>/g, ""), "タグを 外して つないだ 字");
      late(text.replace(/<[^>]*>/g, " "), "タグを 外して つないだ 字");
    }
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
        for (const w of nameHits(part.name, words))
          hit(
            label +
              " の " +
              (k + 1) +
              " 番目の 部品名: 一覧の " +
              (w + 1) +
              " 番目（名前は 出さない）"
          );
        const pl = label + "!" + named(part.name, "(" + (k + 1) + " 番目の 部品)");
        scanBlob(pl, part.data, depth + 1);
        if (!/\.(xml|rels|vml)$/i.test(part.name)) return;
        const text = new TextDecoder("utf-8").decode(part.data);
        for (const [kind, v] of nameFields(part.name, text)) checkName(pl, kind, v);
        if (/(^|\/)docProps\/core\.xml$/i.test(part.name)) {
          const has = (t) => new RegExp("<(?:[\\w-]+:)?" + t + "\\b").test(text);
          if (!has("creator") || !has("lastModifiedBy"))
            reds.push(pl + ": 作者の 欄が 読めない（未測定＝赤）");
        }
      });
      return;
    }
    if (isPng(buf)) {
      let texts;
      try {
        texts = pngTexts(buf);
      } catch (e) {
        return reds.push(label + ": PNG の 字の 塊を ほどけない（未測定＝赤）… " + e.message);
      }
      for (const t of texts) {
        if (t === null) {
          notes.push(label + ": PNG の EXIF は 見ていない（未測定）");
          continue;
        }
        c.pngTexts++;
        scanText(label + "(PNG の 字の 塊)", t);
      }
      scanText(label + "(PNG の 生の 字)", buf.toString("latin1"));
      for (const enc of ["utf-8", "shift_jis", "euc-jp"])
        scanText(label + "(PNG の 生の 字)", new TextDecoder(enc).decode(buf));
      return;
    }
    if (buf[0] === 0x1f && buf[1] === 0x8b) {
      let inner;
      try {
        inner = zlib.gunzipSync(buf);
      } catch (e) {
        return reds.push(label + ": gzip を ほどけない（未測定＝赤）… " + e.message);
      }
      if (depth >= ZIP_DEPTH)
        return reds.push(label + ": 入れ子が 深すぎて 見ていない（未測定＝赤）");
      return scanBlob(label + "(gzip の 中)", inner, depth + 1);
    }
    if (isPdf(buf)) {
      const { out, packed } = pdfAuthors(buf);
      for (const [kind, v] of out) {
        c.pdfAuthors++;
        checkName(label, kind, v);
      }
      if (packed) notes.push(label + ": PDF の 圧縮された 中身は 見ていない（未測定）");
    }
    const head = buf.slice(0, 200).toString("latin1");
    if (head.startsWith("version https://git-lfs"))
      return reds.push(label + ": LFS の 指し札＝中身を 見ていない（未測定＝赤）");
    const { ok, texts } = readTexts(buf);
    if (!ok) {
      c.unreadable++;
      const kind = knownBinary(label, buf);
      if (kind)
        notes.push(label + ": 字として 読めない " + kind + "（未測定・読める 部分だけ 当てた）");
      else
        reds.push(
          label +
            ": 字として 読めない 知らない 形（UTF-8・Shift_JIS・EUC-JP・UTF-16 の どれでも ない＝未測定＝赤）"
        );
    }
    for (const t of texts) scanText(label, t);
  }

  files.forEach((rel, idx) => {
    c.files++;
    for (const w of nameHits(rel, words))
      hit(
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
    let buf;
    try {
      buf = fs.readFileSync(abs);
    } catch {
      return reds.push(label + ": 読めない（未測定＝赤）");
    }
    scanBlob(label, buf, 0);
  });
  return { hits: [...hitSet], notes, reds, c };
}

function gitFiles(root) {
  return execFileSync("git", ["-C", root, "ls-files", "-z"], { encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
}

/* ---------- 走らせる（終わり値と 出しを 返す） ---------- */
export function run({
  env = process.env,
  file = env.KINSHI_JI_FILE || LOCAL_LIST,
  root = ROOT,
  files,
} = {}) {
  const { words, from, finger } = loadWords({ env, file });
  if (!words.length)
    return {
      code: 1,
      lines: [
        "✗ 未測定＝禁止の 字の 一覧が 無い（secret KINSHI_JI も 手元の 一覧も 無い）。緑には しない。",
      ],
    };
  const lines = [];
  const want = (env.KINSHI_JI_FINGER || "").trim();
  let fingerRed = false;
  if (want && want !== finger) {
    lines.push(
      "✗ 一覧の 指紋が 違う（期待 " + want + "・今 " + finger + "）＝secret が 縮んだか 壊れた"
    );
    fingerRed = true;
  } else if (!want && env.CI) {
    lines.push("✗ CI なのに 指紋の 期待（KINSHI_JI_FINGER）が 無い＝一覧が 正しいか 照らせない");
    fingerRed = true;
  }
  const list = files || gitFiles(root);
  const r = scan({ root, files: list, words });
  lines.unshift(
    "一覧＝" +
      from +
      "・" +
      words.length +
      "語・指紋 " +
      finger +
      (want ? "（期待と " + (want === finger ? "同じ" : "違う") + "）" : "") +
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
      " 個・PDF の 作者 " +
      r.c.pdfAuthors +
      " 個・字として 読めない " +
      r.c.unreadable +
      " 本"
  );
  for (const n of r.notes) lines.push("  未測定: " + n);
  for (const x of r.reds) lines.push("  赤: " + x);
  for (const h of r.hits) lines.push("  赤: " + h);
  if (r.c.files === 0) {
    lines.push("✗ 追跡物が 0 本＝何も 見ていない");
    return { code: 1, lines, r };
  }
  if (r.hits.length || r.reds.length || fingerRed) {
    lines.push("✗ 赤 " + (r.hits.length + r.reds.length + (fingerRed ? 1 : 0)) + " 件");
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
  const W_RAW = [
    "見本台ためし語",
    "９９－８－７７",
    "カレホン ためし",
    "Fakeco Lounge",
    "Zorgox",
    "Qx@Wobble.jp",
  ];
  const listFile = path.join(tmp, "list.txt");
  fs.writeFileSync(listFile, W_RAW.join("\n") + "\n");
  const FINGER = loadWords({ env: {}, file: listFile }).finger;
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
  const leaks = (text) =>
    W_RAW.some((w) => text.includes(w) || normJa(text).includes(normJa(w))) ||
    text.includes("Fakeco") ||
    text.includes("ためし");

  /* ★本体を 子プロセスで 走らせる＝main・git の 名簿・終わり値まで 見る★ */
  T(
    "子プロセス：一覧なし→1・きれい→0・当たり→1（字は 出ない）・指紋違い→1・CI で 指紋なし→1",
    () => {
      const repo = path.join(tmp, "repo");
      fs.mkdirSync(path.join(repo, "tests"), { recursive: true });
      fs.copyFileSync(SELF, path.join(repo, "tests", "k.mjs"));
      fs.writeFileSync(path.join(repo, "a.txt"), "ふつう\n");
      const git = (...a) => execFileSync("git", ["-C", repo, ...a], { stdio: "ignore" });
      git("init", "-q");
      git("add", "-A");
      const child = (env) => {
        const base = {
          PATH: process.env.PATH,
          SYSTEMROOT: process.env.SYSTEMROOT || "",
          HOME: tmp,
          USERPROFILE: tmp,
        };
        const r = spawnSync(process.execPath, [path.join(repo, "tests", "k.mjs")], {
          env: { ...base, ...env },
          encoding: "utf8",
        });
        return { code: r.status, out: (r.stdout || "") + (r.stderr || "") };
      };
      /* 本体の 写しにも 自己確認の 作り物の 語が 書いてあるので、子には 別の 語を 使う
         （組み立てて 作る＝字の 並びとしては ソースに 載らない） */
      const CW = ["見本台", "こども語"].join("");
      const cList = path.join(tmp, "child-list.txt");
      fs.writeFileSync(cList, CW + "\n");
      const CF = loadWords({ env: {}, file: cList }).finger;
      must(child({ KINSHI_JI_FILE: path.join(tmp, "nai.txt") }).code === 1, "一覧なしで 緑");
      const clean = child({ KINSHI_JI_FILE: cList });
      must(
        clean.code === 0 && /追跡物 2 本/.test(clean.out),
        "きれいで 赤 か 名簿が 違う: " + clean.out.split("\n")[0]
      );
      must(
        child({ KINSHI_JI_FILE: cList, KINSHI_JI_FINGER: "00000000" }).code === 1,
        "指紋違いで 緑"
      );
      must(child({ KINSHI_JI_FILE: cList, CI: "true" }).code === 1, "CI で 指紋なしが 緑");
      must(
        child({ KINSHI_JI_FILE: cList, CI: "true", KINSHI_JI_FINGER: CF }).code === 0,
        "CI で 指紋ありが 赤"
      );
      must(child({ KINSHI_JI: CW, KINSHI_JI_FINGER: CF }).code === 0, "secret から 読めない");
      fs.writeFileSync(path.join(repo, "b.txt"), CW + "\n");
      git("add", "-A");
      const red = child({ KINSHI_JI_FILE: cList });
      must(red.code === 1, "当たりで 緑");
      must(!red.out.includes(CW) && !red.out.includes("こども"), "出しに 字が 出た");
    }
  );
  T("追跡物が 0 本なら 1", () => must(go([]).code === 1, "0 本で 緑"));
  T("きれいな 物は 0・分母が 出る・指紋が 出る", () => {
    const x = go([
      put("a.txt", "なにもない\nFakecoX MyFakeco Lounge zorgox MyZorgox ZorgoxY\n"),
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
    must(x.lines[0].includes("指紋 " + FINGER), "指紋が 無い");
  });
  T("当たれば 1・行と 番号が 出る・字は 出ない", () => {
    const x = go([put("b.js", "x\nconst a = '見本台ためし語';\n")]);
    must(
      x.code === 1 && x.r.hits[0].includes("b.js:2") && x.r.hits[0].includes("1 番目"),
      "当たらない"
    );
    must(!leaks(x.lines.join("\n")), "出しに 字が 出た");
  });
  T(
    "揃え方：全角・空白・ハイフン・ー・&#..;・幅なし・異体字の 印・向きの 印・カタカナ／ひらがな",
    () => {
      const rows = [
        "99-8-77",
        "99ー8ー77",
        "カレホン　ためし",
        "見本&#21488;ためし語",
        "見本\u200B台ためし語",
        "見本台\uFE0Fためし語",
        "見本\u200E台ためし語",
        "かれほん ためし",
        "見本台タメシ語",
      ];
      const x = go([put("c.html", rows.join("\n") + "\n")]);
      must(x.r.hits.length === rows.length, rows.length + " 件 当たらない: " + x.r.hits.length);
    }
  );
  T("英字：境目・大文字小文字は 守る／_ ・%20・&nbsp;・空白違い・行またぎは 当たる", () => {
    for (const s of [
      "Fakeco  Lounge",
      "Fakeco_Lounge",
      "Fakeco%20Lounge",
      "Fakeco&nbsp;Lounge",
      "Fakeco\nLounge",
      "fakeco lounge",
      "FAKECO LOUNGE",
      "info@fakeco-lounge.jp",
      "FakecoLounge",
      "fakeco.lounge",
      "Fakeco・Lounge",
      "Fakeco/Lounge",
      "Zorgox",
      "qx@wobble.jp",
      "QX@WOBBLE.JP",
    ])
      must(go([put("d.txt", s + "\n")]).code === 1, JSON.stringify(s) + " で 当たらない");
    must(
      go([put("d.txt", "XFakeco Lounge2\nzorgox MyZorgox ZorgoxY\n")]).code === 0,
      "1語の 小文字・識別子の 一部に 当たった"
    );
  });
  T("行またぎ・HTML の タグで 分かれた 字も 当たる", () => {
    must(
      go([put("e.txt", "見本台\nためし語\n")]).r.hits.some((h) => h.includes("行またぎ")),
      "行またぎ"
    );
    must(
      go([put("e.html", "<span>見本台</span><b>ためし語</b>\n")]).code === 1,
      "タグで 分かれた 字"
    );
  });
  T("zip の 中・<t> に 分かれた 字・入れ子の zip・深すぎる 入れ子は 赤", () => {
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
    let deep = makeZip([["x.txt", "ふつう"]]);
    for (let i = 0; i < 4; i++) deep = makeZip([["d.zip", deep]]);
    must(
      go([put("deep.zip", deep)]).r.reds.some((h) => h.includes("深すぎて")),
      "深すぎる 入れ子が 緑"
    );
  });
  T("作者・会社・利用者の 欄（core・単引用・cmAuthor・absPath・custom）", () => {
    for (const [nm, xml] of [
      ["docProps/core.xml", core("他人")],
      ["word/comments.xml", "<w:comment w:author = '他人' />"],
      ["ppt/commentAuthors.xml", '<p:cmAuthor id="0" name="他人" initials=""/>'],
      ["xl/workbook.xml", '<x15ac:absPath url="C:\\Users\\tanin\\" />'],
      ["docProps/custom.xml", "<property><vt:lpwstr>他人</vt:lpwstr></property>"],
      ["meta.xml", "<meta:initial-creator>他人</meta:initial-creator>"],
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
  T("PDF の 作者（/Author の 16進 UTF-16・XMP の creator）は「空か 見本」だけ", () => {
    const hex = "FEFF" + Buffer.from("他人", "utf16le").swap16().toString("hex");
    must(
      go([put("p1.pdf", "%PDF-1.4\n1 0 obj << /Author <" + hex + "> >> endobj\n")]).code === 1,
      "16進の /Author が 緑"
    );
    must(
      go([
        put(
          "p2.pdf",
          Buffer.from(
            "%PDF-1.4\n<x:xmpmeta><dc:creator><rdf:Seq><rdf:li>他人</rdf:li></rdf:Seq></dc:creator></x:xmpmeta>\n"
          )
        ),
      ]).code === 1,
      "XMP が 緑"
    );
    must(
      go([put("p3.pdf", "%PDF-1.4\n1 0 obj << /Author (見本) /Producer (jsPDF) >> endobj\n")])
        .code === 0,
      "見本の PDF が 赤"
    );
  });
  T("拡張子が 違っても zip なら ほどく", () => {
    const x = go([put("h.bin", makeZip([["x.xml", "<a>見本台ためし語</a>"]]))]);
    must(x.r.c.zips === 1 && x.code === 1, "名前で 選んでいる");
  });
  T("ほどけない zip・鍵の かかった zip・壊れた PNG は 赤", () => {
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
    must(
      go([put("bad.png", makePng([["zTXt", Buffer.from("k\0\0xxxx", "latin1")]]))]).r.reds.some(
        (h) => h.includes("PNG")
      ),
      "壊れた PNG が 緑"
    );
  });
  T(
    "名前に 字が あっても 出さない（中身にも 字・バイナリ・フォルダ・部品名・/ で 分かれた 名前）",
    () => {
      const fs_ = [
        put("見本台ためし語.txt", "見本台ためし語\n"),
        put("見本台ためし語.bin", Buffer.from([0xff, 0x00, 0x81])),
        put("見本台ためし語/x.txt", "見本台ためし語"),
        put("見本台/ためし語.txt", "99-8-77\n"),
        put(
          "k.xlsx",
          makeZip([
            ["見本台ためし語.xml", "<a>見本台ためし語</a>"],
            ["見本台/ためし語.xml", "<a>99-8-77</a>"],
          ])
        ),
      ];
      for (const f of fs_) {
        const x = go([f]);
        must(x.code === 1, "名前で 赤に ならない");
        must(!leaks(x.lines.join("\n")), "出しに 名前が 出た");
      }
    }
  );
  T("作者の 欄が 無い core.xml は 赤", () => {
    must(
      go([put("l.xlsx", makeZip([["docProps/core.xml", "<cp:coreProperties/>"]]))]).code === 1,
      "読めないのに 緑"
    );
  });
  T("UTF-16（BOM あり LE・BE・BOM なし LE）・UTF-8 の BOM でも 当たる", () => {
    const s = "見本台ためし語 Fakeco Lounge";
    const le = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(s, "utf16le")]);
    const be = Buffer.from(le);
    be.swap16();
    const u8 = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(s)]);
    const noBom = Buffer.from("Fakeco Lounge", "utf16le");
    for (const [nm, b] of [
      ["le", le],
      ["be", be],
      ["u8", u8],
      ["nobom", noBom],
    ])
      must(go([put(nm + ".txt", b)]).code === 1, nm + " で 当たらない");
  });
  T("PNG の 字の 塊（tEXt・zTXt・iTXt）を 見る・字の 無い PNG は 黙って 緑", () => {
    must(
      go([put("m.png", makePng([["tEXt", Buffer.from("Author\0Fakeco Lounge", "latin1")]]))])
        .code === 1,
      "tEXt"
    );
    const z = Buffer.concat([
      Buffer.from("Comment\0\0", "latin1"),
      zlib.deflateSync(Buffer.from("Fakeco Lounge")),
    ]);
    must(go([put("n.png", makePng([["zTXt", z]]))]).code === 1, "zTXt");
    const it = Buffer.concat([
      Buffer.from("Title\0\0\0\0\0", "latin1"),
      Buffer.from("見本台ためし語"),
    ]);
    must(go([put("o.png", makePng([["iTXt", it]]))]).code === 1, "iTXt");
    const x = go([put("p.png", makePng([["IHDR", Buffer.alloc(13)]]))]);
    must(x.code === 0 && x.r.notes.length === 0, "字の 無い PNG で 未測定");
    const ex = go([put("ex.png", makePng([["eXIf", Buffer.alloc(4)]]))]);
    must(
      ex.r.notes.some((n) => n.includes("EXIF")),
      "EXIF を 黙っている"
    );
    must(
      go([put("raw.png", Buffer.concat([makePng([]), Buffer.from("Zorgox")]))]).code === 1,
      "IEND の 後ろ"
    );
    must(
      go([
        put(
          "rawj.png",
          Buffer.concat([
            makePng([["prVt", Buffer.from("見本台ためし語")]]),
            Buffer.from("見本台ためし語"),
          ])
        ),
      ]).code === 1,
      "PNG の 中の UTF-8 の 日本語"
    );
    /* 作り物の 語を Shift_JIS で 書いた バイトを PNG の tEXt に */
    const sj = Buffer.concat([
      Buffer.from("Author\0", "latin1"),
      Buffer.from("8ca9967b91e482bd82df82b58cea", "hex"),
    ]);
    must(go([put("sj.png", makePng([["tEXt", sj]]))]).r.hits.length >= 1, "PNG の Shift_JIS");
  });
  T("日本の 古い 字コード・BOM 無しの UTF-16（日本語だけ）・gzip でも 当たる", () => {
    /* 作り物の 語を 各 字コードで 書いた バイト（字の 並びとしては ソースに 載らない） */
    for (const [nm, hex] of [
      ["sjis.csv", "8ca9967b91e482bd82df82b58cea"],
      ["euc.csv", "b8abcbdcc2e6a4bfa4e1a4b7b8ec"],
      ["jis.eml", "1b2442382b4b5c4266243f24612437386c1b2842"],
      ["u16le.txt", "8b892c67f0535f30813057309e8a"],
      ["u16be.txt", "898b672c53f0305f308130578a9e"],
    ])
      must(go([put(nm, Buffer.from(hex, "hex"))]).r.hits.length >= 1, nm + " で 語が 当たらない");
    /* JIS の 語に 色の 印（ESC [0m）が 混ざっても 当たる */
    must(
      go([
        put(
          "jis2.log",
          Buffer.concat([
            Buffer.from("1b5b306d", "hex"),
            Buffer.from("1b2442382b4b5c4266243f24612437386c1b2842", "hex"),
          ])
        ),
      ]).r.hits.length >= 1,
      "色の 印が 混ざった JIS で 当たらない"
    );
    /* 語の 無い BOM 無し UTF-16（日本語だけ）は 赤に しない */
    for (const enc of ["utf16le", "be"]) {
      const b = Buffer.from("ふつうの 日本語の 文です。", "utf16le");
      if (enc === "be") b.swap16();
      must(go([put("plain-" + enc + ".txt", b)]).code === 0, enc + " の ふつうの 文で 赤");
    }
    must(go([put("z.gz", zlib.gzipSync(Buffer.from("見本台ためし語")))]).code === 1, "gzip の 中");
  });
  T("知らない 形の バイナリは 赤・分かっている 形（JPEG 等）は 未測定と 書く", () => {
    const junk = Buffer.from([0x80, 0x81, 0xfe, 0x00, 0x9f, 0x00, 0xff, 0x80, 0xc0, 0x00]);
    const x = go([put("q.dat", junk)]);
    must(x.code === 1 && x.r.reds.some((h) => h.includes("知らない 形")), "知らない バイナリが 緑");
    const j = go([put("q.jpg", Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), junk]))]);
    must(j.code === 0 && j.r.notes.some((n) => n.includes("JPEG")), "JPEG で 赤 か 黙る");
  });
  T("手元に 無い 追跡物・フォルダ（submodule の 形）・LFS の 指し札は 赤", () => {
    must(go(["nai/nai.txt"]).code === 1, "無いのに 緑");
    fs.mkdirSync(path.join(tmp, "sub"), { recursive: true });
    must(go(["sub"]).code === 1, "フォルダが 緑");
    must(
      go([put("big.bin", "version https://git-lfs.github.com/spec/v1\noid sha256:00\nsize 1\n")])
        .code === 1,
      "LFS が 緑"
    );
  });

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("自己確認: " + pass + "/" + (pass + fail));
  return fail ? 1 : 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === SELF;
if (isMain) {
  if (process.argv.includes("--self-test")) process.exit(selfTest());
  const { code, lines } = run();
  for (const l of lines) console.log(l);
  process.exit(code);
}
