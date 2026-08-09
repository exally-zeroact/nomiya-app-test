/* nomiya-owntpl.js — 自社テンプレ（お店が持っている紙）を登録して、項目を置く画面。
 * ==============================================================================
 * ★この画面がやること★
 *   ① お店の紙を受け取る（PDF でも 写真/PNG でも）→ ★A4の絵に直して覚える★
 *   ② その絵を敷いて、項目を ★指で動かして置く★（位置は nomiya-tpl.js が％で持つ）
 *   ③ テンプレにもう印刷されている項目は「出さない」にできる
 *
 * ★PDFは登録のときだけ絵に直す★
 *   PDFを読む部品は1.7MBある。登録が済めば絵になるので ★二度と読まない★。
 *   ふだんの起動には1バイトも足さない。
 *
 * ★覚える大きさ★
 *   A4の幅1240px（約150dpi）まで。紙に出すのは794pxなので、これで足りる。
 *   大きすぎる絵をそのまま覚えると、端末の控えとクラウドの両方を圧迫する。
 */

var OWN_MAX_W = 1240; // 覚える絵の幅（A4・約150dpi）
var OWN_JPEG_Q = 0.82; // 写真の圧縮。文字が潰れない範囲でいちばん軽い所

/* ★お店のテンプレが Excel のとき★
 *   お店が持っている請求書は、たいてい ★Excel★（PDFや写真ではない）。
 *   そこで .xlsx はそのまま受け取り、★原本のバイト列を持っておいて、値だけ差し込む★。
 *   こうすると 罫線・結合・列幅・判子の図形・グラフ・数式 が ★1つも消えない★。
 *   （2026-08-08 に実物のExcelで測って決めた方式。作り直す方式では全部消える）
 */

/* ── 受け取る ────────────────────────────────────────────────── */

/** PDFを読む部品を、押したときだけ読む。
    ★pdf.js は新しい書き方(ESM)でしか配られていない★ので import() で読む
    （<script src> では読めない）。CSPは 'self' なので同じ場所からは読める。 */
var _pdfLib = null;
function loadPdfJs() {
  if (_pdfLib) return _pdfLib;
  _pdfLib = import("./vendor/pdf.min.mjs")
    .then(function (m) {
      var L = m && (m.getDocument ? m : m.default);
      if (!L || !L.getDocument) throw new Error("pdf.min.mjs の中身が違う");
      try {
        L.GlobalWorkerOptions.workerSrc = "vendor/pdf.worker.min.mjs";
      } catch (e) {
        /* 別担当が使えない端末でも、本体だけで読める */
      }
      return L;
    })
    .catch(function (e) {
      _pdfLib = null;
      throw new Error("PDFを読む部品を読めませんでした（" + ((e && e.message) || e) + "）");
    });
  return _pdfLib;
}

/** 絵（またはPDFの1ページ目）を、A4の形の絵にして返す（data URL） */
async function ownTplFromFile(file) {
  if (!file) throw new Error("ファイルがありません");
  var isPdf = /pdf$/i.test(file.type) || /\.pdf$/i.test(file.name || "");
  var img;
  if (isPdf) {
    // ★先に中身を読む★（1.7MBの部品を読んでいる間にファイルが消えることがある）
    var buf = await file.arrayBuffer();
    var L = await loadPdfJs();
    var doc = await L.getDocument({ data: buf }).promise;
    if (!doc.numPages) throw new Error("PDFにページがありません");
    var page = await doc.getPage(1); // ★1ページ目だけ★
    var v1 = page.getViewport({ scale: 1 });
    var scale = OWN_MAX_W / v1.width;
    var vp = page.getViewport({ scale: scale });
    var cv = document.createElement("canvas");
    cv.width = Math.round(vp.width);
    cv.height = Math.round(vp.height);
    var cx = cv.getContext("2d");
    cx.fillStyle = "#ffffff"; // 紙は白地（透明のまま焼くと黒くなる端末がある）
    cx.fillRect(0, 0, cv.width, cv.height);
    await page.render({ canvasContext: cx, viewport: vp }).promise;
    return cv.toDataURL("image/jpeg", OWN_JPEG_Q);
  }
  img = await new Promise(function (ok, ng) {
    var i = new Image();
    i.onload = function () {
      ok(i);
    };
    i.onerror = function () {
      ng(new Error("その絵は読めませんでした"));
    };
    i.src = URL.createObjectURL(file);
  });
  var w = Math.min(OWN_MAX_W, img.naturalWidth || OWN_MAX_W);
  var h = Math.round((img.naturalHeight / img.naturalWidth) * w);
  var c2 = document.createElement("canvas");
  c2.width = w;
  c2.height = h;
  var x2 = c2.getContext("2d");
  x2.fillStyle = "#ffffff";
  x2.fillRect(0, 0, w, h);
  x2.imageSmoothingQuality = "high";
  x2.drawImage(img, 0, 0, w, h);
  URL.revokeObjectURL(img.src);
  return c2.toDataURL("image/jpeg", OWN_JPEG_Q);
}

/* ── Excel のテンプレ ────────────────────────────────────────── */

function b64ToBytes(b64) {
  var bin = atob(b64);
  var u8 = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}
function bytesToB64(u8) {
  var s = "";
  for (var i = 0; i < u8.length; i += 8192)
    s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192));
  return btoa(s);
}

/** 読み込んだお店のExcel（開き直すたびに解かないよう、覚えておく） */
var OWN_BOOK = null;
var _bookFor = "";
function ownBook() {
  if (!SETTINGS.ownXlsx) return Promise.resolve(null);
  if (OWN_BOOK && _bookFor === SETTINGS.ownXlsx) return Promise.resolve(OWN_BOOK);
  return window.NomiyaXlsxTpl.open(b64ToBytes(SETTINGS.ownXlsx)).then(function (b) {
    OWN_BOOK = b;
    _bookFor = SETTINGS.ownXlsx;
    return b;
  });
}

/** もう解いてある物だけを、待たずに返す（画面を描く途中で待てないため） */
function ownBookNow() {
  return OWN_BOOK && _bookFor === SETTINGS.ownXlsx ? OWN_BOOK : null;
}

/* ★Excelの「列の幅」を画面の px に直す★
   Excelの幅は「標準の字が何文字ぶん入るか」で、1文字ぶんの幅(MDW)は ★書体で変わる★。
   ★2026-08-09 実測（司さんの実物 飲み屋(ZEROact.xlsx・既定の書体は游ゴシック11）★
     ファイルの値 12.5039 → 本物のExcelで 100px ／ 8.578 → 69px ／ 7.355 → 59px
     ＝ MDW=8 でぴったり。MDW=7 で計算すると ★7列で59pxもズレて、判子が左へ寄る★（実際に寄った）。
   欧文の既定書体(Calibri など)は MDW=7。書体の名前で選ぶ。 */
var XL_MDW_JP = 8;
var XL_MDW_LATIN = 7;
function xlMdw(book) {
  var f0 = book && book.styles && book.styles.font && book.styles.font[0];
  var name = (f0 && f0.name) || "";
  return /^[\x20-\x7E]*$/.test(name) && name ? XL_MDW_LATIN : XL_MDW_JP;
}
function xlColPx(w, mdw) {
  mdw = mdw || XL_MDW_JP;
  if (!w) return mdw === XL_MDW_LATIN ? 64 : 72; // 幅の指定が無い列（既定 8.43文字）
  return Math.trunc(((256 * w + Math.trunc(128 / mdw)) / 256) * mdw);
}
/** Excelの「行の高さ」(pt) を px に直す（1pt = 1/72インチ、画面は 96dpi） */
function xlRowPx(pt) {
  return Math.round((pt || 15) * (96 / 72));
}

/** 各列の px 幅（列の数ぶん） */
function xlColWidths(s, mdw) {
  var maxC = Math.max(1, s.maxCol);
  var w = [];
  for (var i = 0; i < maxC; i++) w.push(s.defaultColWidth || 0);
  (s.cols || []).forEach(function (cc) {
    for (var j = cc.min; j <= Math.min(cc.max, maxC); j++) if (cc.width) w[j - 1] = cc.width;
  });
  return w.map(function (x) {
    return xlColPx(x, mdw);
  });
}

/** そのマスに効いている書式（行や列に付いている物を拾う） */
function styleAt(s, r, c) {
  var rs = (s.rowStyle || {})[r + 1];
  if (rs != null) return rs;
  var cols = s.cols || [];
  for (var i = 0; i < cols.length; i++)
    if (cols[i].style != null && c + 1 >= cols[i].min && c + 1 <= cols[i].max) return cols[i].style;
  return null;
}

/** 各行の px 高さ（行の数ぶん） */
function xlRowHeights(s) {
  var maxR = Math.max(1, s.maxRow);
  var out = [];
  for (var r = 1; r <= maxR; r++) out.push(xlRowPx((s.heights || {})[r] || s.defaultRowHeight));
  return out;
}

/** その表を画面に出したときの、横の長さ(px)。A4に収める倍率を決めるのに使う */
function xlGridWidth(book, si) {
  var s = book && book.sheets[si];
  if (!s) return 1;
  return xlColWidths(s, xlMdw(book)).reduce(function (a, x) {
    return a + x;
  }, 0);
}

/**
 * お店のExcelを、画面に出せる表(HTML)にする。
 * ★お店の紙に見えることが目的★なので、Excelから読んだ物だけで組み立てる：
 *   結合・列幅・行の高さ・罫線・太字・字の大きさ・塗り・寄せ・表示形式・貼ってある絵（判子）
 * @param {object} book
 * @param {number} si 何枚目のシートか
 * @param {object} values 上書きして見せたい値 {"B4":"山田商事"}
 * @param {object} opt { pick:true=セルを押せるようにする, cells:割り当て, labels:項目名 }
 */
function xlGridHtml(book, si, values, opt) {
  var T = window.NomiyaXlsxTpl;
  var s = book && book.sheets[si];
  if (!s) return '<div class="iv-own-none">シートが見つかりません</div>';
  var o = opt || {};
  var val = values || {};
  var st = book.styles;
  var wide = xlColWidths(s, xlMdw(book));
  var high = xlRowHeights(s);
  var maxC = wide.length;
  var maxR = high.length;
  var baseSz = (st.font[0] && st.font[0].sz) || 11;

  // 結合：親だけ出して、隠れる方は出さない
  var span = {};
  var hide = {};
  s.merges.forEach(function (m) {
    span[T.refOf(m.c1, m.r1)] = { cs: m.c2 - m.c1 + 1, rs: m.r2 - m.r1 + 1 };
    for (var r = m.r1; r <= m.r2; r++)
      for (var c = m.c1; c <= m.c2; c++) if (!(r === m.r1 && c === m.c1)) hide[T.refOf(c, r)] = 1;
  });

  // どのセルに何を割り当てたか（画面に印を出す）
  var mark = {};
  if (o.cells)
    Object.keys(o.cells).forEach(function (k) {
      mark[o.cells[k]] = (mark[o.cells[k]] ? mark[o.cells[k]] + "・" : "") + (o.labels[k] || k);
    });

  /* ★表そのものの幅を書く★
     table-layout:fixed は「表の幅」が決まっていないと効かない。書かないと
     ★中身に合わせて表が広がり、列幅の指定が無視されて右がはみ出す★（実測 626px→762px）。 */
  var totalW = wide.reduce(function (a, x) {
    return a + x;
  }, 0);
  /* ★Excelは「隣のマスが空なら、文字がはみ出して見える」★
     （合同会社ZEROact／今治市本町… は1マスに収まっていないが、隣が空なので全部見える）
     ここを切ると ★「合同会社…」と省略されて別の紙に見える★（司さんの実物で出た）。
     先に全部の文字を出して、隣が空かどうかで「はみ出してよいか」を決める。 */
  var txt = [];
  for (var rr = 0; rr < maxR; rr++) {
    txt.push([]);
    for (var cc = 0; cc < maxC; cc++) {
      var rf = T.refOf(cc, rr);
      txt[rr].push(
        Object.prototype.hasOwnProperty.call(val, rf) ? val[rf] : T.cellText(book, s, rf)
      );
    }
  }
  var out = ['<table class="xl-grid" style="width:' + totalW + 'px"><colgroup>'];
  wide.forEach(function (w) {
    out.push('<col style="width:' + w + 'px">');
  });
  out.push("</colgroup><tbody>");
  for (var r = 0; r < maxR; r++) {
    out.push('<tr style="height:' + high[r] + 'px">');
    for (var c = 0; c < maxC; c++) {
      var ref = T.refOf(c, r);
      if (hide[ref]) continue;
      var cell = s.cells[ref];
      var text = txt[r][c];
      /* ★書式は セル → 行 → 列 の順に探す★
         中身の無いマスにも、行や列の書式で色や罫線が付いていることがある
         （お店の紙の「明細の帯」がまさにこれ。見ないと縞が抜ける） */
      var sIdx = cell && cell.s != null ? +cell.s : styleAt(s, r, c);
      var xf = sIdx != null ? st.xf[sIdx] : null;
      var css = [];
      var spill = "";
      var isNum = false;
      if (xf) {
        var bd = st.border[xf.borderId];
        if (bd) {
          if (bd.l) css.push("border-left:1px solid #000");
          if (bd.r) css.push("border-right:1px solid #000");
          if (bd.t) css.push("border-top:1px solid #000");
          if (bd.b) css.push("border-bottom:1px solid #000");
        }
        var fn = st.font[xf.fontId];
        if (fn) {
          if (fn.b) css.push("font-weight:700");
          // pt → px（1pt = 1/72インチ・画面は96dpi）。勘の係数を使わない
          if (fn.sz && fn.sz !== baseSz)
            css.push("font-size:" + Math.round(fn.sz * (96 / 72)) + "px");
        }
        var fl = st.fill[xf.fillId];
        if (fl) css.push("background:" + fl);
        if (xf.align === "center") css.push("text-align:center");
        else if (xf.align === "right") css.push("text-align:right");
        else if (!xf.align && cell && !cell.t && cell.v != null) css.push("text-align:right");
        // 数字はマスに収まらないと Excel では ### になる＝はみ出さない
        isNum = !!(cell && !cell.t && cell.v != null);
        var right = xf.align === "right" || (!xf.align && isNum);
        var nextEmpty = right ? c === 0 || !txt[r][c - 1] : c + 1 >= maxC || !txt[r][c + 1];
        /* ★はみ出す向き★
           CSSは「幅を超えた文字は右へこぼれる」ので、text-align:right だけでは左へ伸びない
           （実測：右寄せなのに右へはみ出して紙から出た）。
           文字を包んで ★右端をマスの右端に留める★ と、Excelと同じに左へ伸びる。 */
        if (text && !isNum && nextEmpty) spill = xf.align === "center" ? "c" : right ? "r" : "l";
        // ★Excelの既定は下揃え★
        css.push(
          "vertical-align:" +
            (xf.valign === "center" ? "middle" : xf.valign === "top" ? "top" : "bottom")
        );
      }
      var sp = span[ref];
      out.push(
        "<td" +
          (sp && sp.cs > 1 ? ' colspan="' + sp.cs + '"' : "") +
          (sp && sp.rs > 1 ? ' rowspan="' + sp.rs + '"' : "") +
          ' data-r="' +
          ref +
          '"' +
          (mark[ref] || spill
            ? ' class="' + (mark[ref] ? "xl-set " : "") + (spill ? "xl-sp " + spill : "") + '"'
            : "") +
          (css.length ? ' style="' + css.join(";") + '"' : "") +
          ">" +
          (mark[ref] ? '<span class="xl-tag">' + esc(mark[ref]) + "</span>" : "") +
          (spill ? "<span>" + esc(text) + "</span>" : esc(text)) +
          "</td>"
      );
    }
    out.push("</tr>");
  }
  out.push("</tbody></table>");

  /* ★貼ってある絵（判子・ロゴ）★
     これが無いと「請求書に見えない」。位置はマスの角からのズレで書いてあるので、
     ここまでに数えた列幅・行の高さを足して置く。 */
  var imgs = "";
  (s.images || []).forEach(function (im, i) {
    var left = 0;
    for (var c2 = 0; c2 < im.col && c2 < wide.length; c2++) left += wide[c2];
    var top = 0;
    for (var r2 = 0; r2 < im.row && r2 < high.length; r2++) top += high[r2];
    left += im.x;
    top += im.y;
    /* ★判子を動かした量★（お店が指で動かした分。触っていなければ 0） */
    var st = SETTINGS.ownStamp || {};
    left += +st.dx || 0;
    top += +st.dy || 0;
    var w2 = im.w;
    var h2 = im.h;
    if (w2 == null) {
      // 大きさが書いていなければ、挟んでいる2つのマスから出す
      var l2 = 0;
      for (var c3 = 0; c3 < im.toCol && c3 < wide.length; c3++) l2 += wide[c3];
      var t2 = 0;
      for (var r3 = 0; r3 < im.toRow && r3 < high.length; r3++) t2 += high[r3];
      w2 = l2 + im.toColOff / 9525 - left;
      h2 = t2 + im.toRowOff / 9525 - top;
    }
    imgs +=
      '<img class="xl-img" data-img="' +
      i +
      '" src="' +
      esc(im.src) +
      '" alt="" style="left:' +
      Math.round(left) +
      "px;top:" +
      Math.round(top) +
      "px;width:" +
      Math.round(w2) +
      "px;height:" +
      Math.round(h2) +
      'px">';
  });

  return (
    '<div class="xl-sheet" style="width:' +
    xlGridWidth(book, si) +
    'px">' +
    out.join("") +
    imgs +
    "</div>"
  );
}

/** 割り当てる画面（項目を押す → セルを押す） */
function openCellPlacer() {
  Promise.all([loadTplLib(), ownBook()])
    .then(function (a) {
      var TL = a[0];
      var book = a[1];
      if (!book) throw new Error("先にExcelのテンプレを選んでください");
      var cells = TL.normalizeCells(SETTINGS.ownCells);
      var labels = {};
      TL.CELL_FIELDS.forEach(function (f) {
        labels[f.key] = f.label;
      });
      var si = Math.min(SETTINGS.ownSheet || 0, book.sheets.length - 1);

      var chips = TL.CELL_FIELDS.map(function (f) {
        return (
          '<button class="chip chip-sm' +
          (cells[f.key] ? " on" : "") +
          '" type="button" data-cf="' +
          f.key +
          '">' +
          esc(f.label) +
          (cells[f.key] ? ' <b class="xl-ref">' + cells[f.key] + "</b>" : "") +
          "</button>"
        );
      }).join("");

      var sheetPick =
        book.sheets.length > 1
          ? '<div class="chips" id="xlSheets">' +
            book.sheets
              .map(function (sh, i) {
                return (
                  '<button class="chip chip-sm' +
                  (i === si ? " on" : "") +
                  '" type="button" data-sh="' +
                  i +
                  '">' +
                  esc(sh.name) +
                  "</button>"
                );
              })
              .join("") +
            "</div>"
          : "";

      openModal(
        "どのマスに入れるか決める",
        '<div class="hint">上の項目を押してから、下の表の ★入れたいマス★ を押します。' +
          "明細は、1行目のマスを列ごとに選んでください（日付・内容・金額…）。<br>" +
          "判子は ★指でつまんで動かせます★（動かした分は、出すExcelにも入ります）。</div>" +
          '<div class="chips" id="xlFields">' +
          chips +
          "</div>" +
          sheetPick +
          '<div class="xl-wrap" id="xlWrap">' +
          xlGridHtml(book, si, {}, { pick: true, cells: cells, labels: labels }) +
          "</div>" +
          '<div class="hint" id="xlNote"></div>' +
          '<div class="btn-row" style="margin-top:12px">' +
          '<button class="btn btn-primary" id="xlcOk">この割り当てで決める</button>' +
          '<button class="btn btn-ghost" id="xlcClear">割り当てを全部消す</button>' +
          "</div>"
      );
      wireCellPlacer(TL, book, cells, labels, si);
    })
    .catch(function (e) {
      toast("⚠️ 開けませんでした（" + ((e && e.message) || e) + "）");
    });
}

function wireCellPlacer(TL, book, cells, labels, si) {
  var picked = null;
  var note = $("xlNote");

  var say = function () {
    var start = TL.detailStart(cells);
    var cap = TL.detailCapacity(cells);
    var msgs = [];
    if (picked) msgs.push("「" + labels[picked] + "」を入れるマスを押してください");
    /* ★計算式のマスを指したら、その場で知らせる★
       お店の紙は明細の行に式が書いてあることがある（実物は E11 が =8500/1.1*4）。
       そこは入れてよいが、★合計の式（=SUM(...)）を指したら壊れる★ので必ず気づかせる。 */
    var onF = Object.keys(cells).filter(function (k) {
      var c = book.sheets[si].cells[cells[k]];
      return c && c.f;
    });
    if (onF.length)
      msgs.push(
        "★計算式のマスに入れます（" +
          onF
            .map(function (k) {
              return labels[k] + " " + cells[k];
            })
            .join("・") +
          "）＝その式は消えます★"
      );
    if (TL.detailCols(cells).length && !start)
      msgs.push("★明細の列が別々の行を指しています（同じ行のマスを選んでください）★");
    else if (start)
      msgs.push("明細は " + start + " 行目から" + (cap ? "・" + cap + " 行ぶん" : ""));
    note.innerHTML = esc(msgs.join(" / "));
  };

  /* 1つ選ぶたびに表を描き直す。
     ※「描き直すと見ている場所が先頭へ戻るのでは」と疑って、位置を覚えて戻す処理を足したが、
       ★Chrome も WebKit も戻らない★（消しても試験が緑のまま＝何も直していなかった）ので外した。 */
  var redraw = function () {
    $("xlWrap").innerHTML = xlGridHtml(book, si, {}, { pick: true, cells: cells, labels: labels });
    wireGrid();
    /* ★描き直したら、判子の配線も付け直す★
       付け直さないと、マスを1つ割り当てた時点で ★判子が動かなくなる★
       （2026-08-09、実物で動かなかった。手元の試験は「割り当てる前」に動かしていて気づけなかった） */
    wireStamp();
    $("xlFields")
      .querySelectorAll("[data-cf]")
      .forEach(function (b) {
        var k = b.getAttribute("data-cf");
        b.classList.toggle("on", !!cells[k]);
        b.classList.toggle("sel", picked === k);
        b.innerHTML = esc(labels[k]) + (cells[k] ? ' <b class="xl-ref">' + cells[k] + "</b>" : "");
      });
    say();
  };

  var wireGrid = function () {
    $("xlWrap")
      .querySelectorAll("td[data-r]")
      .forEach(function (td) {
        td.onclick = function () {
          var ref = td.getAttribute("data-r");
          if (!picked) {
            // 押されたマスに割り当ててある物を外す
            var hit = Object.keys(cells).filter(function (k) {
              return cells[k] === ref;
            });
            if (!hit.length) {
              toast("先に上の項目を押してください");
              return;
            }
            hit.forEach(function (k) {
              delete cells[k];
            });
            redraw();
            return;
          }
          cells[picked] = ref;
          picked = null;
          redraw();
        };
      });
  };

  $("xlFields")
    .querySelectorAll("[data-cf]")
    .forEach(function (b) {
      b.onclick = function () {
        var k = b.getAttribute("data-cf");
        picked = picked === k ? null : k;
        redraw();
      };
    });

  if ($("xlSheets"))
    $("xlSheets")
      .querySelectorAll("[data-sh]")
      .forEach(function (b) {
        b.onclick = function () {
          si = +b.getAttribute("data-sh");
          $("xlSheets")
            .querySelectorAll("[data-sh]")
            .forEach(function (x) {
              x.classList.toggle("on", +x.getAttribute("data-sh") === si);
            });
          cells = {}; // シートが変われば番地の意味も変わる
          picked = null;
          redraw();
        };
      });

  $("xlcClear").onclick = function () {
    Object.keys(cells).forEach(function (k) {
      delete cells[k];
    });
    picked = null;
    redraw();
    toast("割り当てを消しました");
  };

  $("xlcOk").onclick = function () {
    SETTINGS.ownCells = TL.normalizeCells(cells);
    SETTINGS.ownSheet = si;
    saveSettings();
    closeModal();
    renderAll();
    toast("✅ 割り当てを決めました");
  };

  wireStamp();
  wireGrid();
  say();

  /* ★判子を指で動かす★
     お店の紙の判子は、Excelの中に位置が書いてある。ここで動かした分は
     ★書き出すときに、その Excel の中の判子そのものを動かす★（別の絵を重ねない）。 */
  function wireStamp() {
    var img = $("xlWrap").querySelector(".xl-img");
    if (!img) return;
    img.style.pointerEvents = "auto";
    img.style.cursor = "move";
    var drag = null;
    var pt = function (ev) {
      var t = ev.touches && ev.touches[0] ? ev.touches[0] : ev;
      return { x: t.clientX, y: t.clientY };
    };
    var start = function (ev) {
      var p = pt(ev);
      var st = SETTINGS.ownStamp || { dx: 0, dy: 0 };
      drag = {
        x: p.x,
        y: p.y,
        dx: +st.dx || 0,
        dy: +st.dy || 0,
        l: parseFloat(img.style.left),
        t: parseFloat(img.style.top),
      };
      ev.preventDefault();
      ev.stopPropagation();
    };
    var move = function (ev) {
      if (!drag) return;
      var p = pt(ev);
      img.style.left = drag.l + (p.x - drag.x) + "px";
      img.style.top = drag.t + (p.y - drag.y) + "px";
      SETTINGS.ownStamp = {
        dx: Math.round(drag.dx + (p.x - drag.x)),
        dy: Math.round(drag.dy + (p.y - drag.y)),
      };
      ev.preventDefault();
    };
    var end = function () {
      drag = null;
    };
    img.addEventListener("mousedown", start);
    img.addEventListener("touchstart", start, { passive: false });
    document.addEventListener("mousemove", move);
    document.addEventListener("touchmove", move, { passive: false });
    document.addEventListener("mouseup", end);
    document.addEventListener("touchend", end);
  }
}

/** いま画面に出している請求書の中身（Excelに入れる値） */
function ownXlsxData() {
  if (!UI.invName) return null;
  var iv = currentInvoice();
  if (!iv) return null;
  var a = C.invoiceTo(PARTNERS, iv.name);
  var day = invIssueDate(iv);
  return {
    date: day,
    dateText: C.jpDate(day),
    no: iv.no,
    to: a.to + "　" + a.honor,
    toName: a.to,
    grand: iv.total,
    net: iv.net,
    tax: iv.tax,
    total: iv.total,
    store: SETTINGS.store || "",
    bank: SETTINGS.bank || "",
    name: iv.name,
    ym: iv.to ? C.jpMonth(C.ymOf(iv.to)) : "",
    rows: iv.rows.map(function (s) {
      // ★税抜と消費税は core が唯一の正★（ここで /1.1 と書かない）
      var t = C.taxIncluded(s.amount, SETTINGS.rate);
      return {
        date: s.date,
        dateText: C.mdShort(s.date),
        name: "ご飲食代",
        people: s.people,
        amount: s.amount,
        net: t.net,
        tax: t.tax,
        memo: s.memo || "",
      };
    }),
  };
}

/** 保存の名前の案（中身から作る）。例: Castally_請求書_山田商事_2026年8月.xlsx */
function ownXlsxSuggestName(d) {
  var parts = [];
  if (SETTINGS.store) parts.push(SETTINGS.store);
  parts.push("請求書");
  if (d && d.name) parts.push(d.name);
  if (d && d.ym) parts.push(d.ym);
  return parts.join("_").replace(/[\\/:*?"<>|]/g, "-") + ".xlsx";
}

/** いまの請求書を、お店のExcelに差し込んで渡す */
function exportOwnXlsx() {
  Promise.all([loadTplLib(), ownBook()])
    .then(function (a) {
      var TL = a[0];
      var book = a[1];
      if (!book) throw new Error("先にExcelのテンプレを選んでください");
      var d = ownXlsxData();
      if (!d) throw new Error("先に請求先を選んでください");
      var plan = TL.planEdits(SETTINGS.ownCells, d);
      if (!plan.edits.length)
        throw new Error("どのマスに入れるかが決まっていません（「どのマスに入れるか決める」から）");
      var si = Math.min(SETTINGS.ownSheet || 0, book.sheets.length - 1);
      var st = SETTINGS.ownStamp || { dx: 0, dy: 0 };
      var made = window.NomiyaXlsxTpl.fill(book, si, plan.edits, {
        imageShift: [{ dx: +st.dx || 0, dy: +st.dy || 0 }],
        // ★行と列の大きさを渡す★（渡さないと判子の置き場所を計算し直せない）
        colPx: xlColWidths(book.sheets[si], xlMdw(book)),
        rowPx: xlRowHeights(book.sheets[si]),
      });
      var msgs = plan.warn.slice();
      if (+(SETTINGS.ownStamp || {}).dx || 0 || +(SETTINGS.ownStamp || {}).dy || 0)
        msgs.push("判子の位置も動かします");
      if (made.overwritten.length)
        msgs.push("★計算式を消して値を入れます：" + made.overwritten.join("・") + "★");
      if (made.skipped.length)
        msgs.push("計算式のマス（" + made.skipped.join("・") + "）には入れていません");
      var suggest = ownXlsxSuggestName(d);
      openModal(
        "お店のExcelに入れて渡す",
        '<div class="frow"><span class="flabel">ファイル名</span>' +
          '<input class="finput" type="text" id="oxName" value="' +
          esc(suggest) +
          '"></div>' +
          '<div class="hint">' +
          esc(SETTINGS.ownXlsxName || "テンプレ") +
          " に " +
          made.wrote +
          "マスぶん入れます。★元のファイルは変わりません★" +
          (msgs.length ? "<br>★" + esc(msgs.join(" / ")) + "★" : "") +
          "</div>" +
          '<div style="margin-top:12px"><button class="btn btn-primary" id="oxOk">書き出す</button></div>'
      );
      $("oxOk").onclick = function () {
        var name = ($("oxName").value || "").trim() || suggest;
        if (!/\.xlsx$/i.test(name)) name += ".xlsx";
        saveAsFile(
          new Blob([made.bytes], {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          }),
          name
        );
        closeModal();
        toast("📊 " + name + " を書き出しました");
      };
    })
    .catch(function (e) {
      toast("⚠️ " + ((e && e.message) || e));
    });
}

/* ── 置き場所を決める画面 ────────────────────────────────────── */

/** いま置いている物を、A4のプレビューの上で指で動かせるようにする */
function openOwnPlacer() {
  if (SETTINGS.ownXlsx) return openCellPlacer();
  loadTplLib()
    .then(function (TL) {
      var placed = TL.normalize(SETTINGS.ownFields);
      var bg = SETTINGS.ownTpl
        ? '<img class="op-bg" src="' + esc(SETTINGS.ownTpl) + '" alt="">'
        : '<div class="op-none">先に「紙を選ぶ」でテンプレを入れてください</div>';
      var boxes = TL.FIELDS.map(function (f) {
        var p = placed[f.key];
        return (
          '<div class="op-f' +
          (p.show ? "" : " off") +
          '" data-f="' +
          f.key +
          '" style="left:' +
          p.x +
          "%;top:" +
          p.y +
          "%;width:" +
          p.w +
          '%">' +
          '<span class="op-lb">' +
          esc(f.label) +
          "</span>" +
          '<span class="op-grip"></span>' +
          "</div>"
        );
      }).join("");
      var chips = TL.FIELDS.map(function (f) {
        return (
          '<button class="chip chip-sm' +
          (placed[f.key].show ? " on" : "") +
          '" type="button" data-show="' +
          f.key +
          '">' +
          esc(f.label) +
          "</button>"
        );
      }).join("");

      openModal(
        "項目の置き場所を決める",
        '<div class="hint">項目をつまんで動かします。右下の角で幅を変えられます。' +
          "テンプレにもう刷ってある項目は、下で押して消せます。</div>" +
          '<div class="op-wrap"><div class="op-paper" id="opPaper">' +
          bg +
          boxes +
          "</div></div>" +
          '<div class="card-label" style="margin-top:10px">紙に出す項目</div>' +
          '<div class="chips" id="opShow">' +
          chips +
          "</div>" +
          '<div class="btn-row" style="margin-top:12px">' +
          '<button class="btn btn-primary" id="opOk">この置き方で決める</button>' +
          '<button class="btn btn-ghost" id="opReset">はじめの置き方に戻す</button>' +
          "</div>"
      );
      wireOwnPlacer(TL, placed);
    })
    .catch(function (e) {
      toast("⚠️ 置き場所の画面を開けませんでした（" + ((e && e.message) || e) + "）");
    });
}

function wireOwnPlacer(TL, placed) {
  var paper = $("opPaper");
  var drag = null;

  var pt = function (ev) {
    var t = ev.touches && ev.touches[0] ? ev.touches[0] : ev;
    return { x: t.clientX, y: t.clientY };
  };
  var start = function (ev) {
    var el = ev.target.closest ? ev.target.closest(".op-f") : null;
    if (!el) return;
    var key = el.getAttribute("data-f");
    var box = paper.getBoundingClientRect();
    var r = el.getBoundingClientRect();
    var p = pt(ev);
    drag = {
      el: el,
      key: key,
      // 右下の角をつまんだら幅を変える。それ以外は動かす
      mode: ev.target.classList && ev.target.classList.contains("op-grip") ? "size" : "move",
      dx: p.x - r.left,
      dy: p.y - r.top,
      box: box,
      startW: r.width,
      startX: p.x,
    };
    ev.preventDefault();
  };
  var move = function (ev) {
    if (!drag) return;
    var p = pt(ev);
    if (drag.mode === "move") {
      var nx = p.x - drag.dx - drag.box.left;
      var ny = p.y - drag.dy - drag.box.top;
      var v = TL.fromPx(nx, ny, drag.box.width, drag.box.height);
      if (!v) return;
      var fixed = TL.fixOne(
        { x: v.x, y: v.y, w: placed[drag.key].w, show: placed[drag.key].show },
        placed[drag.key]
      );
      placed[drag.key] = fixed;
      drag.el.style.left = fixed.x + "%";
      drag.el.style.top = fixed.y + "%";
    } else {
      var wpx = drag.startW + (p.x - drag.startX);
      var wpc = (wpx / drag.box.width) * 100;
      var f2 = TL.fixOne(
        { x: placed[drag.key].x, y: placed[drag.key].y, w: wpc, show: placed[drag.key].show },
        placed[drag.key]
      );
      placed[drag.key] = f2;
      drag.el.style.left = f2.x + "%";
      drag.el.style.width = f2.w + "%";
    }
    ev.preventDefault();
  };
  var end = function () {
    drag = null;
  };

  paper.addEventListener("mousedown", start);
  paper.addEventListener("touchstart", start, { passive: false });
  document.addEventListener("mousemove", move);
  document.addEventListener("touchmove", move, { passive: false });
  document.addEventListener("mouseup", end);
  document.addEventListener("touchend", end);

  $("opShow")
    .querySelectorAll("[data-show]")
    .forEach(function (b) {
      b.onclick = function () {
        var k = b.getAttribute("data-show");
        placed[k].show = !placed[k].show;
        b.classList.toggle("on", placed[k].show);
        var el = paper.querySelector('.op-f[data-f="' + k + '"]');
        if (el) el.classList.toggle("off", !placed[k].show);
      };
    });

  /* ★はじめの置き方に戻す★
     ここで持っている物(placed)だけを戻して開き直すと、
     開き直した画面は ★保存されている方★ を読むので「戻したのに戻らない」。
     （2026-08-09 に試験が捕まえた。先に保存してから開き直す） */
  $("opReset").onclick = function () {
    SETTINGS.ownFields = TL.defaults();
    saveSettings();
    closeModal();
    renderAll();
    openOwnPlacer();
    toast("はじめの置き方に戻しました");
  };

  $("opOk").onclick = function () {
    SETTINGS.ownFields = TL.normalize(placed);
    saveSettings();
    closeModal();
    renderAll();
    toast("✅ 置き方を決めました");
  };
}

/* ── 設定の行（自社のテンプレを選んだときだけ出る） ───────────── */
function renderOwnTplRow() {
  var row = $("ownTplRow");
  if (!row) return;
  var on = (SETTINGS.tpl || "card") === "own";
  row.style.display = on ? "" : "none";
  if (!on) return;
  var place = $("btnOwnPlace");
  var xl = !!SETTINGS.ownXlsx;
  if (place) place.textContent = xl ? "どのマスに入れるか決める" : "項目の置き場所を決める";
  var out = $("btnOwnXlsx");
  if (out) out.style.display = xl ? "" : "none";
  var note = $("ownTplNote");
  if (!note) return;
  if (xl) {
    var kb2 = Math.round((SETTINGS.ownXlsx.length * 0.75) / 1024);
    var n = Object.keys(
      window.NomiyaTpl ? window.NomiyaTpl.normalizeCells(SETTINGS.ownCells) : {}
    ).length;
    note.textContent =
      "Excelが入っています：" +
      (SETTINGS.ownXlsxName || "テンプレ") +
      "（約" +
      kb2 +
      "KB・割り当て " +
      n +
      "件）。★元のファイルは変えません★";
    return;
  }
  if (!SETTINGS.ownTpl) {
    note.textContent =
      "まだテンプレが入っていません。Excel・PDF・紙を撮った写真のどれでも構いません。";
    return;
  }
  var kb = Math.round((SETTINGS.ownTpl.length * 0.75) / 1024);
  note.textContent = "紙が入っています（約" + kb + "KB）。押すと入れ直せます。";
}

/* 端末に覚えておける大きさの目安。これを超えると他の物まで保存できなくなる */
var OWN_XLSX_MAX = 2 * 1024 * 1024;

/** お店のExcelを受け取って覚える（★原本のバイト列のまま★）
 *  ★バイト列は先に読んでから渡すこと★
 *    部品(nomiya-xlsx-tpl.js)を読み込んでいる間に、選んだファイルの中身が
 *    端末から消えることがある（iPhone/WebKitで実際に起きた：
 *    「読めませんでした（The object can not be found here.）」）。
 *    先に読んでしまえば、あとから消えても困らない。 */
function takeOwnXlsx(u8, name) {
  return Promise.resolve()
    .then(function () {
      if (u8.length > OWN_XLSX_MAX)
        throw new Error(
          "このExcelは大きすぎます（" + Math.round(u8.length / 1024) + "KB）。2MBまでにしてください"
        );
      return window.NomiyaXlsxTpl.open(u8).then(function (book) {
        SETTINGS.ownXlsx = bytesToB64(u8);
        SETTINGS.ownXlsxName = name || "テンプレ.xlsx";
        SETTINGS.ownSheet = 0;
        SETTINGS.ownTpl = ""; // 紙(絵)のテンプレとは同時に持たない
        SETTINGS.tpl = "own";
        OWN_BOOK = book;
        _bookFor = SETTINGS.ownXlsx;
        saveSettings();
        renderOwnTplRow();
        renderAll();
        toast("✅ Excelを入れました。次に「どのマスに入れるか決める」を押してください");
      });
    })
    .catch(function (e) {
      toast("⚠️ 読めませんでした（" + ((e && e.message) || e) + "）");
    });
}

function wireOwnTpl() {
  var pick = $("btnOwnPick");
  var file = $("ownTplFile");
  if (!pick || !file) return;
  pick.onclick = function () {
    file.value = "";
    file.click();
  };
  file.onchange = function () {
    var f = file.files && file.files[0];
    if (!f) return;
    if (/\.xlsx$/i.test(f.name || "") || /spreadsheetml/.test(f.type || "")) {
      toast("📊 Excelを読んでいます…");
      /* ★先に中身を読む★（部品を読み込んでいる間にファイルが消えることがある） */
      var nm = f.name;
      f.arrayBuffer()
        .then(function (ab) {
          var u8 = new Uint8Array(ab);
          return loadXlsxTplLib().then(function () {
            return takeOwnXlsx(u8, nm);
          });
        })
        .catch(function (e) {
          toast("⚠️ 読めませんでした（" + ((e && e.message) || e) + "）");
        });
      return;
    }
    toast("📄 紙を読んでいます…");
    ownTplFromFile(f)
      .then(function (dataUrl) {
        SETTINGS.ownTpl = dataUrl;
        SETTINGS.ownXlsx = ""; // Excelのテンプレとは同時に持たない
        SETTINGS.ownXlsxName = "";
        SETTINGS.tpl = "own";
        if (!SETTINGS.ownFields || !Object.keys(SETTINGS.ownFields).length) {
          SETTINGS.ownFields = window.NomiyaTpl ? window.NomiyaTpl.defaults() : {};
        }
        saveSettings();
        renderOwnTplRow();
        renderAll();
        toast("✅ 紙を入れました。次に「項目の置き場所を決める」を押してください");
      })
      .catch(function (e) {
        toast("⚠️ 読めませんでした（" + ((e && e.message) || e) + "）");
      });
  };
  var place = $("btnOwnPlace");
  if (place) place.onclick = openOwnPlacer;
  var out = $("btnOwnXlsx");
  if (out) out.onclick = exportOwnXlsx;
}
