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
  /* ★並びと束ね方も、ここが正★
     18個をいっぺんに並べると ★何を見せられているのか分からない★（司さんの声 2026-08-10）。
     group で3つの束に分け、ふだん触らない物は「そのほか」へ落とす。
     short は束の中で出す短い名前（束の見出しが「明細」なので「明細列：」を繰り返さない）。 */
  var CELL_FIELDS = [
    { key: "date", label: "請求日", short: "請求日", group: "head", kind: "date" },
    { key: "no", label: "請求番号", short: "請求番号", group: "head", kind: "text" },
    { key: "to", label: "宛名（御中つき）", short: "宛名", group: "head", kind: "text" },
    // ★テンプレに「御中」がもう刷ってあることが多い★。二重に出さないための別口
    {
      key: "toName",
      label: "宛名（御中なし）",
      short: "宛名（御中なし）",
      group: "other",
      kind: "text",
    },
    {
      key: "grand",
      label: "ご請求金額（税込）",
      short: "ご請求金額",
      group: "money",
      kind: "number",
    },
    { key: "net", label: "小計（税抜）", short: "小計（税抜）", group: "money", kind: "number" },
    { key: "tax", label: "消費税", short: "消費税", group: "money", kind: "number" },
    { key: "total", label: "合計", short: "合計", group: "money", kind: "number" },
    { key: "store", label: "店名", short: "店名", group: "other", kind: "text" },
    { key: "bank", label: "振込先", short: "振込先", group: "other", kind: "text" },
    { key: "cDate", label: "明細列：日付", short: "日付", group: "detail", kind: "col" },
    { key: "cName", label: "明細列：内容", short: "内容", group: "detail", kind: "col" },
    { key: "cPeople", label: "明細列：人数", short: "人数", group: "detail", kind: "col" },
    {
      key: "cAmount",
      label: "明細列：金額（税込）",
      short: "金額（税込）",
      group: "detail",
      kind: "col",
    },
    /* ★お店の紙は「金額＝税抜／消費税は別の列」であることが多い★
       司さんの実物がまさにこれ（E列=税抜・F列=消費税・合計は SUM で足している）。
       税込だけを入れると ★消費税ぶん多い請求書★ になるので、両方を入れ口にする。
       税抜と消費税の出し方は nomiya-core.js が唯一の正（ここでは割り算しない）。 */
    {
      key: "cNet",
      label: "明細列：金額（税抜）",
      short: "金額（税抜）",
      group: "detail",
      kind: "col",
    },
    { key: "cTax", label: "明細列：消費税", short: "消費税", group: "detail", kind: "col" },
    { key: "cMemo", label: "明細列：備考", short: "備考", group: "detail", kind: "col" },
    { key: "lastRow", label: "明細の最終行", short: "最後の行", group: "other", kind: "row" },
  ];

  var CELL_GROUPS = [
    { key: "head", title: "① 紙の上のほう" },
    { key: "money", title: "② 金額" },
    { key: "detail", title: "③ 明細（1行目のマスを、列ごとに）" },
    { key: "other", title: "そのほか（ふつうは触らなくて大丈夫）" },
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
      toName: { v: d.toName },
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
      // ★お店が指したマスなので、計算式でも上書きする（触らないと何も入らない）★
      edits.push({ ref: c[f.key], kind: f.kind, value: x.v, text: x.t, force: true });
    });

    var start = detailStart(c);
    var over = 0;
    var merged = []; // ★「ほか」にまとめた明細（画面で見せる／紙には出さない）★
    if (start) {
      var cap = detailCapacity(c);
      var rows = d.rows || [];
      /* ★枠に入りきらない分は「ほか ◯件」の1行にまとめる★（指示役 2026-08-16 の裁定(c)）
         書かずに捨てると ★紙の明細を足しても請求額にならない紙★ が客先へ出る。
         ＝「合計と明細が合わない紙」＝うちで一番 高くつく型。
         まとめる文字は名前の列（無ければ備考の列）に置く。どちらも無い店だけ、
         今までどおり「入りきりません」と知らせるだけにする（置く場所が無いので）。 */
      var otherKey = c.cName ? "cName" : c.cMemo ? "cMemo" : "";
      var n = cap ? Math.min(rows.length, cap) : rows.length;
      if (cap && rows.length > cap && otherKey) {
        n = cap - 1; // ★最後の1行は「ほか」に使う★
        merged = rows.slice(n);
      } else {
        over = rows.length - n;
      }
      var map = {
        cDate: { get: "date", kind: "date" },
        cName: { get: "name", kind: "text" },
        cPeople: { get: "people", kind: "number" },
        cAmount: { get: "amount", kind: "number" },
        cNet: { get: "net", kind: "number" },
        cTax: { get: "tax", kind: "number" },
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
            force: true,
          });
        });
      }
      if (merged.length) {
        /* ★「ほか」の金額は 足し算ではなく「合計 − 出した分」で出す★
           1件ずつ税を丸めているので、残りを足すと合計と1円ずれることがある。
           ★紙の明細を足した額 ＝ 請求額★ を必ず成り立たせる（指示役の合格条件）。 */
        var sumOf = function (key) {
          var t = 0;
          for (var j = 0; j < n; j++) t += +(rows[j][key] || 0);
          return t;
        };
        var allOf = function (key) {
          var t = 0;
          for (var j = 0; j < rows.length; j++) t += +(rows[j][key] || 0);
          return t;
        };
        var totalFor = function (key, whole) {
          return (whole == null || whole === "" ? allOf(key) : +whole) - sumOf(key);
        };
        var restRow = start + n;
        edits.push({
          ref: colLetters(c[otherKey]) + restRow,
          kind: "text",
          value: "ほか " + merged.length + "件",
          force: true,
        });
        [
          ["cAmount", "amount", d.total],
          ["cNet", "net", d.net],
          ["cTax", "tax", d.tax],
        ].forEach(function (x) {
          if (!c[x[0]]) return;
          edits.push({
            ref: colLetters(c[x[0]]) + restRow,
            kind: "number",
            value: totalFor(x[1], x[2]),
            force: true,
          });
        });
        // ★ は出す側（画面）が付けるので、ここでは付けない（★★になる）
        warn.push(merged.length + "件を「ほか」にまとめました（合計は合っています）");
      }
      if (over > 0)
        warn.push(
          "明細が " +
            over +
            " 件 入りきりません（名前か備考の列を決めれば「ほか ◯件」にまとめます）"
        );
    } else if (detailCols(c).length) {
      warn.push("明細の列が 別々の行 を指しています。同じ行のセルを選んでください");
    }
    return { edits: edits, over: over, merged: merged, warn: warn };
  }

  /* ══════════════════════════════════════════════════════════════════
     ★どのマスに入れるかを、お店に決めさせない（こちらで当てる）★
     ------------------------------------------------------------------
     司さんの声（2026-08-10）
       「どのマスに入れるかとか意味が分かりにくい」
       「入ってからこんだけ項目あるけどなんなん」
     ＝ ★18個の空欄を人に埋めさせている★のが間違い。
     日本の請求書は言葉が決まっている（御中／ご請求金額／項目・数量・金額・
     消費税・備考／小計・合計／お振込先）。だから ★紙に刷ってある言葉から機械で当たる★。

     当てない物もある
       ・店名／振込先＝お店の紙に ★もう刷ってある★（上書きすると自分の会社名が消える）
       ・宛名（御中なし）＝「御中」が別のマスにある紙だけの話
     当てた結果は「決まり」ではなく ★下書き★。画面で1つずつ直せる。

     入れる物（画面に依らない形にしてある＝そのまま試験できる）
       { maxRow, maxCol,
         cells: { "A1": { text:"請求書", date:false } , … },   // 画面に出る文字そのもの
         merges: [ {r1,c1,r2,c2} … ],                          // 1から数える
         ruled: [11,12,…] }                                    // 罫線／塗り／高さのある行
     ══════════════════════════════════════════════════════════════════ */

  function colName(c) {
    var s = "";
    while (c > 0) {
      var m = (c - 1) % 26;
      s = String.fromCharCode(65 + m) + s;
      c = (c - 1 - m) / 26;
    }
    return s;
  }
  function a1(r, c) {
    return colName(c) + r;
  }

  /** 言葉くらべ用に整える（全角→半角・空白/かっこ/コロンを落とす） */
  function gnorm(s) {
    return String(s == null ? "" : s)
      .replace(/[！-～]/g, function (ch) {
        // 全角の ！〜～ は、半角と 0xFEE0 だけずれている
        return String.fromCharCode(ch.charCodeAt(0) - 0xfee0);
      })
      .replace(/[\s()\[\].:,]/g, "")
      .toUpperCase();
  }

  /* 明細の見出しの言葉。keys は「使える順」＝先に空いている方へ入る。
     AMT は ★税込か税抜かが、その行に「消費税」の列があるかで変わる★ ので後で決める。 */
  var HEAD_WORDS = [
    { re: /^(日付|日にち|年月日|利用日|ご利用日|日)$/, keys: ["cDate"] },
    { re: /^(項目|品名|品目|内容|ご利用内容|商品名|明細|作業内容|サービス)$/, keys: ["cName"] },
    { re: /^摘要$/, keys: ["cName", "cMemo"] },
    { re: /^(人数|数量|数|員数|組数)$/, keys: ["cPeople"] },
    { re: /^(金額税抜|税抜金額|本体価格|本体金額|税抜)$/, keys: ["cNet"] },
    { re: /^(金額|金額税込|税込金額|価格|料金|税込)$/, keys: ["AMT"] },
    { re: /^(消費税|消費税額|税額|内税|外税)$/, keys: ["cTax"] },
    { re: /^(備考|メモ|摘要欄)$/, keys: ["cMemo"] },
  ];

  /* ★言葉は「丸ごと同じ」で見る（頭が同じだけで拾わない）★
     頭合わせにしていたら「消費税は10%となっております。」という ★ただの挨拶文★ を
     消費税の欄と見なして、その右のマスに金額を書きに行った（見本で実際に出た）。 */
  var STOP_WORDS =
    /^(小計|合計|総計|総合計|お振込先|振込先|振込口座|お支払金額|税抜計|以上|備考欄)(税抜|税込)?$/;

  var MONEY_WORDS = [
    {
      re: /^(ご請求金額|請求金額|ご請求額|今回ご請求額|今回請求額|ご請求合計)(税込|税抜)?$/,
      key: "grand",
    },
    { re: /^(小計|税抜計|税抜金額|差引計)(税抜)?$/, key: "net" },
    { re: /^(消費税|消費税額|内消費税)(額)?$/, key: "tax" },
    { re: /^(合計|総計|総合計|お支払金額|請求額計)(税込)?$/, key: "total" },
  ];

  var DATE_LABEL = /^(請求日|発行日|作成日|日付|年月日)$/;
  var NO_LABEL = /^(請求番号|請求NO\.?|NO\.?|番号|伝票番号|請求書番号)$/;
  var TO_LABEL = /^(宛名|御請求先|ご請求先|請求先|お客様名|お得意先|お客様)$/;
  var NUMERIC = /^[¥￥]?-?[0-9,]+(\.[0-9]+)?円?$/;

  /**
   * ★紙に刷ってある言葉から、入れ場所を当てる★
   * @returns {{cells:object, start:number, last:number, headRow:number}}
   */
  function guessCells(sheet) {
    var sh = sheet || {};
    var src = sh.cells || {};
    var maxCol = sh.maxCol || 0;
    var maxRow = sh.maxRow || 0;
    var ruled = {};
    (sh.ruled || []).forEach(function (r) {
      ruled[r] = true;
    });

    /* 結合のほどき方。押した所が結合の中なら ★左上のマスが本体★、
       右へ探すときは ★結合の右端の次★ から見る（でないと同じマスを何度も見る）。 */
    var mTop = {};
    var mEnd = {};
    (sh.merges || []).forEach(function (m) {
      for (var r = m.r1; r <= m.r2; r++)
        for (var c = m.c1; c <= m.c2; c++) {
          mTop[r + "," + c] = a1(m.r1, m.c1);
          mEnd[r + "," + c] = m.c2;
        }
    });

    var byRow = {};
    var list = [];
    Object.keys(src).forEach(function (ref) {
      var m = /^([A-Z]{1,3})(\d+)$/.exec(ref);
      if (!m) return;
      var c = 0;
      for (var i = 0; i < m[1].length; i++) c = c * 26 + (m[1].charCodeAt(i) - 64);
      var r = +m[2];
      var raw = String((src[ref] && src[ref].text) || "");
      var it = { ref: ref, r: r, c: c, raw: raw, t: gnorm(raw), date: !!(src[ref] || {}).date };
      list.push(it);
      (byRow[r] = byRow[r] || []).push(it);
      if (r > maxRow) maxRow = r;
      if (c > maxCol) maxCol = c;
    });
    Object.keys(byRow).forEach(function (r) {
      byRow[r].sort(function (a, b) {
        return a.c - b.c;
      });
    });

    var out = {};
    var put = function (k, ref) {
      if (ref && !out[k]) out[k] = ref;
    };
    var textAt = function (r, c) {
      var top = mTop[r + "," + c];
      var cell = src[top || a1(r, c)];
      return cell ? String(cell.text || "") : "";
    };

    /** そのラベルの「値を書くマス」を右に探す（数字が先・無ければ最初の空マス） */
    var valueRight = function (r, c) {
      var x = (mEnd[r + "," + c] || c) + 1;
      var stopAt = Math.min(maxCol + 2, x + 9);
      var empty = null;
      while (x <= stopAt) {
        var mk = r + "," + x;
        var ref = mTop[mk] || a1(r, x);
        var t = textAt(r, x);
        if (t === "") {
          if (!empty) empty = ref;
        } else if (NUMERIC.test(gnorm(t))) {
          return ref;
        } else {
          break; // 別の言葉が出てきたら、そこで打ち切り
        }
        x = (mEnd[mk] || x) + 1;
      }
      return empty;
    };

    /* ── ① 明細の見出し行を見つける ───────────────────────────── */
    var best = null;
    Object.keys(byRow).forEach(function (rk) {
      var r = +rk;
      var used = {};
      var hits = [];
      byRow[r].forEach(function (it) {
        if (!it.t) return;
        for (var i = 0; i < HEAD_WORDS.length; i++) {
          if (!HEAD_WORDS[i].re.test(it.t)) continue;
          var keys = HEAD_WORDS[i].keys;
          for (var j = 0; j < keys.length; j++) {
            if (used[keys[j]]) continue;
            used[keys[j]] = true;
            hits.push({ key: keys[j], c: it.c });
            return;
          }
          return;
        }
      });
      if (hits.length < 2) return;
      if (
        !best ||
        hits.length > best.hits.length ||
        (hits.length === best.hits.length && r < best.r)
      )
        best = { r: r, hits: hits, used: used };
    });

    var start = 0;
    var headRow = 0;
    if (best) {
      headRow = best.r;
      start = best.r + 1;
      best.hits.forEach(function (h) {
        var key = h.key;
        if (key === "AMT") {
          /* ★「金額」が税込か税抜かは、その行に「消費税」の列があるかで決まる★
             司さんの紙は 金額=税抜／消費税=別の列。ここを取り違えると
             ★消費税ぶん多い請求書★ が出る。 */
          key = best.used.cTax && !best.used.cNet ? "cNet" : "cAmount";
        }
        put(key, a1(start, h.c));
      });
    }

    /* ── ② 明細の最後の行 ─────────────────────────────────────── */
    var last = 0;
    if (start) {
      var stopRow = 0;
      for (var r2 = start; r2 <= maxRow; r2++) {
        var row = byRow[r2] || [];
        for (var i2 = 0; i2 < row.length; i2++)
          if (row[i2].t && STOP_WORDS.test(row[i2].t)) {
            stopRow = r2;
            break;
          }
        if (stopRow) break;
      }
      last = (stopRow ? stopRow : maxRow + 1) - 1;
      /* 罫線や塗りのある所までが明細。無い行まで数えると
         ★枠の外に1行はみ出して書く★ ので、上へ詰める。 */
      if (sh.ruled && sh.ruled.length) while (last > start && !ruled[last]) last--;
      // 列はどこでもよい（見るのは行番号だけ）
      if (last >= start) put("lastRow", a1(last, 1));
    }

    /* ── ③ 金額のラベル（明細の中は見ない） ───────────────────── */
    list.forEach(function (it) {
      if (!it.t) return;
      if (start && it.r >= headRow && it.r <= last) return;
      for (var i = 0; i < MONEY_WORDS.length; i++) {
        if (!MONEY_WORDS[i].re.test(it.t)) continue;
        put(MONEY_WORDS[i].key, valueRight(it.r, it.c));
        return;
      }
    });

    /* ── ④ 宛名 ───────────────────────────────────────────────── */
    list.forEach(function (it) {
      if (out.to || !it.t) return;
      if (/御中$/.test(it.t) && it.t.length > 2) put("to", it.ref);
    });
    list.forEach(function (it) {
      if (out.to || out.toName || !it.t) return;
      if (it.t === "御中" && it.c > 1)
        put("toName", mTop[it.r + "," + (it.c - 1)] || a1(it.r, it.c - 1));
    });
    list.forEach(function (it) {
      if (out.to || out.toName || !it.t) return;
      if (TO_LABEL.test(it.t)) put("toName", valueRight(it.r, it.c));
    });

    /* ── ⑤ 請求日・請求番号 ───────────────────────────────────── */
    list.forEach(function (it) {
      if (!it.t) return;
      if (start && it.r >= headRow && it.r <= last) return;
      if (!out.date && DATE_LABEL.test(it.t)) put("date", valueRight(it.r, it.c));
      if (!out.no && NO_LABEL.test(it.t)) put("no", valueRight(it.r, it.c));
    });
    if (!out.date) {
      /* ラベルが無い紙（司さんの実物）＝上の方にある「日付の形のマス」がそれ。
         ★ただし「日付の形だけ付いていて空のマス」が隣に並んでいることがある★
         （実物は G2・H2 が空の日付書式、実際に日付が入っているのは I2）。
         空の方を選ぶと ★紙に日付が2つ出る★ ので、
         ★すでに日付が入っているマスを先に選ぶ★。 */
      var top = null;
      var better = function (a, b) {
        if (!b) return true;
        var av = a.raw !== "" ? 1 : 0;
        var bv = b.raw !== "" ? 1 : 0;
        if (av !== bv) return av > bv;
        if (a.r !== b.r) return a.r < b.r;
        return a.c < b.c;
      };
      list.forEach(function (it) {
        if (!it.date) return;
        if (start && it.r >= start) return;
        if (better(it, top)) top = it;
      });
      if (top) put("date", top.ref);
    }

    return { cells: normalizeCells(out), start: start, last: last, headRow: headRow };
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
    CELL_GROUPS: CELL_GROUPS,
    guessCells: guessCells,
    normalizeCells: normalizeCells,
    detailStart: detailStart,
    detailCapacity: detailCapacity,
    detailCols: detailCols,
    planEdits: planEdits,
  };
});
