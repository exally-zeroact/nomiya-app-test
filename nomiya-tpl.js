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

  return {
    FIELDS: FIELDS,
    defaults: defaults,
    normalize: normalize,
    fixOne: fixOne,
    styleOf: styleOf,
    fromPx: fromPx,
    visible: visible,
  };
});
