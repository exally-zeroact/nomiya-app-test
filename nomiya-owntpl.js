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
    var L = await loadPdfJs();
    var buf = await file.arrayBuffer();
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

/* ── 置き場所を決める画面 ────────────────────────────────────── */

/** いま置いている物を、A4のプレビューの上で指で動かせるようにする */
function openOwnPlacer() {
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
  var note = $("ownTplNote");
  if (!note) return;
  if (!SETTINGS.ownTpl) {
    note.textContent = "まだ紙が入っていません。PDFでも、紙を撮った写真でも構いません。";
    return;
  }
  var kb = Math.round((SETTINGS.ownTpl.length * 0.75) / 1024);
  note.textContent = "紙が入っています（約" + kb + "KB）。押すと入れ直せます。";
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
    toast("📄 紙を読んでいます…");
    ownTplFromFile(f)
      .then(function (dataUrl) {
        SETTINGS.ownTpl = dataUrl;
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
}
