/* nomiya-ui-uriage.js — 入力画面・一覧(売上帳)・集計
 * ------------------------------------------------------------------------------
 * ★2026-08-07 に nomiya-uriage.html の中から そのまま切り出した物★
 *   中身は1行も書き換えていない（切って移しただけ）。
 *
 * ★ふつうの <script>（module ではない）★
 *   7本は同じ場所(グローバル)を共有する。module にすると各ファイルが別の部屋になり、
 *   今の呼び合いが全部切れるので ★type=module にしてはいけない★。
 * ★読み込む順番が命★  nomiya-ui-base.js → nomiya-ui-uriage.js → nomiya-ui-kaishu.js → nomiya-ui-kami.js → nomiya-ui-settei.js → nomiya-ui-kyuryo.js → nomiya-ui-boot.js
 *   起動(boot)は必ず最後。順番は nomiya-uriage.html の並びが正。
 * ★どこに何が書いてあるかを試験に教えるのは tests/app-source.mjs★
 *   ファイルを足す/減らす/名前を変えるときは、HTMLの <script> も一緒に直すこと
 *   （食い違ったら tests/app-source.mjs が赤くする）。
 */
"use strict";
/* ===================================================================
         入力画面
         =================================================================== */
function buildInputChips() {
  var pc = $("payChips");
  pc.innerHTML = C.PAY_METHODS.map(function (m) {
    return (
      '<button class="chip" type="button" data-pay="' + m.key + '">' + esc(m.label) + "</button>"
    );
  }).join("");
  pc.querySelectorAll("[data-pay]").forEach(function (b) {
    b.onclick = function () {
      UI.inPay = b.getAttribute("data-pay");
      syncInputChips();
    };
  });
}

// 領収書チップの文字。ツケだけ言い方を変える（渡した／あとで）
function recChipLabel(key, payKey) {
  // 「出したか / 出していないか」だけを聞く。言い方は全部そろえる。
  if (key === "na") return "なし";
  if (key === "later") return "あとで渡す（回収時）";
  if (key === "issued") return payKey === "tsuke" ? "渡した" : "あり";
  return "なし";
}

function syncInputChips() {
  syncDateNote();
  $("payChips")
    .querySelectorAll("[data-pay]")
    .forEach(function (b) {
      b.classList.toggle("on", b.getAttribute("data-pay") === UI.inPay);
    });
  // 領収書の選択肢は支払い方法で変える（振込・カードは出していないので「なし」が既定。
  // ただし請求書・売上票が証憑として残るので、集計では「あり」に数える。
  // ツケは回収時に渡すので「あとで」が既定）
  UI.inRec = C.fixReceiptFor(UI.inPay, UI.inRec);
  $("recChips").innerHTML = C.receiptChoices(UI.inPay)
    .map(function (k) {
      return (
        '<button class="chip" type="button" data-rec="' +
        k +
        '">' +
        esc(recChipLabel(k, UI.inPay)) +
        "</button>"
      );
    })
    .join("");
  $("recChips")
    .querySelectorAll("[data-rec]")
    .forEach(function (b) {
      b.classList.toggle("on", b.getAttribute("data-rec") === UI.inRec);
      b.onclick = function () {
        UI.inRec = b.getAttribute("data-rec");
        syncInputChips();
      };
    });
  // 領収書の注意（印紙・カード払い）。止めない・断定しない。
  var notes = C.receiptNotes(
    {
      pay: UI.inPay,
      receipt: UI.inRec,
      amount: Number($("inAmount").value) || 0,
    },
    SETTINGS.rate
  );
  $("recNote").textContent = notes.join(" ");
  syncNameField();
}

function readForm() {
  var pickName = UI.inPay === "invoice";
  var nm = pickName ? UI.inName : $("inName").value;
  return {
    date: $("inDate").value,
    name: nm === "__new" ? "" : nm,
    people: $("inPeople").value === "" ? NaN : Number($("inPeople").value),
    amount: $("inAmount").value === "" ? NaN : Number($("inAmount").value),
    pay: UI.inPay,
    receipt: UI.inRec,
    staff: $("inStaff").value, // 担当（誰の客か）。歩合の元になる
    crew: readCrew(), // ついた人（ヘルプ・場内など）
    memo: $("inMemo").value,
  };
}

function clearForm(keepDate) {
  var d = $("inDate").value;
  $("inName").value = "";
  UI.inName = "";
  $("inPeople").value = "";
  $("inAmount").value = "";
  $("inMemo").value = "";
  $("inStaff").value = "";
  setCrew([]);
  UI.inRec = C.defaultReceipt(UI.inPay);
  UI.editId = null;
  $("inErr").textContent = "";
  $("inputMode").textContent = "新しい売上";
  $("btnSave").textContent = "保存する";
  $("editArea").style.display = "none";
  if (keepDate) $("inDate").value = d;
  syncInputChips();
}

/* ★打ち間違いを庇う。止めない。
         「2026」を「2030」と打つと、その売上は今日の一覧にも今月の集計にも出ないので、
         入れた瞬間に黄色で知らせる（保存はできる＝前受けを入れたい店もある）。 */
function syncDateNote() {
  var el = $("inDateNote");
  if (!el) return;
  var msg = C.dateNote($("inDate").value, todayIso());
  el.textContent = msg;
  el.style.display = msg ? "" : "none";
}

// ★断られた欄そのものを赤くする。直したらすぐ消す。
var NG_FIELDS = { date: "inDate", name: "inName", people: "inPeople", amount: "inAmount" };
function markNg(fields) {
  Object.keys(NG_FIELDS).forEach(function (k) {
    var el = $(NG_FIELDS[k]);
    if (el) el.classList.toggle("ng", (fields || []).indexOf(k) >= 0);
  });
}

function onSave() {
  var raw = readForm();
  var v = C.validateSale(raw);
  if (!v.ok) {
    $("inErr").textContent = v.errors.join("\n");
    markNg(v.fields);
    return;
  }
  $("inErr").textContent = "";
  markNg([]);
  if (UI.editId) {
    var idx = -1;
    for (var i = 0; i < SALES.length; i++) {
      if (SALES[i].id === UI.editId) {
        idx = i;
        break;
      }
    }
    if (idx < 0) {
      toast("⚠️ 元の売上が見つかりませんでした");
      clearForm(true);
      return;
    }
    var prev = SALES[idx];
    raw.id = prev.id;
    raw.createdAt = prev.createdAt;
    // 入金済みのものは、支払い方法が未回収のままなら入金日を引き継ぐ
    raw.paidDate = prev.paidDate;
    SALES[idx] = C.normalizeSale(raw);
    saveSales();
    toast("✅ 直しました");
  } else {
    SALES.push(C.normalizeSale(raw));
    saveSales();
    toast("✅ 保存しました");
  }
  // ★締めた日を触ったら、その場で言う（あとで気づくと現金が合わない）
  if (C.movedAfterCloseCount(SALES, raw.date, CLOSES[raw.date])) {
    toast("⚠️ " + C.jpDate(raw.date) + "は締めてあります。あるべき額が変わりました");
  }
  // 請求書送りで選んだ相手は、次から上に出す
  if (raw.pay === "invoice" && PARTNERS[raw.name]) {
    PARTNERS = C.touchPartner(PARTNERS, raw.name, new Date().toISOString());
    savePartners();
  }
  clearForm(true);
  renderAll();
}

function startEdit(id) {
  var s = null;
  for (var i = 0; i < SALES.length; i++) {
    if (SALES[i].id === id) s = SALES[i];
  }
  if (!s) return;
  UI.editId = id;
  $("inDate").value = s.date;
  $("inName").value = s.name;
  UI.inName = s.name;
  $("inPeople").value = s.people;
  $("inAmount").value = s.amount;
  $("inMemo").value = s.memo || "";
  $("inStaff").value = s.staff || "";
  setCrew(s.crew || []);
  UI.inPay = s.pay;
  UI.inRec = C.normalizeReceipt(s.receipt);
  $("inputMode").textContent = "この売上を直す";
  $("btnSave").textContent = "直した内容で保存する";
  $("editArea").style.display = "flex";
  syncInputChips();
  showScreen("input");
  window.scrollTo(0, 0);
}

function onDelete() {
  if (!UI.editId) return;
  var id = UI.editId;
  openModal(
    "この売上を消す",
    '<div class="hint">消すと売上帳・集計から外れます。取り消せません。</div>' +
      '<div class="btn-right" style="margin-top:14px">' +
      '<button class="btn btn-ghost btn-sm" id="mdNo">やめる</button>' +
      '<button class="btn btn-ghost btn-danger btn-sm" id="mdYes">消す</button></div>'
  );
  $("mdNo").onclick = closeModal;
  $("mdYes").onclick = function () {
    for (var i = 0; i < SALES.length; i++) {
      if (SALES[i].id === id) {
        var _now = new Date().toISOString();
        SALES[i] = Object.assign({}, SALES[i], {
          deletedAt: _now,
          updatedAt: _now,
        });
      }
    }
    saveSales();
    closeModal();
    clearForm(true);
    renderAll();
    toast("🗑 消しました");
  };
}

/** ★「見ている日」は1つ★（入力タブと締めタブが 別々の日を持たない）
 *  指示役 2026-08-21：同じ状態を2画面で別々に持つな。
 *  ★日を書き換えるのは この関数だけ★。書き換えたら 両方 出し直す。
 *  （前は「出金を打った時だけ揃う」＝すでに2通りあった＝食い違いが出る形だった） */
function setWorkDay(ymd) {
  if (!C.isIsoDate(ymd)) return;
  $("inDate").value = ymd;
  UI.closeYmd = ymd;
  renderDay();
  syncDateNote();
  renderClose(); // 中で renderClosePeriod も呼ばれる
}

function renderDay() {
  var d = $("inDate").value;
  var rows = C.sortSales(C.filterSales(SALES, { from: d, to: d }));
  $("dayLabel").textContent =
    (C.isIsoDate(d) ? C.jpDate(d) + "（" + C.weekday(d) + "）" : "この日") + " の売上";
  var sum = C.summarize(rows);
  $("dayStrip").innerHTML =
    stripItem("組数", C.comma(sum.count), "組") +
    stripItem("人数", C.comma(sum.people), "人") +
    stripItem("売上", C.yen(sum.amount));
  /* ★その日の出金★（司さん 2026-08-21「入力タブからしか入力しないと思う」）
     出す物も押した先も、締めタブとまったく同じ（drawOuts / openOut）。 */
  var inp = closeInput(d);
  var shimeta = !!inp.closedAt;
  $("inOutLabel").textContent =
    (C.isIsoDate(d) ? C.jpDate(d) + "（" + C.weekday(d) + "）" : "この日") + " の出金";
  drawOuts("inOuts", inp.outs, d, shimeta);
  gateBtn("btnInOutAdd", shimeta, "＋ 出金を足す", "この日はもう締めています");

  $("dayList").innerHTML = rows.length
    ? rows.map(saleLi).join("")
    : '<div class="empty">まだありません</div>';
  $("dayList")
    .querySelectorAll("[data-id]")
    .forEach(function (el) {
      el.onclick = function () {
        startEdit(el.getAttribute("data-id"));
      };
    });
}

function saleLi(s) {
  var unpaid = C.isUnpaidMethod(s.pay) && !s.paidDate;
  return (
    '<div class="li" data-id="' +
    esc(s.id) +
    '"><div class="li-main"><div class="li-nm">' +
    esc(s.name) +
    "　" +
    s.people +
    '人</div><div class="li-sub">' +
    '<span class="tag ' +
    (unpaid ? "tag-unpaid" : "tag-pay") +
    '">' +
    esc(C.payLabel(s.pay)) +
    (unpaid ? "・未回収" : "") +
    "</span>" +
    (C.isIssued(s)
      ? '<span class="tag tag-rc">領収書</span>'
      : C.isLater(s)
        ? '<span class="tag tag-rc">領収書あとで</span>'
        : "") +
    esc(s.memo || "") +
    '</div></div><div class="li-amt">' +
    C.yen(s.amount) +
    "</div></div>"
  );
}

/* 上の数字1つ分。★単位(u)は数字と分ける★＝数字の右端をそろえるため。 */
function stripItem(k, v, u) {
  var len = String(v).length + (u ? 2 : 0);
  var size = len >= 13 ? " len-l" : len >= 10 ? " len-m" : "";
  return (
    '<div class="strip-item"><div class="strip-k">' +
    esc(k) +
    '</div><div class="strip-v' +
    size +
    '">' +
    esc(v) +
    (u ? '<span class="strip-u">' + esc(u) + "</span>" : "") +
    "</div></div>"
  );
}

/* ===================================================================
         一覧（売上帳）
         =================================================================== */
function buildListFilters() {
  var fp = $("filPay");
  fp.innerHTML =
    '<button class="chip chip-sm on" type="button" data-fp="all">すべて</button>' +
    C.PAY_METHODS.map(function (m) {
      return (
        '<button class="chip chip-sm" type="button" data-fp="' +
        m.key +
        '">' +
        esc(m.label) +
        "</button>"
      );
    }).join("");
  fp.querySelectorAll("[data-fp]").forEach(function (b) {
    b.onclick = function () {
      UI.filPay = b.getAttribute("data-fp");
      renderLedger();
    };
  });
  $("filRec")
    .querySelectorAll("[data-rec]")
    .forEach(function (b) {
      b.onclick = function () {
        UI.filRec = b.getAttribute("data-rec");
        renderLedger();
      };
    });
}

function listRows() {
  var r = periodRange();
  return C.sortSales(
    C.filterSales(SALES, {
      from: r.from,
      to: r.to,
      pay: UI.filPay,
      receipt: UI.filRec,
    })
  );
}

/* ===== Excelに書き出す（売上帳） =====
   ★出すのは「いま画面に出している行」そのまま★（期間・支払い方法・領収書の絞り込み込み）。
   紙と同じ物を、Excelで並べ替え・足し算できる形で渡すためのもの。
   ・金額と人数は ★数字★、日付は ★日付★ で入れる（文字で入れると足せない）
   ・保存の名前は ★中身から作った案を先に出して、直せるようにする★（全アプリ共通の決まり）
   ・部品(nomiya-xlsx.js)は ★押したときだけ読む★＝ふだんの起動には1バイトも足さない */
var _xlsxLib = null;
function loadXlsxLib() {
  if (_xlsxLib) return _xlsxLib;
  _xlsxLib = new Promise(function (ok, ng) {
    if (window.NomiyaXlsx) return ok(window.NomiyaXlsx);
    var el = document.createElement("script");
    el.src = "nomiya-xlsx.js";
    el.onload = function () {
      window.NomiyaXlsx ? ok(window.NomiyaXlsx) : ng(new Error("nomiya-xlsx.js"));
    };
    el.onerror = function () {
      _xlsxLib = null; // 失敗は次に押したとき取り直す
      ng(new Error("nomiya-xlsx.js"));
    };
    document.head.appendChild(el);
  });
  return _xlsxLib;
}

/** 保存の名前の案（中身から作る）。例: Castally_売上帳_2026年8月.xlsx */
function xlsxSuggestName() {
  var shop = (SETTINGS && SETTINGS.store) || "";
  var parts = [];
  if (shop) parts.push(shop);
  parts.push("売上帳");
  parts.push(periodLabel());
  if (UI.filPay && UI.filPay !== "all") parts.push(C.payLabel(UI.filPay));
  if (UI.filRec && UI.filRec !== "all") parts.push(recFilterLabel(UI.filRec));
  return parts.join("_").replace(/[\\/:*?"<>|]/g, "-") + ".xlsx";
}
function recFilterLabel(k) {
  return k === "yes" ? "領収書あり" : k === "no" ? "領収書なし" : k === "adj" ? "調整" : "";
}

function exportListXlsx() {
  var rows = listRows();
  if (!rows.length) {
    toast("⚠️ この期間に売上がありません");
    return;
  }
  openModal(
    "Excelに書き出す",
    '<div class="frow"><span class="flabel">ファイル名</span>' +
      '<input class="finput" type="text" id="xlName" value="' +
      esc(xlsxSuggestName()) +
      '"></div>' +
      '<div class="hint">' +
      rows.length +
      "件（" +
      esc(periodLabel()) +
      "）。いま画面に出している分をそのまま出します。</div>" +
      '<div style="margin-top:12px"><button class="btn btn-primary" id="xlOk">書き出す</button></div>'
  );
  $("xlOk").onclick = function () {
    var name = ($("xlName").value || "").trim() || xlsxSuggestName();
    if (!/\.xlsx$/i.test(name)) name += ".xlsx";
    $("xlOk").disabled = true;
    toast("📊 作っています…");
    loadXlsxLib()
      .then(function (X) {
        var bytes = X.build({
          sheet: "売上帳",
          columns: [
            { key: "ymd", label: "日付", type: "date", width: 12 },
            { key: "name", label: "名前", width: 18 },
            { key: "people", label: "人数", type: "number", width: 6 },
            { key: "amount", label: "金額", type: "number", width: 12 },
            { key: "pay", label: "支払い方法", width: 14 },
            { key: "rec", label: "領収書", width: 9 },
            { key: "staff", label: "担当", width: 12 },
            { key: "memo", label: "備考", width: 28 },
          ],
          rows: rows.map(function (s) {
            return {
              // ★画面の売上は s.date（ymd はクラウドの棚の側の名前。取り違えると日付が空になる）
              ymd: s.date,
              name: s.name,
              people: s.people,
              amount: s.amount,
              pay: C.payLabel(s.pay),
              // ★紙と同じ2区分★（紙の印が ○ の物が「あり」。判断の元は core が唯一の正）
              rec: C.receiptMark(s.receipt) === "○" ? "あり" : "なし",
              staff: s.staff || "",
              memo: s.memo || "",
            };
          }),
        });
        var blob = new Blob([bytes], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });
        saveAsFile(blob, name);
        closeModal();
        toast("📊 " + name + " を書き出しました");
      })
      .catch(function (e) {
        $("xlOk").disabled = false;
        toast("⚠️ 書き出せませんでした（" + ((e && e.message) || e) + "）");
      });
  };
}

/** ★一覧＝見て・直して・消す所★（司さん 2026-08-21）
 *  絞り込みのチップも 紙も Excel も ここには置かない（見本＝代行請求の「明細一覧 / 修正」）。
 *  期間の中の売上を、そのまま日付つきで並べる。押せば その1件を直せる・消せる。 */
function renderList() {
  var r = periodRange();
  var rows = C.sortSales(C.filterSales(SALES, { from: r.from, to: r.to }));
  var sum = C.summarize(rows);
  $("tabListStrip").innerHTML =
    stripItem("組数", C.comma(sum.count), "組") +
    stripItem("のべ人数", C.comma(sum.people), "人") +
    stripItem("売上", C.yen(sum.amount));
  $("listRows").innerHTML = rows.length
    ? rows
        .map(function (x) {
          // 日付を頭に付ける（月をまたいで並ぶので、日が無いと どれか分からない）
          return saleLi(x).replace(
            '<div class="li-nm">',
            '<div class="li-nm">' + esc(C.mdShort(x.date)) + "　"
          );
        })
        .join("")
    : '<div class="empty">まだありません</div>';
  $("listRows")
    .querySelectorAll("[data-id]")
    .forEach(function (el) {
      el.onclick = function () {
        startEdit(el.getAttribute("data-id"));
      };
    });
}

/** ★売上帳＝紙を作る所★（集計タブの中）。絞り込みと紙と Excel はここ。 */
function renderLedger() {
  $("filPay")
    .querySelectorAll("[data-fp]")
    .forEach(function (b) {
      b.classList.toggle("on", b.getAttribute("data-fp") === UI.filPay);
    });
  $("filRec")
    .querySelectorAll("[data-rec]")
    .forEach(function (b) {
      b.classList.toggle("on", b.getAttribute("data-rec") === UI.filRec);
    });

  var rows = listRows();
  var sum = C.summarize(rows);
  $("listStrip").innerHTML =
    stripItem("組数", C.comma(sum.count), "組") +
    stripItem("のべ人数", C.comma(sum.people), "人") +
    stripItem("売上", C.yen(sum.amount));

  /* ★0件のときに紙やExcelを作らせない★（白紙を作って渡すのが、いちばん分かりにくい） */
  gateBtn("btnPrintList", !rows.length, "🖨 印刷 / PDFにする", "この期間に売上がありません");
  gateBtn("btnXlsxList", !rows.length, "📊 Excelに書き出す", "この期間に売上がありません");

  /* ★出す物が無いときは、紙の下絵も出さない★（白紙を見せると「壊れている」に見える） */
  $("listScale").hidden = !rows.length;
  $("listSheets").innerHTML = ledgerSheetsHtml(rows);
  bindSheetRows($("listSheets"));
  fitSheets("listScale", "listSheets");
  renderAdjPick();
}

/* 調整＝領収書なしの中から、どれを足すかを1件ずつ自分で選ぶ。
         いくら足しているかを必ず見せる（何を出しているか分からんまま印刷させない）。 */
function renderAdjPick() {
  var box = $("adjBox");
  box.style.display = UI.filRec === "adj" ? "" : "none";
  if (UI.filRec !== "adj") return;
  var r = periodRange();
  var inPeriod = C.filterSales(SALES, { from: r.from, to: r.to, pay: UI.filPay });
  var t = C.adjTotals(inPeriod);
  $("adjSum").innerHTML =
    '<table class="sum-tbl"><tbody>' +
    '<tr><td style="text-align:left">領収書あり</td><td>' +
    t.yes.count +
    "件</td><td>" +
    C.comma(t.yes.amount) +
    "</td></tr>" +
    '<tr><td style="text-align:left">＋ 選んだ分</td><td>' +
    t.picked.count +
    "件</td><td>" +
    C.comma(t.picked.amount) +
    "</td></tr>" +
    '<tr><td style="text-align:left"><b>合わせて</b></td><td></td><td><b>' +
    C.comma(t.total) +
    "</b></td></tr>" +
    '<tr><td style="text-align:left">残り</td><td>' +
    t.rest.count +
    "件</td><td>" +
    C.comma(t.rest.amount) +
    "</td></tr></tbody></table>";

  var cand = C.sortSales(
    inPeriod.filter(function (s) {
      return C.canAdj(s);
    })
  );
  $("adjPick").innerHTML = cand.length
    ? cand
        .map(function (s) {
          return (
            '<div class="li" data-adj="' +
            esc(s.id) +
            '"><div class="li-main"><div class="li-nm">' +
            (s.adj ? "☑ " : "☐ ") +
            esc(s.name || "（名前なし）") +
            '</div><div class="li-sub">' +
            esc(C.mdShort(s.date)) +
            "（" +
            esc(C.weekday(s.date)) +
            "）　" +
            esc(C.payLabel(s.pay)) +
            "　" +
            s.people +
            '人</div></div><div class="li-amt">' +
            C.yen(s.amount) +
            "</div></div>"
          );
        })
        .join("")
    : '<div class="empty">この期間に、領収書なしの売上はありません。</div>';
  $("adjPick")
    .querySelectorAll("[data-adj]")
    .forEach(function (el) {
      el.onclick = function () {
        var id = el.getAttribute("data-adj");
        var i = SALES.findIndex(function (x) {
          return x.id === id;
        });
        if (i < 0) return;
        SALES[i] = Object.assign({}, SALES[i], {
          adj: !SALES[i].adj,
          updatedAt: new Date().toISOString(),
        });
        saveSales();
        renderAll();
      };
    });
}

// 売上帳のA4（複数ページ）
function ledgerSheetsHtml(rows) {
  var pages = C.ledgerPages(rows, ROWS_FULL, ROWS_LAST);
  var total = C.summarize(rows);
  var html = "";
  for (var p = 0; p < pages.length; p++) {
    var last = p === pages.length - 1;
    html +=
      '<div class="sheet">' +
      '<div class="sh-head">' +
      '<div class="sh-store">' +
      esc(SETTINGS.store || "（店名は設定で入れられます）") +
      "</div>" +
      '<div class="sh-title">売 上 帳</div>' +
      // ★紙に「どう絞り込んだか」は刷らない（司さん指示）。期間とページだけ。
      '<div class="sh-meta"><span>' +
      esc(periodLabel()) +
      "</span><span>" +
      (p + 1) +
      " / " +
      pages.length +
      " ページ</span></div>" +
      "</div>" +
      // ページごとに日付の印を付け直す＝ページの1行目には必ず日付が出る
      ledgerTableHtml(C.markFirstOfDate(pages[p]), last ? ROWS_LAST : ROWS_FULL) +
      (last ? ledgerFootHtml(rows, total) : "") +
      "</div>";
  }
  return html;
}

// rows は markFirstOfDate() を通した [{sale, showDate}]。
// 同じ日は最初の行だけ日付・曜日を出す（代行請求書と同じ見せ方＝日付が並んで潰れない）。
function ledgerTableHtml(marked, slots) {
  var body = "";
  for (var i = 0; i < slots; i++) {
    var m = marked[i];
    if (m) {
      var s = m.sale;
      body +=
        '<tr data-id="' +
        esc(s.id) +
        '"><td class="c-d">' +
        (m.showDate ? esc(C.mdShort(s.date)) : "") +
        '</td><td class="c-w">' +
        (m.showDate ? esc(C.weekday(s.date)) : "") +
        '</td><td class="c-n">' +
        esc(s.name) +
        '</td><td class="c-p">' +
        s.people +
        '</td><td class="c-a">' +
        C.comma(s.amount) +
        '</td><td class="c-m">' +
        esc(C.payShort(s.pay)) +
        // 請求書送り・ツケは、まだお金が入っていない(未)/入った(済)を紙の上でも分かるようにする
        (C.isUnpaidMethod(s.pay)
          ? s.paidDate
            ? '<span class="c-paid">済</span>'
            : '<span class="c-un">未</span>'
          : "") +
        // ★領収書の列は紙に出さない（司さん指示・2026-08-02）
        '</td><td class="c-bk">' +
        esc(s.memo || "") +
        "</td></tr>";
    } else {
      body +=
        '<tr class="blank"><td class="c-d"></td><td class="c-w"></td><td class="c-n"></td>' +
        '<td class="c-p"></td><td class="c-a"></td><td class="c-m"></td>' +
        '<td class="c-bk"></td></tr>';
    }
  }
  return (
    '<table class="sh-tbl"><thead><tr>' +
    '<th class="c-d">日付</th><th class="c-w">曜</th><th class="c-n">名前</th>' +
    '<th class="c-p">人数</th><th class="c-a">金額</th><th class="c-m">支払方法</th>' +
    '<th class="c-bk">備考</th>' +
    "</tr></thead><tbody>" +
    body +
    "</tbody></table>"
  );
}

function ledgerFootHtml(rows, total) {
  var pays = C.byPayMethod(rows);
  var recs = C.byReceipt(rows);
  var showRec = UI.filRec === "all";
  var payHtml = pays
    .map(function (m) {
      return (
        '<div class="fb-row"><span>' +
        esc(m.label) +
        '</span><span class="fb-c">' +
        m.count +
        '件</span><span class="fb-v">' +
        C.comma(m.amount) +
        "</span></div>"
      );
    })
    .join("");
  var recHtml = recs
    .map(function (m) {
      return (
        '<div class="fb-row"><span>' +
        esc(m.label) +
        '</span><span class="fb-c">' +
        m.count +
        '件</span><span class="fb-v">' +
        C.comma(m.amount) +
        "</span></div>"
      );
    })
    .join("");
  return (
    '<div class="sh-foot">' +
    '<div class="sh-total"><span class="st-k">合計</span>' +
    '<span class="st-sub">' +
    total.count +
    " 組 / のべ " +
    total.people +
    " 人</span>" +
    '<span class="st-v">¥' +
    C.comma(total.amount) +
    "</span></div>" +
    '<div class="sh-boxes">' +
    '<div class="fb"><div class="fb-h">支払い方法別</div>' +
    payHtml +
    "</div>" +
    // ★領収書 あり/なし の内訳は「すべて」で見ているときだけ出す（司さん指示）。
    //   絞って出した紙には載せない。客単価・1組平均はどちらでも出す。
    '<div class="fb"><div class="fb-h">' +
    (showRec ? "領収書" : "平均") +
    "</div>" +
    (showRec ? recHtml : "") +
    '<div class="fb-note">客単価 ¥' +
    C.comma(total.perPerson) +
    " / 1組平均 ¥" +
    C.comma(total.perGroup) +
    "</div></div>" +
    "</div></div>"
  );
}

// A4の行をタップしたら、その売上を直せる
function bindSheetRows(root) {
  root.querySelectorAll("tr[data-id]").forEach(function (tr) {
    tr.classList.add("clickable");
    tr.onclick = function () {
      startEdit(tr.getAttribute("data-id"));
    };
  });
}

/* ===================================================================
         集計
         =================================================================== */
// 集計の「全体 / 領収書あり / 領収書なし」の切り替え。選んだ範囲で全部の数字が変わる。
function sumScopeRows() {
  var r = periodRange();
  return C.sortSales(C.filterSales(SALES, { from: r.from, to: r.to, receipt: UI.sumRec }));
}

function renderSum() {
  $("sumRecTabs")
    .querySelectorAll("[data-srec]")
    .forEach(function (b) {
      b.classList.toggle("on", b.getAttribute("data-srec") === UI.sumRec);
    });
  // 領収書で絞っているときに「領収書あり/なし別」を出しても意味がないので隠す
  $("sumRecCard").style.display = UI.sumRec === "all" ? "" : "none";

  var rows = sumScopeRows();
  var sum = C.summarize(rows);

  // 数字は横1列に詰める（上の塊で場所を取らないように）
  $("sumStrip").innerHTML =
    stripItem("売上", C.yen(sum.amount)) +
    stripItem("組数", C.comma(sum.count), "組") +
    stripItem("のべ人数", C.comma(sum.people), "人") +
    stripItem("客単価", C.yen(sum.perPerson));

  $("sumPay").innerHTML = brkTable(C.byPayMethod(rows), sum.amount);
  var later = C.laterReceipts(rows);
  $("sumRec").innerHTML =
    brkTable(C.byReceipt(rows), sum.amount) +
    (later.count
      ? '<div class="hint" style="margin-top:8px">うち「あとで渡す」約束が ' +
        later.count +
        "件・" +
        C.yen(later.amount) +
        "（回収したときに渡す分。まだ出していないので『なし』に入っています）</div>"
      : "");

  var days = C.byDay(rows);
  var maxDay = 0;
  days.forEach(function (d) {
    if (d.amount > maxDay) maxDay = d.amount;
  });
  $("sumDay").innerHTML = days.length
    ? '<table class="brk"><thead><tr><th>日</th><th>組</th><th>人</th><th>売上</th><th class="barcell"></th></tr></thead><tbody>' +
      days
        .map(function (d) {
          return (
            "<tr><td>" +
            esc(C.mdShort(d.date)) +
            "（" +
            esc(C.weekday(d.date)) +
            "）</td><td>" +
            d.count +
            "</td><td>" +
            d.people +
            "</td><td>" +
            C.comma(d.amount) +
            '</td><td class="barcell"><div class="bar"><i style="width:' +
            (maxDay ? Math.round((d.amount / maxDay) * 100) : 0) +
            '%"></i></div></td></tr>'
          );
        })
        .join("") +
      "</tbody></table>"
    : '<div class="empty">この期間の売上はまだありません</div>';

  updateBadge(C.receivables(SALES, PAYMENTS, dueOpt({ hideDone: true })).length);
}

function statCard(k, v) {
  return (
    '<div class="stat"><div class="stat-k">' +
    esc(k) +
    '</div><div class="stat-v">' +
    v +
    "</div></div>"
  );
}

function brkTable(rows, total) {
  // 棒も「組」の多さで伸ばす（割合の列と同じ見方にする）
  var maxCount = 0;
  rows.forEach(function (r) {
    if (r.count > maxCount) maxCount = r.count;
  });
  return (
    '<table class="brk"><thead><tr><th>区分</th><th>組</th><th>金額</th><th>割合</th><th class="barcell"></th></tr></thead><tbody>' +
    rows
      .map(function (r) {
        var z = r.count === 0 ? " zero" : "";
        return (
          "<tr><td>" +
          esc(r.label) +
          '</td><td class="' +
          z.trim() +
          '">' +
          r.count +
          '</td><td class="' +
          z.trim() +
          '">' +
          C.comma(r.amount) +
          '</td><td class="' +
          z.trim() +
          '">' +
          // 割合は「組」に対して。金額の割合は出さない（見るのは組の数）
          Math.round(r.countRatio * 100) +
          '%</td><td class="barcell"><div class="bar"><i style="width:' +
          (maxCount ? Math.round((r.count / maxCount) * 100) : 0) +
          '%"></i></div></td></tr>'
        );
      })
      .join("") +
    "</tbody><tfoot><tr><td>合計</td><td>" +
    rows.reduce(function (a, r) {
      return a + r.count;
    }, 0) +
    "</td><td>" +
    C.comma(total) +
    "</td><td></td><td></td></tr></tfoot></table>"
  );
}

function updateBadge(n) {
  var b = $("invBadge");
  if (n > 0) {
    b.textContent = n;
    b.style.display = "";
  } else {
    b.style.display = "none";
  }
}
