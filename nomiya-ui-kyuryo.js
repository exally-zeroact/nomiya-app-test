/* nomiya-ui-kyuryo.js — 給料(キャスト・スタッフ)
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
         給料（キャスト・スタッフ）
         ─ 打つのは「誰が・何時から何時まで・指名何本・同伴何回」だけ。
           いくら払うかは決め方（スタッフ台帳）から自動で出す。
         =================================================================== */
function staffById(id) {
  for (var i = 0; i < STAFF.length; i++) {
    if (STAFF[i].id === id) return STAFF[i];
  }
  return null;
}
function worksOf(ymd) {
  return WORKS.filter(function (w) {
    return !w.deletedAt && w.ymd === ymd;
  });
}
// 黄色い注意をどう出すか。店が実際に付けている/引いているなら、その注意は出さない。
// 渡した時刻。日付は「画面で見ている日」に合わせる。
// （締めの出金もその日に入るので、ここがズレると記録と現金が食い違う）
function paidStamp(ymd) {
  var now = new Date().toISOString();
  return C.isIsoDate(ymd) ? ymd + now.slice(10) : now;
}
function payWarnOpt(ymd) {
  return {
    minWage: SETTINGS.minWage,
    nightPaid: !!SETTINGS.nightPay,
    withholding: !!SETTINGS.gensen,
    ymd: ymd || UI.payYmd,
  };
}
function payDayOf(w) {
  var st = staffById(w.staffId);
  if (!st) return null;
  return C.payDay(st, w, {
    sales: C.salesByStaff(SALES, w.ymd, st.name, SETTINGS),
    crew: C.crewByStaff(SALES, w.ymd, st.name),
    settings: SETTINGS,
  });
}

function renderPayPeriod() {
  var el = $("periodPay");
  el.innerHTML =
    '<button class="period-arrow" type="button" data-pmv="-1">◀</button>' +
    '<span class="period-lb">' +
    esc(C.jpDate(UI.payYmd)) +
    "（" +
    esc(C.weekday(UI.payYmd)) +
    "）</span>" +
    '<button class="period-arrow" type="button" data-pmv="1">▶</button>';
  el.querySelectorAll("[data-pmv]").forEach(function (b) {
    b.onclick = function () {
      var d = new Date(
        +UI.payYmd.slice(0, 4),
        +UI.payYmd.slice(5, 7) - 1,
        +UI.payYmd.slice(8, 10) + +b.getAttribute("data-pmv")
      );
      UI.payYmd = C.toIso(d);
      renderPay();
    };
  });
}

function renderPay() {
  if (!UI.payYmd) UI.payYmd = todayIso();
  renderPayPeriod();
  // その日の出勤
  var rows = worksOf(UI.payYmd);
  $("payDayList").innerHTML = rows.length
    ? rows
        .map(function (w) {
          var st = staffById(w.staffId);
          var d = payDayOf(w);
          if (!st || !d) return "";
          var warn = C.payWarnings(st, w, d, payWarnOpt(w.ymd));
          return (
            '<div class="li" data-work="' +
            esc(w.id) +
            '"><div class="li-main"><div class="li-nm">' +
            esc(st.name) +
            (d.paidAt ? '<span class="li-tag">渡した</span>' : "") +
            '</div><div class="li-sub">' +
            (w.inAt ? esc(w.inAt) + "〜" + esc(w.outAt || "") : "時間なし") +
            (d.minutes ? "（" + (d.minutes / 60).toFixed(1) + "h）" : "") +
            backLabel(d) +
            // 前借りが残っている人は、その場で残高が見えるようにする
            (function () {
              var bal = C.lendBalance(st, WORKS, UI.payYmd);
              return bal ? "　前借り残 " + C.yen(bal) : "";
            })() +
            warn
              .map(function (t) {
                return '<div class="li-warn">⚠️ ' + esc(t) + "</div>";
              })
              .join("") +
            '</div></div><div class="li-amt">' +
            C.yen(d.net) +
            "</div></div>"
          );
        })
        .join("")
    : '<div class="empty">まだ入っていません。「＋ 出勤を入れる」から。</div>';
  $("payDayList")
    .querySelectorAll("[data-work]")
    .forEach(function (el) {
      el.onclick = function () {
        openWork(el.getAttribute("data-work"));
      };
    });

  // この日に渡す人（人ごとの締め方から数える）
  var plan = C.payPlan(STAFF, WORKS, SALES, UI.payYmd, { settings: SETTINGS });
  $("payDue").innerHTML = plan.length
    ? plan
        .map(function (x) {
          return (
            '<div class="li"><div class="li-main"><div class="li-nm">' +
            esc(x.staff.name) +
            (x.unpaid ? "" : '<span class="li-tag">渡した</span>') +
            '</div><div class="li-sub">' +
            C.mdShort(x.period.from) +
            "〜" +
            C.mdShort(x.period.to) +
            " 締め分　" +
            x.days +
            "日" +
            (x.paid ? "　渡し済み " + C.yen(x.paid) : "") +
            '</div></div><div class="li-amt">' +
            C.yen(x.unpaid) +
            "</div>" +
            '<button class="btn btn-ghost btn-sm" type="button" data-slip="' +
            esc(x.staff.id) +
            '" data-from="' +
            esc(x.period.from) +
            '" data-to="' +
            esc(x.period.to) +
            '" data-pay="' +
            esc(x.period.payYmd) +
            '" style="flex:0 0 auto">明細</button>' +
            (x.unpaid
              ? '<button class="btn btn-ghost btn-sm" type="button" data-due="' +
                esc(x.staff.id) +
                '" data-from="' +
                esc(x.period.from) +
                '" data-to="' +
                esc(x.period.to) +
                '" style="flex:0 0 auto">渡した</button>'
              : "") +
            "</div>"
          );
        })
        .join("")
    : '<div class="empty">この日に渡す人はいません。</div>';
  $("payDue")
    .querySelectorAll("[data-due]")
    .forEach(function (b) {
      b.onclick = function () {
        var sid = b.getAttribute("data-due");
        var from = b.getAttribute("data-from");
        var to = b.getAttribute("data-to");
        var st = staffById(sid);
        // ★締めた日はレジの出金を増やせない（締めの鍵を破らない）
        if (C.fromRegister(st) && closeInput(UI.payYmd).closedAt) {
          toast("⚠️ " + C.jpDate(UI.payYmd) + "は締めてあります。締め直してから渡してください");
          return;
        }
        // 渡した額をその場で固める（あとで決め方を直しても、記録は動かさない）
        var amounts = {};
        var total = 0;
        WORKS.forEach(function (w) {
          if (w.deletedAt || w.staffId !== sid || w.paidAt) return;
          if (w.ymd < from || w.ymd > to) return;
          var d = payDayOf(w);
          if (!d) return;
          amounts[w.id] = d.net;
          total += d.net;
        });
        WORKS = C.markPaidRange(WORKS, sid, from, to, paidStamp(UI.payYmd), amounts);
        saveWorks();
        // ★金庫から出すかどうかは、人ごとの「渡し方」で店が決める。
        //   レジから＝その日の締めの出金に入れる（金庫の現金が減る）。
        //   手元の現金・振込＝入れない。
        if (C.fromRegister(st) && total > 0) {
          addPayoutToClose(
            UI.payYmd,
            st.name,
            total,
            "range_" + sid + "_" + UI.payYmd,
            C.mdShort(from) + "〜" + C.mdShort(to) + " 締め分"
          );
        }
        renderAll();
        toast("💰 " + (st ? st.name : "") + " に " + C.yen(total) + " を渡しました");
      };
    });
  $("payDue")
    .querySelectorAll("[data-slip]")
    .forEach(function (b) {
      b.onclick = function () {
        openCastSlip(
          b.getAttribute("data-slip"),
          b.getAttribute("data-from"),
          b.getAttribute("data-to"),
          b.getAttribute("data-pay")
        );
      };
    });

  // 月のまとめ
  var ym = C.ymOf(UI.payYmd);
  var r = C.rangeOfMonth(ym);
  var alive = C.aliveStaff(STAFF);
  var sums = alive
    .map(function (st) {
      return {
        st: st,
        t: C.paySummary(st, WORKS, SALES, r.from, r.to, { settings: SETTINGS }),
      };
    })
    .filter(function (x) {
      return x.t.days > 0;
    });
  $("payMonth").innerHTML = sums.length
    ? '<div class="hint" style="margin-bottom:8px">' +
      esc(C.jpMonth(ym)) +
      "分</div>" +
      // ★「まだ渡していない分」を出さないと、日払いで渡した分をもう一度払ってしまう
      //   スマホの幅では見出しがぶつかるので短くする（意味は下のひとことで補う）
      '<table class="sum-tbl"><thead><tr><th>名前</th><th>日数</th><th>差引</th>' +
      "<th>渡した</th><th>まだ</th><th>前借り</th></tr></thead><tbody>" +
      sums
        .map(function (x) {
          var bal = C.lendBalance(x.st, WORKS, r.to);
          return (
            "<tr><td>" +
            esc(x.st.name) +
            "</td><td>" +
            x.t.days +
            "</td><td>" +
            C.comma(x.t.net) +
            "</td><td>" +
            (x.t.paidNet ? "−" + C.comma(x.t.paidNet) : "0") +
            "</td><td><b>" +
            C.comma(x.t.unpaidNet) +
            "</b></td><td>" +
            (bal ? C.comma(bal) : "0") +
            "</td></tr>"
          );
        })
        .join("") +
      "</tbody></table>" +
      '<div class="hint" style="margin-top:6px">「まだ」＝これから渡す分。「渡した」は日払いなどで渡し済みの分。</div>'
    : '<div class="empty">この月はまだ出勤がありません。</div>';

  // 渡した記録（この月に渡したぶん・新しい順）
  var log = C.payoutLog(STAFF, WORKS, SALES, {
    from: r.from,
    to: r.to,
    settings: SETTINGS,
  });
  var logTotal = log.reduce(function (a, x) {
    return a + x.amount;
  }, 0);
  $("payLog").innerHTML = log.length
    ? '<div class="hint" style="margin-bottom:8px">' +
      esc(C.jpMonth(ym)) +
      "に渡した分　" +
      C.yen(logTotal) +
      "</div>" +
      log
        .map(function (x) {
          return (
            '<div class="li"><div class="li-main"><div class="li-nm">' +
            esc(C.mdShort(x.ymd)) +
            "（" +
            esc(C.weekday(x.ymd)) +
            "）　" +
            esc(x.name) +
            '</div><div class="li-sub">' +
            esc(C.mdShort(x.from)) +
            "〜" +
            esc(C.mdShort(x.to)) +
            " 締め分　" +
            x.days +
            "日　" +
            esc(C.payFromLabel(x.payFrom)) +
            '</div></div><div class="li-amt">' +
            C.yen(x.amount) +
            '</div><button class="btn btn-ghost btn-sm" type="button" data-undopay="' +
            esc(x.staffId) +
            '" data-undoymd="' +
            esc(x.ymd) +
            '" style="flex:0 0 auto">取り消す</button>' +
            "</div>"
          );
        })
        .join("")
    : '<div class="empty">この月に渡した分はまだありません。</div>';
  // 押し間違いを戻せるようにする。渡した印・固めた額・締めの出金を、まとめて外す。
  $("payLog")
    .querySelectorAll("[data-undopay]")
    .forEach(function (b) {
      b.onclick = function () {
        var sid = b.getAttribute("data-undopay");
        var ymd = b.getAttribute("data-undoymd");
        var st = staffById(sid);
        if (C.fromRegister(st) && closeInput(ymd).closedAt) {
          toast("⚠️ " + C.jpDate(ymd) + "は締めてあります。締め直してから取り消してください");
          return;
        }
        openModal(
          "渡したのを取り消す",
          '<div class="hint">' +
            esc(C.jpDate(ymd)) +
            " に " +
            esc(st ? st.name : "") +
            "へ渡した記録を取り消します。<br>渡した印と、レジから出した記録も一緒に外れます。" +
            '</div><div class="btn-right" style="margin-top:14px">' +
            '<button class="btn btn-ghost btn-danger btn-sm" id="mdUndoYes">取り消す</button></div>'
        );
        $("mdUndoYes").onclick = function () {
          var nowIso3 = new Date().toISOString();
          var r = C.unmarkPaid(WORKS, sid, ymd, nowIso3);
          WORKS = r.works;
          saveWorks();
          CLOSES = C.removePayouts(
            CLOSES,
            r.workIds
              .map(function (id) {
                return "pay_" + id;
              })
              .concat(["pay_range_" + sid + "_" + ymd]),
            nowIso3
          );
          saveCloses();
          closeModal();
          renderAll();
          toast("↩️ 取り消しました");
        };
      };
    });

  // 渡した記録の紙（渡した分がある月だけ）
  $("logBox").style.display = log.length ? "" : "none";
  $("logSheets").innerHTML = log.length ? payLogSheetHtml(ym, log, logTotal) : "";
  if (log.length) fitSheets("logScale", "logSheets");

  $("paySheets").innerHTML = paySheetHtml(ym, sums);
  fitWide("paySheets");
  fitSheets("payScale", "paySheets");
}

/* 渡した記録のA4（月ごと1枚）。誰にいつ、いくら渡したかを紙で残す。 */
function payLogSheetHtml(ym, log, total) {
  return (
    '<div class="sheet">' +
    '<div class="sh-head"><div class="sh-store">' +
    esc(SETTINGS.store || "") +
    '</div><div class="sh-title">渡 し た 記 録</div>' +
    '<div class="sh-meta"><span>' +
    esc(C.jpMonth(ym)) +
    "分</span></div></div>" +
    '<table class="sh-tbl pay-tbl"><thead><tr>' +
    "<th>渡した日</th><th>名前</th><th>対象</th><th>日数</th><th>渡し方</th><th>金額</th>" +
    "</tr></thead><tbody>" +
    log
      .map(function (x) {
        return (
          "<tr><td>" +
          esc(C.mdShort(x.ymd)) +
          "（" +
          esc(C.weekday(x.ymd)) +
          "）</td><td>" +
          esc(x.name) +
          "</td><td>" +
          esc(C.mdShort(x.from)) +
          "〜" +
          esc(C.mdShort(x.to)) +
          "</td><td>" +
          x.days +
          "</td><td>" +
          esc(C.payFromLabel(x.payFrom)) +
          '</td><td class="c-a"><b>' +
          C.comma(x.amount) +
          "</b></td></tr>"
        );
      })
      .join("") +
    "</tbody><tfoot><tr><td>合計</td><td></td><td></td><td></td><td></td>" +
    '<td class="c-a"><b>' +
    C.comma(total) +
    "</b></td></tr></tfoot></table>" +
    '<div class="sm-note">金額は渡したときの額。あとで決め方を直しても、この記録は変わりません。</div>' +
    "</div>"
  );
}

/* キャストに渡す明細（1人・1区切りで1枚）。
         「何日出て、何が付いて、何を引いて、いくら渡すか」を紙にする。 */
function castSheetHtml(st, p) {
  var t = C.paySummary(st, WORKS, SALES, p.from, p.to, { settings: SETTINGS });
  // ★この人が選んでいない項目は、列ごと出さない。
  //   （深夜を付けていない店に「深夜」の列、歩合の無い人に「歩合」の列を出さない）
  var hasNight = !!SETTINGS.nightPay;
  var hasComm = C.staffUses(st, "rate");
  var hasCut =
    C.staffUses(st, "kousei") ||
    C.staffUses(st, "fine") ||
    C.staffUses(st, "repay") ||
    !!SETTINGS.gensen;
  var dayCols = [
    { h: "基本", v: (d) => C.comma(d.base) },
    hasNight ? { h: "深夜", v: (d) => (d.nightAdd ? C.comma(d.nightAdd) : "—") } : null,
    { h: "バック", v: (d) => C.comma(d.backTotal) },
    hasComm ? { h: "歩合", v: (d) => (d.commission ? C.comma(d.commission) : "—") } : null,
    { h: "支給", v: (d) => C.comma(d.gross) },
    hasCut ? { h: "控除", v: (d) => (d.deduct ? C.comma(d.deduct) : "—") } : null,
    { h: "差引", b: 1, v: (d) => C.comma(d.net) },
  ].filter(Boolean);
  var rows = t.rows
    .map(function (w) {
      var d = payDayOf(w);
      if (!d) return "";
      return (
        "<tr><td>" +
        esc(C.mdShort(w.ymd)) +
        "（" +
        esc(C.weekday(w.ymd)) +
        "）</td><td>" +
        (d.minutes ? (d.minutes / 60).toFixed(1) + "h" : "—") +
        "</td>" +
        dayCols
          .map(function (c) {
            var v = c.v(d);
            return '<td class="c-a">' + (c.b ? "<b>" + v + "</b>" : v) + "</td>";
          })
          .join("") +
        "</tr>"
      );
    })
    .join("");
  // バックの内訳。合計だけだと「場内指名を打ったのに、どこにも出ない」になる。
  // 選んだ項目は0でも出す＝紙の形が毎月変わらない。
  var backRows = Object.keys(t.backAmts).map(function (key) {
    var k = C.backKinds(SETTINGS).filter(function (x) {
      return x.key === key;
    })[0];
    // 数の出し方は決め方で変わる。
    //   ％で決めている種類＝本数は打たないので、売った額を出す（0本と嘘をつかない）
    //   1日1回の種類（同伴）＝「◯回」
    //   それ以外＝「◯本」
    var isPct = C.num((st.backPct || {})[key]) > 0;
    var n = isPct
      ? C.comma(t.amounts[key] || 0) + " 円ぶん"
      : (t.counts[key] || 0) + (k && k.once ? " 回" : " 本");
    return (
      '<div class="fb-row">' +
      esc((k && k.label) || key) +
      '<span class="fb-c">' +
      esc(n) +
      '</span><span class="fb-v">' +
      C.comma(t.backAmts[key]) +
      "</span></div>"
    );
  });
  // 支給と控除の内訳。この人が選んでいる項目は 0 でも必ず行を出す
  //（去年の紙と形が変わらない＝どこを見ればいいか毎回同じ）。
  var moneyRow = function (label, v, sub) {
    return (
      '<div class="fb-row">' +
      esc(label) +
      (sub ? '<span class="fb-c">' + esc(sub) + "</span>" : "") +
      '<span class="fb-v">' +
      C.comma(v) +
      "</span></div>"
    );
  };
  var payRows = [moneyRow("基本", t.base)];
  if (SETTINGS.nightPay) payRows.push(moneyRow("深夜割増", t.nightAdd));
  payRows.push(moneyRow("バック", t.backTotal));
  if (C.staffUses(st, "rate")) payRows.push(moneyRow("歩合", t.commission));
  if (C.staffUses(st, "guarantee")) payRows.push(moneyRow("最低保証で足した分", t.guaranteeAdd));
  payRows.push(moneyRow("合計", t.gross));
  var cutRows = [];
  if (C.staffUses(st, "kousei")) cutRows.push(moneyRow("厚生費", t.kousei));
  if (C.staffUses(st, "fine")) cutRows.push(moneyRow("罰金", t.fine));
  if (C.staffUses(st, "repay")) cutRows.push(moneyRow("前借りの返済", t.repay));
  if (SETTINGS.gensen) cutRows.push(moneyRow("源泉", t.gensen));
  cutRows.push(moneyRow("合計", t.deduct));
  var bal = C.lendBalance(st, WORKS, p.to);
  return (
    '<div class="sheet">' +
    '<div class="sh-head"><div class="sh-store">' +
    esc(SETTINGS.store || "") +
    '</div><div class="sh-title">給 与 明 細</div>' +
    '<div class="sh-meta"><span>' +
    esc(st.name) +
    " 様</span><span>" +
    esc(C.jpDate(p.from)) +
    " 〜 " +
    esc(C.jpDate(p.to)) +
    " 締め</span><span>お渡し " +
    esc(C.jpDate(p.payYmd)) +
    "</span></div></div>" +
    '<div class="wide"><table class="sh-tbl pay-tbl">' +
    colGroup([13, 9], dayCols.length) +
    "<thead><tr><th>日付</th><th>時間</th>" +
    dayCols
      .map(function (c) {
        return "<th>" + esc(c.h) + "</th>";
      })
      .join("") +
    "</tr></thead><tbody>" +
    (rows ||
      '<tr><td colspan="' + (2 + dayCols.length) + '">この期間の出勤はありません</td></tr>') +
    "</tbody><tfoot><tr><td>合計</td><td>" +
    (t.minutes / 60).toFixed(1) +
    "h</td>" +
    dayCols
      .map(function (c) {
        return '<td class="c-a"><b>' + c.v(t) + "</b></td>";
      })
      .join("") +
    "</tr></tfoot></table></div>" +
    '<div class="pay-sub">お渡しする額　' +
    C.yen(t.unpaidNet) +
    (t.paidNet ? "　（渡し済み " + C.yen(t.paidNet) + "）" : "") +
    "</div>" +
    // 内訳は横に3つ並べる（縦に積むとA4に入らない）
    '<div class="sh-boxes">' +
    '<div class="fb"><div class="fb-h">バックの内訳</div>' +
    (backRows.join("") || '<div class="fb-row">—</div>') +
    '<div class="fb-row"><b>合計</b><span class="fb-v"><b>' +
    C.comma(t.backTotal) +
    "</b></span></div></div>" +
    '<div class="fb"><div class="fb-h">支給の内訳</div>' +
    payRows.join("") +
    "</div>" +
    // 何も引かない人には「控除の内訳」の枠ごと出さない
    (hasCut
      ? '<div class="fb"><div class="fb-h">控除の内訳</div>' + cutRows.join("") + "</div>"
      : "") +
    "</div>" +
    (C.staffUses(st, "lend")
      ? '<div class="sm-note">この期間の前借り　' +
        C.yen(t.lend) +
        "　／　前借りの残り　" +
        C.yen(bal) +
        "（控除ではありません）</div>"
      : "") +
    "</div>"
  );
}
function openCastSlip(staffId, from, to, payYmd) {
  var st = staffById(staffId);
  if (!st) return;
  $("castLabel").textContent = st.name + " に渡す明細";
  $("castSheets").innerHTML = castSheetHtml(st, { from: from, to: to, payYmd: payYmd });
  $("castBox").style.display = "";
  // 幅は「画面に出してから」測る。隠れている間は幅が0で、配り直しができない。
  fitWide("castSheets");
  fitSheets("castScale", "castSheets");
  $("castBox").scrollIntoView({ block: "start" });
}

/* ===== 設定のマスタ（スタッフ・商品・バックの種類） =====
         直す場所は設定ひとつだけ。押すボタンは入力の画面に置いたまま。 */
function renderMasters() {
  var alive = C.aliveStaff(STAFF);
  $("staffList").innerHTML = alive.length
    ? alive
        .map(function (st, i) {
          return (
            '<div class="li"><div class="li-main" data-staff="' +
            esc(st.id) +
            '"><div class="li-nm">' +
            esc(st.name) +
            (st.role ? "　" + esc(st.role) : "") +
            '</div><div class="li-sub">' +
            esc(staffRule(st)) +
            '</div></div><div class="ord">' +
            '<button class="ord-b" type="button" title="上へ" data-stup="' +
            esc(st.id) +
            '"' +
            (i === 0 ? " disabled" : "") +
            ">↑</button>" +
            '<button class="ord-b" type="button" title="下へ" data-stdown="' +
            esc(st.id) +
            '"' +
            (i === alive.length - 1 ? " disabled" : "") +
            ">↓</button></div>" +
            '<button class="btn btn-ghost btn-danger btn-sm" type="button" data-stdel="' +
            esc(st.id) +
            '" style="flex:0 0 auto">外す</button></div>'
          );
        })
        .join("")
    : '<div class="empty">まだいません。「＋ スタッフを足す」から。</div>';
  $("staffList")
    .querySelectorAll("[data-staff]")
    .forEach(function (el) {
      el.onclick = function () {
        openStaff(el.getAttribute("data-staff"));
      };
    });
  $("staffList")
    .querySelectorAll("[data-stdel]")
    .forEach(function (b) {
      b.onclick = function (ev) {
        ev.stopPropagation();
        askRemoveStaff(b.getAttribute("data-stdel"));
      };
    });
  $("staffList")
    .querySelectorAll("[data-stup],[data-stdown]")
    .forEach(function (b) {
      b.onclick = function () {
        var up = b.getAttribute("data-stup");
        STAFF = C.moveStaff(STAFF, up || b.getAttribute("data-stdown"), up ? -1 : 1);
        saveStaff();
        renderMasters();
      };
    });

  renderKindList();

  var items = C.itemList(SETTINGS.items);
  $("itemList").innerHTML = items.length
    ? items
        .map(function (it, i) {
          return (
            '<div class="li"><div class="li-main" data-item="' +
            esc(it.id) +
            '"><div class="li-nm">' +
            esc(it.name) +
            '</div><div class="li-sub">' +
            esc(backLabelOf(it.kind)) +
            (it.pct ? "　この銘柄だけ " + it.pct + "%" : "") +
            '</div></div><div class="li-amt">' +
            C.yen(it.price) +
            '</div><div class="ord">' +
            '<button class="ord-b" type="button" title="上へ" data-up="' +
            esc(it.id) +
            '"' +
            (i === 0 ? " disabled" : "") +
            ">↑</button>" +
            '<button class="ord-b" type="button" title="下へ" data-down="' +
            esc(it.id) +
            '"' +
            (i === items.length - 1 ? " disabled" : "") +
            ">↓</button></div></div>"
          );
        })
        .join("")
    : '<div class="empty">まだありません</div>';
  $("itemList")
    .querySelectorAll("[data-item]")
    .forEach(function (el) {
      el.onclick = function () {
        openItem(el.getAttribute("data-item"));
      };
    });
  $("itemList")
    .querySelectorAll("[data-up],[data-down]")
    .forEach(function (b) {
      b.onclick = function () {
        var up = b.getAttribute("data-up");
        SETTINGS = Object.assign({}, SETTINGS, {
          items: C.moveItem(SETTINGS.items, up || b.getAttribute("data-down"), up ? -1 : 1),
        });
        saveSettings();
        renderMasters();
      };
    });

  // 請求書の宛先（会社）。請求書の画面の「宛先を登録・修正する」もここへ来る。
  var pts = C.partnerList(PARTNERS);
  $("partnerList").innerHTML = pts.length
    ? pts
        .map(function (x) {
          return (
            '<div class="li" data-pt="' +
            esc(x.name) +
            '"><div class="li-main"><div class="li-nm">' +
            esc(x.to || x.name) +
            "　" +
            esc(x.honor) +
            "</div>" +
            (x.person ? '<div class="li-sub">' + esc(x.person) + "</div>" : "") +
            '</div><button class="btn btn-ghost btn-danger btn-sm" type="button" data-ptdel="' +
            esc(x.name) +
            '" style="flex:0 0 auto">消す</button></div>'
          );
        })
        .join("")
    : '<div class="empty">まだありません。</div>';
  $("partnerList")
    .querySelectorAll("[data-pt]")
    .forEach(function (el) {
      el.onclick = function () {
        openPartner(el.getAttribute("data-pt"));
      };
    });
  $("partnerList")
    .querySelectorAll("[data-ptdel]")
    .forEach(function (b) {
      b.onclick = function (ev) {
        ev.stopPropagation();
        askDeletePartner(b.getAttribute("data-ptdel"));
      };
    });
}

/* ===== バックの種類（店が決める） =====
         画面はどこもこの2つを見る。決め打ちの5つは、何も決めていない店の初期値。 */
function BACK_KINDS() {
  return C.backKinds(SETTINGS);
}
// 「使う項目」の一覧＝店の種類（バック）＋ 決まった6つ（歩合・保証・厚生費・罰金・前借り・返済）
function PAY_ITEMS() {
  var fixed = C.PAY_ITEMS.filter(function (x) {
    return x.group !== "back";
  });
  return BACK_KINDS()
    .map(function (k) {
      return { key: k.key, label: k.label, group: "back" };
    })
    .concat(fixed);
}

/* 種類の登録・修正 */
function renderKindList() {
  var kinds = BACK_KINDS();
  $("kindList").innerHTML = kinds
    .map(function (k, i) {
      return (
        '<div class="li"><div class="li-main" data-kind="' +
        esc(k.key) +
        '"><div class="li-nm">' +
        esc(k.label) +
        '</div></div><div class="ord">' +
        '<button class="ord-b" type="button" title="上へ" data-kdup="' +
        esc(k.key) +
        '"' +
        (i === 0 ? " disabled" : "") +
        ">↑</button>" +
        '<button class="ord-b" type="button" title="下へ" data-kddown="' +
        esc(k.key) +
        '"' +
        (i === kinds.length - 1 ? " disabled" : "") +
        ">↓</button></div></div>"
      );
    })
    .join("");
  $("kindList")
    .querySelectorAll("[data-kind]")
    .forEach(function (el) {
      el.onclick = function () {
        openKind(el.getAttribute("data-kind"));
      };
    });
  $("kindList")
    .querySelectorAll("[data-kdup],[data-kddown]")
    .forEach(function (b) {
      b.onclick = function () {
        var up = b.getAttribute("data-kdup");
        SETTINGS = Object.assign({}, SETTINGS, {
          backKinds: C.moveBackKind(SETTINGS, up || b.getAttribute("data-kddown"), up ? -1 : 1),
        });
        saveSettings();
        renderAll();
      };
    });
}
function openKind(key) {
  var kinds = BACK_KINDS();
  var cur =
    kinds.filter(function (k) {
      return k.key === key;
    })[0] || null;
  openModal(
    cur ? "種類を直す" : "種類を足す",
    '<div class="frow"><span class="flabel">名前</span>' +
      '<input class="finput" id="kd_label" value="' +
      esc(cur ? cur.label : "") +
      '" placeholder="例）シャンパン"></div>' +
      '<div class="err" id="kd_err"></div>' +
      '<div style="margin-top:12px"><button class="btn btn-primary" id="kd_ok">保存する</button></div>' +
      (cur
        ? '<div class="btn-right" style="margin-top:10px">' +
          '<button class="btn btn-ghost btn-danger btn-sm" id="kd_del">この種類を消す</button></div>'
        : "")
  );
  var write = function (list) {
    SETTINGS = Object.assign({}, SETTINGS, { backKinds: list });
    saveSettings();
    closeModal();
    renderAll();
  };
  $("kd_ok").onclick = function () {
    var label = $("kd_label").value.trim();
    if (!label) {
      $("kd_err").textContent = "名前を入れてください";
      return;
    }
    var next = kinds.map(function (k) {
      return { key: k.key, label: k.label };
    });
    if (cur) {
      next = next.map(function (k) {
        return k.key === cur.key ? { key: k.key, label: label } : k;
      });
    } else {
      next.push({ key: "k" + Date.now().toString(36), label: label });
    }
    write(next);
    toast("✅ 保存しました");
  };
  if ($("kd_del")) {
    $("kd_del").onclick = function () {
      // 消しても、打ってある実績は消さない（表示から落とすだけ）
      write(
        kinds
          .filter(function (k) {
            return k.key !== cur.key;
          })
          .map(function (k) {
            return { key: k.key, label: k.label };
          })
      );
      toast("🗑 消しました（今までの実績は残ります）");
    };
  }
}

function backLabel(d) {
  var t = d.backs
    .filter(function (b) {
      return b.used && (b.count || b.sold);
    })
    .map(function (b) {
      return b.pct > 0 && b.sold ? b.label + C.comma(b.sold) : b.label + b.count;
    })
    .join("・");
  return t ? "　" + esc(t) : "";
}
function staffRule(st) {
  var t = [];
  if (st.daily) t.push("日給" + C.comma(st.daily));
  else if (st.hourly) t.push("時給" + C.comma(st.hourly));
  if (st.rate && C.staffUses(st, "rate")) t.push("歩合" + st.rate + "%");
  if (st.guarantee && C.staffUses(st, "guarantee")) t.push("保証" + C.comma(st.guarantee));
  var b = BACK_KINDS()
    .filter(function (k) {
      return C.staffUses(st, k.key) && (st.back[k.key] || C.num((st.backPct || {})[k.key]));
    })
    .map(function (k) {
      return C.num((st.backPct || {})[k.key])
        ? k.label + (st.backPct || {})[k.key] + "%"
        : k.label + C.comma(st.back[k.key]);
    })
    .join("・");
  if (b) t.push(b);
  // 締め方＝「週払い(日)」「15日締め・5日後に渡す」のように、その場で分かる形にする
  var cy = C.PAY_CYCLES.filter(function (c) {
    return c.key === st.cycle;
  })[0].label;
  if (st.cycle === "weekly") cy += "(" + C.WDAYS[st.closeWday] + ")";
  if (st.payAfter) cy += "・" + st.payAfter + "日後に渡す";
  t.push(cy);
  if (st.payFrom !== "register") t.push(C.payFromLabel(st.payFrom));
  if (st.employ === "contract") t.push("業務委託");
  return t.join(" / ");
}

function backLabelOf(kind) {
  var k = BACK_KINDS().filter(function (x) {
    return x.key === kind;
  })[0];
  return k ? k.label + "のバックに使う" : "";
}

/* よく出るボトル・シャンパンの登録 */
function openItem(id) {
  var cur =
    C.itemList(SETTINGS.items).filter(function (x) {
      return x.id === id;
    })[0] || null;
  var kind = cur ? cur.kind : "bottle";
  openModal(
    cur ? "商品を直す" : "商品を足す",
    '<div class="frow"><span class="flabel">名前</span>' +
      '<input class="finput" id="it_name" value="' +
      esc(cur ? cur.name : "") +
      '" placeholder="例）ドンペリ白"></div>' +
      '<div class="frow"><span class="flabel">値段</span>' +
      '<input class="finput" type="number" inputmode="numeric" id="it_price" value="' +
      esc(cur ? cur.price : "") +
      '" placeholder="例）50000"></div>' +
      '<div class="frow"><span class="flabel">バック率（この銘柄だけ・％）</span>' +
      '<input class="finput" type="number" inputmode="numeric" id="it_pct" value="' +
      esc(cur && cur.pct ? cur.pct : "") +
      '" placeholder="空なら、下で選んだ種類の率を使います"></div>' +
      '<div class="frow"><span class="flabel">どのバックに使う</span><div class="chips" id="it_kind">' +
      BACK_KINDS()
        .map(function (k) {
          return (
            '<button class="chip chip-sm" type="button" data-k="' +
            k.key +
            '">' +
            esc(k.label) +
            "</button>"
          );
        })
        .join("") +
      "</div></div>" +
      '<div class="err" id="it_err"></div>' +
      '<div style="margin-top:12px"><button class="btn btn-primary" id="it_ok">保存する</button></div>' +
      (cur
        ? '<div class="btn-right" style="margin-top:10px">' +
          '<button class="btn btn-ghost btn-danger btn-sm" id="it_del">この商品を消す</button></div>'
        : "")
  );
  var sync = function () {
    $("it_kind")
      .querySelectorAll("[data-k]")
      .forEach(function (b) {
        b.classList.toggle("on", b.getAttribute("data-k") === kind);
        b.onclick = function () {
          kind = b.getAttribute("data-k");
          sync();
        };
      });
  };
  sync();
  var write = function (list) {
    SETTINGS = Object.assign({}, SETTINGS, { items: list });
    saveSettings();
    closeModal();
    renderAll();
  };
  $("it_ok").onclick = function () {
    var name = $("it_name").value.trim();
    if (!name) {
      $("it_err").textContent = "名前を入れてください";
      return;
    }
    var next = C.normalizeItem({
      id: cur ? cur.id : "",
      name: name,
      price: $("it_price").value,
      pct: $("it_pct").value,
      kind: kind,
      // 新しく足した物は一番下に付ける（押すボタンの並びを勝手に変えない）
      ord: cur ? cur.ord : C.nextItemOrd(SETTINGS.items),
    });
    write(
      (SETTINGS.items || [])
        .filter(function (x) {
          return x && x.id !== next.id;
        })
        .concat([next])
    );
    toast("✅ 保存しました");
  };
  if ($("it_del")) {
    $("it_del").onclick = function () {
      write(
        (SETTINGS.items || []).filter(function (x) {
          return x && x.id !== cur.id;
        })
      );
      toast("🗑 消しました");
    };
  }
}

/* スタッフの登録・修正 */
function openStaff(id) {
  var isNew = !staffById(id);
  // 足したばかりの人は「なし」から選ぶ（店ごとに使う物が違うので、全部出しても迷うだけ）。
  // 前からいる人の use は空＝全部オンのまま。既にいる人の数字は変えない。
  var cur = staffById(id) || C.normalizeStaff({ name: "", use: C.emptyUse(C.backKinds(SETTINGS)) });
  var numRow = function (label, key, val, ph) {
    return (
      '<div class="frow" id="st_row_' +
      key +
      '"><span class="flabel">' +
      esc(label) +
      '</span><input class="finput" type="number" inputmode="numeric" id="st_' +
      key +
      '" value="' +
      (val ? esc(val) : "") +
      '" placeholder="' +
      esc(ph || "") +
      '"></div>'
    );
  };
  openModal(
    isNew ? "スタッフを足す" : "スタッフを直す",
    '<div class="frow"><span class="flabel">名前</span>' +
      '<input class="finput" id="st_name" value="' +
      esc(cur.name) +
      '" placeholder="例）あかり"></div>' +
      '<div class="frow"><span class="flabel">役目（任意）</span>' +
      '<input class="finput" id="st_role" value="' +
      esc(cur.role) +
      '" placeholder="例）キャスト／ボーイ"></div>' +
      '<div class="frow"><span class="flabel">使う項目（タップで選ぶ）</span>' +
      '<div class="chips" id="st_use">' +
      PAY_ITEMS()
        .map(function (x) {
          return (
            '<button class="chip chip-sm" type="button" data-use="' +
            x.key +
            '">' +
            esc(x.label) +
            "</button>"
          );
        })
        .join("") +
      "</div>" +
      '<span class="hint">この人に使う物だけ選びます。選ぶと、下に決める欄が出ます。外した項目は、出勤を入れるときも出ません（打ってある実績は消えません）。</span></div>' +
      numRow("時給", "hourly", cur.hourly, "例）1200") +
      numRow("日給（時給の代わり）", "daily", cur.daily, "例）10000") +
      '<div class="frow" id="st_row_backs"><span class="flabel">バックの決め方</span>' +
      '<span class="hint">1本いくら（円）か、売った額の何％か。シャンパン・ボトルは値段がバラバラなので％が楽です。</span></div>' +
      BACK_KINDS()
        .map(function (k) {
          var isPct = C.num((cur.backPct || {})[k.key]) > 0;
          return (
            '<div class="frow" id="st_row_' +
            k.key +
            '"><span class="flabel">　' +
            esc(k.label) +
            '</span><div class="f2">' +
            '<input class="finput" type="number" inputmode="numeric" id="st_b_' +
            k.key +
            '" value="' +
            esc(isPct ? cur.backPct[k.key] : cur.back[k.key] || "") +
            '" placeholder="0">' +
            '<div class="chips" id="st_u_' +
            k.key +
            '">' +
            '<button class="chip chip-sm" type="button" data-u="yen">円</button>' +
            '<button class="chip chip-sm" type="button" data-u="pct">％</button>' +
            "</div></div></div>"
          );
        })
        .join("") +
      numRow("売上の歩合（％）", "rate", cur.rate, "例）10") +
      numRow("最低保証", "guarantee", cur.guarantee, "0なら無し") +
      numRow("厚生費（1日）", "kousei", cur.kousei, "0なら無し") +
      '<div class="frow"><span class="flabel">締め方</span><div class="chips" id="st_cycle">' +
      C.PAY_CYCLES.map(function (c) {
        return (
          '<button class="chip chip-sm" type="button" data-cy="' +
          c.key +
          '">' +
          esc(c.label) +
          "</button>"
        );
      }).join("") +
      "</div></div>" +
      // 週払いのときだけ、どの曜日で締めるかを聞く
      '<div class="frow" id="st_row_wday"><span class="flabel">締める曜日</span><div class="chips" id="st_wday">' +
      C.WDAYS.map(function (w, i) {
        return (
          '<button class="chip chip-sm" type="button" data-wd="' + i + '">' + esc(w) + "</button>"
        );
      }).join("") +
      "</div></div>" +
      '<div class="frow"><span class="flabel">締めてから何日後に渡す</span>' +
      '<input class="finput" type="number" inputmode="numeric" id="st_payafter" value="' +
      (cur.payAfter ? esc(cur.payAfter) : "") +
      '" placeholder="0＝締めたその日に渡す"></div>' +
      '<div class="hint" id="st_cycle_hint" style="margin:-4px 2px 10px"></div>' +
      // 生年月日は任意。入れた人だけ、18歳未満の深夜に黄色い注意を出す。
      '<div class="frow"><span class="flabel">生年月日（任意）</span>' +
      '<input class="finput" type="date" id="st_birth" value="' +
      esc(cur.birth || "") +
      '"><span class="hint">入れておくと、18歳未満の人が22時以降になったとき注意が出ます。</span></div>' +
      '<div class="frow"><span class="flabel">渡し方</span><div class="chips" id="st_payfrom">' +
      C.PAY_FROMS.map(function (x) {
        return (
          '<button class="chip chip-sm" type="button" data-pf="' +
          x.key +
          '">' +
          esc(x.label) +
          "</button>"
        );
      }).join("") +
      '</div><span class="hint">レジからにすると、渡した分がその日の締めの出金に入ります。</span></div>' +
      '<div class="frow"><span class="flabel">立場</span><div class="chips" id="st_employ">' +
      C.EMPLOY_KINDS.map(function (c) {
        return (
          '<button class="chip chip-sm" type="button" data-em="' +
          c.key +
          '">' +
          esc(c.label) +
          "</button>"
        );
      }).join("") +
      "</div></div>" +
      '<div class="err" id="st_err"></div>' +
      '<div style="margin-top:12px"><button class="btn btn-primary" id="st_ok">保存する</button></div>' +
      (isNew
        ? ""
        : '<div class="btn-right" style="margin-top:10px">' +
          '<button class="btn btn-ghost btn-danger btn-sm" id="st_del">この人を外す</button></div>')
  );
  var cycle = cur.cycle;
  var wday = cur.closeWday;
  var employ = cur.employ;
  var payFrom = cur.payFrom;
  var use = {};
  PAY_ITEMS().forEach(function (x) {
    use[x.key] = C.staffUses(cur, x.key);
  });
  var unit = {};
  BACK_KINDS().forEach(function (k) {
    unit[k.key] = C.num((cur.backPct || {})[k.key]) > 0 ? "pct" : "yen";
  });
  var sync = function () {
    // 選んでいる項目だけ、決め方の欄を出す（使わない物は見せない）
    $("st_use")
      .querySelectorAll("[data-use]")
      .forEach(function (b) {
        var k = b.getAttribute("data-use");
        b.classList.toggle("on", !!use[k]);
        b.onclick = function () {
          use[k] = !use[k];
          sync();
        };
      });
    var anyBack = false;
    PAY_ITEMS().forEach(function (x) {
      if (x.group === "back" && use[x.key]) anyBack = true;
      var row = $("st_row_" + x.key);
      if (row) row.style.display = use[x.key] ? "" : "none";
    });
    $("st_row_backs").style.display = anyBack ? "" : "none";
    BACK_KINDS().forEach(function (k) {
      $("st_u_" + k.key)
        .querySelectorAll("[data-u]")
        .forEach(function (b) {
          b.classList.toggle("on", b.getAttribute("data-u") === unit[k.key]);
          b.onclick = function () {
            unit[k.key] = b.getAttribute("data-u");
            sync();
          };
        });
    });
    $("st_cycle")
      .querySelectorAll("[data-cy]")
      .forEach(function (b) {
        b.classList.toggle("on", b.getAttribute("data-cy") === cycle);
        b.onclick = function () {
          cycle = b.getAttribute("data-cy");
          sync();
        };
      });
    // 締める曜日は週払いのときだけ。要らない欄は出さない。
    $("st_row_wday").style.display = cycle === "weekly" ? "" : "none";
    $("st_wday")
      .querySelectorAll("[data-wd]")
      .forEach(function (b) {
        b.classList.toggle("on", Number(b.getAttribute("data-wd")) === wday);
        b.onclick = function () {
          wday = Number(b.getAttribute("data-wd"));
          sync();
        };
      });
    syncCycleHint();
    $("st_payfrom")
      .querySelectorAll("[data-pf]")
      .forEach(function (b) {
        b.classList.toggle("on", b.getAttribute("data-pf") === payFrom);
        b.onclick = function () {
          payFrom = b.getAttribute("data-pf");
          sync();
        };
      });
    $("st_employ")
      .querySelectorAll("[data-em]")
      .forEach(function (b) {
        b.classList.toggle("on", b.getAttribute("data-em") === employ);
        b.onclick = function () {
          employ = b.getAttribute("data-em");
          sync();
        };
      });
  };
  // 「いま選んでいる決め方だと、今日ぶんはいつ渡すことになるか」をその場で出す
  var syncCycleHint = function () {
    var p = C.payPeriod(
      { cycle: cycle, closeWday: wday, payAfter: $("st_payafter").value },
      todayIso()
    );
    $("st_cycle_hint").textContent = p
      ? "今日ぶんは " +
        C.mdShort(p.from) +
        "〜" +
        C.mdShort(p.to) +
        "（" +
        C.weekday(p.to) +
        "）で締めて、" +
        C.mdShort(p.payYmd) +
        "（" +
        C.weekday(p.payYmd) +
        "）に渡します"
      : "";
  };
  $("st_payafter").oninput = syncCycleHint;
  sync();
  $("st_ok").onclick = function () {
    var name = $("st_name").value.trim();
    if (!name) {
      $("st_err").textContent = "名前を入れてください";
      return;
    }
    var back = {};
    var backPct = {};
    BACK_KINDS().forEach(function (k) {
      // 円で決めたなら単価に、％で決めたなら率に入れる（両方には入れない）
      if (unit[k.key] === "pct") backPct[k.key] = $("st_b_" + k.key).value;
      else back[k.key] = $("st_b_" + k.key).value;
    });
    var next = C.normalizeStaff({
      id: isNew ? "" : cur.id,
      name: name,
      role: $("st_role").value,
      hourly: $("st_hourly").value,
      daily: $("st_daily").value,
      back: back,
      backPct: backPct,
      rate: $("st_rate").value,
      guarantee: $("st_guarantee").value,
      kousei: $("st_kousei").value,
      use: use, // 外した項目の値は消さない（また使うときに戻せる）
      cycle: cycle,
      closeWday: wday,
      payAfter: $("st_payafter").value,
      birth: $("st_birth").value,
      payFrom: payFrom,
      employ: employ,
    });
    STAFF = STAFF.filter(function (x) {
      return x.id !== next.id;
    }).concat([next]);
    saveStaff();
    closeModal();
    renderAll();
    toast("✅ 保存しました");
  };
  if ($("st_del")) {
    $("st_del").onclick = function () {
      var nowIso2 = new Date().toISOString();
      STAFF = STAFF.map(function (x) {
        return x.id === cur.id
          ? Object.assign({}, x, { deletedAt: nowIso2, updatedAt: nowIso2 })
          : x;
      });
      saveStaff();
      closeModal();
      renderAll();
      toast("🗑 外しました（今までの実績は残ります）");
    };
  }
}

/* 出勤（1人×1日）の入力 */
function openWork(id) {
  var cur =
    WORKS.filter(function (w) {
      return w.id === id;
    })[0] || null;
  var alive = C.aliveStaff(STAFF);
  if (!alive.length) {
    toast("先にスタッフを足してください");
    return;
  }
  var sel = cur ? cur.staffId : alive[0].id;
  // wrap=false のときだけ、外側の入れ物（id付き）を自分では作らない
  var numRow = function (label, key, val, ph, wrap) {
    return (
      '<div class="frow"' +
      (wrap === false ? "" : ' id="wk_row_' + key + '"') +
      '><span class="flabel">' +
      esc(label) +
      '</span><input class="finput" type="number" inputmode="numeric" id="wk_' +
      key +
      '" value="' +
      (val ? esc(val) : "") +
      '" placeholder="' +
      esc(ph || "0") +
      '"></div>'
    );
  };
  openModal(
    cur ? "出勤を直す" : "出勤を入れる",
    '<div class="frow"><span class="flabel">だれ</span>' +
      '<select class="fselect" id="wk_staff">' +
      alive
        .map(function (st) {
          return (
            '<option value="' +
            esc(st.id) +
            '"' +
            (st.id === sel ? " selected" : "") +
            ">" +
            esc(st.name) +
            "</option>"
          );
        })
        .join("") +
      "</select></div>" +
      // 時計の輪っかを回さずに、テンキーで 2000 と打てば 20:00 になる
      '<div class="frow"><span class="flabel">出勤 〜 退勤</span><div class="f2">' +
      '<input class="finput" type="text" inputmode="numeric" id="wk_in" placeholder="20:00" value="' +
      esc(cur ? cur.inAt : "") +
      '">' +
      '<input class="finput" type="text" inputmode="numeric" id="wk_out" placeholder="1:00" value="' +
      esc(cur ? cur.outAt : "") +
      '"></div><span class="hint">2000 と打てば 20:00 になります。</span></div>' +
      BACK_KINDS()
        .map(function (k) {
          return (
            // 銘柄のボタン＝押すだけ。本数も金額も自動で積まれる
            '<div id="wk_row_p_' +
            k.key +
            '"><div class="frow"><span class="flabel">' +
            esc(k.label) +
            '　<span style="color:#6b7690;font-weight:400">出たら押す</span></span>' +
            '<div class="chips" id="wk_items_' +
            k.key +
            '"></div>' +
            '<div id="wk_picked_' +
            k.key +
            '" class="picked"></div></div></div>' +
            numRow(k.label + "（本数）", "c_" + k.key, cur ? cur.count[k.key] : 0) +
            // 1日に1回しかない物（同伴）は、本数を聞かずに あり／なし で入れる
            '<div class="frow" id="wk_row_o_' +
            k.key +
            '"><span class="flabel">' +
            esc(k.label) +
            '</span><div class="chips" id="wk_once_' +
            k.key +
            '">' +
            '<button class="chip chip-sm" type="button" data-once="1">あり</button>' +
            '<button class="chip chip-sm" type="button" data-once="0">なし</button>' +
            "</div></div>" +
            '<div id="wk_row_a_' +
            k.key +
            '">' +
            numRow(
              k.label + "（登録していない物の金額）",
              "a_" + k.key,
              cur ? (cur.amount || {})[k.key] : 0,
              "0",
              false
            ) +
            "</div>"
          );
        })
        .join("") +
      numRow(
        "自分の客の売上（入れると歩合に使う）",
        "sales",
        cur ? cur.sales : 0,
        "自動で拾います"
      ) +
      numRow("罰金", "fine", cur ? cur.fine : 0) +
      numRow("前借り", "lend", cur ? cur.lend : 0) +
      numRow("返済", "repay", cur ? cur.repay : 0) +
      '<div class="frow"><span class="flabel">メモ（任意）</span>' +
      '<input class="finput" id="wk_memo" value="' +
      esc(cur ? cur.memo : "") +
      '"></div>' +
      '<div id="wk_calc" class="hint" style="margin-top:6px"></div>' +
      '<div style="margin-top:12px"><button class="btn btn-primary" id="wk_ok">保存する</button></div>' +
      (cur && !cur.paidAt
        ? '<div style="margin-top:8px"><button class="btn btn-ghost" id="wk_pay">この日ぶんを日払いで渡した</button></div>'
        : "") +
      (cur
        ? '<div class="btn-right" style="margin-top:10px">' +
          '<button class="btn btn-ghost btn-danger btn-sm" id="wk_del">この出勤を消す</button></div>'
        : "")
  );
  // 打ち終わった瞬間に 20:00 の形へ直す（保存するまで気付かない、を無くす）
  ["wk_in", "wk_out"].forEach(function (id) {
    $(id).onblur = function () {
      var t = C.normalizeTime($(id).value);
      if (t) $(id).value = t;
    };
  });
  // 押した銘柄 { 商品id: 本数 }。ボタンを押すたびに増える。
  var picks = Object.assign({}, (cur && cur.picks) || {});
  // 選んだ人の「使う項目」だけを出す。銘柄は押すだけ、手打ちは補助。
  var syncKinds = function () {
    var st = staffById($("wk_staff").value);
    // 使わない項目（罰金・前借り・返済・歩合のもとになる売上）は欄ごと出さない
    $("wk_row_sales").style.display = C.staffUses(st, "rate") ? "" : "none";
    ["fine", "lend", "repay"].forEach(function (k) {
      $("wk_row_" + k).style.display = C.staffUses(st, k) ? "" : "none";
    });
    BACK_KINDS().forEach(function (k) {
      var on = C.staffUses(st, k.key);
      var isPct = !!(st && C.num((st.backPct || {})[k.key]) > 0);
      var list = C.itemList(SETTINGS.items, k.key);
      // 銘柄のボタンは、その種類に登録があるときだけ出す
      $("wk_row_p_" + k.key).style.display = on && list.length ? "" : "none";
      // 本数は「円で決めていて、押すボタンが無い種類」だけ手で打つ
      // （ボタンがあるのに本数の欄も出すと、どっちで入れるのか分からなくなる）
      var typeCount = on && !isPct && !list.length;
      // 同伴のような「1日1回」の物は、本数の代わりに あり／なし を出す。
      // 数字は今までどおり wk_c_ に入れる＝保存も計算も1本のまま。
      $("wk_row_c_" + k.key).style.display = typeCount && !k.once ? "" : "none";
      $("wk_row_o_" + k.key).style.display = typeCount && k.once ? "" : "none";
      if (typeCount && k.once) {
        var cn = C.num($("wk_c_" + k.key).value) > 0 ? "1" : "0";
        $("wk_once_" + k.key)
          .querySelectorAll("[data-once]")
          .forEach(function (b) {
            b.classList.toggle("on", b.getAttribute("data-once") === cn);
            b.onclick = function () {
              $("wk_c_" + k.key).value = b.getAttribute("data-once");
              syncKinds();
            };
          });
      }
      // 登録していない物の金額は、％の種類だけ
      $("wk_row_a_" + k.key).style.display = on && isPct ? "" : "none";
      if (!on || !list.length) return;
      $("wk_items_" + k.key).innerHTML = list
        .map(function (it, i) {
          return (
            '<button class="chip chip-sm" type="button" data-i="' +
            i +
            '">' +
            esc(it.name) +
            " " +
            C.comma(it.price) +
            (it.pct ? " (" + it.pct + "%)" : "") +
            "</button>"
          );
        })
        .join("");
      $("wk_items_" + k.key)
        .querySelectorAll("[data-i]")
        .forEach(function (b) {
          b.onclick = function () {
            var it = list[Number(b.getAttribute("data-i"))];
            picks[it.id] = (picks[it.id] || 0) + 1;
            syncPicked();
            preview();
          };
        });
    });
    syncPicked();
  };
  // 押した中身を出す（何をいくつ押したか・合計いくらか。押し間違いは1つずつ戻せる）
  var syncPicked = function () {
    BACK_KINDS().forEach(function (k) {
      var box = $("wk_picked_" + k.key);
      if (!box) return;
      var list = C.itemList(SETTINGS.items, k.key).filter(function (it) {
        return picks[it.id];
      });
      if (!list.length) {
        box.innerHTML = "";
        return;
      }
      var sum = list.reduce(function (a, it) {
        return a + it.price * picks[it.id];
      }, 0);
      box.innerHTML =
        '<div class="picked-hd">入れた分　合計 ' +
        C.yen(sum) +
        "</div>" +
        list
          .map(function (it) {
            return (
              '<span class="picked-it">' +
              esc(it.name) +
              " ×" +
              picks[it.id] +
              '<b data-undo="1" data-id="' +
              esc(it.id) +
              '" title="1つ戻す">✕</b></span>'
            );
          })
          .join("");
      box.querySelectorAll("[data-undo]").forEach(function (b) {
        b.onclick = function () {
          var id = b.getAttribute("data-id");
          picks[id] = (picks[id] || 0) - 1;
          if (picks[id] <= 0) delete picks[id];
          syncPicked();
          preview();
        };
      });
    });
  };
  var build = function () {
    var back = {};
    var amt = {};
    BACK_KINDS().forEach(function (k) {
      back[k.key] = $("wk_c_" + k.key).value;
      amt[k.key] = $("wk_a_" + k.key).value;
    });
    return C.normalizeWork({
      id: cur ? cur.id : "",
      ymd: UI.payYmd,
      staffId: $("wk_staff").value,
      inAt: C.normalizeTime($("wk_in").value),
      outAt: C.normalizeTime($("wk_out").value),
      count: back,
      amount: amt,
      picks: picks,
      sales: $("wk_sales").value,
      fine: $("wk_fine").value,
      lend: $("wk_lend").value,
      repay: $("wk_repay").value,
      paidAt: cur ? cur.paidAt : null,
      // 渡した額は固めたまま持ち回る（メモを直しただけで記録が変わらないように）
      paidAmount: cur ? cur.paidAmount : 0,
      memo: $("wk_memo").value,
    });
  };
  var preview = function () {
    var w = build();
    var st = staffById(w.staffId);
    if (!st) return;
    var d = C.payDay(st, w, {
      sales: C.salesByStaff(SALES, UI.payYmd, st.name, SETTINGS),
      crew: C.crewByStaff(SALES, UI.payYmd, st.name),
      settings: SETTINGS,
    });
    var pctNote = d.backs
      .filter(function (b) {
        return b.used && b.pct > 0 && b.sold;
      })
      .map(function (b) {
        return b.label + " " + C.comma(b.sold) + "の" + b.pct + "% = " + C.comma(b.amount);
      })
      .join("／");
    $("wk_calc").innerHTML =
      (pctNote ? esc(pctNote) + "<br>" : "") +
      "支給 " +
      C.yen(d.gross) +
      "（基本 " +
      C.comma(d.base) +
      " ＋ バック " +
      C.comma(d.backTotal) +
      (d.commission ? " ＋ 歩合 " + C.comma(d.commission) : "") +
      "）− 控除 " +
      C.comma(d.deduct) +
      " ＝ <b>" +
      C.yen(d.net) +
      "</b>" +
      (d.guaranteeUsed ? "　※最低保証を使いました" : "");
  };
  syncKinds();
  preview();
  ["wk_staff", "wk_in", "wk_out", "wk_sales", "wk_fine", "wk_lend", "wk_repay"]
    .concat(
      BACK_KINDS().map(function (k) {
        return "wk_c_" + k.key;
      })
    )
    .concat(
      BACK_KINDS().map(function (k) {
        return "wk_a_" + k.key;
      })
    )
    .forEach(function (id2) {
      $(id2).oninput = preview;
      $(id2).onchange = preview;
    });
  $("wk_staff").onchange = function () {
    syncKinds();
    preview();
  };
  var save = function (patch) {
    var next = Object.assign(build(), patch || {});
    WORKS = WORKS.filter(function (x) {
      return x.id !== next.id;
    }).concat([next]);
    saveWorks();
    return next;
  };
  $("wk_ok").onclick = function () {
    save();
    closeModal();
    renderPay();
    toast("✅ 保存しました");
  };
  if ($("wk_pay")) {
    $("wk_pay").onclick = function () {
      // ★締めた日はレジの出金を増やせない（締めの鍵を破らない）
      var stNow = staffById($("wk_staff").value);
      if (C.fromRegister(stNow) && closeInput(UI.payYmd).closedAt) {
        toast("⚠️ " + C.jpDate(UI.payYmd) + "は締めてあります。締め直してから渡してください");
        return;
      }
      var w0 = save({ paidAt: paidStamp(UI.payYmd) });
      var st = staffById(w0.staffId);
      var d = C.payDay(st, w0, {
        sales: C.salesByStaff(SALES, UI.payYmd, st.name, SETTINGS),
        crew: C.crewByStaff(SALES, UI.payYmd, st.name),
        settings: SETTINGS,
      });
      // 渡した額をその場で固める（あとで決め方を直しても、記録は動かさない）
      WORKS = WORKS.map(function (x) {
        return x.id === w0.id ? Object.assign({}, x, { paidAmount: d.net }) : x;
      });
      saveWorks();
      // 現金で渡すなら、その日の締めの出金にも入れる（二度打ちしない）
      if (C.fromRegister(st) && d.net > 0) addPayoutToClose(UI.payYmd, st.name, d.net, w0.id);
      closeModal();
      renderPay();
      toast("💰 " + st.name + " に " + C.yen(d.net) + " を渡しました");
    };
  }
  if ($("wk_del")) {
    $("wk_del").onclick = function () {
      var nowIso2 = new Date().toISOString();
      WORKS = WORKS.map(function (x) {
        return x.id === cur.id
          ? Object.assign({}, x, { deletedAt: nowIso2, updatedAt: nowIso2 })
          : x;
      });
      saveWorks();
      // ★この出勤で渡した分が締めの出金に入っていたら、それも一緒に外す。
      //   残すと、金庫から出していないのに出したことになってレジが合わない。
      CLOSES = C.removePayouts(CLOSES, ["pay_" + cur.id], nowIso2);
      saveCloses();
      closeModal();
      renderAll();
      toast("🗑 消しました");
    };
  }
}

// 日払いを渡したら、その日のレジ締めの出金に1行入れる（同じ人の同じ日は入れ替える）
function addPayoutToClose(ymd, name, amount, wid, memo) {
  var cur = CLOSES[ymd] || C.normalizeClose({ ymd: ymd, opening: C.carryOver(CLOSES, ymd) || 0 });
  var outs = (cur.outs || []).filter(function (o) {
    return o.id !== "pay_" + wid;
  });
  outs.push(
    C.normalizeOut({
      id: "pay_" + wid,
      kind: "pay",
      amount: amount,
      memo: memo || "日払い",
      staff: name,
    })
  );
  CLOSES[ymd] = C.normalizeClose(Object.assign({}, cur, { outs: outs }));
  saveCloses();
}

/* 給料のA4（月のまとめ） */
/* 給与一覧（A4・その月の全員）
         ★列は「店で選んでいる項目」を全部出す。誰も選んでいない項目だけ出さない。
           場内指名を打ったのに列が無い、といった取りこぼしを作らないため。
         ★横に長くなっても fitWide が紙の幅まで縮めるので、数字は切れない。 */
function paySheetHtml(ym, sums) {
  var kinds = C.usedKinds(STAFF, SETTINGS);
  // その項目を1人でも使っているか（誰も使わない列は紙を汚すだけなので出さない）
  var anyUse = function (key) {
    return C.aliveStaff(STAFF).some(function (st) {
      return C.staffUses(st, key);
    });
  };
  var yen = function (v) {
    return C.comma(v);
  };
  // 列の決まり。{ h:見出し, cls:並べ方, v:1人ぶん, t:合計, b:太字 }
  var cols = [
    { h: "日数", cls: "c-p", v: (t) => t.days, t: (o) => o.days },
    {
      h: "時間",
      cls: "c-p",
      v: (t) => (t.minutes / 60).toFixed(1),
      t: (o) => (o.minutes / 60).toFixed(1),
    },
  ];
  kinds.forEach(function (k) {
    cols.push({
      h: k.label,
      cls: "c-p",
      kind: k.key,
      // ％で決めている人は本数を打たない。その人のマスは「売った額」を出す。
      //（0本と出すと、売っていないように見えて嘘になる）
      v: function (t, st) {
        return C.num((st.backPct || {})[k.key]) > 0
          ? "¥" + C.comma(t.amounts[k.key] || 0)
          : t.counts[k.key] || 0;
      },
      t: function (o) {
        return o.counts[k.key] || 0;
      },
    });
  });
  cols.push({ h: "基本", cls: "c-a", v: (t) => yen(t.base), t: (o) => yen(o.base) });
  if (SETTINGS.nightPay)
    cols.push({
      h: "深夜",
      cls: "c-a",
      v: (t) => yen(t.nightAdd),
      t: (o) => yen(o.nightAdd),
    });
  cols.push({
    h: "バック",
    cls: "c-a",
    v: (t) => yen(t.backTotal),
    t: (o) => yen(o.backTotal),
  });
  if (anyUse("rate"))
    cols.push({
      h: "歩合",
      cls: "c-a",
      v: (t) => yen(t.commission),
      t: (o) => yen(o.commission),
    });
  if (anyUse("guarantee"))
    cols.push({
      h: "保証",
      cls: "c-a",
      v: (t) => yen(t.guaranteeAdd),
      t: (o) => yen(o.guaranteeAdd),
    });
  cols.push({ h: "支給", cls: "c-a", b: 1, v: (t) => yen(t.gross), t: (o) => yen(o.gross) });
  if (anyUse("kousei"))
    cols.push({ h: "厚生費", cls: "c-a", v: (t) => yen(t.kousei), t: (o) => yen(o.kousei) });
  if (anyUse("fine"))
    cols.push({ h: "罰金", cls: "c-a", v: (t) => yen(t.fine), t: (o) => yen(o.fine) });
  if (anyUse("repay"))
    cols.push({ h: "返済", cls: "c-a", v: (t) => yen(t.repay), t: (o) => yen(o.repay) });
  if (SETTINGS.gensen)
    cols.push({ h: "源泉", cls: "c-a", v: (t) => yen(t.gensen), t: (o) => yen(o.gensen) });
  cols.push({
    h: "控除",
    cls: "c-a",
    b: 1,
    v: (t) => yen(t.deduct),
    t: (o) => yen(o.deduct),
  });
  cols.push({ h: "差引", cls: "c-a", b: 1, v: (t) => yen(t.net), t: (o) => yen(o.net) });
  if (anyUse("lend"))
    cols.push({ h: "前借り", cls: "c-a", v: (t) => yen(t.lend), t: (o) => yen(o.lend) });
  cols.push({
    h: "渡し済み",
    cls: "c-a",
    v: (t) => (t.paidNet ? "−" + yen(t.paidNet) : "0"),
    t: (o) => (o.paidNet ? "−" + yen(o.paidNet) : "0"),
  });
  cols.push({
    h: "これから渡す",
    cls: "c-a",
    b: 1,
    v: (t) => yen(t.unpaidNet),
    t: (o) => yen(o.unpaidNet),
  });

  // 合計は、1人ぶんと同じ形の入れ物にためる（列を足しても合計を書き足さなくていい）
  var tot = {
    days: 0,
    minutes: 0,
    counts: {},
    amounts: {},
    base: 0,
    nightAdd: 0,
    backTotal: 0,
    commission: 0,
    guaranteeAdd: 0,
    gross: 0,
    kousei: 0,
    fine: 0,
    repay: 0,
    gensen: 0,
    deduct: 0,
    net: 0,
    lend: 0,
    paidNet: 0,
    unpaidNet: 0,
  };
  sums.forEach(function (x) {
    Object.keys(tot).forEach(function (k) {
      if (k === "counts" || k === "amounts") return;
      tot[k] += x.t[k] || 0;
    });
    kinds.forEach(function (k) {
      tot.counts[k.key] = (tot.counts[k.key] || 0) + (x.t.counts[k.key] || 0);
      tot.amounts[k.key] = (tot.amounts[k.key] || 0) + (x.t.amounts[k.key] || 0);
    });
  });
  var cell = function (c, val) {
    return '<td class="' + c.cls + '">' + (c.b ? "<b>" + val + "</b>" : val) + "</td>";
  };
  return (
    '<div class="sheet">' +
    '<div class="sh-head"><div class="sh-store">' +
    esc(SETTINGS.store || "") +
    '</div><div class="sh-title">給 与 一 覧</div>' +
    '<div class="sh-meta"><span>' +
    esc(C.jpMonth(ym)) +
    "分</span></div></div>" +
    '<div class="wide"><table class="sh-tbl pay-tbl">' +
    colGroup([11, 5.5, 6.5], cols.length - 2) +
    "<thead><tr><th>名前</th>" +
    cols
      .map(function (c) {
        return "<th>" + esc(c.h) + "</th>";
      })
      .join("") +
    "</tr></thead><tbody>" +
    (sums.length
      ? sums
          .map(function (x) {
            return (
              '<tr><td class="c-n">' +
              esc(x.st.name) +
              "</td>" +
              cols
                .map(function (c) {
                  return cell(c, c.v(x.t, x.st));
                })
                .join("") +
              "</tr>"
            );
          })
          .join("")
      : '<tr><td colspan="' +
        (1 + cols.length) +
        '" style="text-align:center;color:#888">この月は出勤がありません</td></tr>') +
    '</tbody><tfoot><tr><td class="c-n"><b>合計</b></td>' +
    cols
      .map(function (c) {
        return '<td class="' + c.cls + '"><b>' + c.t(tot) + "</b></td>";
      })
      .join("") +
    "</tr></tfoot></table></div>" +
    // 内訳は列で全部出しているので、下は読み方の一言だけ
    '<div class="sm-note">支給＝基本' +
    (tot.nightAdd ? "＋深夜割増" : "") +
    "＋バック＋歩合（最低保証がある人は高い方）。控除＝罰金＋厚生費＋前借りの返済" +
    (tot.gensen ? "＋源泉" : "") +
    "。</div>" +
    "</div>"
  );
}
