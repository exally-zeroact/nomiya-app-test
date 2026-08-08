/* nomiya-tpl.js — 自社テンプレ（お店が持っている紙）の上に、項目を置くための計算。
 * ==============================================================================
 * ★他のアプリにそのまま持っていける形にしてある★
 *   ・依存なし（DOMも触らない。数と決まりだけ）
 *   ・「背景を敷いて、項目を％で置く」だけの話なので、
 *     請求書でも給与明細でも領収書でも同じ物が使える
 *
 * ★位置は「A4に対する％」で持つ★
 *   px で持つと、画面の拡大率・端末・紙のdpiでズレる。
 *   ％なら、画面のプレビューでも A4 の紙でも ★同じ場所★ に出る。
 *   （設計メモに「位置合わせで必ずつまずく」と書いてあった所への答え）
 *
 * ★0〜100 の外に出さない★
 *   指で動かすと簡単に紙の外へ出る。出したまま保存すると
 *   ★画面では見えているのに紙に出ない★ という一番困る形になるので、ここで必ず戻す。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.NomiyaTpl = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* 置ける項目。key は請求書の部品(ivParts)と同じ名前にしてある。
     w は幅（A4の幅に対する％）。h は持たない＝中身の高さに任せる。 */
  var FIELDS = [
    { key: "meta", label: "請求日・No.", x: 62, y: 8, w: 32 },
    { key: "to", label: "宛名", x: 8, y: 16, w: 48 },
    { key: "lead", label: "あいさつ（前）", x: 8, y: 26, w: 48 },
    { key: "grand", label: "ご請求金額", x: 8, y: 33, w: 50 },
    { key: "cap", label: "ご利用明細の見出し", x: 8, y: 43, w: 84 },
    { key: "table", label: "明細（表）", x: 8, y: 47, w: 84 },
    { key: "sum", label: "合計", x: 55, y: 72, w: 37 },
    { key: "bank", label: "振込先", x: 8, y: 80, w: 44 },
    { key: "thanks", label: "あいさつ（後）", x: 8, y: 90, w: 40 },
    { key: "issuer", label: "店名・判子", x: 58, y: 82, w: 34 },
    { key: "logoTop", label: "ロゴ", x: 8, y: 6, w: 20 },
  ];

  function clamp(n, lo, hi) {
    n = typeof n === "number" ? n : parseFloat(n);
    if (isNaN(n)) return null;
    return n < lo ? lo : n > hi ? hi : n;
  }

  /** 1項目ぶんの置き方を、必ず紙の中に収まる形に直す */
  function fixOne(v, def) {
    var d = def || { x: 0, y: 0, w: 30 };
    var w = clamp(v && v.w, 5, 100);
    if (w == null) w = d.w;
    var x = clamp(v && v.x, 0, 100);
    if (x == null) x = d.x;
    var y = clamp(v && v.y, 0, 100);
    if (y == null) y = d.y;
    // ★右へはみ出させない（はみ出すと画面では見えて紙に出ない）★
    if (x + w > 100) x = Math.max(0, 100 - w);
    return { x: r1(x), y: r1(y), w: r1(w), show: v && v.show === false ? false : true };
  }
  function r1(n) {
    return Math.round(n * 10) / 10;
  }

  /** 保存されている置き方を、いまの項目の一覧に合わせて整える（増えた項目は既定の場所） */
  function normalize(saved) {
    var s = saved || {};
    var out = {};
    FIELDS.forEach(function (f) {
      out[f.key] = fixOne(s[f.key], f);
    });
    return out;
  }

  /** まっさらな置き方（はじめて使うとき） */
  function defaults() {
    return normalize({});
  }

  /** 画面/紙に出すための style 文字列（A4の幅を100とした％で置く） */
  function styleOf(p) {
    return "position:absolute;left:" + p.x + "%;top:" + p.y + "%;width:" + p.w + "%;";
  }

  /** 指で動かした結果（px）を％に直す。紙の実寸(px)を渡す */
  function fromPx(px, py, paperW, paperH) {
    if (!paperW || !paperH) return null;
    return { x: r1((px / paperW) * 100), y: r1((py / paperH) * 100) };
  }

  /** 出す項目だけを、置いた順（上から）に返す */
  function visible(placed) {
    return FIELDS.filter(function (f) {
      return placed[f.key] && placed[f.key].show;
    }).sort(function (a, b) {
      return placed[a.key].y - placed[b.key].y;
    });
  }

  /* ══════════════════════════════════════════════════════════════════
     ★お店のテンプレが「Excel」のとき★
     ------------------------------------------------------------------
     紙(PDF/写真)のときは「A4の上のどこに置くか（％）」だった。
     Excel のときは ★どのセルに入れるか（A1形式の番地）★ になる。
     置き方の考え方が違うだけで、やることは同じ＝「お店の物を捨てない」。

     ★番地は手で打たせない★
       画面にそのExcelを出して、押して選ばせる。打たせると必ず打ち間違える
       （司さんの「幅はExcelで見な分からん＝盲打ちは無意味」と同じ話）。
     ══════════════════════════════════════════════════════════════════ */

  /* 明細は「列」で指す。1行目の場所は、この列たちが指すセルの行から決まる
     （日付の列に A10 を選んだら、明細は10行目から下へ並ぶ）。 */
  var CELL_FIELDS = [
    { key: "date", label: "請求日", kind: "date" },
    { key: "no", label: "請求番号", kind: "text" },
    { key: "to", label: "宛名", kind: "text" },
    { key: "grand", label: "ご請求金額（税込）", kind: "number" },
    { key: "net", label: "小計（税抜）", kind: "number" },
    { key: "tax", label: "消費税", kind: "number" },
    { key: "total", label: "合計", kind: "number" },
    { key: "store", label: "店名", kind: "text" },
    { key: "bank", label: "振込先", kind: "text" },
    { key: "cDate", label: "明細列：日付", kind: "col" },
    { key: "cName", label: "明細列：内容", kind: "col" },
    { key: "cPeople", label: "明細列：人数", kind: "col" },
    { key: "cAmount", label: "明細列：金額", kind: "col" },
    { key: "cMemo", label: "明細列：備考", kind: "col" },
    { key: "lastRow", label: "明細の最終行", kind: "row" },
  ];

  var REF = /^[A-Z]{1,3}[1-9]\d{0,6}$/;

  /** 保存されている割り当てから、いまも意味のある物だけ残す */
  function normalizeCells(saved) {
    var s = saved || {};
    var out = {};
    CELL_FIELDS.forEach(function (f) {
      var v = String(s[f.key] || "").toUpperCase();
      if (REF.test(v)) out[f.key] = v;
    });
    return out;
  }

  function rowOf(ref) {
    var m = /^[A-Z]{1,3}(\d+)$/.exec(String(ref || "").toUpperCase());
    return m ? +m[1] : 0;
  }
  function colLetters(ref) {
    var m = /^([A-Z]{1,3})\d+$/.exec(String(ref || "").toUpperCase());
    return m ? m[1] : "";
  }

  /** 明細に使う列だけ取り出す（割り当てられている物だけ） */
  function detailCols(cells) {
    return CELL_FIELDS.filter(function (f) {
      return f.kind === "col" && cells[f.key];
    });
  }

  /**
   * 明細が始まる行。★列たちがバラバラの行を指していたら 0 を返す★
   * （バラバラのまま並べると、日付と金額が別の行に出て紙が壊れる）
   */
  function detailStart(cells) {
    var cs = detailCols(cells);
    if (!cs.length) return 0;
    var rows = cs.map(function (f) {
      return rowOf(cells[f.key]);
    });
    for (var i = 1; i < rows.length; i++) if (rows[i] !== rows[0]) return 0;
    return rows[0];
  }

  /** 明細に使える行数（最終行を決めていなければ 0＝上限なし） */
  function detailCapacity(cells) {
    var s = detailStart(cells);
    var last = rowOf(cells.lastRow);
    if (!s || !last) return 0;
    return Math.max(0, last - s + 1);
  }

  /**
   * ★お店のExcelに入れる「値の一覧」を作る（画面に依らない）★
   * @param {object} cells 割り当て（normalizeCells の結果）
   * @param {object} d 中身
   *   { date, dateText, no, to, grand, net, tax, total, store, bank,
   *     rows:[{date,dateText,name,people,amount,memo}] }
   * @returns {{edits:Array, over:number, warn:string[]}}
   */
  function planEdits(cells, d) {
    var c = normalizeCells(cells);
    var edits = [];
    var warn = [];
    var val = {
      date: { v: d.date, t: d.dateText },
      no: { v: d.no },
      to: { v: d.to },
      grand: { v: d.grand },
      net: { v: d.net },
      tax: { v: d.tax },
      total: { v: d.total },
      store: { v: d.store },
      bank: { v: d.bank },
    };
    CELL_FIELDS.forEach(function (f) {
      if (f.kind === "col" || f.kind === "row") return;
      if (!c[f.key]) return;
      var x = val[f.key];
      if (!x || x.v == null || x.v === "") return;
      edits.push({ ref: c[f.key], kind: f.kind, value: x.v, text: x.t });
    });

    var start = detailStart(c);
    var over = 0;
    if (start) {
      var cap = detailCapacity(c);
      var rows = d.rows || [];
      var n = cap ? Math.min(rows.length, cap) : rows.length;
      over = rows.length - n;
      var map = {
        cDate: { get: "date", kind: "date" },
        cName: { get: "name", kind: "text" },
        cPeople: { get: "people", kind: "number" },
        cAmount: { get: "amount", kind: "number" },
        cMemo: { get: "memo", kind: "text" },
      };
      for (var i = 0; i < n; i++) {
        var r = rows[i];
        Object.keys(map).forEach(function (k) {
          if (!c[k]) return;
          var v = r[map[k].get];
          if (v == null || v === "") return;
          edits.push({
            ref: colLetters(c[k]) + (start + i),
            kind: map[k].kind,
            value: v,
            text: k === "cDate" ? r.dateText : null,
          });
        });
      }
      if (over > 0) warn.push("明細が " + over + " 件 入りきりません（合計には入っています）");
    } else if (detailCols(c).length) {
      warn.push("明細の列が ★別々の行★ を指しています。同じ行のセルを選んでください");
    }
    return { edits: edits, over: over, warn: warn };
  }

  return {
    FIELDS: FIELDS,
    defaults: defaults,
    normalize: normalize,
    fixOne: fixOne,
    styleOf: styleOf,
    fromPx: fromPx,
    visible: visible,
    CELL_FIELDS: CELL_FIELDS,
    normalizeCells: normalizeCells,
    detailStart: detailStart,
    detailCapacity: detailCapacity,
    detailCols: detailCols,
    planEdits: planEdits,
  };
});
