/* kinshi-ji.test.mjs — ★公開 repo に 実在の 字（司さん・会社・お客さんの 本物）を 戻さない★
 *
 * なぜ要るか（2026-10-10）:
 *   公開 repo の 試験と 見本に、司さんの 住所・実名（xlsx の 作者の欄）・本物の 取引先の 名前が 残っていた。
 *   作り物に 替えたが、見張りが 無いと また 戻る（台本で xlsx を 作り直すと 作者名が 戻る 等）。
 *
 * ★禁止の 字の 一覧は repo に 置かない★（ここに 書くと 名前を もう一度 公開する）
 *   CI      … GitHub Actions の secret KINSHI_JI（1行に 1語）
 *   手元    … C:/Users/zeroa/.tsukurimono/kinshi-ji.txt（repo の 外）
 *   ★どちらも 無い 時は「未測定」で 赤★（緑に 倒さない）
 *
 * ★当たった 時に 字を 出さない★（公開の CI ログは 誰でも 読める）
 *   出すのは「ファイル・行・一覧の 何番目か」だけ。ファイル名に 当たった 時は 名前も 出さない。
 *
 * 見る所:
 *   ・git が 追跡している 全部の ファイル（字として）
 *   ・zip（PK で 始まる 物＝xlsx/docx/pptx 等。拡張子では 選ばない）は 全部 ほどいて 中の 全部の 部品
 *     XML は タグを 外して つないだ 字にも 当てる（字が <t> に 分かれていても 拾う）
 *   ・照合の 前に 揃える：&#..; を 戻す → NFKC → ハイフンの 仲間を - に → 空白を 全部 消す
 *   ・zip の 作者の 欄（creator・lastModifiedBy・author・Company・Manager 等）は「空か 見本」だけ 通す
 *   ・ほどけない zip は 赤（見ないまま 緑に しない）
 * 見ない所（出しに 本数を 出す）:
 *   ・zip でない バイナリ（png・pdf の 圧縮された 中身）＝★字の 見張りでは 見えない★
 *   ・行を またいだ 字（1行ずつ 当てる。XML の 結合だけは 別に 当てる）
 *
 * 使い方: node tests/kinshi-ji.test.mjs
 *         node tests/kinshi-ji.test.mjs --self-test
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOCAL_LIST = path.join(os.homedir(), ".tsukurimono", "kinshi-ji.txt");
const OK_NAMES = new Set(["", "見本"]);

/* ---------- 揃える ---------- */
export function norm(s) {
  return String(s)
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => safeCp(parseInt(h, 16), m))
    .replace(/&#(\d+);/g, (m, d) => safeCp(parseInt(d, 10), m))
    .normalize("NFKC")
    .replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, "-")
    .replace(/\s+/g, "");
}
function safeCp(n, orig) {
  try {
    return String.fromCodePoint(n);
  } catch {
    return orig;
  }
}

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
  if (raw === null) return { words: [], from: null };
  const seen = new Set();
  const words = [];
  for (const line of raw.split(/\r?\n/)) {
    const w = norm(line);
    if (w && !seen.has(w)) {
      seen.add(w);
      words.push(w);
    }
  }
  return { words, from };
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
    if (flag & 1) throw new Error("鍵の かかった zip: " + k + "番目の 部品");
    if (buf.readUInt32LE(lho) !== 0x04034b50) throw new Error("zip の 部品の 頭が 壊れている");
    const start = lho + 30 + buf.readUInt16LE(lho + 26) + buf.readUInt16LE(lho + 28);
    const comp = buf.slice(start, start + csize);
    let data;
    if (method === 0) data = comp;
    else if (method === 8) data = zlib.inflateRawSync(comp);
    else throw new Error("知らない 圧縮の 形 " + method + ": " + k + "番目の 部品");
    out.push({ name, data });
  }
  if (count === 0) throw new Error("zip の 部品が 0");
  return out;
}

function decode(buf) {
  if (buf[0] === 0xff && buf[1] === 0xfe) return buf.slice(2).toString("utf16le");
  return new TextDecoder("utf-8").decode(buf);
}

/* ---------- 作者の 欄 ---------- */
const NAME_TAGS =
  /<(?:[\w-]+:)?(creator|lastModifiedBy|Company|Manager|initial-creator|author)\b[^>]*?(?:\/>|>([\s\S]*?)<\/(?:[\w-]+:)?\1>)/g;
const NAME_ATTRS = /\s(?:[\w-]+:)?(author|displayName|initials)="([^"]*)"/g;
export function nameFields(xml) {
  const out = [];
  for (const m of xml.matchAll(NAME_TAGS)) out.push(norm((m[2] || "").replace(/<[^>]*>/g, "")));
  for (const m of xml.matchAll(NAME_ATTRS)) out.push(norm(m[2]));
  return out;
}

/* ---------- 1つの 塊に 当てる ---------- */
function scanText(label, text, words, hits) {
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const n = norm(lines[i]);
    if (!n) continue;
    for (let w = 0; w < words.length; w++)
      if (n.includes(words[w])) hits.push(label + ":" + (i + 1) + ": 一覧の " + (w + 1) + " 番目");
  }
}

/* ---------- 本体 ---------- */
export function scan({ root, files, words }) {
  const hits = [];
  const notes = [];
  const c = { files: 0, zips: 0, parts: 0, binaries: 0, nameChecks: 0 };
  files.forEach((rel, idx) => {
    c.files++;
    const nRel = norm(rel);
    for (let w = 0; w < words.length; w++)
      if (nRel.includes(words[w]))
        hits.push(
          "追跡物の " +
            (idx + 1) +
            " 本目の ファイル名: 一覧の " +
            (w + 1) +
            " 番目（名前は 出さない）"
        );
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs) || fs.statSync(abs).isDirectory()) return;
    const buf = fs.readFileSync(abs);
    if (buf.length >= 4 && buf.readUInt32LE(0) === 0x04034b50) {
      c.zips++;
      let parts;
      try {
        parts = unzip(buf);
      } catch (e) {
        hits.push(rel + ": zip を ほどけない（見ないまま 緑に しない）… " + e.message);
        return;
      }
      for (const part of parts) {
        c.parts++;
        const label = rel + "!" + part.name;
        for (let w = 0; w < words.length; w++)
          if (norm(part.name).includes(words[w]))
            hits.push(rel + " の 部品名: 一覧の " + (w + 1) + " 番目");
        const text = decode(part.data);
        scanText(label, text, words, hits);
        if (/\.(xml|rels|vml)$/i.test(part.name)) {
          const joined = norm(text.replace(/<[^>]*>/g, ""));
          for (let w = 0; w < words.length; w++)
            if (joined.includes(words[w]))
              hits.push(label + ":(タグを 外して つないだ 字): 一覧の " + (w + 1) + " 番目");
          for (const v of nameFields(text)) {
            c.nameChecks++;
            if (!OK_NAMES.has(v))
              hits.push(label + ": 作者・会社の 欄が「空か 見本」でない（字は 出さない）");
          }
        }
        if (/^docProps\/core\.xml$/i.test(part.name)) {
          const has = (t) => new RegExp("<(?:[\\w-]+:)?" + t + "\\b").test(text);
          if (!has("creator") || !has("lastModifiedBy"))
            notes.push(label + ": 作者の 欄が 読めない（未測定）");
        }
      }
      return;
    }
    if (buf.includes(0)) {
      c.binaries++;
      notes.push(rel + ": zip でない バイナリ＝中の 圧縮された 字は 見えない（未測定）");
    }
    scanText(rel, decode(buf), words, hits);
  });
  return { hits, notes, c };
}

function gitFiles(root) {
  return execFileSync("git", ["-C", root, "ls-files", "-z"], { encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
}

function report({ hits, notes, c }, words, from) {
  const lines = [];
  lines.push(
    "一覧＝" +
      from +
      "・" +
      words.length +
      "語 ／ 追跡物 " +
      c.files +
      " 本・zip " +
      c.zips +
      " 本（部品 " +
      c.parts +
      "）・作者の欄 " +
      c.nameChecks +
      " 個・zip でない バイナリ " +
      c.binaries +
      " 本"
  );
  for (const n of notes) lines.push("  未測定: " + n);
  for (const h of hits) lines.push("  赤: " + h);
  return lines;
}

function main() {
  const { words, from } = loadWords();
  if (!words.length) {
    console.log(
      "✗ 未測定＝禁止の 字の 一覧が 無い（secret KINSHI_JI も " +
        LOCAL_LIST +
        " も 無い）。緑には しない。"
    );
    process.exit(1);
  }
  const r = scan({ root: ROOT, files: gitFiles(ROOT), words });
  for (const l of report(r, words, from)) console.log(l);
  const coreUnread = r.notes.filter((n) => n.includes("作者の 欄が 読めない")).length;
  if (r.c.files === 0) {
    console.log("✗ 追跡物が 0 本＝何も 見ていない");
    process.exit(1);
  }
  if (r.hits.length || coreUnread) {
    console.log("✗ 赤 " + r.hits.length + " 件・作者の欄が 読めない zip " + coreUnread + " 本");
    process.exit(1);
  }
  console.log("✓ 実在の 字 0 件（" + r.c.files + " 本・zip の 部品 " + r.c.parts + " 個を 見た）");
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
  for (const [name, text] of entries) {
    const raw = Buffer.from(text, "utf8");
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
  const W_RAW = ["見本台ためし語", "９９－８－７７", "カレホン ためし"];
  const listFile = path.join(tmp, "list.txt");
  fs.writeFileSync(listFile, W_RAW.join("\n") + "\n");
  const { words } = loadWords({ env: {}, file: listFile });
  const core = (who) =>
    '<cp:coreProperties xmlns:cp="x" xmlns:dc="y"><dc:creator>' +
    who +
    "</dc:creator><cp:lastModifiedBy>見本</cp:lastModifiedBy></cp:coreProperties>";
  const put = (name, data) => {
    fs.mkdirSync(path.dirname(path.join(tmp, name)), { recursive: true });
    fs.writeFileSync(path.join(tmp, name), data);
    return name;
  };
  const run = (files) => scan({ root: tmp, files, words });
  const leaks = (r) => {
    const all = report(r, words, "ためし").join("\n");
    return W_RAW.some((w) => all.includes(w) || norm(all).includes(norm(w)));
  };

  T("一覧が 無い時は 語が 0（main は 未測定で 赤）", () => {
    must(
      loadWords({ env: {}, file: path.join(tmp, "nai.txt") }).words.length === 0,
      "無いのに 語が ある"
    );
    must(
      loadWords({ env: { KINSHI_JI: "あ\nい" }, file: null }).words.length === 2,
      "secret から 読めない"
    );
  });
  T("きれいな 物は 緑・分母が 出る", () => {
    const f = [
      put("a.txt", "なにもない\n"),
      put(
        "ok.xlsx",
        makeZip([
          ["docProps/core.xml", core("見本")],
          ["xl/a.xml", "<t>ふつう</t>"],
        ])
      ),
    ];
    const r = run(f);
    must(r.hits.length === 0, "赤が ある: " + r.hits.length);
    must(
      r.c.files === 2 && r.c.zips === 1 && r.c.parts === 2 && r.c.nameChecks === 2,
      "分母が 違う " + JSON.stringify(r.c)
    );
  });
  T("ふつうの 字で 赤・出しに 字が 出ない", () => {
    const r = run([put("b.js", "x\nconst a = '見本台ためし語';\n")]);
    must(
      r.hits.length === 1 && r.hits[0].includes("b.js:2") && r.hits[0].includes("1 番目"),
      "当たらない: " + r.hits
    );
    must(!leaks(r), "出しに 字が 出た");
  });
  T("全角・空白・ハイフン違い・&#..; でも 赤", () => {
    const r = run([put("c.html", "99-8-77\nカレホン　ためし\n見本&#21488;ためし語\n")]);
    must(r.hits.length === 3, "3件 当たらない: " + r.hits.length);
    must(!leaks(r), "出しに 字が 出た");
  });
  T("zip の 中（deflate）・<t> に 分かれた 字でも 赤", () => {
    const z = makeZip([
      ["docProps/core.xml", core("見本")],
      ["xl/sharedStrings.xml", "<si><r><t>見本台</t></r><r><t>ためし語</t></r></si>"],
    ]);
    const r = run([put("d.xlsx", z)]);
    must(
      r.hits.some((h) => h.includes("タグを 外して")),
      "分かれた 字を 拾わない: " + r.hits
    );
    must(!leaks(r), "出しに 字が 出た");
  });
  T("作者の 欄が 見本でなければ 赤（字は 出さない）", () => {
    const r = run([put("e.xlsx", makeZip([["docProps/core.xml", core("他人の名前")]]))]);
    must(
      r.hits.some((h) => h.includes("作者・会社の 欄")),
      "赤に ならない"
    );
    must(!report(r, words, "x").join("\n").includes("他人の名前"), "作者の 字が 出た");
  });
  T("docx の w:author も 見る", () => {
    const r = run([
      put(
        "f.docx",
        makeZip([
          ["docProps/core.xml", core("見本")],
          ["word/comments.xml", '<w:comment w:author="他人" w:id="0"/>'],
        ])
      ),
    ]);
    must(
      r.hits.some((h) => h.includes("作者・会社の 欄")),
      "w:author を 見ていない"
    );
  });
  T("拡張子が 違っても zip なら ほどく", () => {
    const r = run([put("g.bin", makeZip([["x.xml", "<a>見本台ためし語</a>"]]))]);
    must(r.c.zips === 1 && r.hits.length >= 1, "名前で 選んでいる");
  });
  T("ほどけない zip は 赤（緑に 倒れない）", () => {
    const z = makeZip([["x.xml", "<a>ふつう</a>"]]);
    const cdAt = z.readUInt32LE(z.length - 22 + 16);
    z.writeUInt16LE(99, cdAt + 10); // 知らない 圧縮の 形
    const r = run([put("h.xlsx", z)]);
    must(
      r.hits.some((h) => h.includes("ほどけない")),
      "壊れた zip が 緑"
    );
  });
  T("ファイル名に 当たっても 名前は 出さない", () => {
    const name = put("見本台ためし語.txt", "x");
    const r = run([name]);
    must(
      r.hits.some((h) => h.includes("ファイル名")),
      "ファイル名を 見ていない"
    );
    must(!leaks(r), "出しに 字が 出た");
  });
  T("作者の 欄が 無い core.xml は 未測定に 数える", () => {
    const r = run([put("i.xlsx", makeZip([["docProps/core.xml", "<cp:coreProperties/>"]]))]);
    must(
      r.notes.some((n) => n.includes("作者の 欄が 読めない")),
      "読めないのに 黙る"
    );
  });
  T("zip でない バイナリは 未測定と 書く", () => {
    const r = run([put("j.png", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 1]))]);
    must(r.c.binaries === 1 && r.notes.some((n) => n.includes("j.png")), "黙っている");
  });

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("自己確認: " + pass + "/" + (pass + fail));
  process.exit(fail ? 1 : 0);
}

if (process.argv.includes("--self-test")) selfTest();
else main();
