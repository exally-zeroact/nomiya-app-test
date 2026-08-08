/* nomiya-xlsx-tpl.js — お店が今使っている Excel の請求書に、値だけ差し込む。
 * ==============================================================================
 * ★なぜこの作りなのか（2026-08-08 に実物のExcelで測って決めた）★
 *   出来合いの部品(SheetJS)で「読んで書き直す」と、こうなる:
 *     罫線のあるセル 84 → 0 ／ 結合 7 → 0 ／ 判子の図形 1 → 0 ／ 列幅 全部 既定値
 *   ＝★お店の紙の見た目がほぼ全部消える★。これでは「そのExcelのまま」にならない。
 *
 *   .xlsx は ZIP。★中の値だけ書き換えて、触っていない部分は元のバイトをそのまま積み直す★と
 *     図形・グラフ・結合・罫線・太字・塗り・列幅 … ★差ゼロ★（実測）／グラフの数字も更新される。
 *   だからここは「XMLを作り直す」のではなく ★元のzipを組み直す★ 道具にしてある。
 *
 * ★原本は触らない★
 *   受け取ったバイト列は読むだけ。差し込みは必ず新しいバイト列を作って返す。
 *
 * ★画面にも依らない（DOMを1つも触らない）★
 *   ＝そのまま他のアプリへ持っていける。試験も素のNodeで回せる。
 *
 * 依存: nomiya-xlsx.js（CRC・UTF-8・列名・日付の通し番号を借りる。二重に持たない）
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports)
    module.exports = factory(require("./nomiya-xlsx.js"));
  else root.NomiyaXlsxTpl = factory(root.NomiyaXlsx);
})(typeof self !== "undefined" ? self : this, function (X) {
  "use strict";
  if (!X || !X._crc32) throw new Error("nomiya-xlsx.js を先に読んでください");

  /* ── 番地（A1 ⇄ 行列） ─────────────────────────────────────────── */

  /** "B7" → {col:1, row:6}（0から数える）。おかしければ null */
  function parseRef(ref) {
    var m = /^([A-Z]+)(\d+)$/.exec(String(ref || "").toUpperCase());
    if (!m) return null;
    var c = 0;
    for (var i = 0; i < m[1].length; i++) c = c * 26 + (m[1].charCodeAt(i) - 64);
    var r = parseInt(m[2], 10);
    if (!r) return null;
    return { col: c - 1, row: r - 1 };
  }
  /** {col:1,row:6} → "B7" */
  function refOf(col, row) {
    return X.col(col) + (row + 1);
  }

  /* ── ZIP を読む ────────────────────────────────────────────────── */

  function u16(b, p) {
    return b[p] | (b[p + 1] << 8);
  }
  function u32(b, p) {
    return (b[p] | (b[p + 1] << 8) | (b[p + 2] << 16) | (b[p + 3] << 24)) >>> 0;
  }

  /** ZIP の「目録の終わり(EOCD)」を後ろから探す。注記が付いていてもよいように 66KB 遡る */
  function findEnd(b) {
    var min = Math.max(0, b.length - 66000);
    for (var p = b.length - 22; p >= min; p--) {
      if (u32(b, p) === 0x06054b50) return p;
    }
    return -1;
  }

  /**
   * ZIP の目録を読む。中身はまだ広げない（★触らない物は広げずに積み直す★ため）。
   * @returns {{raw:Uint8Array, entries:Array}}
   */
  function readZip(b) {
    if (!(b instanceof Uint8Array)) b = new Uint8Array(b);
    if (b.length < 22 || u32(b, 0) !== 0x04034b50)
      throw new Error("Excelのファイル(.xlsx)ではありません");
    var end = findEnd(b);
    if (end < 0) throw new Error("Excelのファイルが壊れています（目録が見つかりません）");
    var n = u16(b, end + 10);
    var cenAt = u32(b, end + 16);
    if (n === 0xffff || cenAt === 0xffffffff) throw new Error("この形のExcel（ZIP64）は読めません");
    var list = [];
    var p = cenAt;
    for (var i = 0; i < n; i++) {
      if (u32(b, p) !== 0x02014b50) throw new Error("Excelのファイルが壊れています（目録の並び）");
      var flags = u16(b, p + 8);
      if (flags & 1) throw new Error("パスワード付きのExcelは読めません");
      var nameLen = u16(b, p + 28);
      var extraLen = u16(b, p + 30);
      var cmtLen = u16(b, p + 32);
      var name = "";
      for (var k = 0; k < nameLen; k++) name += String.fromCharCode(b[p + 46 + k]);
      if (flags & 0x800) name = new TextDecoder().decode(b.subarray(p + 46, p + 46 + nameLen));
      list.push({
        name: name,
        flags: flags & ~8, // 「大きさは後ろに書いてある」印は落とす（積み直す時に実数を書くので）
        method: u16(b, p + 10),
        time: u16(b, p + 12),
        date: u16(b, p + 14),
        crc: u32(b, p + 16),
        csize: u32(b, p + 20),
        usize: u32(b, p + 24),
        attr: u32(b, p + 38),
        offset: u32(b, p + 42),
      });
      p += 46 + nameLen + extraLen + cmtLen;
    }
    return { raw: b, entries: list };
  }

  /** 1つ分の「圧縮されたままのバイト列」を切り出す */
  function rawOf(zip, e) {
    var b = zip.raw;
    var p = e.offset;
    if (u32(b, p) !== 0x04034b50)
      throw new Error("Excelのファイルが壊れています（" + e.name + "）");
    var at = p + 30 + u16(b, p + 26) + u16(b, p + 28);
    return b.subarray(at, at + e.csize);
  }

  /** 圧縮を解く。ブラウザ/Nodeが持っている道具を使う（部品を積まない） */
  function inflate(u8) {
    if (typeof DecompressionStream === "undefined")
      return Promise.reject(new Error("この端末では圧縮されたExcelを開けません"));
    var ds = new DecompressionStream("deflate-raw");
    var w = ds.writable.getWriter();
    w.write(u8);
    w.close();
    return new Response(ds.readable).arrayBuffer().then(function (ab) {
      return new Uint8Array(ab);
    });
  }

  /** 中の1ファイルを文字として取り出す */
  function textOf(zip, name) {
    var e = null;
    for (var i = 0; i < zip.entries.length; i++)
      if (zip.entries[i].name === name) {
        e = zip.entries[i];
        break;
      }
    if (!e) return Promise.resolve(null);
    var raw = rawOf(zip, e);
    var dec = function (u8) {
      return new TextDecoder().decode(u8);
    };
    if (e.method === 0) return Promise.resolve(dec(raw));
    if (e.method !== 8) return Promise.reject(new Error("この形のExcelは読めません"));
    return inflate(raw).then(dec);
  }

  /**
   * ★元のzipを組み直す★（触っていない物は圧縮されたままのバイトを、そのまま積む）
   * @param {object} zip readZip の結果
   * @param {object} replaced { "xl/worksheets/sheet1.xml": "…新しい中身…" }
   */
  function rebuild(zip, replaced) {
    var parts = [];
    var central = [];
    var offset = 0;
    zip.entries.forEach(function (e) {
      var name = X._utf8(e.name);
      var body, method, crc, csize, usize;
      if (Object.prototype.hasOwnProperty.call(replaced, e.name)) {
        body = X._utf8(replaced[e.name]);
        method = 0; // 差し替えた物だけ「圧縮しない」で入れる（Excelは混ざっていても読める）
        crc = X._crc32(body);
        csize = usize = body.length;
      } else {
        body = rawOf(zip, e);
        method = e.method;
        crc = e.crc;
        csize = e.csize;
        usize = e.usize;
      }
      var h = [];
      w32(h, 0x04034b50);
      w16(h, 20);
      w16(h, e.flags);
      w16(h, method);
      w16(h, e.time);
      w16(h, e.date);
      w32(h, crc);
      w32(h, csize);
      w32(h, usize);
      w16(h, name.length);
      w16(h, 0);
      var head = new Uint8Array(h);
      parts.push(head, name, body);

      var c = [];
      w32(c, 0x02014b50);
      w16(c, 20);
      w16(c, 20);
      w16(c, e.flags);
      w16(c, method);
      w16(c, e.time);
      w16(c, e.date);
      w32(c, crc);
      w32(c, csize);
      w32(c, usize);
      w16(c, name.length);
      w16(c, 0);
      w16(c, 0);
      w16(c, 0);
      w16(c, 0);
      w32(c, e.attr);
      w32(c, offset);
      central.push(new Uint8Array(c), name);
      offset += head.length + name.length + body.length;
    });
    var cenSize = central.reduce(function (s, x) {
      return s + x.length;
    }, 0);
    var end = [];
    w32(end, 0x06054b50);
    w16(end, 0);
    w16(end, 0);
    w16(end, zip.entries.length);
    w16(end, zip.entries.length);
    w32(end, cenSize);
    w32(end, offset);
    w16(end, 0);
    var all = parts.concat(central, [new Uint8Array(end)]);
    var total = all.reduce(function (s, x) {
      return s + x.length;
    }, 0);
    var out = new Uint8Array(total);
    var p = 0;
    all.forEach(function (x) {
      out.set(x, p);
      p += x.length;
    });
    return out;
  }
  function w16(a, v) {
    a.push(v & 0xff, (v >> 8) & 0xff);
  }
  function w32(a, v) {
    a.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff);
  }

  /* ── Excel の中を読む ──────────────────────────────────────────── */
  /* ★XMLを正規表現で読んでよい理由★
     Excel が書く XML では、文字の中の < > & は必ず &lt; &gt; &amp; に置き換えられている。
     つまり ★タグの外に < は出てこない★ ので、タグの切り出しが曖昧にならない。 */

  /* ★タグを切り出す型（ここを1つにまとめている理由）★
     Excel は中身の無いセルを `<c r="A10" s="5"/>` と ★閉じ付きの1つのタグ★ で書く。
     ここを `<c\b[^>]*(?:\/>|>…<\/c>)` と ★欲張りに★ 書くと、`[^>]*` が末尾の `/` まで飲み、
     残った `>` の方に当たってしまう。すると「次の </c> まで」を丸ごと1つのセルと見なし、
     ★その行のセルが全部消える★（2026-08-09 実物のExcelで踏んだ）。
     `[^>]*?` と ★控えめに★ すれば、先に `/>` の方に当たる。属性の中に生の `>` は入らない
     （Excel が必ず &gt; に直す）ので、これで取り違えない。 */
  function tagRe(name) {
    return new RegExp("<" + name + "\\b([^>]*?)\\s*(?:\\/>|>([\\s\\S]*?)<\\/" + name + ">)", "g");
  }

  function unesc(s) {
    return String(s)
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, function (_, d) {
        return String.fromCharCode(+d);
      })
      .replace(/&amp;/g, "&");
  }
  function attr(tag, key) {
    var m = new RegExp("\\b" + key + '\\s*=\\s*"([^"]*)"').exec(tag);
    return m ? unesc(m[1]) : null;
  }

  /** 共有文字列（Excelは同じ文字を1か所にまとめて番号で指す） */
  function readShared(xml) {
    if (!xml) return [];
    var out = [];
    var re = tagRe("si");
    var m;
    while ((m = re.exec(xml))) {
      /* ★ふりがな(<rPh>)は本文ではない★
         Excel は「請求書」と一緒に「セイキュウショ」を <rPh> に持っている。
         中の <t> を素直に全部つなぐと ★「請求書セイキュウショ」★ と出る（司さんの実物で出た）。
         先に <rPh> を丸ごと落としてから、残った <t> をつなぐ。 */
      var inner = (m[2] || "").replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
      var t = "";
      var tre = tagRe("t");
      var tm;
      while ((tm = tre.exec(inner))) t += unesc(tm[2] || "");
      out.push(t);
    }
    return out;
  }

  /* ★色は「テーマの色」で書かれていることがある★
     実物のお店のExcelでは、明細の縞が `<fgColor theme="2"/>` だった。
     rgb しか見ないと ★縞が出ない★（実際に出なかった）。テーマの色表を読んで解く。
     Excelのテーマ番号の並びは、theme1.xml の並び(dk1,lt1,dk2,lt2,accent1..6,…)とは違う。 */
  var THEME_ORDER = [1, 0, 3, 2, 4, 5, 6, 7, 8, 9, 10, 11];

  function readTheme(xml) {
    if (!xml) return [];
    var block = /<a:clrScheme\b[\s\S]*?<\/a:clrScheme>/.exec(xml);
    if (!block) return [];
    var raw = [];
    var re = /<a:(?:srgbClr|sysClr)\b[^>]*\/?>/g;
    var m;
    while ((m = re.exec(block[0]))) {
      var v = attr(m[0], "lastClr") || attr(m[0], "val") || "";
      raw.push(/^[0-9A-Fa-f]{6}$/.test(v) ? "#" + v : "");
    }
    return THEME_ORDER.map(function (i) {
      return raw[i] || "";
    });
  }

  /** 明るく/暗くする指定(tint)を当てる */
  function applyTint(hex, tint) {
    if (!hex || !tint) return hex;
    var n = parseInt(hex.slice(1), 16);
    var ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(function (c) {
      var v = tint < 0 ? c * (1 + tint) : c + (255 - c) * tint;
      return Math.max(0, Math.min(255, Math.round(v)));
    });
    return (
      "#" +
      ch
        .map(function (c) {
          return (c < 16 ? "0" : "") + c.toString(16);
        })
        .join("")
    );
  }

  /** 色の指定タグ（rgb / theme+tint）を "#rrggbb" にする */
  function colorOf(theme, tag) {
    var rgb = attr(tag, "rgb");
    if (rgb && /^[0-9A-Fa-f]{8}$/.test(rgb)) return "#" + rgb.slice(2);
    if (rgb && /^[0-9A-Fa-f]{6}$/.test(rgb)) return "#" + rgb;
    var th = attr(tag, "theme");
    if (th != null && theme && theme[+th])
      return applyTint(theme[+th], parseFloat(attr(tag, "tint") || "0"));
    return "";
  }

  /** 見た目に要る所だけ読む（表示形式・罫線・太字・塗り・寄せ） */
  function readStyles(xml, theme) {
    var st = { numFmt: {}, xf: [], border: [], font: [], fill: [] };
    if (!xml) return st;
    var m;
    var re = /<numFmt\b[^>]*\/>/g;
    while ((m = re.exec(xml))) st.numFmt[attr(m[0], "numFmtId")] = attr(m[0], "formatCode");

    var fo = /<fonts\b[\s\S]*?<\/fonts>/.exec(xml);
    if (fo) {
      var fre = tagRe("font");
      while ((m = fre.exec(fo[0]))) {
        var inner = m[2] || "";
        st.font.push({
          b: /<b\b[^>]*\/?>/.test(inner),
          sz: parseFloat((/<sz\b[^>]*val="([^"]+)"/.exec(inner) || [])[1] || "11"),
          name: (/<name\b[^>]*val="([^"]*)"/.exec(inner) || [])[1] || "",
        });
      }
    }
    var fi = /<fills\b[\s\S]*?<\/fills>/.exec(xml);
    if (fi) {
      var ire = tagRe("fill");
      while ((m = ire.exec(fi[0]))) {
        var body = m[2] || "";
        if (!/patternType="solid"/.test(body)) {
          st.fill.push("");
          continue;
        }
        var fg = /<fgColor\b[^>]*\/?>/.exec(body);
        st.fill.push(fg ? colorOf(theme, fg[0]) : "");
      }
    }
    var bo = /<borders\b[\s\S]*?<\/borders>/.exec(xml);
    if (bo) {
      var bre = tagRe("border");
      while ((m = bre.exec(bo[0]))) {
        var s = m[2] || "";
        var has = function (side) {
          var t = new RegExp("<" + side + '\\b[^>]*style="([^"]+)"').exec(s);
          return !!(t && t[1] && t[1] !== "none");
        };
        st.border.push({ l: has("left"), r: has("right"), t: has("top"), b: has("bottom") });
      }
    }
    var cx = /<cellXfs\b[\s\S]*?<\/cellXfs>/.exec(xml);
    if (cx) {
      var xre = tagRe("xf");
      while ((m = xre.exec(cx[0]))) {
        var tag = "<xf" + m[1] + ">";
        var al = /<alignment\b[^>]*\/?>/.exec(m[2] || "");
        st.xf.push({
          numFmtId: attr(tag, "numFmtId") || "0",
          fontId: +(attr(tag, "fontId") || 0),
          fillId: +(attr(tag, "fillId") || 0),
          borderId: +(attr(tag, "borderId") || 0),
          align: al ? attr(al[0], "horizontal") : null,
          // ★Excelの既定は「下揃え」★。真ん中にすると行の高い所で位置が変わる
          valign: al ? attr(al[0], "vertical") : null,
        });
      }
    }
    return st;
  }

  /** 1枚のシートを読む（セル・結合・列幅） */
  function readSheet(xml) {
    var cells = {};
    var maxRow = 0;
    var maxCol = 0;
    var body = /<sheetData\b[^>]*>([\s\S]*?)<\/sheetData>/.exec(xml);
    if (body) {
      var cre = tagRe("c");
      var m;
      while ((m = cre.exec(body[1]))) {
        var tag = "<c" + m[1] + ">";
        var ref = attr(tag, "r");
        if (!ref) continue;
        var pos = parseRef(ref);
        if (!pos) continue;
        var inner = m[2] || "";
        var txt = "";
        if (/<is\b/.test(inner)) {
          var tre2 = tagRe("t");
          var t2;
          while ((t2 = tre2.exec(inner))) txt += unesc(t2[2] || "");
        }
        cells[ref] = {
          t: attr(tag, "t"),
          s: attr(tag, "s"),
          v: (/<v\b[^>]*>([\s\S]*?)<\/v>/.exec(inner) || [])[1] || null,
          is: /<is\b/.test(inner) ? txt : null,
          f: /<f\b/.test(inner),
        };
        if (pos.row + 1 > maxRow) maxRow = pos.row + 1;
        if (pos.col + 1 > maxCol) maxCol = pos.col + 1;
      }
    }
    var merges = [];
    var mre = /<mergeCell\b[^>]*ref="([A-Z]+\d+):([A-Z]+\d+)"/g;
    var mm;
    while ((mm = mre.exec(xml))) {
      var a = parseRef(mm[1]);
      var b = parseRef(mm[2]);
      if (a && b) merges.push({ r1: a.row, c1: a.col, r2: b.row, c2: b.col });
    }
    var cols = [];
    var ore = /<col\b[^>]*\/>/g;
    var om;
    while ((om = ore.exec(xml))) {
      cols.push({
        min: +(attr(om[0], "min") || 1),
        max: +(attr(om[0], "max") || 1),
        width: parseFloat(attr(om[0], "width") || "0"),
        // 列そのものに付いている書式（セルにも行にも書式が無いときの受け皿）
        style: attr(om[0], "style") != null ? +attr(om[0], "style") : null,
      });
    }
    /* ★行の高さ★ 見ないと縦が全部ズレる（お店の紙は行ごとに高さを決めてある）。
       ht は pt（1pt = 1/72インチ）。画面の px は 96/72 倍。 */
    var heights = {};
    /* ★行そのものに付いている書式★
       お店の紙は「明細の帯」を ★行ごと★ に塗ってあることが多い。
       セルの s= しか見ないと ★中身の無い行だけ縞が抜ける★（実物で1行おきに抜けた）。 */
    var rowStyle = {};
    var hre = /<row\b[^>]*>/g;
    var hm;
    while ((hm = hre.exec(xml))) {
      var rn = +(attr(hm[0], "r") || 0);
      if (!rn) continue;
      var ht = parseFloat(attr(hm[0], "ht") || "0");
      if (ht) heights[rn] = ht;
      if (attr(hm[0], "customFormat") === "1" && attr(hm[0], "s") != null)
        rowStyle[rn] = +attr(hm[0], "s");
    }
    var fmt = /<sheetFormatPr\b[^>]*\/?>/.exec(xml);
    var view = /<sheetView\b[^>]*>/.exec(xml);
    return {
      cells: cells,
      merges: merges,
      cols: cols,
      maxRow: maxRow,
      maxCol: maxCol,
      heights: heights,
      rowStyle: rowStyle,
      defaultRowHeight: fmt ? parseFloat(attr(fmt[0], "defaultRowHeight") || "15") : 15,
      defaultColWidth: fmt ? parseFloat(attr(fmt[0], "defaultColWidth") || "0") || 0 : 0,
      /* ★Excelの「ゼロ値を表示しない」★ 見ないと、空の明細に 0 が並ぶ（実物で出た） */
      showZeros: view ? attr(view[0], "showZeros") !== "0" : true,
    };
  }

  /* ── 貼ってある絵（判子・ロゴ）────────────────────────────────────
     ★お店の紙で「これが無いと請求書に見えない」物★。実物は判子が右上に貼ってあった。
     場所は EMU（1px = 9525EMU）で、どのマスの角から何ぶんズラすかで書いてある。 */

  /** 中の1ファイルを、バイト列のまま取り出す */
  function bytesOf(zip, name) {
    var e = null;
    for (var i = 0; i < zip.entries.length; i++)
      if (zip.entries[i].name === name) {
        e = zip.entries[i];
        break;
      }
    if (!e) return Promise.resolve(null);
    var raw = rawOf(zip, e);
    if (e.method === 0) return Promise.resolve(raw.slice());
    if (e.method !== 8) return Promise.resolve(null);
    return inflate(raw);
  }

  var B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  /** バイト列 → base64（端末の道具に頼らない。古い端末でも同じに動く） */
  function toBase64(u8) {
    var s = "";
    var i;
    for (i = 0; i + 2 < u8.length; i += 3) {
      var n = (u8[i] << 16) | (u8[i + 1] << 8) | u8[i + 2];
      s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
    }
    var rest = u8.length - i;
    if (rest === 1) {
      var a = u8[i] << 16;
      s += B64[(a >> 18) & 63] + B64[(a >> 12) & 63] + "==";
    } else if (rest === 2) {
      var b = (u8[i] << 16) | (u8[i + 1] << 8);
      s += B64[(b >> 18) & 63] + B64[(b >> 12) & 63] + B64[(b >> 6) & 63] + "=";
    }
    return s;
  }

  var EMU = 9525; // 1px

  /** そのシートに貼ってある絵を、位置つきで返す */
  function readImages(zip, sheet) {
    var rid = attr(/<drawing\b[^>]*\/>/.exec(sheet.xml) || [""], "r:id");
    if (!rid) return Promise.resolve([]);
    var dir = sheet.path.replace(/\/[^/]+$/, "");
    var base = sheet.path.replace(/^.*\//, "");
    return textOf(zip, dir + "/_rels/" + base + ".rels")
      .then(function (rels) {
        var target = null;
        var re = /<Relationship\b[^>]*\/>/g;
        var m;
        while ((m = re.exec(rels || ""))) {
          if (attr(m[0], "Id") === rid) target = attr(m[0], "Target");
        }
        if (!target) return [];
        var dpath = norm(dir + "/" + target);
        return textOf(zip, dpath).then(function (dxml) {
          if (!dxml) return [];
          var ddir = dpath.replace(/\/[^/]+$/, "");
          var dbase = dpath.replace(/^.*\//, "");
          return textOf(zip, ddir + "/_rels/" + dbase + ".rels").then(function (drels) {
            var media = {};
            var rre = /<Relationship\b[^>]*\/>/g;
            var rm;
            while ((rm = rre.exec(drels || "")))
              media[attr(rm[0], "Id")] = norm(ddir + "/" + attr(rm[0], "Target"));
            return placeImages(zip, dxml, media);
          });
        });
      })
      .catch(function () {
        return []; // 絵が読めなくても、紙の中身は出す
      });
  }

  /** "xl/drawings/../media/a.png" → "xl/media/a.png" */
  function norm(p) {
    var out = [];
    String(p)
      .split("/")
      .forEach(function (x) {
        if (x === "..") out.pop();
        else if (x && x !== ".") out.push(x);
      });
    return out.join("/");
  }

  function placeImages(zip, dxml, media) {
    var list = [];
    var re = /<xdr:(oneCellAnchor|twoCellAnchor)\b[\s\S]*?<\/xdr:\1>/g;
    var m;
    while ((m = re.exec(dxml))) {
      var a = m[0];
      var pick = function (tag, from) {
        var block = new RegExp("<xdr:" + from + ">([\\s\\S]*?)</xdr:" + from + ">").exec(a);
        if (!block) return 0;
        var v = new RegExp("<xdr:" + tag + ">(-?\\d+)</xdr:" + tag + ">").exec(block[1]);
        return v ? +v[1] : 0;
      };
      var rid = attr(/<a:blip\b[^>]*\/?>/.exec(a) || [""], "r:embed");
      if (!rid || !media[rid]) continue;
      var item = {
        file: media[rid],
        col: pick("col", "from"),
        colOff: pick("colOff", "from"),
        row: pick("row", "from"),
        rowOff: pick("rowOff", "from"),
        toCol: pick("col", "to"),
        toColOff: pick("colOff", "to"),
        toRow: pick("row", "to"),
        toRowOff: pick("rowOff", "to"),
      };
      /* 大きさは、書いてある所を上から順に探す。
         ★Excelは「1マスに貼る形(oneCellAnchor)」では <xdr:ext>、
           「2マスで挟む形(twoCellAnchor)」では <a:ext> に書く★
         （挟む形で <a:ext> を見ないと、大きさが決まらず絵が出ない） */
      var ext =
        /<xdr:ext\b[^>]*cx="(\d+)"[^>]*cy="(\d+)"/.exec(a) ||
        /<a:ext\b[^>]*cx="(\d+)"[^>]*cy="(\d+)"/.exec(a);
      if (ext) {
        item.w = +ext[1] / EMU;
        item.h = +ext[2] / EMU;
      }
      /* Excel自身が計算した「紙の左上からの位置」。あればこれが一番正しい */
      var off = /<a:off\b[^>]*x="(-?\d+)"[^>]*y="(-?\d+)"/.exec(a);
      if (off) {
        item.absX = +off[1] / EMU;
        item.absY = +off[2] / EMU;
      }
      item.x = item.colOff / EMU;
      item.y = item.rowOff / EMU;
      list.push(item);
    }
    // 絵の中身（data URL）を順に読む
    var i = 0;
    var next = function () {
      if (i >= list.length) return Promise.resolve(list);
      var it = list[i++];
      return bytesOf(zip, it.file).then(function (u8) {
        if (u8) {
          var ext = ((it.file.match(/\.(\w+)$/) || [])[1] || "png").toLowerCase();
          var mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : "image/" + ext;
          it.src = "data:" + mime + ";base64," + toBase64(u8);
        }
        return next();
      });
    };
    return next().then(function () {
      return list.filter(function (x) {
        return x.src;
      });
    });
  }

  /**
   * .xlsx を開く。★原本のバイト列は保持し、書き換えは一切しない★
   * @param {Uint8Array} bytes
   * @returns {Promise<object>} book
   */
  function open(bytes) {
    var zip = readZip(bytes);
    var book = { zip: zip, sheets: [], shared: [], styles: null };
    return textOf(zip, "xl/workbook.xml")
      .then(function (wb) {
        if (!wb) throw new Error("Excelの中身が見つかりません");
        book.workbookXml = wb;
        return textOf(zip, "xl/_rels/workbook.xml.rels").then(function (rels) {
          var map = {};
          var rre = /<Relationship\b[^>]*\/>/g;
          var rm;
          while ((rm = rre.exec(rels || ""))) {
            var tgt = attr(rm[0], "Target") || "";
            map[attr(rm[0], "Id")] = tgt.replace(/^\/?xl\//, "").replace(/^\.\//, "");
          }
          var sre = /<sheet\b[^>]*\/>/g;
          var sm;
          while ((sm = sre.exec(wb))) {
            var rid = attr(sm[0], "r:id") || attr(sm[0], "id");
            var target = map[rid];
            if (!target) continue;
            book.sheets.push({ name: attr(sm[0], "name") || "", path: "xl/" + target });
          }
          if (!book.sheets.length) throw new Error("シートが1枚もありません");
        });
      })
      .then(function () {
        return textOf(zip, "xl/sharedStrings.xml");
      })
      .then(function (ss) {
        book.shared = readShared(ss);
        return textOf(zip, "xl/theme/theme1.xml");
      })
      .then(function (th) {
        book.theme = readTheme(th);
        return textOf(zip, "xl/styles.xml");
      })
      .then(function (sty) {
        book.styles = readStyles(sty, book.theme);
        // シートは順番に読む（同時に走らせても速くならず、順番が崩れる）
        var i = 0;
        var next = function () {
          if (i >= book.sheets.length) return Promise.resolve(book);
          var s = book.sheets[i++];
          return textOf(zip, s.path).then(function (xml) {
            s.xml = xml || "";
            var d = readSheet(s.xml);
            s.cells = d.cells;
            s.merges = d.merges;
            s.cols = d.cols;
            s.maxRow = d.maxRow;
            s.maxCol = d.maxCol;
            s.heights = d.heights;
            s.rowStyle = d.rowStyle;
            s.defaultRowHeight = d.defaultRowHeight;
            s.defaultColWidth = d.defaultColWidth;
            s.showZeros = d.showZeros;
            return readImages(zip, s).then(function (imgs) {
              s.images = imgs;
              return next();
            });
          });
        };
        return next();
      });
  }

  /* ── 見えている文字にする ──────────────────────────────────────── */

  var DATE_BUILTIN = {
    14: 1,
    15: 1,
    16: 1,
    17: 1,
    18: 1,
    19: 1,
    20: 1,
    21: 1,
    22: 1,
    45: 1,
    46: 1,
    47: 1,
  };

  /** Excel の通し番号 → "YYYY-MM-DD"
   *  ★端は実物のExcelで測った（2026-08-09）★
   *    1→1900-01-01 ／ 59→1900-02-28 ／ 60→★1900-02-29（この日は無い）★ ／ 61→1900-03-01
   *  Excel が 1900年をうるう年だと思い込んでいるので、60 より前は1日ぶん数え方が違う。 */
  function fromSerial(n) {
    n = Math.round(n);
    if (n <= 0) return "";
    if (n === 60) return "1900-02-29"; // Excelはこう出す（実在しないが、そう出す）
    var base = n < 60 ? Date.UTC(1899, 11, 31) : Date.UTC(1899, 11, 30);
    var d = new Date(base + n * 86400000);
    var p = function (x) {
      return (x < 10 ? "0" : "") + x;
    };
    return d.getUTCFullYear() + "-" + p(d.getUTCMonth() + 1) + "-" + p(d.getUTCDate());
  }

  /** そのセルが日付として飾られているか */
  function isDateStyle(book, s) {
    var xf = book.styles.xf[+(s || 0)];
    if (!xf) return false;
    if (DATE_BUILTIN[+xf.numFmtId]) return true;
    var code = book.styles.numFmt[xf.numFmtId];
    return !!code && /[ymd]/.test(code.replace(/\[[^\]]*\]/g, "").replace(/"[^"]*"/g, ""));
  }

  /* ── 表示形式（Excelの「セルの書式設定」）を、見えている形に直す ──────────
     ★数字をそのまま出すと、お店の紙と違う物が出る★
       実物で出た例: 30909.090909… を素で出すと「30,909.09」。
       Excelの表示形式は `#,##0_ ` なので ★30,909★ が正しい。
       日付も 46235 のままでは駄目で、`yyyy/m/d` なら ★2026/8/1★。
     ここは「見せる」ためだけの物。ファイルに書く値は触らない。 */

  /** 組み込みの表示形式（よく使う物だけ。Excelが番号だけで持っている分） */
  var BUILTIN_FMT = {
    0: "General",
    1: "0",
    2: "0.00",
    3: "#,##0",
    4: "#,##0.00",
    9: "0%",
    10: "0.00%",
    11: "0.00E+00",
    /* ★14番と22番は「その国の短い日付」＝国によって見え方が変わる★
       日本のExcelで実測すると 46243 → ★2026/8/9★（2026-08-09・COMで表示を読んだ）。
       米国式の m/d/yyyy にすると「8/9/2026」と出る＝お店の紙と違う物が出る。 */
    14: "yyyy/m/d",
    15: "d-mmm-yy",
    16: "d-mmm",
    17: "mmm-yy",
    18: "h:mm AM/PM",
    19: "h:mm:ss AM/PM",
    20: "h:mm",
    21: "h:mm:ss",
    22: "yyyy/m/d h:mm",
    37: "#,##0;(#,##0)",
    38: "#,##0;[Red](#,##0)",
    39: "#,##0.00;(#,##0.00)",
    40: "#,##0.00;[Red](#,##0.00)",
    45: "mm:ss",
    46: "[h]:mm:ss",
    47: "mm:ss.0",
    48: "##0.0E+0",
    49: "@",
  };

  /** そのセルの表示形式の文字列（無ければ "General"） */
  function formatOf(book, s) {
    var xf = book.styles.xf[+(s || 0)];
    if (!xf) return "General";
    return book.styles.numFmt[xf.numFmtId] || BUILTIN_FMT[+xf.numFmtId] || "General";
  }

  /** 色や条件の指定([Red]など)と、飾りだけの指定(_x や *x)を落とす */
  function stripDeco(sec) {
    return String(sec)
      .replace(/\[[^\]]*\]/g, "")
      .replace(/_./g, "") // _ の次の1文字ぶんの空きを取る指定
      .replace(/\*./g, "");
  }

  /** 表示形式が日付かどうか（引用符の中と [] は数えない） */
  function isDateCode(code) {
    var s = String(code)
      .replace(/\[[^\]]*\]/g, "")
      .replace(/"[^"]*"/g, "")
      .replace(/\\./g, "");
    return /[ymdhs]/i.test(s) && !/[#0?]/.test(s.replace(/[ymdhs]/gi, ""));
  }

  function comma(intStr) {
    return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  /* 組み立ての途中で使う目印。表示形式の中に出てこない字を選んである */
  var LIT = String.fromCharCode(1);
  var NUM = String.fromCharCode(2);

  /** 数を、その表示形式のとおりに文字にする */
  /** 数を、その表示形式のとおりに文字にする */
  function fmtNumber(n, code) {
    if (!code || code === "General") {
      // Excelの「標準」は、桁区切りを付けない
      return String(Math.round(n * 1e10) / 1e10);
    }
    // 正 ; 負 ; ゼロ ; 文字 の順。無い所は正の形を使う
    var parts = code.split(";");
    var sec = n < 0 && parts[1] ? parts[1] : n === 0 && parts[2] ? parts[2] : parts[0];
    var isPct = /%/.test(stripDeco(sec));
    var v = Math.abs(n) * (isPct ? 100 : 1);
    var body = stripDeco(sec);
    // 飾り文字（"¥" や \- など）は、いったん目印に置き換えて、最後に元の場所へ戻す
    var lit = [];
    body = body.replace(/"([^"]*)"/g, function (_, x) {
      lit.push(x);
      return LIT;
    });
    body = body.replace(/\\(.)/g, function (_, x) {
      lit.push(x);
      return LIT;
    });
    var numPart = (body.match(/[#0,.?]+/) || [""])[0];
    var dot = numPart.indexOf(".");
    var dec = dot < 0 ? 0 : (numPart.slice(dot + 1).match(/[0#?]/g) || []).length;
    var useComma = /,/.test(numPart.split(".")[0]);
    var fixed = v.toFixed(dec);
    var ip = fixed.split(".")[0];
    var fp = fixed.split(".")[1] || "";
    var num = (useComma ? comma(ip) : ip) + (dec ? "." + fp : "");
    var i = 0;
    var shown = body
      .replace(/[#0,.?]+/, NUM)
      .split(LIT)
      .reduce(function (acc, piece, k) {
        return k === 0 ? piece : acc + lit[i++] + piece;
      }, "");
    var minus = n < 0 && !parts[1] ? "-" : "";
    return minus + shown.replace(NUM, num);
  }

  /** 通し番号を、その表示形式のとおりの日付にする */
  function fmtDate(n, code) {
    var ymd = fromSerial(n);
    if (!ymd) return "";
    var y = +ymd.slice(0, 4);
    var mo = +ymd.slice(5, 7);
    var d = +ymd.slice(8, 10);
    var body = stripDeco(String(code).split(";")[0]);
    var lit = [];
    body = body.replace(/"([^"]*)"/g, function (_, x) {
      lit.push(x);
      return LIT;
    });
    body = body.replace(/\\(.)/g, function (_, x) {
      lit.push(x);
      return LIT;
    });
    var p2 = function (x) {
      return (x < 10 ? "0" : "") + x;
    };
    // 長い物から先に置き換える（mm を先に m で潰さない）
    var out = body
      .replace(/yyyy/gi, String(y))
      .replace(/yy/gi, String(y).slice(2))
      .replace(/mmmm|mmm/gi, String(mo))
      .replace(/dddd|ddd/gi, String(d))
      .replace(/mm/g, p2(mo))
      .replace(/dd/g, p2(d))
      .replace(/m/g, String(mo))
      .replace(/d/g, String(d))
      .replace(/[hs:]/gi, "")
      .replace(/@/g, "");
    var i = 0;
    return out.split(LIT).reduce(function (acc, piece, k) {
      return k === 0 ? piece : acc + lit[i++] + piece;
    }, "");
  }
  /** 画面に出す文字（数式セルはExcelが覚えている結果を出す） */
  function cellText(book, sheet, ref) {
    var c = sheet.cells[ref];
    if (!c) return "";
    if (c.t === "s") return book.shared[+c.v] || "";
    if (c.t === "inlineStr" || c.is != null) return c.is || "";
    if (c.t === "b") return c.v === "1" ? "TRUE" : "FALSE";
    if (c.t === "e") return c.v || "";
    if (c.v == null || c.v === "") return "";
    if (c.t === "str") return c.v;
    var n = parseFloat(c.v);
    if (isNaN(n)) return c.v;
    /* ★Excelの「ゼロ値を表示しない」を守る★
       これを見ないと、お店の紙で空いているはずの明細に ★0 が20個並ぶ★（実物で出た）。 */
    if (n === 0 && sheet.showZeros === false) return "";
    var code = formatOf(book, c.s);
    if (isDateCode(code)) return fmtDate(n, code);
    return fmtNumber(n, code);
  }

  /* ── 値を差し込む ──────────────────────────────────────────────── */

  /** 1つのセルのXMLを組み立てる（★飾り(s=)は元のまま残す★＝罫線も書体も寄せも変わらない） */
  function cellXml(ref, style, kind, value) {
    var s = style != null && style !== "" ? ' s="' + style + '"' : "";
    if (kind === "date") {
      var n = X.serial(value);
      if (n == null) return '<c r="' + ref + '"' + s + "/>";
      return '<c r="' + ref + '"' + s + "><v>" + n + "</v></c>";
    }
    if (kind === "number") {
      var v = typeof value === "number" ? value : parseFloat(value);
      if (isNaN(v)) return '<c r="' + ref + '"' + s + "/>";
      return '<c r="' + ref + '"' + s + "><v>" + v + "</v></c>";
    }
    if (value == null || value === "") return '<c r="' + ref + '"' + s + "/>";
    return (
      '<c r="' +
      ref +
      '"' +
      s +
      ' t="inlineStr"><is><t xml:space="preserve">' +
      X.esc(value) +
      "</t></is></c>"
    );
  }

  /**
   * シートのXMLに、値を差し込んだ新しいXMLを返す。
   * ★数式のセルには書かない★（結果だけ書き換えると次に開いたとき計算し直されて元に戻る＝嘘になる）
   * @param {string} xml
   * @param {Array<{ref:string,kind:string,value:*}>} edits
   * @returns {{xml:string, skipped:string[], wrote:number}}
   */
  function setCells(xml, edits) {
    var body = /(<sheetData\b[^>]*?)\s*(\/>|>([\s\S]*?)<\/sheetData>)/.exec(xml);
    if (!body) throw new Error("このシートには表がありません");
    var inner = body[2] === "/>" ? "" : body[3] || "";

    // 行に分ける
    var rows = [];
    var rre = tagRe("row");
    var m;
    while ((m = rre.exec(inner))) {
      rows.push({ n: +(attr("<row" + m[1] + ">", "r") || 0), a: m[1], inner: m[2] || "" });
    }

    var byRow = {};
    rows.forEach(function (r) {
      byRow[r.n] = r;
    });

    var skipped = [];
    var wrote = 0;
    var want = {};
    edits.forEach(function (e) {
      var pos = parseRef(e.ref);
      if (!pos) return;
      (want[pos.row + 1] = want[pos.row + 1] || []).push({ e: e, col: pos.col });
    });

    Object.keys(want).forEach(function (rn) {
      rn = +rn;
      var row = byRow[rn];
      if (!row) {
        row = { n: rn, a: ' r="' + rn + '"', inner: "" };
        byRow[rn] = row;
        rows.push(row);
      }
      // その行のセルを並べる
      var cells = [];
      var cre = tagRe("c");
      var cm;
      while ((cm = cre.exec(row.inner))) {
        var ctag = "<c" + cm[1] + ">";
        var ref = attr(ctag, "r");
        var pos = ref ? parseRef(ref) : null;
        cells.push({
          ref: ref,
          col: pos ? pos.col : 1e9,
          s: attr(ctag, "s"),
          f: /<f\b/.test(cm[2] || ""),
          xml: cm[0],
        });
      }
      want[rn].forEach(function (w) {
        var ref = refOf(w.col, rn - 1);
        var hit = null;
        for (var i = 0; i < cells.length; i++)
          if (cells[i].ref === ref) {
            hit = cells[i];
            break;
          }
        if (hit && hit.f) {
          skipped.push(ref);
          return;
        }
        var made = cellXml(ref, hit ? hit.s : null, w.e.kind, w.e.value);
        wrote++;
        if (hit) hit.xml = made;
        else cells.push({ ref: ref, col: w.col, s: null, f: false, xml: made });
      });
      cells.sort(function (a, b) {
        return a.col - b.col;
      });
      row.inner = cells
        .map(function (c) {
          return c.xml;
        })
        .join("");
      // 行の「範囲」の書き置きは、増やしたときに合わなくなるので落とす（Excelが数え直す）
      row.a = row.a.replace(/\s+spans="[^"]*"/, "");
    });

    rows.sort(function (a, b) {
      return a.n - b.n;
    });
    var built =
      "<sheetData>" +
      rows
        .map(function (r) {
          return "<row" + r.a + ">" + r.inner + "</row>";
        })
        .join("") +
      "</sheetData>";

    var out = xml.slice(0, body.index) + built + xml.slice(body.index + body[0].length);
    // 使う範囲の書き置きも、外へ広げたときだけ直す（放っておくと Excel が「修復」と言うことがある）
    out = out.replace(/<dimension\b[^>]*\/>/, function (tag) {
      var cur = attr(tag, "ref") || "A1";
      var pr = cur.split(":");
      var a = parseRef(pr[0]) || { col: 0, row: 0 };
      var b = parseRef(pr[1] || pr[0]) || a;
      var c2 = b.col;
      var r2 = b.row;
      edits.forEach(function (e) {
        var p = parseRef(e.ref);
        if (!p) return;
        if (p.col > c2) c2 = p.col;
        if (p.row > r2) r2 = p.row;
      });
      return '<dimension ref="' + refOf(a.col, a.row) + ":" + refOf(c2, r2) + '"/>';
    });
    return { xml: out, skipped: skipped, wrote: wrote };
  }

  /** workbook.xml に「開いたら全部計算し直す」印を立てる */
  function withFullCalc(xml) {
    if (/<calcPr\b/.test(xml)) {
      return xml.replace(/<calcPr\b([^>]*?)\s*\/?>/, function (all, a) {
        var b = a.replace(/\s+fullCalcOnLoad="[^"]*"/, "");
        return "<calcPr" + b + ' fullCalcOnLoad="1"/>';
      });
    }
    return xml.replace(/<\/workbook>/, '<calcPr fullCalcOnLoad="1"/></workbook>');
  }

  /**
   * 差し込んだ .xlsx のバイト列を作る（★原本は変えない★）
   * @param {object} book open() の結果
   * @param {number} sheetIndex 何枚目のシートか
   * @param {Array} edits [{ref, kind:"text"|"number"|"date", value}]
   * @returns {{bytes:Uint8Array, skipped:string[], wrote:number}}
   */
  function fill(book, sheetIndex, edits) {
    var s = book.sheets[sheetIndex];
    if (!s) throw new Error("そのシートがありません");
    /* ★日付は「日付として飾られているセル」にだけ通し番号で入れる★
       飾りの無いセルに通し番号を入れると ★46235★ と出る（お店から見たら壊れている）。
       飾りは元のまま残すのが約束なので、そういうセルには ★見えている形の文字★ を入れる。 */
    var fixed = edits.map(function (e) {
      if (e.kind !== "date") return e;
      var c = s.cells[e.ref];
      if (c && isDateStyle(book, c.s)) return e;
      return { ref: e.ref, kind: "text", value: e.text != null ? e.text : e.value };
    });
    var r = setCells(s.xml, fixed);
    var rep = {};
    rep[s.path] = r.xml;
    /* ★数式の「覚え書き」を古いまま渡さない★
       Excelは数式の答えを ★前に計算した値★ としてファイルに書き置いている。
       こちらが元の値だけ入れ替えると、その書き置きは嘘になる（合計が0のまま出る＝実際に踏んだ）。
       ★開いたとき全部計算し直す★という印を立てておく。 */
    if (book.workbookXml) rep["xl/workbook.xml"] = withFullCalc(book.workbookXml);
    return { bytes: rebuild(book.zip, rep), skipped: r.skipped, wrote: r.wrote };
  }

  return {
    open: open,
    fill: fill,
    setCells: setCells,
    cellText: cellText,
    isDateStyle: isDateStyle,
    parseRef: parseRef,
    refOf: refOf,
    fromSerial: fromSerial,
    _readZip: readZip,
    _rawOf: rawOf,
    _rebuild: rebuild,
    _withFullCalc: withFullCalc,
    _textOf: textOf,
    _readShared: readShared,
    _readStyles: readStyles,
    _readSheet: readSheet,
    formatOf: formatOf,
    fmtNumber: fmtNumber,
    fmtDate: fmtDate,
    isDateCode: isDateCode,
    _bytesOf: bytesOf,
    _toBase64: toBase64,
  };
});
