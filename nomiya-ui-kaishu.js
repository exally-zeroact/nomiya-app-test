/* nomiya-ui-kaishu.js — 未回収と入金(ツケ・請求書送りの回収)
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
         未回収と入金（ツケ・請求書送りの回収）
         ─ 入金は1件ずつ記録して、古いツケから順に充てる。
           充てた結果は持たない＝毎回 C.receivables() が計算する。
           だから入金を消せば、未回収もそのまま元に戻る。
         =================================================================== */
/* 未回収に渡す「いつまでにもらう約束」。会社は宛先ごと、ツケは店ぜんぶ共通。
         ここが唯一の正。画面もバッジも同じ物を使う。 */
function dueOpt(extra) {
  var terms = {};
  Object.keys(PARTNERS || {}).forEach(function (k) {
    var p = PARTNERS[k];
    if (p && !p.deletedAt && p.term) terms[p.name || k] = p.term;
  });
  return Object.assign(
    { today: todayIso(), terms: terms, tsukeTerm: SETTINGS.tsukeTerm },
    extra || {}
  );
}

function renderDue() {
  var list = C.receivables(SALES, PAYMENTS, dueOpt({ order: UI.dueOrder }));
  var open = list.filter(function (x) {
    return !x.done;
  });
  var total = open.reduce(function (a, x) {
    return a + x.left;
  }, 0);
  var oldest = open.length ? open[0] : null;
  var late = open.reduce(function (a, x) {
    return a + x.overdue;
  }, 0);
  $("dueStrip").innerHTML =
    stripItem("まだもらってない", C.yen(total)) +
    stripItem("相手", C.comma(open.length), "人") +
    // 期限を決めている店だけ「過ぎている分」を出す。決めていない店には出さない。
    (open.some(function (x) {
      return x.due;
    })
      ? stripItem("期限が過ぎた", C.yen(late))
      : stripItem(
          "一番古い",
          oldest && oldest.days != null ? C.comma(oldest.days) : "—",
          oldest && oldest.days != null ? "日前" : ""
        ));
  $("dueOrder")
    .querySelectorAll("[data-do]")
    .forEach(function (b) {
      b.classList.toggle("on", b.getAttribute("data-do") === UI.dueOrder);
      b.onclick = function () {
        UI.dueOrder = b.getAttribute("data-do");
        renderDue();
      };
    });
  $("dueList").innerHTML = open.length
    ? open
        .map(function (x) {
          return (
            '<div class="li" data-due-name="' +
            esc(x.name) +
            '"><div class="li-main"><div class="li-nm">' +
            esc(x.name) +
            // 期限を決めている相手は「期限が過ぎた」を先に出す（30日タグより強い）
            (x.overdue > 0
              ? '<span class="li-tag" style="background:var(--c-danger-bg);color:var(--c-danger)">期限 ' +
                -x.dueIn +
                "日すぎ</span>"
              : x.days != null && x.days >= 30 && !x.due
                ? '<span class="li-tag" style="background:var(--c-warn-bg);color:var(--c-warn)">' +
                  x.days +
                  "日</span>"
                : "") +
            '</div><div class="li-sub">' +
            esc(C.mdShort(x.oldest)) +
            "から　" +
            x.count +
            "件" +
            (x.paid ? "　入金 " + C.yen(x.paid) : "") +
            // 期限を決めていれば「◯/◯まで（あと◯日）」。決めていなければ今までどおり日数。
            (x.due
              ? "　" +
                esc(C.mdShort(x.due)) +
                "まで" +
                (x.dueIn != null && x.dueIn >= 0 ? "（あと" + x.dueIn + "日）" : "")
              : x.days != null && x.days < 30
                ? "　" + x.days + "日"
                : "") +
            '</div></div><div class="li-amt">' +
            C.yen(x.left) +
            "</div></div>"
          );
        })
        .join("")
    : '<div class="empty">まだもらってない分はありません。</div>';
  $("dueList")
    .querySelectorAll("[data-due-name]")
    .forEach(function (el) {
      el.onclick = function () {
        askPay(el.getAttribute("data-due-name"));
      };
    });
  // 多くもらった分（預かり）があれば出す
  var over = list.filter(function (x) {
    return x.over > 0;
  });
  $("dueNote").innerHTML = over.length
    ? over
        .map(function (x) {
          return (
            "<div>⚠️ " +
            esc(x.name) +
            " は " +
            C.yen(x.over) +
            " 多くもらっています（預かりになっています）</div>"
          );
        })
        .join("")
    : "";
}

function renderPaidLog() {
  var rows = (PAYMENTS || [])
    .filter(function (p) {
      return p && !p.deletedAt;
    })
    .sort(function (a, b) {
      if (a.ymd !== b.ymd) return a.ymd < b.ymd ? 1 : -1;
      return (a.createdAt || "") < (b.createdAt || "") ? 1 : -1;
    });
  $("paidList").innerHTML = rows.length
    ? rows
        .map(function (p) {
          return (
            '<div class="li"><div class="li-main"><div class="li-nm">' +
            esc(C.mdShort(p.ymd)) +
            "（" +
            esc(C.weekday(p.ymd)) +
            "）　" +
            esc(p.name) +
            '</div><div class="li-sub">' +
            esc(p.how === "cash" ? "現金で受け取った" : "振込・カード") +
            (p.memo ? "　" + esc(p.memo) : "") +
            '</div></div><div class="li-amt">' +
            C.yen(p.amount) +
            '</div><button class="btn btn-ghost btn-sm" type="button" data-unpay="' +
            esc(p.id) +
            '" style="flex:0 0 auto">取り消す</button></div>'
          );
        })
        .join("")
    : '<div class="empty">まだ入金はありません。</div>';
  $("paidList")
    .querySelectorAll("[data-unpay]")
    .forEach(function (b) {
      b.onclick = function () {
        var id = b.getAttribute("data-unpay");
        var p = PAYMENTS.filter(function (x) {
          return x.id === id;
        })[0];
        if (!p) return;
        openModal(
          "入金を取り消す",
          '<div class="hint">' +
            esc(C.jpDate(p.ymd)) +
            " の " +
            esc(p.name) +
            " からの " +
            C.yen(p.amount) +
            " を取り消します。<br>未回収は元に戻ります。" +
            (p.how === "cash" ? "レジの「現金で回収したツケ」からも外れます。" : "") +
            '</div><div class="btn-right" style="margin-top:14px">' +
            '<button class="btn btn-ghost btn-danger btn-sm" id="mdUnpayYes">取り消す</button></div>'
        );
        $("mdUnpayYes").onclick = function () {
          var nowIso4 = new Date().toISOString();
          PAYMENTS = PAYMENTS.map(function (x) {
            return x.id === id
              ? Object.assign({}, x, { deletedAt: nowIso4, updatedAt: nowIso4 })
              : x;
          });
          savePayments();
          applyPaidMarks(nowIso4);
          closeModal();
          renderAll();
          toast("↩️ 取り消しました");
        };
      };
    });
}

/* 入金の結果を売上に映す。埋まりきった売上に「入金済み（payment）」の印を付け、
         足りなくなったら外す。金額の正は入金の記録の方（ここは印だけ）。 */
function applyPaidMarks(nowIso6) {
  var byId = {};
  C.receivables(SALES, PAYMENTS, {}).forEach(function (r) {
    r.rows.forEach(function (row) {
      byId[row.id] = { left: row.left, ymd: lastPayYmd(r.name) };
    });
  });
  var touched = false;
  SALES = SALES.map(function (s0) {
    var hit = byId[s0.id];
    // 前の作りで入金済みにした分（印が無い）は触らない
    if (s0.paidDate && s0.paidBy !== "payment") return s0;
    if (hit && hit.left === 0 && !s0.paidDate) {
      touched = true;
      return Object.assign({}, s0, {
        paidDate: hit.ymd || todayIso(),
        paidBy: "payment",
        updatedAt: nowIso6,
      });
    }
    if (s0.paidBy === "payment" && (!hit || hit.left > 0)) {
      touched = true;
      return Object.assign({}, s0, { paidDate: null, paidBy: "", updatedAt: nowIso6 });
    }
    return s0;
  });
  if (touched) saveSales();
}
// その相手の一番新しい入金日（印に使う）
function lastPayYmd(name) {
  var ymd = "";
  (PAYMENTS || []).forEach(function (p) {
    if (!p || p.deletedAt || p.name !== name) return;
    if (p.ymd > ymd) ymd = p.ymd;
  });
  return ymd;
}

/* 入金を記録する（相手ごと。既定は残り全部＝1タップで済む） */
function askPay(name) {
  var r = C.receivables(SALES, PAYMENTS, { today: todayIso() }).filter(function (x) {
    return x.name === name;
  })[0];
  if (!r || r.left <= 0) {
    toast("この相手に、まだもらってない分はありません");
    return;
  }
  // その相手の未回収のうち、領収書を「あとで渡す」約束が残っている件数
  var laterCount = 0;
  r.rows.forEach(function (row) {
    var s0 = SALES.filter(function (x) {
      return x.id === row.id;
    })[0];
    if (s0 && C.isLater(s0)) laterCount++;
  });
  openModal(
    "入金を記録する",
    '<div class="hint">' +
      esc(name) +
      " のまだもらってない分は " +
      C.yen(r.left) +
      "（" +
      r.count +
      "件・" +
      esc(C.mdShort(r.oldest)) +
      "から）です。<br>一部だけ入ったときは、その額を入れてください。</div>" +
      '<div class="frow" style="margin-top:12px"><span class="flabel">入金日</span>' +
      '<input class="finput" type="date" id="pyDate" value="' +
      todayIso() +
      '"></div>' +
      '<div class="frow"><span class="flabel">入った額</span>' +
      '<input class="finput" type="number" inputmode="numeric" id="pyAmount" value="' +
      r.left +
      '"></div>' +
      '<div class="frow"><span class="flabel">受け取り方</span><div class="chips" id="pyHow">' +
      C.PAY_HOWS.map(function (h) {
        return (
          '<button class="chip chip-sm" type="button" data-how="' +
          h.key +
          '">' +
          esc(h.label) +
          "</button>"
        );
      }).join("") +
      "</div></div>" +
      '<div class="frow"><span class="flabel">メモ（任意）</span>' +
      '<input class="finput" id="pyMemo" placeholder="例）半分だけ"></div>' +
      // 「あとで渡す」約束が残っていれば、この場で渡したことにできる
      (laterCount
        ? '<label class="md-check"><input type="checkbox" id="pyRc" checked>' +
          "領収書も渡した（あとで渡す分 " +
          laterCount +
          "件）</label>"
        : "") +
      '<div class="err" id="pyErr"></div>' +
      '<div style="margin-top:12px"><button class="btn btn-primary" id="pyOk">入金を記録する</button></div>'
  );
  var how = "bank";
  var syncHow = function () {
    $("pyHow")
      .querySelectorAll("[data-how]")
      .forEach(function (b) {
        b.classList.toggle("on", b.getAttribute("data-how") === how);
        b.onclick = function () {
          how = b.getAttribute("data-how");
          syncHow();
        };
      });
  };
  syncHow();
  $("pyOk").onclick = function () {
    var d = $("pyDate").value;
    var amt = Math.floor(Number($("pyAmount").value) || 0);
    if (!C.isIsoDate(d)) {
      $("pyErr").textContent = "入金日を入れてください";
      return;
    }
    if (amt <= 0) {
      $("pyErr").textContent = "入った額を入れてください";
      return;
    }
    var nowIso5 = new Date().toISOString();
    PAYMENTS = PAYMENTS.concat([
      C.normalizePayment(
        { name: name, ymd: d, amount: amt, how: how, memo: $("pyMemo").value },
        nowIso5
      ),
    ]);
    savePayments();
    applyPaidMarks(nowIso5);
    // 埋まりきった売上のうち「あとで渡す」だった分は、渡したなら発行済みにする
    if ($("pyRc") && $("pyRc").checked) {
      var after = C.receivables(SALES, PAYMENTS, {}).filter(function (x) {
        return x.name === name;
      })[0];
      var doneIds = {};
      ((after && after.rows) || []).forEach(function (row) {
        if (row.left === 0) doneIds[row.id] = 1;
      });
      var touched = false;
      SALES = SALES.map(function (s0) {
        if (doneIds[s0.id] && C.isLater(s0)) {
          touched = true;
          return Object.assign({}, s0, {
            receipt: "issued",
            receiptDate: d,
            updatedAt: nowIso5,
          });
        }
        return s0;
      });
      if (touched) saveSales();
    }
    closeModal();
    renderAll();
    toast("✅ " + name + " から " + C.yen(amt) + " の入金を記録しました");
  };
}

// 入金の記録（相手＋任意の期間＋任意の支払い方法の未入金分に入金日を入れる）
function askPaid(name, from, to, payKey) {
  var target = C.filterSales(SALES, {
    name: name,
    from: from || "",
    to: to || "",
    pay: payKey || "all",
    unpaidOnly: true,
  });
  if (!target.length) {
    toast("未回収がありません");
    return;
  }
  var sum = C.summarize(target);
  openModal(
    "入金を記録する",
    '<div class="hint">' +
      esc(name) +
      (payKey ? "（" + esc(C.payLabel(payKey)) + "）" : "") +
      " の未回収 " +
      sum.count +
      "件・" +
      C.yen(sum.amount) +
      " を入金済みにします。<br>売上はそのまま残り、未回収からだけ消えます。</div>" +
      '<div class="frow" style="margin-top:12px"><span class="flabel">入金日</span>' +
      '<input class="finput" type="date" id="mdPaidDate" value="' +
      todayIso() +
      '"></div>' +
      // 現金で受け取ったならレジの現金が増える＝締めに入れる
      '<div class="frow"><span class="flabel">受け取り方</span><div class="chips" id="mdPaidHow">' +
      '<button class="chip chip-sm on" type="button" data-how="bank">振込・カード</button>' +
      '<button class="chip chip-sm" type="button" data-how="cash">現金で受け取った</button>' +
      "</div></div>" +
      // 「あとで渡す」約束が残っている分があれば、この場で渡したことにできる
      (C.laterReceipts(target).count
        ? '<label class="md-check"><input type="checkbox" id="mdPaidRc" checked>' +
          "領収書も渡した（あとで渡す分 " +
          C.laterReceipts(target).count +
          "件）</label>"
        : "") +
      '<div style="margin-top:12px"><button class="btn btn-primary" id="mdPaidOk">入金済みにする</button></div>'
  );
  var paidHow = "bank";
  $("mdPaidHow")
    .querySelectorAll("[data-how]")
    .forEach(function (b) {
      b.onclick = function () {
        paidHow = b.getAttribute("data-how");
        $("mdPaidHow")
          .querySelectorAll("[data-how]")
          .forEach(function (x) {
            x.classList.toggle("on", x === b);
          });
      };
    });
  $("mdPaidOk").onclick = function () {
    var d = $("mdPaidDate").value;
    if (!C.isIsoDate(d)) {
      toast("⚠️ 入金日を入れてください");
      return;
    }
    var rcBox = $("mdPaidRc");
    var giveRc = !!(rcBox && rcBox.checked);
    var ids = {};
    target.forEach(function (s) {
      ids[s.id] = 1;
    });
    for (var i = 0; i < SALES.length; i++) {
      if (ids[SALES[i].id]) {
        var patch = {
          paidDate: d,
          paidCash: paidHow === "cash",
          updatedAt: new Date().toISOString(),
        };
        // 「あとで渡す」だったものは、渡したなら発行済み（発行日＝入金日）にする
        if (giveRc && C.isLater(SALES[i])) {
          patch.receipt = "issued";
          patch.receiptDate = d;
        }
        SALES[i] = Object.assign({}, SALES[i], patch);
      }
    }
    saveSales();
    closeModal();
    renderAll();
    toast("✅ 入金を記録しました");
  };
}

// 日別はA4 1枚に収めるため2列組みにする（1ヶ月31日でも1枚に入る）
function dayColsHtml(days) {
  function tblOf(list) {
    return (
      '<table class="sm-tbl"><thead><tr><th class="l">日</th><th class="r">組</th>' +
      '<th class="r">人</th><th class="r">売上</th></tr></thead><tbody>' +
      (list.length
        ? list
            .map(function (d) {
              return (
                '<tr><td class="l">' +
                esc(C.mdShort(d.date)) +
                "（" +
                esc(C.weekday(d.date)) +
                '）</td><td class="r">' +
                d.count +
                '</td><td class="r">' +
                d.people +
                '</td><td class="r">' +
                C.comma(d.amount) +
                "</td></tr>"
              );
            })
            .join("")
        : '<tr><td class="l" colspan="4">なし</td></tr>') +
      "</tbody></table>"
    );
  }
  var half = Math.ceil(days.length / 2);
  var left = days.slice(0, half);
  var right = days.slice(half);
  return (
    '<div class="sm-blk"><div class="sm-h">日別</div><div class="sm-2col">' +
    "<div>" +
    tblOf(left) +
    "</div><div>" +
    (right.length ? tblOf(right) : "") +
    "</div></div></div>"
  );
}
