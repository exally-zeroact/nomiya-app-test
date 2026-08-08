import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expectNoneOf } from "./lib/check-kit.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const X = createRequire(import.meta.url)(path.join(ROOT, "nomiya-xlsx.js"));

/* ★作った Excel を「開き直して」確かめる★
 * ------------------------------------------------------------------------------
 * バイト数だけ見て緑にしない。ZIPをほどいて、中のXMLから ★1マスずつ★ 読み戻す。
 * （圧縮しない形で書いているので、外の部品なしでほどける。それがこの作りの狙い）
 */
function unzip(bytes) {
  const files = {};
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let p = 0;
  while (p + 4 <= bytes.length && dv.getUint32(p, true) === 0x04034b50) {
    const method = dv.getUint16(p + 8, true);
    const size = dv.getUint32(p + 18, true);
    const nameLen = dv.getUint16(p + 26, true);
    const extraLen = dv.getUint16(p + 28, true);
    const name = new TextDecoder().decode(bytes.subarray(p + 30, p + 30 + nameLen));
    const start = p + 30 + nameLen + extraLen;
    if (method !== 0) throw new Error(name + " が圧縮されている（この試験はほどけない）");
    files[name] = new TextDecoder().decode(bytes.subarray(start, start + size));
    p = start + size;
  }
  return files;
}

/** sheet1.xml から「マスの位置 → 中身」を読み戻す */
function cells(sheetXml) {
  const out = {};
  const re = /<c r="([A-Z]+\d+)"([^>]*)>([\s\S]*?)<\/c>/g;
  let m;
  while ((m = re.exec(sheetXml))) {
    const [, ref, attrs, body] = m;
    const style = (attrs.match(/ s="(\d+)"/) || [])[1] || "0";
    const inline = /t="inlineStr"/.test(attrs);
    const v = inline
      ? (body.match(/<t[^>]*>([\s\S]*?)<\/t>/) || [])[1]
      : (body.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
    out[ref] = { v, style, inline };
  }
  return out;
}

const SPEC = {
  sheet: "売上帳",
  columns: [
    { key: "ymd", label: "日付", type: "date", width: 12 },
    { key: "name", label: "名前", width: 18 },
    { key: "people", label: "人数", type: "number", width: 6 },
    { key: "amount", label: "金額", type: "number", width: 12 },
    { key: "pay", label: "支払い方法", width: 12 },
    { key: "memo", label: "備考", width: 24 },
  ],
  rows: [
    { ymd: "2026-08-07", name: "田中様", people: 2, amount: 12345, pay: "現金", memo: "" },
    {
      ymd: "2026-08-08",
      name: "山本商事",
      people: 4,
      amount: 88000,
      pay: "請求書送り",
      memo: 'ボトル"入れ" & 焼酎<キープ>',
    },
  ],
};

describe("Excel書き出し（開き直して1マスずつ確かめる）", () => {
  const bytes = X.build(SPEC);
  const files = unzip(bytes);
  const sheet = files["xl/worksheets/sheet1.xml"];
  const c = cells(sheet);

  it("Excelが開くのに要る中身がそろっている", () => {
    const need = [
      "[Content_Types].xml",
      "_rels/.rels",
      "xl/workbook.xml",
      "xl/_rels/workbook.xml.rels",
      "xl/worksheets/sheet1.xml",
      "xl/styles.xml",
    ];
    const missing = need.filter((n) => !files[n]);
    expect(missing, "足りない部品: " + missing.join(" / ")).toEqual([]);
  });

  it("★ZIPとして正しい（PKで始まり、袋の数が合う）", () => {
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
    expect(Object.keys(files).length, "袋の数が合わない").toBe(6);
  });

  it("見出しが1行目に、書いた順で入っている", () => {
    expect(c.A1.v).toBe("日付");
    expect(c.B1.v).toBe("名前");
    expect(c.C1.v).toBe("人数");
    expect(c.D1.v).toBe("金額");
    expect(c.E1.v).toBe("支払い方法");
    expect(c.F1.v).toBe("備考");
  });

  it("★金額は「数字」で入る（文字ではない＝Excelで足せる）★", () => {
    expect(c.D2.inline, "金額が文字で入っている").toBe(false);
    expect(c.D2.v).toBe("12345");
    expect(c.D3.v).toBe("88000");
    // 金額の見た目は #,##0（s=2）
    expect(c.D2.style).toBe("2");
  });

  it("★日付は「日付」で入る（並べ替えできる）★", () => {
    expect(c.A2.inline, "日付が文字で入っている").toBe(false);
    // 2026-08-07 の Excel 通し番号
    expect(Number(c.A2.v)).toBe(X.serial("2026-08-07"));
    expect(Number(c.A3.v) - Number(c.A2.v), "1日ぶん進んでいない").toBe(1);
    expect(c.A2.style, "日付の見た目が付いていない").toBe("1");
  });

  it("人数も数字", () => {
    expect(c.C2.inline).toBe(false);
    expect(c.C2.v).toBe("2");
  });

  it("名前・支払い方法は文字のまま", () => {
    expect(c.B2.inline).toBe(true);
    expect(c.B2.v).toBe("田中様");
    expect(c.E3.v).toBe("請求書送り");
  });

  it('★記号入りの備考が壊れない（& < > " をそのまま戻せる）★', () => {
    expect(c.F3.v).toBe("ボトル&quot;入れ&quot; &amp; 焼酎&lt;キープ&gt;");
  });

  it("空欄はマスを作らない（嘘の0を置かない）", () => {
    expect(c.F2, "空の備考にマスができている").toBeUndefined();
  });

  it("金額が数字にならない値は、マスを作らない（0を捏造しない）", () => {
    const b = X.build({
      columns: [{ key: "amount", label: "金額", type: "number" }],
      rows: [{ amount: "" }, { amount: null }, { amount: "abc" }],
    });
    const cc = cells(unzip(b)["xl/worksheets/sheet1.xml"]);
    expect(cc.A2).toBeUndefined();
    expect(cc.A3).toBeUndefined();
    expect(cc.A4).toBeUndefined();
  });

  it("おかしな日付はマスを作らない", () => {
    expect(X.serial("2026-8-7")).toBe(null);
    expect(X.serial("")).toBe(null);
    expect(X.serial(null)).toBe(null);
  });

  it("シート名・並べ替えの絞り込み・見出し固定が入っている", () => {
    expect(files["xl/workbook.xml"]).toContain('name="売上帳"');
    expect(sheet, "並べ替えの絞り込みが無い").toContain("<autoFilter");
    expect(sheet, "見出しの固定が無い").toContain('ySplit="1"');
  });

  it("列の幅を決めている（金額が###にならない）", () => {
    expect(sheet).toContain('width="12"');
    expect(sheet).toContain('customWidth="1"');
  });

  it("★1000件でも作れて、行が抜けない★", () => {
    const rows = Array.from({ length: 1000 }, (_, i) => ({
      ymd: "2026-08-07",
      name: "客" + i,
      people: 1,
      amount: i + 1,
      pay: "現金",
      memo: "",
    }));
    const cc = cells(unzip(X.build({ ...SPEC, rows }))["xl/worksheets/sheet1.xml"]);
    expect(cc.B2.v).toBe("客0");
    expect(cc["B1001"].v).toBe("客999");
    expect(cc["D1001"].v).toBe("1000");
  });

  it("列が1つも無ければ、黙って空を作らずに落ちる", () => {
    expect(() => X.build({ columns: [], rows: [] })).toThrow(/列が1つもありません/);
  });

  it("★中身に「壊れたマス」が1つも無い（元が空なら赤）★", () => {
    const all = Object.keys(c);
    expectNoneOf(all, (ref) => c[ref].v === undefined, "中身の読めないマスがある", { min: 10 });
  });

  it("列の記号（A,B,…,Z,AA）が正しい", () => {
    expect(X.col(0)).toBe("A");
    expect(X.col(25)).toBe("Z");
    expect(X.col(26)).toBe("AA");
    expect(X.col(27)).toBe("AB");
  });
});
