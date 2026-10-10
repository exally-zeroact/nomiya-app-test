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
 *   ・★見られない 物（絵・EXIF 等）は「未測定」＝赤★。通すのは tests/kinshi-ji-shiro.txt に「道<TAB>種類（未測定 か 当たりN）<TAB>訳」で 名指しした 道だけ
 * 見ない所（★未測定★）:
 *   ・絵（PNG・JPEG 等）の 画素の 中の 字・PDF の 中の 絵（＝未測定＝赤。目で 見て 白名簿に 名指しする）
 *   ・base64・\uXXXX・%XX（%20 以外）・字の つなぎ（'名'+'前'）・絵の 中の 字
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
/* PDF の 字の 塊（(..) と <..>）を バイトに。(..) は 逃がし（\n \( \ddd 等）を 戻す */
function pdfLiteral(body) {
  const out = [];
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch !== "\\") {
      out.push(ch.charCodeAt(0) & 0xff);
      continue;
    }
    const nx = body[++i];
    if (nx === undefined) break;
    const esc = { n: 10, r: 13, t: 9, b: 8, f: 12 }[nx];
    if (esc !== undefined) out.push(esc);
    else if (/[0-7]/.test(nx)) {
      let oct = nx;
      while (oct.length < 3 && /[0-7]/.test(body[i + 1] || "")) oct += body[++i];
      out.push(parseInt(oct, 8) & 0xff);
    } else if (nx === "\r" || nx === "\n") {
      if (nx === "\r" && body[i + 1] === "\n") i++;
    } else out.push(nx.charCodeAt(0) & 0xff);
  }
  return Buffer.from(out);
}
const STR_TOKEN = /<([0-9A-Fa-f\s]*)>(?!>)|\(((?:\\[\s\S]|[^\\)])*)\)/g;
const tokBytes = (x) =>
  x[1] !== undefined ? Buffer.from(x[1].replace(/\s+/g, ""), "hex") : pdfLiteral(x[2]);
function bytesText(b) {
  if (b[0] === 0xfe && b[1] === 0xff) return utf16be(b.slice(2));
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(b);
  } catch {
    return b.toString("latin1");
  }
}
/* 字の 欄（/Title・/Author 等）として 全部の 字の 塊を 読む */
export function pdfStrings(lt) {
  const out = [];
  for (const x of lt.matchAll(STR_TOKEN)) {
    const b = tokBytes(x);
    if (b.length) out.push(bytesText(b));
  }
  return out;
}
export function pdfAuthors(buf) {
  const t = buf.toString("latin1");
  const out = [];
  for (const m of t.matchAll(/\/Author\s*(<[0-9A-Fa-f\s]*>|\((?:\\[\s\S]|[^\\)])*\))/g)) {
    const x = [...m[1].matchAll(STR_TOKEN)][0];
    if (x) out.push(["PDF /Author", bytesText(tokBytes(x))]);
  }
  const u = new TextDecoder("utf-8").decode(buf);
  for (const m of u.matchAll(/<dc:creator>([\s\S]*?)<\/dc:creator>/g))
    out.push(["PDF XMP creator", m[1].replace(/<[^>]*>/g, "")]);
  for (const m of u.matchAll(/<pdf:Author>([\s\S]*?)<\/pdf:Author>/g))
    out.push(["PDF XMP Author", m[1]]);
  return out;
}

/* ---------- PDF の 流れを ほどく＝読めない 所は problems（未測定）・壊れは errors（赤） ---------- */
const PDF_IMAGE = new Set(["DCTDecode", "JPXDecode", "CCITTFaxDecode", "JBIG2Decode"]);
export function pdfStreams(buf) {
  const t = buf.toString("latin1");
  const streams = [];
  const problems = [];
  const errors = [];
  let images = 0;
  let counted = 0;
  const re = /stream[ \t]*(?:\r\n|\r|\n)/g;
  let m;
  while ((m = re.exec(t))) {
    if (t.slice(m.index - 3, m.index) === "end") continue;
    let e = m.index;
    while (e > 0 && /\s/.test(t[e - 1])) e--;
    if (t.slice(e - 2, e) !== ">>") continue;
    counted++;
    let q = e;
    let depth = 0;
    while (q >= 2) {
      const two = t.slice(q - 2, q);
      if (two === ">>") {
        depth++;
        q -= 2;
      } else if (two === "<<") {
        depth--;
        q -= 2;
        if (depth === 0) break;
      } else q--;
    }
    const dict = t.slice(q, e);
    const start = m.index + m[0].length;
    const lenM = dict.match(/\/Length\s+(\d+)(?!\s+\d+\s+R)/);
    let end = t.indexOf("endstream", start);
    if (end < 0) {
      errors.push("流れの 終わりが 無い");
      break;
    }
    if (
      lenM &&
      t.slice(start + Number(lenM[1]), start + Number(lenM[1]) + 30).includes("endstream")
    )
      end = start + Number(lenM[1]);
    let data = buf.slice(start, end);
    re.lastIndex = end;
    if (/\/Filter\s*\d+\s+\d+\s+R/.test(dict) || /\/DecodeParms\s*\d+\s+\d+\s+R/.test(dict)) {
      problems.push("縮め方が 間接参照で 分からない 流れ");
      continue;
    }
    const fm = dict.match(/\/Filter\s*(\[[^\]]*\]|\/\w+)/);
    const filters = fm ? [...fm[1].matchAll(/\/(\w+)/g)].map((x) => x[1]) : [];
    if (filters.some((f) => PDF_IMAGE.has(f)) || /\/Subtype\s*\/Image\b/.test(dict)) {
      images++;
      continue;
    }
    try {
      for (const f of filters) {
        if (f === "FlateDecode" || f === "Fl") data = zlib.inflateSync(data);
        else if (f === "ASCIIHexDecode" || f === "AHx")
          data = Buffer.from(data.toString("latin1").replace(/[^0-9A-Fa-f]/g, ""), "hex");
        else throw new Error("知らない 縮め方 " + f);
      }
    } catch (err) {
      errors.push("流れを ほどけない（" + err.message + "）");
      continue;
    }
    streams.push({ dict, data });
  }
  const ends = (t.match(/endstream/g) || []).length;
  if (ends !== counted)
    problems.push("流れの 数が 合わない（endstream " + ends + "・拾えた " + counted + "）");
  if (/\/Encrypt\b/.test(t)) problems.push("鍵の かかった 中身");
  return { streams, problems, errors, images };
}

/* ToUnicode の 表（bfchar・bfrange）＝字形の 番号 → 字 */
export function cmapOf(text) {
  const map = new Map();
  const h2s = (h) => utf16be(Buffer.from(h, "hex"));
  for (const blk of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g))
    for (const x of blk[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g))
      map.set(x[1].toLowerCase(), h2s(x[2]));
  for (const blk of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g))
    for (const x of blk[1].matchAll(
      /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(?:<([0-9A-Fa-f]+)>|\[([^\]]*)\])/g
    )) {
      const lo = parseInt(x[1], 16);
      const hi = parseInt(x[2], 16);
      if (!(hi >= lo) || hi - lo > 65535) continue;
      const arr = x[4] ? [...x[4].matchAll(/<([0-9A-Fa-f]+)>/g)].map((y) => y[1]) : null;
      for (let k = 0; k <= hi - lo; k++) {
        const key = (lo + k).toString(16).padStart(x[1].length, "0");
        if (arr) {
          if (arr[k]) map.set(key, h2s(arr[k]));
        } else if (x[3] && x[3].length >= 4) {
          const b = Buffer.from(x[3], "hex");
          b.writeUInt16BE((b.readUInt16BE(b.length - 2) + k) & 0xffff, b.length - 2);
          map.set(key, utf16be(b));
        }
      }
    }
  return map;
}
/* 書体ごとの 表を 1つに まとめる。同じ 番号が 違う 字を 指したら ぶつかり（＝どの 字か 決められない） */
export function mergeCmaps(datas) {
  const map = new Map();
  let conflict = false;
  for (const d of datas) {
    const lt = d.toString("latin1");
    if (!lt.includes("begincmap")) continue;
    for (const [k, v] of cmapOf(lt)) {
      if (map.has(k) && map.get(k) !== v) conflict = true;
      map.set(k, v);
    }
  }
  return { map, conflict };
}

/* 文字を 書く 所（BT … ET）の 字の 塊を、表で 引いて つなぐ。
   CID の 書体（Type0・Identity-H 等）で 表に 無い 番号は missing に 数える（黙って 緑に しない） */
export function shownTexts(text, map, cid) {
  const widths = [...new Set([...map.keys()].map((k) => k.length))].sort((a, b) => b - a);
  const pieces = [];
  let missing = 0;
  for (const seg of text.match(/\bBT\b[\s\S]*?\bET\b/g) || []) {
    for (const x of seg.matchAll(STR_TOKEN)) {
      const hex = tokBytes(x).toString("hex");
      let out = "";
      let i = 0;
      while (i < hex.length) {
        const w = widths.find((wd) => map.has(hex.slice(i, i + wd)));
        if (w) {
          out += map.get(hex.slice(i, i + w));
          i += w;
        } else if (cid) {
          missing++;
          i += 4;
        } else {
          out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
          i += 2;
        }
      }
      if (out) pieces.push(out);
    }
  }
  return { texts: [pieces.join(""), pieces.join("\n")], missing };
}

/* xlsx の 印刷の 設定（DEVMODE）＝大きさが 合えば 形として 読めた（装置名は UTF-16LE で 当てる） */
function isDevmode(label, buf) {
  if (!/printerSettings\d*\.bin$/i.test(label) || buf.length < 72) return false;
  const size = buf.readUInt16LE(68);
  const extra = buf.readUInt16LE(70);
  return size >= 68 && size + extra === buf.length;
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
    pdfStreams: 0,
    unreadable: 0,
    nameChecks: 0,
  };
  const hits = [];
  const hit = (s) => {
    if (!hitSet.has(s)) {
      hitSet.add(s);
      hits.push(s);
    }
  };
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
      notes.push(label + ": PNG の 絵の 中の 字（画素）は 見ていない（未測定）");
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
      const pdf = pdfStreams(buf);
      for (const e of pdf.errors) reds.push(label + ": PDF の " + e + "（未測定＝赤）");
      for (const pr of pdf.problems) notes.push(label + ": PDF の " + pr + "（未測定）");
      if (pdf.images)
        notes.push(label + ": PDF の 中の 絵 " + pdf.images + " 個は 見ていない（未測定）");
      const isEmb = (st) => /\/EmbeddedFile\b/.test(st.dict);
      pdf.streams
        .filter(isEmb)
        .forEach((st, k) => scanBlob(label + "(添付 " + (k + 1) + ")", st.data, depth + 1));
      const body = pdf.streams.filter((st) => !isEmb(st)).map((st) => st.data);
      for (const b of [buf, ...body])
        for (const [kind, v] of pdfAuthors(b)) {
          c.pdfAuthors++;
          checkName(label, kind, v);
        }
      const { map, conflict } = mergeCmaps(body);
      if (conflict)
        notes.push(label + ": PDF の 書体の 表が ぶつかる（どの 字か 決められない＝未測定）");
      const lts = [buf.toString("latin1"), ...body.map((b) => b.toString("latin1"))];
      const cid = lts.some((x) =>
        /\/Type0\b|Identity-[HV]|\/CIDFontType|-UCS2-|-RKSJ-|\/Encoding\s*\/[\w-]+-[HV]\b/.test(x)
      );
      let missing = 0;
      for (const lt of lts) {
        const sh = shownTexts(lt, map, cid);
        missing += sh.missing;
        for (const t of sh.texts) scanText(label + "(PDF の 字)", t);
        for (const t of pdfStrings(lt)) scanText(label + "(PDF の 字の 欄)", t);
      }
      if (missing) notes.push(label + ": PDF の 字形 " + missing + " 個を 表で 引けない（未測定）");
      for (const b of body) {
        c.pdfStreams++;
        for (const t of readTexts(b).texts) scanText(label + "(PDF の 流れ)", t);
      }
      for (const t of readTexts(buf).texts) scanText(label, t);
      return;
    }
    const head = buf.slice(0, 200).toString("latin1");
    if (head.startsWith("version https://git-lfs"))
      return reds.push(label + ": LFS の 指し札＝中身を 見ていない（未測定＝赤）");
    const { ok, texts } = readTexts(buf);
    if (!ok && isDevmode(label, buf)) {
      for (const t of texts) scanText(label, t);
      return;
    }
    /* 絵・字形は 中の 字を 見られない＝字コードで たまたま 読めても 未測定（小さい 物で 逃げない） */
    const pic = knownBinary(label, buf);
    if (ok && pic && pic !== "印刷の 設定") {
      c.unreadable++;
      notes.push(label + ": " + pic + " の 中の 字は 見ていない（未測定）");
    }
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

  const shiro = loadShiro(root, words);
  const passed = [];
  files.forEach((rel, idx) => {
    const before = [hits.length, notes.length];
    scanFile(rel, idx);
    const ent = shiro.map.get(rel);
    if (!ent) return;
    ent.used = true;
    const lab = named(rel, "(追跡物の " + (idx + 1) + " 本目)");
    if (ent.kind === "未測定") {
      const n = notes.length - before[1];
      if (!n) return reds.push("白名簿: " + lab + " に 未測定が 無い＝要らなくなった");
      notes.splice(before[1]);
      passed.push({ label: lab, kind: ent.kind, n });
    } else {
      const n = hits.length - before[0];
      if (n !== ent.count)
        return reds.push(
          "白名簿: " + lab + " の 当たりの 数が 違う（名指し " + ent.count + "・今 " + n + "）"
        );
      hits.splice(before[0]);
      passed.push({ label: lab, kind: ent.kind, n });
    }
  });
  for (const e of shiro.errors) reds.push("白名簿: " + e);
  for (const [rel, ent] of shiro.map)
    if (!ent.used) reds.push("白名簿の 道が 追跡物に 無い（" + named(rel, "名指しの 道") + "）");
  return { hits, notes, reds, c, passed };

  function scanFile(rel, idx) {
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
  }
}

/* ---------- 白名簿（tests/kinshi-ji-shiro.txt）＝「道<TAB>種類<TAB>訳」 ----------
   種類＝「未測定」（その 道の 未測定だけ 通す）か「当たりN」（その 道の 当たりを ちょうど N 件 だけ 通す・増えたら 赤）。
   ★白名簿 自身の 道・訳に 一覧の 字・同じ 道の 2行・知らない 種類 は 赤★。訳は 出しに 書かない。 */
export const SHIRO_PATH = "tests/kinshi-ji-shiro.txt";
export function loadShiro(root, words = []) {
  const map = new Map();
  const errors = [];
  const f = path.join(root, SHIRO_PATH);
  if (!fs.existsSync(f)) return { map, errors };
  fs.readFileSync(f, "utf8")
    .split(/\r?\n/)
    .forEach((line, i) => {
      if (!line.trim() || line.startsWith("#")) return;
      const at = i + 1 + " 行目";
      if (matchIdx(line, words).length)
        return errors.push(at + " に 一覧の 字が ある（字は 出さない）");
      const [rel, kind, why] = line.split("\t").map((x) => (x || "").trim());
      if (!rel || !kind || !why) return errors.push(at + " の 形が 違う（道<TAB>種類<TAB>訳）");
      if (rel === SHIRO_PATH) return errors.push(at + " で 白名簿 自身を 名指ししている");
      if (map.has(rel)) return errors.push(at + " で 同じ 道を 2回 名指ししている");
      const hm = kind.match(/^当たり(\d+)$/);
      if (kind !== "未測定" && !hm)
        return errors.push(at + " の 種類が 知らない 形（未測定 か 当たりN）");
      map.set(rel, { kind, count: hm ? Number(hm[1]) : 0, used: false });
    });
  return { map, errors };
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
      " 個・PDF の 流れ " +
      r.c.pdfStreams +
      " 個・字として 読めない " +
      r.c.unreadable +
      " 本"
  );
  for (const pz of r.passed)
    lines.push("  白名簿で 通した: " + pz.label + "（" + pz.kind + "）" + pz.n + " 件");
  for (const n of r.notes) lines.push("  赤（未測定）: " + n);
  for (const x of r.reds) lines.push("  赤: " + x);
  for (const h of r.hits) lines.push("  赤: " + h);
  if (r.c.files === 0) {
    lines.push("✗ 追跡物が 0 本＝何も 見ていない");
    return { code: 1, lines, r };
  }
  if (r.hits.length || r.reds.length || r.notes.length || fingerRed) {
    lines.push(
      "✗ 赤 " + (r.hits.length + r.reds.length + r.notes.length + (fingerRed ? 1 : 0)) + " 件"
    );
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
function makePdf(objs) {
  const parts = [Buffer.from("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n", "latin1")];
  objs.forEach(([dict, data], i) => {
    const body = Buffer.isBuffer(data) ? data : Buffer.from(data, "latin1");
    parts.push(
      Buffer.from(
        i + 1 + " 0 obj\n<< " + dict + " /Length " + body.length + " >>\nstream\n",
        "latin1"
      )
    );
    parts.push(body, Buffer.from("\nendstream\nendobj\n", "latin1"));
  });
  parts.push(Buffer.from("trailer\n<< >>\n%%EOF\n", "latin1"));
  return Buffer.concat(parts);
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
  T("PNG の 字の 塊（tEXt・zTXt・iTXt）を 見る・絵（画素）は 未測定", () => {
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
    must(
      x.code === 1 && x.r.hits.length === 0 && x.r.notes.length === 1,
      "絵の 未測定を 黙っている"
    );
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
    must(j.code === 1 && j.r.notes.some((n) => n.includes("JPEG")), "JPEG の 未測定が 緑");
  });
  T("白名簿：未測定／当たりN だけ 通す・自分の 名指し・訳の 字・2行・数違い・無い 道は 赤", () => {
    const sf = path.join(tmp, SHIRO_PATH);
    fs.mkdirSync(path.dirname(sf), { recursive: true });
    const jpg = put("w.jpg", Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x80, 0x81, 0x00]));
    const txt = put("w.txt", "見本台ためし語\n");
    const clean = put("w2.txt", "ふつう\n");
    const w = (body) => fs.writeFileSync(sf, body);
    const reds = (x) => x.r.reds.join("\n");
    try {
      w(jpg + "\t未測定\t絵だけ\n" + txt + "\t当たり1\t法律で 載せる 表示\n");
      const ok = go([jpg, txt, clean]);
      must(
        ok.code === 0 && ok.lines.filter((l) => l.includes("白名簿で 通した")).length === 2,
        "名指しで 通らない"
      );
      must(
        !ok.lines.join("\n").includes("法律") && !ok.lines.join("\n").includes("ためし"),
        "訳か 字が 出た"
      );
      w(jpg + "\t当たり0\t絵\n");
      must(go([jpg]).code === 1, "未測定を 当たりの 名指しで 通した");
      w(txt + "\t未測定\t字\n");
      must(go([txt]).code === 1, "当たりを 未測定の 名指しで 通した");
      fs.appendFileSync(path.join(tmp, txt), "見本台ためし語 もう1つ\n");
      w(txt + "\t当たり1\t字\n");
      must(reds(go([txt])).includes("当たりの 数が 違う"), "当たりが 増えても 緑");
      w(jpg + "\t未測定\n");
      must(reds(go([jpg])).includes("形が 違う"), "訳の 無い 行が 赤に ならない");
      w(clean + "\t未測定\t要らない\n");
      must(reds(go([clean])).includes("要らなくなった"), "通す 物が 無い 白名簿で 緑");
      w("nai/nai.jpg\t未測定\t無い\n");
      must(reds(go([clean])).includes("追跡物に 無い"), "無い 道の 白名簿で 緑");
      w(SHIRO_PATH + "\t当たり1\t自分\n");
      must(reds(go([clean])).includes("自身を 名指し"), "自分の 名指しで 緑");
      w(jpg + "\t未測定\t見本台ためし語 の 訳\n");
      const lk = go([jpg]);
      must(
        reds(lk).includes("一覧の 字が ある") && !lk.lines.join("\n").includes("ためし"),
        "訳の 字で 緑 か 出た"
      );
      w(jpg + "\t未測定\tA\n" + jpg + "\t未測定\tB\n");
      must(reds(go([jpg])).includes("2回"), "同じ 道の 2行で 緑");
      w(jpg + "\t何か\tA\n");
      must(reds(go([jpg])).includes("知らない 形"), "知らない 種類で 緑");
    } finally {
      fs.rmSync(sf, { force: true });
    }
  });
  T(
    "PDF：縮めた 流れ・表で 引いた 字（bfrange・bfchar）・8進・流れの 中の /Title・/Author・添付・ASCIIHex",
    () => {
      const fl = (s2) => zlib.deflateSync(Buffer.from(s2, "latin1"));
      const hit = (nm, objs) => go([put(nm, makePdf(objs))]).r.hits.length >= 1;
      must(hit("s1.pdf", [["/Filter /FlateDecode", fl("BT (Zorgox) Tj ET")]]), "縮めた 流れ");
      /* 作り物の 語の UTF-16BE を 字形 1〜7 番に 割り当てた 表 */
      const rng = "<0001> <0007> [<898B> <672C> <53F0> <305F> <3081> <3057> <8A9E>]";
      const content = "BT /F1 12 Tf [<00010002> 5 <0003000400050006>] TJ <0007> Tj ET";
      must(
        hit("s2.pdf", [
          [
            "/Filter /FlateDecode",
            fl("begincmap\n1 beginbfrange\n" + rng + "\nendbfrange\nendcmap"),
          ],
          ["/Filter /FlateDecode", fl("/Type0 /Encoding /Identity-H\n" + content)],
        ]),
        "bfrange で 引いた 字"
      );
      const chars = ["898B", "672C", "53F0", "305F", "3081", "3057", "8A9E"]
        .map((h, i) => "<000" + (i + 1) + "> <" + h + ">")
        .join("\n");
      must(
        hit("s2b.pdf", [
          [
            "/Filter /FlateDecode",
            fl("begincmap\n7 beginbfchar\n" + chars + "\nendbfchar\nendcmap"),
          ],
          ["/Filter /FlateDecode", fl("/Type0 /Encoding /Identity-H\n" + content)],
        ]),
        "bfchar で 引いた 字"
      );
      must(
        hit("s6.pdf", [["/Filter /FlateDecode", fl("BT (\\132\\157rgox) Tj ET")]]),
        "8進の 逃がし"
      );
      const t16 = "FEFF" + Buffer.from("見本台ためし語", "utf16le").swap16().toString("hex");
      must(
        hit("s7.pdf", [["/Type /ObjStm /Filter /FlateDecode", fl("<< /Title <" + t16 + "> >>")]]),
        "流れの 中の UTF-16 の /Title"
      );
      must(
        go([
          put(
            "s8.pdf",
            makePdf([["/Type /ObjStm /Filter /FlateDecode", fl("<< /Author (他人) >>")]])
          ),
        ]).code === 1,
        "流れの 中の /Author"
      );
      /* 前に 字を 足して 縮みの 形を 変える＝縮んだ バイトの 中に 語が そのまま 見えない（ほどかないと 当たらない） */
      const emb = makeZip([["x.xml", "<a>" + "ふつうの 字 ".repeat(40) + "見本台ためし語</a>"]]);
      must(hit("s9.pdf", [["/Type /EmbeddedFile", emb]]), "添付の zip の 中");
      must(
        hit("s10.pdf", [
          ["/Filter /ASCIIHexDecode", Buffer.from("BT (Zorgox) Tj ET").toString("hex") + ">"],
        ]),
        "ASCIIHex"
      );
      must(
        go([put("s5.pdf", makePdf([["/Filter /FlateDecode", fl("BT (ok) Tj ET")]]))]).code === 0,
        "きれいな PDF が 赤"
      );
    }
  );
  T(
    "PDF：読めない 所は 未測定（表に 無い 字形・表の ぶつかり・絵・数違い・間接の 縮め方・鍵）・壊れは 赤",
    () => {
      const fl = (s2) => zlib.deflateSync(Buffer.from(s2, "latin1"));
      const note = (nm, objs, why) => {
        const x = go([put(nm, Buffer.isBuffer(objs) ? objs : makePdf(objs))]);
        must(x.code === 1 && x.r.notes.length >= 1, why + " を 黙っている");
      };
      note(
        "u1.pdf",
        [["/Filter /FlateDecode", fl("/Type0 /Encoding /Identity-H\nBT <00010002> Tj ET")]],
        "表の 無い CID"
      );
      note(
        "u2.pdf",
        [
          [
            "/Filter /FlateDecode",
            fl("begincmap\n1 beginbfchar\n<0001> <0041>\nendbfchar\nendcmap"),
          ],
          [
            "/Filter /FlateDecode",
            fl("begincmap\n1 beginbfchar\n<0001> <0042>\nendbfchar\nendcmap"),
          ],
        ],
        "表の ぶつかり"
      );
      note("u3.pdf", [["/Filter /DCTDecode", Buffer.from([0xff, 0xd8, 0xff])]], "中の 絵（DCT）");
      note("u4.pdf", [["/Subtype /Image /Filter /FlateDecode", fl("xx")]], "中の 絵（Flate）");
      note("u5.pdf", [["/Filter 7 0 R", Buffer.from("xx")]], "間接の 縮め方");
      note(
        "u6.pdf",
        Buffer.concat([
          makePdf([["/Filter /FlateDecode", fl("BT (ok) Tj ET")]]),
          Buffer.from("\nendstream\n"),
        ]),
        "流れの 数違い"
      );
      note(
        "u7.pdf",
        Buffer.concat([Buffer.from("%PDF-1.4\n/Encrypt 5 0 R\n"), makePdf([["", "ok"]])]),
        "鍵"
      );
      must(
        go([put("u8.pdf", makePdf([["/Filter /FlateDecode", Buffer.from("not deflate")]]))]).r.reds
          .length >= 1,
        "壊れた 流れが 緑"
      );
    }
  );
  T("xlsx の 印刷の 設定（DEVMODE）は 形を 見て 読む・形が 合わなければ 読めない 扱い", () => {
    const dm = (name, size = 220) => {
      const b = Buffer.alloc(220);
      b.write(name, 0, "utf16le");
      b.writeUInt16LE(size, 68);
      b.writeUInt16LE(0, 70);
      b[100] = 0x81;
      b[101] = 0xff;
      return b;
    };
    const core2 =
      '<cp:coreProperties xmlns:cp="x" xmlns:dc="y"><dc:creator>見本</dc:creator><cp:lastModifiedBy>見本</cp:lastModifiedBy></cp:coreProperties>';
    const z = (b) =>
      makeZip([
        ["docProps/core.xml", core2],
        ["xl/printerSettings/printerSettings1.bin", b],
      ]);
    const ok = go([put("dm1.xlsx", z(dm("Some Printer")))]);
    must(
      ok.code === 0 && ok.r.notes.length === 0,
      "ふつうの DEVMODE で 赤 か 未測定: " + ok.lines.join(" / ")
    );
    must(
      go([put("dm2.xlsx", z(dm("Zorgox Printer")))]).r.hits.length >= 1,
      "装置名の 字に 当たらない"
    );
    const bad = go([put("dm3.xlsx", z(dm("Some Printer", 100)))]);
    must(bad.code === 1, "大きさの 合わない 印刷の 設定が 緑");
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
