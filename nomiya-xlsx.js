/* nomiya-xlsx.js — 売上帳を Excel のファイル(.xlsx)にする。
 * ==============================================================================
 * ★なぜ自前で書くか★
 *   Excel を作る出来合いの部品は 900KB 前後ある。この画面は毎晩スマホで開く物なので、
 *   1つの表を出すためにそれを積むのは重すぎる。ここは ★数KBで足りる★。
 *   （押したときだけ読む形にしてあるので、ふだんの起動には1バイトも足さない）
 *
 * ★.xlsx の正体★
 *   中身は「XMLを何枚か入れた ZIP」。だから ZIP を書ければ作れる。
 *   ここでは ★圧縮しない(stored)★ ZIP にしてある。理由は2つ:
 *     ・圧縮の部品が要らない（依存ゼロを保てる）
 *     ・★試験で中身を読み戻せる★（開いて1マスずつ確かめられる）
 *   売上帳くらいの大きさなら、圧縮しなくても十分小さい。
 *
 * ★数字は数字・日付は日付で入れる★
 *   文字で入れると Excel で足し算も並べ替えもできない。
 *   日付は Excel の数え方（1900年1月1日を1とする通し番号）に直して入れ、
 *   表示の形（yyyy/mm/dd）を別に指定する。
 *
 * 計算そのものは持たない（nomiya-core.js が唯一の正）。ここは「並べて袋に詰める」だけ。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.NomiyaXlsx = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* ── ZIP（圧縮しない）を書くのに要る道具 ───────────────────────── */
  var CRC = (function () {
    var t = new Int32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })();
  function crc32(bytes) {
    var c = -1;
    for (var i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  }
  function utf8(str) {
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(str);
    // 古い端末向け（TextEncoder が無い）
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else if (c >= 0xd800 && c <= 0xdbff) {
        var c2 = str.charCodeAt(++i);
        var u = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00);
        out.push(
          0xf0 | (u >> 18),
          0x80 | ((u >> 12) & 63),
          0x80 | ((u >> 6) & 63),
          0x80 | (u & 63)
        );
      } else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return new Uint8Array(out);
  }
  function w16(a, v) {
    a.push(v & 0xff, (v >> 8) & 0xff);
  }
  function w32(a, v) {
    a.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff);
  }

  /** 名前と中身の組を、1つの ZIP（圧縮しない）にまとめる */
  function zip(files) {
    var out = [];
    var central = [];
    var offset = 0;
    files.forEach(function (f) {
      var name = utf8(f.name);
      var body = utf8(f.text);
      var crc = crc32(body);
      var local = [];
      w32(local, 0x04034b50);
      w16(local, 20); // 要る版
      w16(local, 0x0800); // 名前はUTF-8
      w16(local, 0); // 圧縮しない
      w16(local, 0);
      w16(local, 0); // 日時（0で困らない）
      w32(local, crc);
      w32(local, body.length);
      w32(local, body.length);
      w16(local, name.length);
      w16(local, 0);
      var head = new Uint8Array(local);
      out.push(head, name, body);

      var c = [];
      w32(c, 0x02014b50);
      w16(c, 20);
      w16(c, 20);
      w16(c, 0x0800);
      w16(c, 0);
      w16(c, 0);
      w16(c, 0);
      w32(c, crc);
      w32(c, body.length);
      w32(c, body.length);
      w16(c, name.length);
      w16(c, 0);
      w16(c, 0);
      w16(c, 0);
      w16(c, 0);
      w32(c, 0);
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
    w16(end, files.length);
    w16(end, files.length);
    w32(end, cenSize);
    w32(end, offset);
    w16(end, 0);
    var parts = out.concat(central, [new Uint8Array(end)]);
    var total = parts.reduce(function (s, x) {
      return s + x.length;
    }, 0);
    var buf = new Uint8Array(total);
    var p = 0;
    parts.forEach(function (x) {
      buf.set(x, p);
      p += x.length;
    });
    return buf;
  }

  /* ── Excel の中身 ────────────────────────────────────────────── */
  var esc = function (s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  };

  /** 日付(YYYY-MM-DD) → Excel の通し番号。おかしければ null
   *  ★端を実物のExcelで測った（2026-08-09）★
   *    1→1900-01-01 ／ 59→1900-02-28 ／ 60→★1900-02-29（存在しない日）★ ／ 61→1900-03-01
   *  Excel は 1900年をうるう年だと思い込んでいるので、
   *  ★1900-03-01 より前だけ 1日ぶんズレる★。そこだけ数え方を変える。 */
  function serial(ymd) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ""));
    if (!m) return null;
    var d = Date.UTC(+m[1], +m[2] - 1, +m[3]);
    if (isNaN(d)) return null;
    var n = Math.round((d - Date.UTC(1899, 11, 30)) / 86400000);
    if (n < 61) n = Math.round((d - Date.UTC(1899, 11, 31)) / 86400000);
    return n > 0 ? n : null; // 1899-12-31 以前は Excel に無い
  }

  var COL = function (i) {
    var s = "";
    i++;
    while (i > 0) {
      var r = (i - 1) % 26;
      s = String.fromCharCode(65 + r) + s;
      i = Math.floor((i - 1) / 26);
    }
    return s;
  };

  /**
   * 表を1枚の .xlsx にする。
   * @param {{sheet?:string, columns:{key:string,label:string,type?:"text"|"number"|"date",width?:number}[], rows:object[]}} spec
   * @returns {Uint8Array}
   */
  function build(spec) {
    var sheetName = String(spec.sheet || "Sheet1").slice(0, 31);
    var cols = spec.columns || [];
    var rows = spec.rows || [];
    if (!cols.length) throw new Error("列が1つもありません");

    var xml = [];
    rows.forEach(function (row, ri) {
      var cells = [];
      cols.forEach(function (c, ci) {
        var ref = COL(ci) + (ri + 2);
        var v = row[c.key];
        if (c.type === "number") {
          var n = typeof v === "number" ? v : parseFloat(v);
          if (isNaN(n)) return; // 空欄のまま（0を書かない＝嘘の0を作らない）
          cells.push('<c r="' + ref + '" s="2"><v>' + n + "</v></c>");
        } else if (c.type === "date") {
          var s = serial(v);
          if (s == null) return;
          cells.push('<c r="' + ref + '" s="1"><v>' + s + "</v></c>");
        } else {
          if (v == null || v === "") return;
          cells.push(
            '<c r="' +
              ref +
              '" t="inlineStr"><is><t xml:space="preserve">' +
              esc(v) +
              "</t></is></c>"
          );
        }
      });
      xml.push('<row r="' + (ri + 2) + '">' + cells.join("") + "</row>");
    });
    var head = cols
      .map(function (c, ci) {
        return (
          '<c r="' + COL(ci) + '1" t="inlineStr" s="3"><is><t>' + esc(c.label) + "</t></is></c>"
        );
      })
      .join("");
    var widths = cols
      .map(function (c, ci) {
        return (
          '<col min="' +
          (ci + 1) +
          '" max="' +
          (ci + 1) +
          '" width="' +
          (c.width || 12) +
          '" customWidth="1"/>'
        );
      })
      .join("");
    var lastRef = COL(cols.length - 1) + (rows.length + 1);

    var sheet =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<dimension ref="A1:' +
      lastRef +
      '"/>' +
      // 見出しを固定して、下へ送っても列名が見えるようにする
      '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
      '<sheetFormatPr defaultRowHeight="15"/>' +
      "<cols>" +
      widths +
      "</cols>" +
      "<sheetData>" +
      '<row r="1">' +
      head +
      "</row>" +
      xml.join("") +
      "</sheetData>" +
      // 見出しに絞り込み（Excelで並べ替え・絞り込みができる）
      '<autoFilter ref="A1:' +
      lastRef +
      '"/>' +
      "</worksheet>";

    var styles =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<numFmts count="2"><numFmt numFmtId="164" formatCode="yyyy/mm/dd"/><numFmt numFmtId="165" formatCode="#,##0"/></numFmts>' +
      '<fonts count="2"><font><sz val="11"/><name val="Yu Gothic"/></font>' +
      '<font><b/><sz val="11"/><name val="Yu Gothic"/></font></fonts>' +
      '<fills count="3"><fill><patternFill patternType="none"/></fill>' +
      '<fill><patternFill patternType="gray125"/></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFEFEFEF"/><bgColor indexed="64"/></patternFill></fill></fills>' +
      '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="4">' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' + // s=0 ふつう
      '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' + // s=1 日付
      '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' + // s=2 金額
      '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' + // s=3 見出し
      "</cellXfs>" +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      "</styleSheet>";

    return zip([
      {
        name: "[Content_Types].xml",
        text:
          '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
          '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
          '<Default Extension="xml" ContentType="application/xml"/>' +
          '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
          '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
          '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
          "</Types>",
      },
      {
        name: "_rels/.rels",
        text:
          '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
          "</Relationships>",
      },
      {
        name: "xl/workbook.xml",
        text:
          '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
          'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
          '<sheets><sheet name="' +
          esc(sheetName) +
          '" sheetId="1" r:id="rId1"/></sheets>' +
          "</workbook>",
      },
      {
        name: "xl/_rels/workbook.xml.rels",
        text:
          '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
          '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
          "</Relationships>",
      },
      { name: "xl/worksheets/sheet1.xml", text: sheet },
      { name: "xl/styles.xml", text: styles },
    ]);
  }

  return {
    build: build,
    serial: serial,
    col: COL,
    esc: esc,
    _zip: zip,
    _crc32: crc32,
    _utf8: utf8,
  };
});
