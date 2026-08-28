/* env-badge.js — テスト環境の帯（見た瞬間に「本番ではない」と分かる）
 * ==============================================================================
 * ★なぜ要るか（指示役 2026-08-22 実測）★
 *   飲み屋は本番もテストも同じ形の画面で、URLも似ている。
 *     本番   https://nomiya-app.vercel.app/
 *     テスト https://nomiya-app-test.vercel.app/
 *   ＝★画面だけ見て、本番かテストか 分からない★。
 *   一番 危ないのは URL ではなく画面です。★本番だと思ってテストに打つ／
 *   テストのつもりで本番を触る★が起きます。だから画面の一番上に帯を出します。
 *
 * ★仕組みは Rakually(rakually-test/js/env-badge.js)から借りています★
 *   借りたのは ★仕組みだけ★（何で判定するか・頭が隠れない出し方・文の割れ止め）。
 *   ★色と言葉は 飲み屋の物★（色は :root の変数だけ＝直書きしない・全アプリの決まり）。
 *
 * ★何を見て決めるか＝ js/supa-config.js の env（この配信の名札）★
 *   ホスト名（vercel.app）では決めません。配り方は変わるが、
 *   ★本当に大事なのは「本番のデータか、テストのデータか」★だからです。
 *   倉庫のIDをこのファイルに書くのも禁じ手です（★向き先を持つのは supa-config.js だけ★）。
 *
 * ★安全側の倒し方★
 *   ・env が 'test' と分かった時 ★だけ★ 出す
 *   ・本番(env:'prod')なら ★絶対に出さない★
 *   ・名札が無い／知らない値なら ★出さない★
 *   理由: 本番に「テスト環境」と出るのが一番 危ない（本番を軽く触ってしまう）。
 *
 * ★頭が隠れないようにする★
 *   帯は画面の一番上に固定するので、そのぶん中身を下げないと
 *   アプリの上の帯（sticky）や1行目が隠れます（iOSの status-bar と同じ前科）。
 *   ★帯の高さを測って body の上余白と sticky の top を足す★。
 *   ★動かすのは position:sticky だけ★（fixed＝被せ物を下げると隙間が空く）。
 *
 * 【読む順】必ず js/supa-config.js より ★後★ に読む（先だと名札が無くて判定できない）
 */
(function (global) {
  "use strict";

  var TEST = "test";

  /**
   * 帯を出すか。★'test' と分かった時だけ true★
   *   本番(env:'prod')／名札が無い／知らない値 → ★出さない（安全側）★
   */
  function shouldShow(cfg) {
    var env = cfg && typeof cfg === "object" ? cfg.env : cfg;
    return String(env || "") === TEST;
  }

  /* 帯の見た目。★色は :root の変数だけ★（飲み屋の決まり＝直書きしない）
     地＝この店の「注意」の色(--c-warn)／字＝濃い地の上の字(--c-on-dark)／
     下の線＝Castally の金(--c-hd-logo)＝アプリの一部だと分かる。
     ★濃紺の上帯（アプリの頭）とは別の色にする★＝一目で「いつもと違う」と分かる。 */
  var CSS = [
    "#envbar{position:fixed;top:0;left:0;right:0;z-index:2147483000;",
    "background:var(--c-warn);color:var(--c-on-dark);",
    "border-bottom:2px solid var(--c-hd-logo);",
    "font-family:'Noto Sans JP',system-ui,-apple-system,sans-serif;",
    "font-size:12px;font-weight:700;line-height:1.5;text-align:center;",
    "padding:calc(6px + env(safe-area-inset-top)) 12px 6px;",
    "box-shadow:0 1px 4px rgba(0,0,0,.18);",
    /* ★文は1文字ずつ縦に割れない書き方（block・折り返し可・break-all を使わない）★ */
    "white-space:normal;word-break:normal;overflow-wrap:break-word;}",
    "#envbar b{font-weight:700;}",
    "#envbar .envbar-sub{display:block;font-weight:400;font-size:10.5px;opacity:.92;}",
    "@media print{#envbar{display:none !important;}}",
  ].join("");

  function mount() {
    if (!shouldShow(global.SUPA)) return null;
    var d = global.document;
    if (!d || d.getElementById("envbar")) return null;

    var st = d.createElement("style");
    st.id = "envbar-css";
    st.textContent = CSS;
    d.head.appendChild(st);

    var bar = d.createElement("div");
    bar.id = "envbar";
    bar.setAttribute("role", "status");
    bar.innerHTML =
      "<b>テスト環境</b>" +
      '<span class="envbar-sub">ここで打った売上は お店の本番には入りません（練習用）</span>';
    d.body.insertBefore(bar, d.body.firstChild);

    fit(bar);
    // 画面を回した・幅が変わった時も合わせ直す（帯が2行になると高さが変わる）
    global.addEventListener("resize", function () {
      fit(bar);
    });
    return bar;
  }

  /* ★帯のぶんだけ中身を下げる★（アプリの上の帯や1行目が隠れないように） */
  function fit(bar) {
    var d = global.document;
    var h = bar.offsetHeight || 0;
    if (!h) return;
    d.body.style.paddingTop = h + "px";
    /* 画面の上に貼り付く物（appbar など）は、その下に来るよう top をずらす。
       ★動かすのは position:sticky だけ★
         fixed は「画面いっぱいに被せる物」（ログイン画面・小窓・下のナビ）に使われている。
         それを下げると ★被せ物に隙間が空き、下がはみ出す★。
         被せ物は帯より下に描かれるだけでよい（帯の z-index が上）。 */
    var all = d.querySelectorAll("body *");
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (el.id === "envbar") continue;
      var cs = global.getComputedStyle(el);
      if (cs.position !== "sticky") continue;
      if (cs.top !== "0px" && el.getAttribute("data-envbar-top") !== "1") continue;
      el.style.top = h + "px";
      el.setAttribute("data-envbar-top", "1"); // 幅が変わった時に測り直せるよう印を残す
    }
  }

  var API = { shouldShow: shouldShow, mount: mount, TEST: TEST, CSS: CSS };
  if (typeof module === "object" && module.exports) module.exports = API;
  else {
    global.CastallyEnvBadge = API;
    if (global.document) {
      if (global.document.readyState === "loading") {
        global.document.addEventListener("DOMContentLoaded", mount);
      } else {
        mount();
      }
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
