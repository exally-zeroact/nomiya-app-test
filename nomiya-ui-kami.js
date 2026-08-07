/* nomiya-ui-kami.js — 税理士用の紙・請求書・A4のフィット表示/印刷
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
         税理士用の紙（1ヶ月の売上まとめ）
         ─ 対象（全体 / 領収書あり / 領収書なし）を紙に必ず印字する。
           絞った紙は売上の一部なので、それが紙の上で分かるようにしておく。
         =================================================================== */
function taxRows() {
  var r = periodRange();
  return C.sortSales(C.filterSales(SALES, { from: r.from, to: r.to, receipt: UI.taxRec }));
}

function renderTax() {
  $("taxRecTabs")
    .querySelectorAll("[data-trec]")
    .forEach(function (b) {
      b.classList.toggle("on", b.getAttribute("data-trec") === UI.taxRec);
    });
  $("taxNames")
    .querySelectorAll("[data-tn]")
    .forEach(function (b) {
      b.classList.toggle("on", (b.getAttribute("data-tn") === "1") === !!SETTINGS.taxNames);
    });
  var rows = taxRows();
  var sum = C.summarize(rows);
  $("taxStrip").innerHTML =
    stripItem("組数", C.comma(sum.count), "組") +
    stripItem("のべ人数", C.comma(sum.people), "人") +
    stripItem("売上", C.yen(sum.amount));
  $("taxSheets").innerHTML = taxSheetHtml(rows);
  fitSheets("taxScale", "taxSheets");
}

// 税理士の紙の「お金まわり」。売上の区分に関わらず、期間ぜんぶを見る。
function cashBlocksHtml() {
  var r = periodRange();
  var m = C.monthlyCash(SALES, CLOSES, r.from, r.to, PAYMENTS);
  var row2 = function (l, v, cls) {
    return (
      '<tr><td class="l' +
      (cls ? " " + cls : "") +
      '">' +
      esc(l) +
      '</td><td class="r' +
      (cls ? " " + cls : "") +
      '">' +
      v +
      "</td></tr>"
    );
  };
  var expense =
    '<div class="sm-blk"><div class="sm-h">現金で使ったお金</div>' +
    '<table class="sm-tbl sm-2"><tbody>' +
    m.expense
      .map(function (x) {
        return row2(x.label + (x.count ? "（" + x.count + "件）" : ""), C.comma(x.amount));
      })
      .join("") +
    row2("合計", C.comma(m.expenseTotal), "b") +
    (m.lend.amount ? row2("前借り・貸付（経費ではありません）", C.comma(m.lend.amount)) : "") +
    "</tbody></table>" +
    (SETTINGS.taxNames && m.staffPays.length
      ? '<table class="sm-tbl sm-2 sm-sub"><tbody>' +
        m.staffPays
          .map(function (x) {
            return row2("　" + x.name + "（" + x.count + "回）", C.comma(x.amount));
          })
          .join("") +
        "</tbody></table>"
      : "") +
    "</div>";
  var uneven = m.unpaid.slice(0, 6);
  var restCount = m.unpaid.length - uneven.length;
  var kake =
    '<div class="sm-blk"><div class="sm-h">ツケ・請求書送り</div>' +
    '<table class="sm-tbl sm-2"><tbody>' +
    row2("期間の終わりの未回収", C.comma(m.unpaidTotal), "b") +
    uneven
      .map(function (x) {
        return row2("　" + x.name + "（" + x.count + "件）", C.comma(x.amount));
      })
      .join("") +
    (restCount > 0 ? row2("　ほか " + restCount + " 件", "") : "") +
    row2("この期間に回収（現金）", C.comma(m.collectedCash)) +
    row2("この期間に回収（振込・カード）", C.comma(m.collectedBank)) +
    "</tbody></table></div>";
  var cash =
    '<div class="sm-blk"><div class="sm-h">現金</div>' +
    '<table class="sm-tbl sm-2"><tbody>' +
    row2(
      "手許現金" + (m.cashOnHandYmd ? "（" + C.mdShort(m.cashOnHandYmd) + "に数えた分）" : ""),
      m.cashOnHand == null ? "—" : C.comma(m.cashOnHand)
    ) +
    row2(
      "レジの過不足（" + m.closedDays + "日ぶん）",
      m.diffTotal == null ? "—" : (m.diffTotal > 0 ? "+" : "") + C.comma(m.diffTotal)
    ) +
    "</tbody></table></div>";
  return expense + kake + cash;
}

function taxSheetHtml(rows) {
  var sum = C.summarize(rows);
  var pays = C.byPayMethod(rows);
  var recs = C.byReceipt(rows);
  var days = C.byDay(rows);
  var tx = C.taxIncluded(sum.amount, SETTINGS.rate);
  var scoped = UI.taxRec !== "all";

  return (
    '<div class="sheet">' +
    '<div class="sh-head"><div class="sh-store">' +
    esc(SETTINGS.store || "") +
    '</div><div class="sh-title">売 上 報 告 書</div>' +
    '<div class="sh-meta"><span>' +
    esc(periodLabel()) +
    // ★紙に「どう絞り込んだか」は刷らない（司さん指示）
    "</span></div></div>" +
    '<div class="sm-stats">' +
    '<div class="sm-s"><span>売上（税込）</span><b>¥' +
    C.comma(sum.amount) +
    "</b></div>" +
    '<div class="sm-s"><span>うち消費税（' +
    Math.round(tx.rate * 100) +
    "%・内税）</span><b>¥" +
    C.comma(tx.tax) +
    "</b></div>" +
    '<div class="sm-s"><span>組数</span><b>' +
    sum.count +
    "</b></div>" +
    '<div class="sm-s"><span>のべ人数</span><b>' +
    sum.people +
    "</b></div>" +
    "</div>" +
    // 支払い方法別（現金・キャッシュレス・掛の別が分かるように）
    '<div class="sm-blk"><div class="sm-h">支払い方法別</div>' +
    '<table class="sm-tbl"><thead><tr><th class="l">区分</th><th class="r">件数</th>' +
    '<th class="r">のべ人数</th><th class="r">金額（税込）</th><th class="r">割合</th></tr></thead><tbody>' +
    pays
      .map(function (r) {
        return (
          '<tr><td class="l">' +
          esc(r.label) +
          '</td><td class="r">' +
          r.count +
          '</td><td class="r">' +
          r.people +
          '</td><td class="r">' +
          C.comma(r.amount) +
          '</td><td class="r">' +
          Math.round(r.ratio * 100) +
          "%</td></tr>"
        );
      })
      .join("") +
    '<tr><td class="l"><b>合計</b></td><td class="r"><b>' +
    sum.count +
    '</b></td><td class="r"><b>' +
    sum.people +
    '</b></td><td class="r"><b>' +
    C.comma(sum.amount) +
    '</b></td><td class="r"></td></tr>' +
    "</tbody></table></div>" +
    // 全体を出すときだけ領収書あり/なしの内訳を載せる
    (scoped
      ? ""
      : '<div class="sm-blk"><div class="sm-h">領収書 あり / なし</div>' +
        '<table class="sm-tbl"><thead><tr><th class="l">区分</th><th class="r">件数</th>' +
        '<th class="r">金額（税込）</th><th class="r">割合</th></tr></thead><tbody>' +
        recs
          .map(function (r) {
            return (
              '<tr><td class="l">' +
              esc(r.label) +
              '</td><td class="r">' +
              r.count +
              '</td><td class="r">' +
              C.comma(r.amount) +
              '</td><td class="r">' +
              Math.round(r.ratio * 100) +
              "%</td></tr>"
            );
          })
          .join("") +
        "</tbody></table></div>") +
    dayColsHtml(days) +
    cashBlocksHtml() +
    '<div class="sm-note">1件＝1組のお会計。金額は税込。' +
    (C.laterReceipts(rows).count
      ? "　領収書を「あとで渡す」約束が " + C.laterReceipts(rows).count + "件（回収時に渡す分）。"
      : "") +
    "</div>" +
    "</div>"
  );
}

/* ===================================================================
         請求書
         =================================================================== */
function invoiceTargets() {
  var names = {};
  var order = [];
  C.unpaidSales(SALES).forEach(function (s) {
    if (!names[s.name]) {
      names[s.name] = 1;
      order.push(s.name);
    }
  });
  return order;
}

// 請求書タブの「見た目」（デザイン・色・書体・ロゴ位置）の状態を出す
function renderInvLook() {
  $("invTpl")
    .querySelectorAll("[data-tpl]")
    .forEach(function (b) {
      b.classList.toggle("on", b.getAttribute("data-tpl") === (SETTINGS.tpl || "card"));
    });
  $("invFont")
    .querySelectorAll("[data-font]")
    .forEach(function (b) {
      b.classList.toggle("on", b.getAttribute("data-font") === (SETTINGS.font || "mincho"));
    });
  $("invLogoPos")
    .querySelectorAll("[data-lpos]")
    .forEach(function (b) {
      b.classList.toggle("on", b.getAttribute("data-lpos") === (SETTINGS.logoPos || "top"));
    });
  var curHex = accentHex();
  var isPreset = ACCENTS.some(function (a) {
    return a.hex === curHex;
  });
  $("invAccent").innerHTML =
    '<button class="chip chip-sm" type="button" data-accent="">デザインのまま</button>' +
    ACCENTS.map(function (a) {
      return (
        '<button class="acc-sw" type="button" data-accent="' +
        a.hex +
        '" title="' +
        esc(a.label) +
        '" aria-label="' +
        esc(a.label) +
        '"><i style="background:' +
        a.hex +
        '"></i></button>'
      );
    }).join("") +
    '<label class="acc-pick' +
    (curHex && !isPreset ? " on" : "") +
    '">自分で選ぶ<input type="color" id="invAccentPick" value="' +
    (curHex || "#7d3a44") +
    '"></label>';
  $("invAccent")
    .querySelectorAll("[data-accent]")
    .forEach(function (b) {
      b.classList.toggle("on", b.getAttribute("data-accent") === curHex);
      b.onclick = function () {
        SETTINGS.accent = b.getAttribute("data-accent");
        saveSettings();
        renderInv();
      };
    });
  $("invAccentPick").oninput = function () {
    SETTINGS.accent = this.value;
    saveSettings();
    $("invSkin").textContent = invoiceSkinCss();
  };
  $("invAccentPick").onchange = function () {
    renderInv();
  };
}

// 登録した宛先の一覧。ふだんは見せない（請求書タブの「宛先を直す」で開く）
// 宛先の一覧は設定の「会社」ひとつだけ。請求書の画面からもここへ連れて行く。
function openPartnerList() {
  showSettings("partner");
}

// 宛先の登録・修正。会社名がそのまま売上の名前になる（入力では選ぶだけ）。
// 会社名を直したときは、その名前で入っている売上も一緒に直す。
function openPartner(name, onSaved) {
  var cur = PARTNERS[name] || { name: name || "", honor: "御中" };
  openModal(
    name ? "宛先を直す" : "宛先を登録する",
    '<div class="frow"><span class="flabel">会社名（請求書に出す宛名）</span>' +
      '<input class="finput" id="ptName" value="' +
      esc(cur.to || cur.name) +
      '" placeholder="例）株式会社◯◯"></div>' +
      '<div class="frow"><span class="flabel">敬称</span><div class="chips" id="ptHonor">' +
      '<button class="chip chip-sm" type="button" data-h="御中">御中</button>' +
      '<button class="chip chip-sm" type="button" data-h="様">様</button></div></div>' +
      '<div class="frow"><span class="flabel">担当者（宛名の下に出ます・任意）</span>' +
      '<input class="finput" id="ptPerson" value="' +
      esc(cur.person || "") +
      '" placeholder="例）総務部 山本様"></div>' +
      // いつまでにもらう約束か。決めなくても今までどおり使える。
      '<div class="frow"><span class="flabel">いつまでにもらう（任意）</span>' +
      '<div class="chips" id="ptTerm">' +
      C.PAY_TERMS.map(function (t) {
        return (
          '<button class="chip chip-sm" type="button" data-tk="' +
          t.key +
          '">' +
          esc(t.label) +
          "</button>"
        );
      }).join("") +
      '</div><div class="f2" id="ptTermN" style="margin-top:8px">' +
      '<input class="finput" type="number" inputmode="numeric" id="ptTermDays" value="' +
      esc(cur.term && cur.term.n ? cur.term.n : "") +
      '" placeholder="30"><span class="hint" id="ptTermUnit"></span></div>' +
      '<span class="hint">決めておくと、未回収の画面に「いつまでに入るか」と「もう過ぎている分」が出ます。決めなくても使えます。</span></div>' +
      '<div class="err" id="ptErr"></div>' +
      '<div style="margin-top:12px"><button class="btn btn-primary" id="ptOk">保存する</button></div>' +
      (name
        ? '<div class="btn-right" style="margin-top:10px">' +
          '<button class="btn btn-ghost btn-danger btn-sm" id="ptDel">この宛先を消す</button></div>'
        : "")
  );
  var honor = cur.honor === "様" ? "様" : "御中";
  var syncHonor = function () {
    $("ptHonor")
      .querySelectorAll("[data-h]")
      .forEach(function (b) {
        b.classList.toggle("on", b.getAttribute("data-h") === honor);
        b.onclick = function () {
          honor = b.getAttribute("data-h");
          syncHonor();
        };
      });
  };
  syncHonor();
  var term = C.normalizeTerm(cur.term);
  var syncTerm = function () {
    $("ptTerm")
      .querySelectorAll("[data-tk]")
      .forEach(function (b) {
        b.classList.toggle("on", b.getAttribute("data-tk") === term.kind);
        b.onclick = function () {
          term.kind = b.getAttribute("data-tk");
          syncTerm();
        };
      });
    // 日数を聞くのは「◯日後」と「翌月◯日」のときだけ
    var need = term.kind === "days" || term.kind === "nextDay";
    $("ptTermN").style.display = need ? "" : "none";
    $("ptTermUnit").textContent =
      term.kind === "days" ? "日後にもらう" : term.kind === "nextDay" ? "日にもらう" : "";
  };
  syncTerm();
  $("ptOk").onclick = function () {
    var raw = {
      name: $("ptName").value,
      honor: honor,
      person: $("ptPerson").value,
      term: { kind: term.kind, n: $("ptTermDays").value },
      lastUsedAt: cur.lastUsedAt || "",
    };
    var v = C.validatePartner(raw);
    if (!v.ok) {
      $("ptErr").textContent = v.errors.join("\n");
      return;
    }
    var pt = C.normalizePartner(raw);
    if (pt.name !== name && PARTNERS[pt.name] && !PARTNERS[pt.name].deletedAt) {
      $("ptErr").textContent = "その会社名はもう登録されています";
      return;
    }
    if (name && pt.name !== name) {
      // 会社名を直した＝売上に入っている名前も一緒に直す（請求書がバラけないように）
      var delIso = new Date().toISOString();
      PARTNERS[name] = Object.assign({}, PARTNERS[name], {
        deletedAt: delIso,
        updatedAt: delIso,
      });
      var moved = 0;
      var mvIso = new Date().toISOString();
      SALES.forEach(function (x, i) {
        if (x.name === name) {
          // 直した印（updatedAt）も付ける＝クラウドの古い名前に上書きされない
          SALES[i] = Object.assign({}, x, { name: pt.name, updatedAt: mvIso });
          moved++;
        }
      });
      if (moved) saveSales();
      if (UI.invName === name) UI.invName = pt.name;
      if (UI.inName === name) UI.inName = pt.name;
    }
    PARTNERS[pt.name] = pt;
    savePartners();
    closeModal();
    renderAll();
    toast("✅ 宛先を保存しました");
    if (onSaved) onSaved(pt.name);
  };
  if ($("ptDel")) {
    $("ptDel").onclick = function () {
      var nowIso = new Date().toISOString();
      PARTNERS[name] = Object.assign({}, PARTNERS[name], {
        deletedAt: nowIso,
        updatedAt: nowIso,
      });
      savePartners();
      closeModal();
      renderAll();
      toast("🗑 宛先を消しました");
    };
  }
}

/* 宛先を消す。売上は消さない（過去の請求書が空にならないように）。
         中身は宛先を直す画面の「この宛先を消す」と同じ物を、一覧からも押せるようにした物。 */
function askDeletePartner(name) {
  var pt = PARTNERS[name];
  if (!pt) return;
  openModal(
    "宛先を消す",
    '<div class="hint">' +
      esc(pt.to || pt.name) +
      " を一覧から消します。<br>この会社の売上と、出した請求書はそのまま残ります。</div>" +
      '<div class="btn-right" style="margin-top:14px">' +
      '<button class="btn btn-ghost btn-danger btn-sm" id="mdPtDelYes">消す</button></div>'
  );
  $("mdPtDelYes").onclick = function () {
    var nowIso3 = new Date().toISOString();
    PARTNERS[name] = Object.assign({}, PARTNERS[name], {
      deletedAt: nowIso3,
      updatedAt: nowIso3,
    });
    savePartners();
    closeModal();
    renderAll();
    toast("🗑 宛先を消しました");
  };
}

/* スタッフを外す。出勤・給料の実績は残す（過去の給料が変わらないように）。 */
function askRemoveStaff(id) {
  var st = staffById(id);
  if (!st) return;
  openModal(
    "スタッフを外す",
    '<div class="hint">' +
      esc(st.name) +
      " を一覧から外します。<br>今までの出勤と渡した記録はそのまま残ります。</div>" +
      '<div class="btn-right" style="margin-top:14px">' +
      '<button class="btn btn-ghost btn-danger btn-sm" id="mdStDelYes">外す</button></div>'
  );
  $("mdStDelYes").onclick = function () {
    var nowIso3 = new Date().toISOString();
    STAFF = STAFF.map(function (x) {
      return x.id === id ? Object.assign({}, x, { deletedAt: nowIso3, updatedAt: nowIso3 }) : x;
    });
    saveStaff();
    closeModal();
    renderAll();
    toast("🗑 外しました（今までの実績は残ります）");
  };
}

// 「請求書送り」を選んだときだけ、名前は登録した宛先から選ぶ（最近選んだ順）。
// 打ち間違いで請求書が2つに割れないようにするため。
function syncNameField() {
  var pick = UI.inPay === "invoice";
  $("inName").style.display = pick ? "none" : "";
  $("inNameSel").style.display = pick ? "" : "none";
  if (!pick) return;
  var list = C.partnerRecent(PARTNERS);
  var have = {};
  list.forEach(function (x) {
    have[x.name] = 1;
  });
  // 昔の売上を直しているときは、登録が無い名前もそのまま選べるようにしておく
  var extra = UI.inName && !have[UI.inName] ? UI.inName : "";
  $("inNameSel").innerHTML =
    '<option value="">（選んでください）</option>' +
    (extra ? '<option value="' + esc(extra) + '">' + esc(extra) + "</option>" : "") +
    list
      .map(function (x) {
        return '<option value="' + esc(x.name) + '">' + esc(x.name) + "</option>";
      })
      .join("") +
    '<option value="__new">＋ 新しく登録する</option>';
  $("inNameSel").value = UI.inName || "";
}

// 請求書は「◯月分」で1枚。月送りだけで区切る（掛売りの月締めと同じ）。
function renderInvPeriod() {
  var el = $("periodInv");
  el.innerHTML =
    '<button class="period-arrow" type="button" data-imv="-1">◀</button>' +
    '<span class="period-lb">' +
    esc(C.jpMonth(UI.invYm)) +
    "分</span>" +
    '<button class="period-arrow" type="button" data-imv="1">▶</button>';
  el.querySelectorAll("[data-imv]").forEach(function (b) {
    b.onclick = function () {
      UI.invYm = C.shiftMonth(UI.invYm, +b.getAttribute("data-imv"));
      renderInv();
    };
  });
}

function renderInvControls() {
  renderInvPeriod();
  var r = invRange();
  var names = C.billableNames(SALES, r.from, r.to);
  var sel = $("invName");
  var cur = UI.invName;
  // 会社ごとに切り替える。いくら請求するかも並びに出す（開く前に分かる）
  sel.innerHTML = names.length
    ? names
        .map(function (n) {
          var iv = C.buildInvoice(SALES, {
            name: n,
            from: r.from,
            to: r.to,
            unpaidOnly: false,
            rate: SETTINGS.rate,
          });
          return '<option value="' + esc(n) + '">' + esc(n) + "　" + C.yen(iv.total) + "</option>";
        })
        .join("")
    : '<option value="">（この月は請求書送り・ツケがありません）</option>';
  if (names.indexOf(cur) < 0) UI.invName = names[0] || "";
  sel.value = UI.invName;
}

function invRange() {
  return C.rangeOfMonth(UI.invYm);
}

function currentInvoice() {
  var r = invRange();
  var iv = C.buildInvoice(SALES, {
    name: UI.invName,
    from: r.from,
    to: r.to,
    // その月の分は入金済みでも同じ1枚になる（あとから出し直しても中身が変わらない）
    unpaidOnly: false,
    rate: SETTINGS.rate,
  });
  iv.no = invoiceNoFor(iv);
  return iv;
}

// 同じ相手・同じ期間なら同じ番号を使い回す（見るたびに番号が変わらない）
function invoiceNoFor(iv) {
  if (!iv.name || !iv.rows.length) return "";
  var key = C.invoiceKey(iv.name, iv.from || "", iv.to || "");
  for (var i = 0; i < INVOICES.length; i++) {
    if (INVOICES[i].key === key) return INVOICES[i].no;
  }
  var ym = C.ymOf(iv.to) || C.ymOf(todayIso());
  var no = C.formatInvoiceNo(ym, C.nextInvoiceSeq(INVOICES, ym));
  var nowIso = new Date().toISOString();
  INVOICES.push({
    key: key,
    no: no,
    name: iv.name,
    from: iv.from || "",
    to: iv.to || "",
    issuedAt: nowIso,
    updatedAt: nowIso,
  });
  saveInvoices();
  return no;
}

/* 相手がいないときに見せる「見本」の請求書。
         ★中身（日付・金額・備考）は作らない。
           店が1件も入れていないのに、売上があるように見える紙を出すのはおかしい。
           出すのは「枠」だけ＝どの見た目にするかを選ぶためのもの。
           金額は 0円ではなく「—」。0円と言い切るのも嘘になる。 */
function sampleInvoice() {
  return {
    sample: true,
    name: "◯◯",
    from: "",
    to: "",
    rows: [],
    count: 0,
    people: 0,
    total: 0,
    tax: 0,
    net: 0,
    rate: C.taxIncluded(0, SETTINGS.rate).rate,
    no: "",
  };
}

function renderInv() {
  renderInvControls();
  renderInvLook();
  var isSample = !UI.invName;
  $("invSample").style.display = isSample ? "" : "none";
  $("invSheets").innerHTML = invoiceSheetHtml(isSample ? sampleInvoice() : currentInvoice());
  $("invSkin").textContent = invoiceSkinCss();
  fitSheets("invScale", "invSheets");
}

/* 請求書のA4 ─ 骨が違う3レイアウト
           card  = 紙の上に白いカードを浮かせる（丸み・くすみピンク／やわらかい）
           band  = 上部に濃色の帯で表題を白抜き（高級バー／きりっと）
           tate  = 右端に縦組みの大きな表題（和モダン／落ち着き）
         共通部品(明細・合計・発行者など)は ivParts() で作り、置き場所だけ変える。
         判子は代行請求書アプリと同じ「社名の右端に重ねる（角印16mm）」。 */
// 1枚に載る明細の行数（レイアウトごとに実測。1行30px・余白を測って詰めた値）
// 宛先に住所・担当者を登録していると、その分だけ上が伸びるので1行ずつ減らす。
function invRowsFor(tpl, subLines) {
  var n = tpl === "band" ? 13 : 14; // tate / card は14
  return Math.max(1, n - (subLines || 0));
}
// 宛先の下に出る行数（住所・担当者）
function invToSubLines(name) {
  var a = C.invoiceTo(PARTNERS, name);
  return a.person ? 1 : 0;
}

// 掛売りの請求日は締め日（その月の末日）。まだ月の途中なら今日。
function invIssueDate(iv) {
  var t = todayIso();
  return iv.to && iv.to < t ? iv.to : t;
}

function ivParts(iv) {
  // 見本のときは、金額も番号も出さない（架空の数字を紙に載せない）
  var yen = function (n) {
    return iv.sample ? "—" : "¥" + C.comma(n);
  };
  var ROWS = invRowsFor(SETTINGS.tpl || "card", invToSubLines(iv.name));
  var shown = iv.rows.slice(0, ROWS);
  var marked = C.markFirstOfDate(shown);
  var body = marked
    .map(function (m) {
      var s = m.sale;
      return (
        '<tr><td class="c-d">' +
        (m.showDate ? esc(C.mdShort(s.date)) : "") +
        '</td><td class="c-w">' +
        (m.showDate ? esc(C.weekday(s.date)) : "") +
        '</td><td class="c-n">ご飲食代</td><td class="c-p">' +
        s.people +
        '</td><td class="c-a">' +
        C.comma(s.amount) +
        '</td><td class="c-bk">' +
        esc(s.memo || "") +
        "</td></tr>"
      );
    })
    .join("");
  // 何月の分かを紙にも出す
  var period = iv.from && iv.to ? C.jpMonth(C.ymOf(iv.to)) + "分" : "";
  return {
    // ロゴ（上に置くとき用）。定番は右上＝発行者の名乗りを先に見せる。
    logoTop:
      SETTINGS.logo && (SETTINGS.logoPos || "top") === "top"
        ? '<img class="iv-logo iv-logo-top" src="' + esc(SETTINGS.logo) + '" alt="" />'
        : "",
    meta:
      '<div class="iv-meta">請求日　' +
      esc(C.jpDate(invIssueDate(iv))) +
      "<br>No.　" +
      esc(iv.sample ? "—" : iv.no) +
      "</div>",
    to: (function () {
      var a = C.invoiceTo(PARTNERS, iv.name);
      return (
        '<div class="iv-tolb">宛名</div><div class="iv-to">' +
        esc(a.to) +
        "　" +
        esc(a.honor) +
        "</div>" +
        (a.person ? '<div class="iv-tosub">' + esc(a.person) + "</div>" : "")
      );
    })(),
    lead: '<div class="iv-lead">ご来店いただきありがとうございました。<br>下記の通りご請求申し上げます。</div>',
    grand:
      '<div class="iv-grand"><span>ご請求金額（税込）</span><b>' + yen(iv.total) + "</b></div>",
    cap: '<div class="iv-cap">ご利用明細<span>' + esc(period) + "</span></div>",
    table:
      '<table class="iv-tbl"><thead><tr><th class="c-d">日付</th><th class="c-w">曜</th>' +
      '<th class="c-n">内容</th><th class="c-p">人数</th><th class="c-a">金額（税込）</th>' +
      '<th class="c-bk">備考</th></tr></thead><tbody>' +
      body +
      "</tbody></table>" +
      (iv.rows.length > ROWS
        ? '<div class="iv-more">ほか ' +
          (iv.rows.length - ROWS) +
          " 件（合計に含まれています）</div>"
        : ""),
    sum:
      '<table class="iv-sum"><tr><td>小計（税抜）</td><td>' +
      yen(iv.net) +
      "</td></tr><tr><td>消費税（" +
      Math.round(iv.rate * 100) +
      "%）</td><td>" +
      yen(iv.tax) +
      '</td></tr><tr class="t"><td>合計</td><td>' +
      yen(iv.total) +
      "</td></tr></table>",
    thanks: '<div class="iv-thanks">またのご来店を<br>お待ちしております</div>',
    // 発行者（会社の情報は紙の中で1回だけ。社名の右端に判子を重ねる）
    issuer:
      '<div class="iv-issuer">' +
      (SETTINGS.logo && SETTINGS.logoPos === "bottom"
        ? '<img class="iv-logo" src="' + esc(SETTINGS.logo) + '" alt="" />'
        : "") +
      '<div class="iv-sign">' +
      (SETTINGS.hanko
        ? '<img class="iv-hanko hk-' +
          esc(SETTINGS.hankoSize || "m") +
          '" src="' +
          esc(SETTINGS.hanko) +
          '" alt="" />'
        : "") +
      '<span class="iv-store">' +
      esc(SETTINGS.store || "") +
      "</span></div>" +
      '<div class="iv-shopsub">' +
      (SETTINGS.addr ? esc(SETTINGS.addr) + "<br>" : "") +
      (SETTINGS.tel ? "TEL " + esc(SETTINGS.tel) : "") +
      (SETTINGS.regNo ? "<br>登録番号：" + esc(SETTINGS.regNo) : "") +
      "</div></div>",
    bank:
      '<div class="iv-bank"><span class="iv-fh">お振込先</span>' +
      (SETTINGS.bank ? esc(SETTINGS.bank) : "—") +
      "</div>",
  };
}

function invoiceSheetHtml(iv) {
  var tpl = SETTINGS.tpl || "card";
  var q = ivParts(iv);
  if (tpl === "band") {
    // 上に濃色の帯（表題を白抜き）／本文は白地／最下部に振込先
    return (
      '<div class="sheet iv-sheet iv-band">' +
      '<div class="iv-hd"><div class="iv-title">請 求 書</div>' +
      q.meta +
      "</div>" +
      '<div class="iv-pad">' +
      '<div class="iv-r2"><div class="iv-r2l">' +
      q.to +
      q.lead +
      '</div><div class="iv-r2r">' +
      q.logoTop +
      "</div></div>" +
      q.grand +
      q.cap +
      q.table +
      q.sum +
      '<div class="iv-btm"><div class="iv-btml">' +
      q.bank +
      q.thanks +
      "</div>" +
      q.issuer +
      "</div></div>" +
      "</div>"
    );
  }
  if (tpl === "tate") {
    // 右端に縦組みの大きな表題／左が本文／下に振込先と発行者を並べる
    return (
      '<div class="sheet iv-sheet iv-tate">' +
      '<div class="iv-side"><div class="iv-title">請求書</div></div>' +
      '<div class="iv-main"><div class="iv-pad">' +
      '<div class="iv-r1"><div class="iv-r1r">' +
      q.logoTop +
      q.meta +
      "</div></div>" +
      '<div class="iv-r2"><div class="iv-r2l">' +
      q.to +
      q.lead +
      "</div></div>" +
      q.grand +
      q.cap +
      q.table +
      q.sum +
      '<div class="iv-btm"><div class="iv-btml">' +
      q.bank +
      q.thanks +
      "</div>" +
      q.issuer +
      "</div></div></div>" +
      "</div>"
    );
  }
  // card: 紙の上に白いカードを浮かせる
  return (
    '<div class="sheet iv-sheet iv-card">' +
    '<div class="iv-cardbox"><div class="iv-pad">' +
    '<div class="iv-r1"><div class="iv-title">請 求 書</div>' +
    '<div class="iv-r1r">' +
    q.logoTop +
    q.meta +
    "</div></div>" +
    '<div class="iv-r2"><div class="iv-r2l">' +
    q.to +
    q.lead +
    "</div></div>" +
    q.grand +
    q.cap +
    q.table +
    q.sum +
    '<div class="iv-btm"><div class="iv-btml">' +
    q.bank +
    q.thanks +
    "</div>" +
    q.issuer +
    "</div></div></div>" +
    "</div>"
  );
}

/* ===================================================================
         A4のフィット表示・印刷
         ─ 原寸794px(=A4幅)で描き、画面幅に合わせて縮小表示する。
           印刷は新しい窓に原寸のまま渡す＝拡大されずくっきり出る。
         =================================================================== */
function fitSheets(scaleId, innerId) {
  var wrap = $(scaleId);
  var inner = $(innerId);
  if (!wrap || !inner) return;
  var avail = wrap.clientWidth;
  if (!avail) return;
  var k = Math.min(1, avail / 794);
  inner.style.transform = "scale(" + k + ")";
  wrap.style.height = inner.scrollHeight * k + "px";
}
/* 表の幅の配り方。頭の何列か（日付・名前など）は決め打ちで、
         残りの列は均等に分ける。こうしないと、日付と時間だけが間延びして
         肝心の金額が右へ押し込まれる。 */
function colGroup(head, cols) {
  var rest = (100 - head.reduce((a, x) => a + x, 0)) / cols;
  return (
    "<colgroup>" +
    head.map((w) => '<col style="width:' + w + '%">').join("") +
    Array(cols)
      .fill('<col style="width:' + rest.toFixed(3) + '%">')
      .join("") +
    "</colgroup>"
  );
}

/* 紙の中の横に長い表を、紙の幅ぴったりまで縮める。
         列が増えても数字が切れないようにするため（切れた数字は嘘になる）。
         表そのものは自然な幅で組み、はみ出したぶんだけ縮める。 */
function fitWide(rootId) {
  var root = $(rootId);
  if (!root) return;
  root.querySelectorAll(".wide").forEach(function (box) {
    var t = box.firstElementChild;
    if (!t) return;
    t.style.transform = "";
    box.style.height = "";
    // まず自然な幅で組んで、本当に必要な幅を測る
    t.style.tableLayout = "auto";
    t.style.width = "auto";
    var avail = box.clientWidth;
    var need = t.scrollWidth;
    if (!avail || !need) return;
    if (need <= avail) {
      // 入るなら、決めた割り当て（colgroup）で紙いっぱいに配り直す
      t.style.tableLayout = "fixed";
      t.style.width = "100%";
      return;
    }
    // 入らないぶんだけ縮める（1文字も切らない）
    t.style.width = need + "px";
    var k = avail / need;
    t.style.transformOrigin = "top left";
    t.style.transform = "scale(" + k + ")";
    box.style.height = t.offsetHeight * k + "px";
  });
}

function fitAll() {
  fitSheets("listScale", "listSheets");
  fitSheets("taxScale", "taxSheets");
  fitSheets("invScale", "invSheets");
}

var SHEET_CSS = [
  ".sheet{width:794px;min-height:1123px;background:#ffffff;color:#000000;",
  "padding:30px 34px;margin:0 auto 16px;border:1px solid #e3e7ee;",
  "box-shadow:0 4px 16px rgba(30,80,46,0.10);font-size:12px;position:relative;}",
  ".sh-head{border-bottom:2px solid #0A1128;padding-bottom:8px;margin-bottom:10px;}",
  ".sh-store{font-size:13px;font-weight:700;}",
  ".sh-title{text-align:center;font-size:24px;font-weight:700;letter-spacing:8px;margin:2px 0 6px;padding-left:8px;}",
  ".sh-meta{display:flex;justify-content:space-between;font-size:11px;color:#333333;}",
  // 日報（レジ締め）＝閉店後に印刷して綴じる紙。金額は右、罫線は最小限。
  ".cl-sheet .sh-meta{justify-content:flex-start;gap:14px;}",
  ".cl-p2{width:420px;border-collapse:collapse;margin:14px 0 4px;}",
  ".cl-p2 th{text-align:left;font-size:12px;font-weight:400;padding:6px 8px;",
  "border-bottom:1px solid #e3e7ee;white-space:nowrap;}",
  ".cl-p2 td{text-align:right;font-size:13px;padding:6px 8px;border-bottom:1px solid #e3e7ee;",
  "font-family:'DM Mono',monospace;width:150px;}",
  ".cl-p2 .c-bold{font-weight:700;font-size:15px;}",
  ".cl-p2 tr:nth-last-child(3) th,.cl-p2 tr:nth-last-child(3) td{border-top:2px solid #0A1128;}",
  ".cl-p3{margin-top:18px;}",
  ".cl-cap{font-size:11.5px;font-weight:700;letter-spacing:2px;color:#0A1128;",
  "border-left:3px solid #0A1128;padding-left:7px;margin-bottom:5px;}",
  ".cl-p4{width:420px;border-collapse:collapse;}",
  ".cl-p4 td{font-size:12px;padding:5px 8px;border-bottom:1px solid #eef0f4;}",
  ".cl-p4 td:nth-child(2){color:#555555;}",
  ".cl-p4 .c-a{text-align:right;font-family:'DM Mono',monospace;width:110px;}",
  ".cl-p4 .c-mid{text-align:center;color:#888888;}",
  ".cl-p4 .c-bold{font-weight:700;}",
  ".cl-memo{font-size:12px;line-height:1.9;border:1px solid #e3e7ee;padding:8px 10px;",
  "min-height:44px;width:420px;box-sizing:border-box;}",
  ".cl-sign{position:absolute;left:34px;bottom:34px;font-size:11px;color:#333333;}",
  ".sh-tbl{width:100%;border-collapse:collapse;table-layout:fixed;}",
  ".sh-tbl th{font-size:11px;font-weight:700;background:#eef1f6;border:1px solid #9aa6bb;padding:5px 4px;}",
  ".sh-tbl td{font-size:12px;border:1px solid #c6ccd8;padding:4px 5px;height:26px;overflow:hidden;white-space:nowrap;}",
  ".sh-tbl tr.blank td{color:#ffffff;}",
  ".sh-tbl .c-d{width:46px;text-align:center;font-family:'DM Mono',monospace;}",
  ".sh-tbl .c-w{width:24px;text-align:center;}",
  // 名前は「常連 木下様」くらいが入る幅で固定し、余りは備考へ（備考は書ける幅を広く取る）
  ".sh-tbl .c-n{width:150px;text-align:left;}",
  ".sh-tbl .c-p{width:40px;text-align:right;font-family:'DM Mono',monospace;}",
  ".sh-tbl .c-a{width:88px;text-align:right;font-family:'DM Mono',monospace;}",
  ".sh-tbl .c-m{width:70px;text-align:center;}",
  // 給与一覧（列が多いので細めに）
  // 横に長い表は、はみ出したぶんだけ縮める（fitWide）。列が増えても数字が切れない。
  ".wide{overflow:hidden;}",
  ".wide>table{table-layout:auto;width:auto;min-width:100%;}",
  ".wide>table td,.wide>table th{white-space:nowrap;overflow:visible;}",
  ".pay-tbl th{font-size:10px;}",
  ".pay-tbl td{font-size:11px;height:24px;}",
  ".pay-tbl .c-n{width:90px;text-align:left;}",
  ".pay-tbl .c-p{width:44px;text-align:right;font-family:'DM Mono',monospace;}",
  ".pay-tbl .c-a{width:74px;text-align:right;font-family:'DM Mono',monospace;}",
  ".pay-tbl tfoot td{border-top:2px solid #0A1128;}",
  ".sh-tbl .c-bk{text-align:left;font-size:11px;color:#333333;}",
  ".sh-tbl .c-un{color:#b06d17;font-size:10px;margin-left:3px;}",
  ".sh-tbl .c-paid{color:#1f4e86;font-size:10px;margin-left:3px;}",
  ".sh-tbl tr.clickable:hover td{background:#f5f7fb;cursor:pointer;}",
  ".sh-foot{margin-top:10px;}",
  ".sh-total{display:flex;align-items:baseline;gap:10px;border:2px solid #0A1128;padding:8px 12px;}",
  ".sh-total .st-k{font-size:13px;font-weight:700;}",
  ".sh-total .st-sub{font-size:11px;color:#333333;}",
  ".sh-total .st-v{margin-left:auto;font-family:'DM Mono',monospace;font-size:20px;font-weight:500;}",
  ".sh-boxes{display:flex;gap:10px;margin-top:8px;}",
  ".fb{flex:1;border:1px solid #c6ccd8;padding:6px 8px;}",
  ".fb-h{font-size:11px;font-weight:700;border-bottom:1px solid #c6ccd8;padding-bottom:3px;margin-bottom:3px;}",
  ".fb-row{display:flex;font-size:11px;padding:1.5px 0;}",
  ".fb-row .fb-c{margin-left:auto;color:#555555;font-family:'DM Mono',monospace;padding-right:8px;}",
  ".fb-row .fb-v{font-family:'DM Mono',monospace;min-width:64px;text-align:right;}",
  ".fb-note{font-size:10px;color:#555555;margin-top:4px;}",
  /* 集計表 */
  ".sm-stats{display:flex;gap:8px;margin:10px 0 12px;}",
  ".sm-s{flex:1;border:1px solid #c6ccd8;padding:8px;text-align:center;}",
  ".sm-s span{display:block;font-size:10px;color:#555555;}",
  ".sm-s b{font-family:'DM Mono',monospace;font-size:17px;font-weight:500;}",
  ".sm-blk{margin-bottom:12px;page-break-inside:avoid;}",
  ".sm-h{font-size:12px;font-weight:700;border-left:4px solid #0A1128;padding-left:6px;margin-bottom:4px;}",
  ".sm-sub{font-size:11px;font-weight:700;color:#1f4e86;margin:2px 0 3px;}",
  ".sm-tbl{width:100%;border-collapse:collapse;}",
  ".sm-tbl th{font-size:10px;background:#eef1f6;border:1px solid #9aa6bb;padding:3px 5px;}",
  ".sm-tbl td{font-size:11px;border:1px solid #c6ccd8;padding:3px 5px;}",
  ".sm-2 td{border:none;border-bottom:1px solid #eef0f4;padding:4px 6px;}",
  ".sm-2 td.r{width:120px;}",
  ".sm-2 .b{font-weight:700;}",
  ".sm-sub td{color:#555555;font-size:10px;}",
  ".sm-note{font-size:10px;color:#555555;margin-top:2px;}",
  ".pay-sub{font-size:11px;color:#1b2740;margin-top:8px;padding:6px 8px;border:1px solid #c6ccd8;border-radius:4px;background:#f5f7fb;}",
  ".sm-2col{display:flex;gap:10px;align-items:flex-start;}",
  ".sm-2col>div{flex:1;min-width:0;}",
  ".sm-tbl .l{text-align:left;}",
  ".sm-tbl .r{text-align:right;font-family:'DM Mono',monospace;}",
  /* ===== 請求書：骨から違う3レイアウト =====
           card = 紙にカードを浮かせる / band = 上に濃色帯 / tate = 右端に縦組みの表題
           配色の下敷き: くすみ色の上品さ、和モダンの「墨×生成り」「紺×金茶」
           (uto-room.com / tenantkoubou.com)。塗りは帯と見出しだけ＝印刷でインクを食わない。 */
  ".iv-sheet{display:flex;flex-direction:column;padding:0;color:#33302c;}",
  ".iv-pad{flex:1;display:flex;flex-direction:column;}",
  /* 共通部品 */
  // 請求日とNo.は右端を揃える（行ごとに文字数が違うので右揃えが必要）
  ".iv-meta{font-size:10.5px;line-height:1.9;color:#6a655e;text-align:right;}",
  ".iv-title{font-family:'Noto Serif JP',serif;font-weight:600;}",
  ".iv-tolb{font-size:9.5px;letter-spacing:2px;color:#8a847b;}",
  ".iv-to{font-family:'Noto Serif JP',serif;font-size:19px;font-weight:600;",
  "letter-spacing:2px;padding:3px 0 7px;}",
  ".iv-tosub{font-size:10.5px;line-height:1.8;color:#5a554e;margin-top:6px;}",
  ".iv-lead{font-size:10.5px;line-height:1.9;color:#5a554e;margin-top:8px;}",
  // 金額は幅400px(=約106mm)の1枚の箱。ラベルと数字を近づけて前後に空白を作らない
  // （書き換え・付け足しの防止）。
  ".iv-grand{width:400px;display:flex;align-items:center;gap:22px;padding:14px 20px;",
  "margin-top:22px;box-sizing:border-box;}",
  ".iv-grand span{font-family:'Noto Serif JP',serif;font-size:13px;letter-spacing:2px;}",
  ".iv-grand b{margin-left:auto;font-family:'Noto Serif JP',serif;font-size:27px;",
  "font-weight:600;letter-spacing:1px;}",
  ".iv-cap{font-family:'Noto Serif JP',serif;font-size:11.5px;letter-spacing:3px;",
  "margin:22px 0 6px;display:flex;align-items:baseline;}",
  // 何月分かは見出しのすぐ横（右端まで目を動かさなくていい）
  ".iv-cap span{margin-left:12px;font-family:'Noto Sans JP',sans-serif;font-size:9.5px;",
  "letter-spacing:0;color:#8a847b;}",
  ".iv-tbl{width:100%;border-collapse:collapse;table-layout:fixed;}",
  ".iv-tbl th{font-size:10px;font-weight:500;border:none;padding:7px 8px;text-align:right;",
  "letter-spacing:1px;}",
  ".iv-tbl th.c-n,.iv-tbl th.c-bk{text-align:left;}",
  ".iv-tbl th.c-d,.iv-tbl th.c-w{text-align:center;}",
  ".iv-tbl td{font-size:12px;border:none;padding:7px 8px;height:29px;overflow:hidden;",
  "white-space:nowrap;}",
  ".iv-tbl .c-d{width:44px;text-align:center;}",
  ".iv-tbl .c-w{width:22px;text-align:center;color:#8a847b;}",
  ".iv-tbl .c-n{width:80px;text-align:left;}",
  ".iv-tbl .c-p{width:42px;text-align:right;}",
  ".iv-tbl .c-a{width:96px;text-align:right;}",
  ".iv-tbl .c-bk{text-align:left;font-size:11px;color:#5a554e;}",
  ".iv-more{font-size:9.5px;color:#8a847b;margin-top:5px;}",
  ".iv-sum{margin:14px 0 0 auto;border-collapse:collapse;width:280px;}",
  ".iv-sum td{border:none;padding:5px 8px;font-size:12px;color:#5a554e;}",
  ".iv-sum td:last-child{text-align:right;}",
  ".iv-sum tr.t td{font-family:'Noto Serif JP',serif;font-size:19px;font-weight:600;",
  "color:#33302c;padding-top:8px;letter-spacing:1px;}",
  ".iv-thanks{font-family:'Noto Serif JP',serif;font-size:13px;line-height:1.9;",
  "letter-spacing:2px;}",
  ".iv-btm{display:flex;align-items:flex-end;gap:20px;margin-top:auto;padding-top:20px;}",
  ".iv-btml{display:flex;flex-direction:column;gap:12px;}",
  // 店名・住所・TEL・登録番号は全部おなじ右端に揃える
  ".iv-issuer{position:relative;margin-left:auto;text-align:right;}",
  ".iv-sign{display:block;position:relative;}",
  ".iv-logo{display:block;max-width:150px;max-height:38px;object-fit:contain;",
  "margin:0 0 6px auto;}",
  // 上に置くロゴ（定番の位置）＝請求日/No.の上に右寄せ
  ".iv-logo-top{display:block;max-width:100%;max-height:46px;margin:0 0 10px auto;}",
  // 右上は「ロゴ＋請求日/No.」で1つの列。幅を決めて右端を揃える。
  ".iv-r1r{width:230px;margin-left:auto;text-align:right;}",
  ".iv-band .iv-r2r .iv-logo-top{margin:0 0 0 auto;}",
  // 店名は住所・TEL・登録番号と同じ大きさ・同じ右端。太さだけで名前だと分かるようにする。
  // letter-spacing は最後の文字の後ろにも入るので、同じ幅だけ右へ戻して右端を揃える。
  ".iv-store{font-family:'Noto Serif JP',serif;font-size:10.5px;font-weight:700;",
  "letter-spacing:1px;margin-right:-1px;line-height:1.9;}",
  // 判子＝社名の行に軽く重ねる（角印）。住所や登録番号には掛からない大きさにする。
  ".iv-hanko{position:absolute;object-fit:contain;opacity:0.95;}",
  // ★実物の角印の寸法。はんこ屋の既製サイズは 18/21/24mm がほぼ全部で、
  //   一番多いのが 21mm（既定）。紙は A4 幅 794px＝210mm なので 1mm ≒ 3.781px。
  //     18mm → 68px ／ 21mm → 79px ／ 24mm → 91px
  //   位置は大きさに合わせて動かす（社名の行に重ね、紙の右端からはみ出さない）。
  //   高さは「判子の下端が社名の行に少しかかる」位置で揃える（下端＝社名の上から17px）。
  //   社名にかけるのが角印の作法（改ざん防止）。ただし住所・TEL・登録番号は隠さない。
  ".iv-hanko.hk-s{right:-20px;top:-51px;width:68px;height:68px;}",
  ".iv-hanko.hk-m{right:-22px;top:-62px;width:79px;height:79px;}",
  ".iv-hanko.hk-l{right:-24px;top:-74px;width:91px;height:91px;}",
  ".iv-shopsub{font-size:10px;line-height:1.9;color:#6a655e;margin-top:2px;}",
  ".iv-bank{font-size:10.5px;line-height:1.8;word-break:keep-all;}",
  ".iv-fh{font-family:'Noto Serif JP',serif;font-size:10.5px;letter-spacing:2px;",
  "display:block;margin-bottom:2px;}",
  ".iv-empty{padding:40px 0;text-align:center;color:#888888;font-size:12px;}",

  /* ===== ① card：紙にカードを浮かせる（くすみピンク・やわらかい） ===== */
  ".iv-card{background:#ffffff;}",
  ".iv-card .iv-cardbox{flex:1;display:flex;background:#ffffff;}",
  ".iv-card .iv-pad{padding:44px 52px 24px;}",
  ".iv-card .iv-r1{display:flex;align-items:flex-start;}",
  ".iv-card .iv-title{font-size:30px;letter-spacing:9px;color:#4a3634;}",
  ".iv-card .iv-meta{margin-left:auto;text-align:right;}",
  ".iv-card .iv-r2{margin-top:22px;display:flex;gap:20px;align-items:flex-start;}",
  ".iv-card .iv-r2l{flex:1;min-width:0;}",
  ".iv-card .iv-r2r{width:230px;}",
  ".iv-card .iv-to{border-bottom:1px solid #ddbcb8;display:inline-block;min-width:280px;}",
  ".iv-card .iv-grand{background:#f8e7e4;border-radius:14px;}",
  ".iv-card .iv-grand span{color:#8a5b58;}",
  ".iv-card .iv-cap{color:#8a5b58;}",
  ".iv-card .iv-tbl th{background:#f7ece9;color:#7a5250;}",
  ".iv-card .iv-tbl td{border-bottom:1px solid #f0e2e0;}",
  ".iv-card .iv-sum tr.t td{border-top:1px solid #ddbcb8;}",
  ".iv-card .iv-thanks{color:#a8746f;}",

  /* ===== ② band：上に濃色の帯で表題を白抜き（紺×金・きりっと） ===== */
  ".iv-band{background:#ffffff;}",
  ".iv-band .iv-hd{background:#1b2b45;color:#f2ece0;padding:34px 52px 26px;",
  "display:flex;align-items:flex-end;border-bottom:3px solid #c2a86a;}",
  ".iv-band .iv-title{font-size:31px;letter-spacing:13px;}",
  ".iv-band .iv-hd .iv-meta{margin-left:auto;text-align:right;color:#dcd6c8;}",
  ".iv-band .iv-pad{padding:30px 52px 24px;}",
  ".iv-band .iv-r2{display:flex;gap:24px;align-items:flex-start;}",
  ".iv-band .iv-r2l{flex:1;min-width:0;}",
  ".iv-band .iv-r2r{width:230px;}",
  ".iv-band .iv-to{border-bottom:1px solid #1b2b45;display:inline-block;min-width:240px;}",
  ".iv-band .iv-grand{background:#f2f4f7;border-left:3px solid #c2a86a;}",
  ".iv-band .iv-grand span{color:#1b2b45;}",
  ".iv-band .iv-cap{color:#1b2b45;}",
  ".iv-band .iv-tbl th{background:#1b2b45;color:#f2ece0;}",
  ".iv-band .iv-tbl td{border-bottom:1px solid #e2e5ea;}",
  ".iv-band .iv-sum tr.t td{border-top:1px solid #c2a86a;}",
  ".iv-band .iv-thanks{color:#7d6a3e;}",

  /* ===== ③ tate：右端に縦組みの大きな表題（墨×生成り・和） ===== */
  ".iv-tate{background:#ffffff;flex-direction:row;}",
  ".iv-tate .iv-main{flex:1;min-width:0;display:flex;}",
  ".iv-tate .iv-pad{padding:44px 52px 26px 34px;}",
  ".iv-tate .iv-r1{display:flex;justify-content:flex-end;margin-bottom:18px;}",
  ".iv-tate .iv-r2{display:flex;gap:20px;align-items:flex-start;}",
  ".iv-tate .iv-r2l{flex:1;min-width:0;}",
  ".iv-tate .iv-r2r{width:220px;}",
  ".iv-tate .iv-side{flex:0 0 132px;display:flex;justify-content:center;",
  "padding:44px 0;border-right:1px solid #cbbd9a;}",
  ".iv-tate .iv-title{writing-mode:vertical-rl;font-size:38px;letter-spacing:16px;",
  "color:#2b2b2b;line-height:1;}",
  ".iv-tate .iv-to{border-bottom:1px solid #2b2b2b;display:inline-block;min-width:260px;}",
  ".iv-tate .iv-grand{background:#f2ede1;border-top:1px solid #b39a68;",
  "border-bottom:1px solid #b39a68;}",
  ".iv-tate .iv-cap{color:#2b2b2b;}",
  ".iv-tate .iv-tbl th{background:#f2ede1;color:#5a4f38;border-top:1px solid #cbbd9a;",
  "border-bottom:1px solid #cbbd9a;}",
  ".iv-tate .iv-tbl td{border-bottom:1px solid #e3ddcd;}",
  ".iv-tate .iv-sum tr.t td{border-top:1px solid #b39a68;}",
].join("");

/* 店の色・書体の上書き（選んだときだけ足す）。
         塗りは薄く（14%）、罫は選んだ色そのまま＝印刷でインクを食わない。 */
// 店の色。よく使う色を並べ、足りなければ自分で選べる（色コードをそのまま持つ）。
var ACCENTS = [
  { label: "ワイン", hex: "#7d3a44" },
  { label: "朱", hex: "#b04a3e" },
  { label: "桜", hex: "#b5827e" },
  { label: "桃", hex: "#c98f8a" },
  { label: "藤", hex: "#7b6aa0" },
  { label: "紺", hex: "#1b2b45" },
  { label: "藍", hex: "#2f5d7c" },
  { label: "空", hex: "#5b8ca8" },
  { label: "深緑", hex: "#2f5d4a" },
  { label: "若草", hex: "#4a6b45" },
  { label: "金茶", hex: "#8c6f3f" },
  { label: "銅", hex: "#96603c" },
  { label: "墨", hex: "#2b2b2b" },
  { label: "灰", hex: "#6b6f73" },
];
// 旧データ（色の名前で保存していたもの）を色コードに読み替える
var ACCENT_OLD = {
  wine: "#7d3a44",
  navy: "#1b2b45",
  sumi: "#2b2b2b",
  sakura: "#b5827e",
  moss: "#4a6b45",
  gold: "#8c6f3f",
};
function accentHex() {
  var a = SETTINGS.accent || "";
  if (!a) return "";
  if (ACCENT_OLD[a]) return ACCENT_OLD[a];
  return /^#[0-9a-fA-F]{6}$/.test(a) ? a : "";
}
function hexToRgba(hex, a) {
  var h = String(hex).replace("#", "");
  if (h.length !== 6) return "";
  return (
    "rgba(" +
    parseInt(h.slice(0, 2), 16) +
    "," +
    parseInt(h.slice(2, 4), 16) +
    "," +
    parseInt(h.slice(4, 6), 16) +
    "," +
    a +
    ")"
  );
}
function invoiceSkinCss() {
  var out = "";
  var hex = accentHex();
  if (hex) {
    var tint = hexToRgba(hex, 0.12);
    var line = hexToRgba(hex, 0.45);
    out +=
      ".iv-sheet .iv-grand{background:" +
      tint +
      ";border-color:" +
      hex +
      ";}" +
      ".iv-sheet .iv-grand span{color:" +
      hex +
      ";}" +
      ".iv-sheet .iv-cap{color:" +
      hex +
      ";}" +
      ".iv-sheet .iv-tbl th{background:" +
      tint +
      ";color:" +
      hex +
      ";border-color:" +
      line +
      ";}" +
      ".iv-sheet .iv-tbl td{border-bottom-color:" +
      hexToRgba(hex, 0.22) +
      ";}" +
      ".iv-sheet .iv-to{border-bottom-color:" +
      hex +
      ";}" +
      ".iv-sheet .iv-sum tr.t td{border-top-color:" +
      hex +
      ";}" +
      ".iv-sheet .iv-thanks{color:" +
      hex +
      ";}" +
      ".iv-band .iv-hd{background:" +
      hex +
      ";border-bottom-color:" +
      hexToRgba(hex, 0.55) +
      ";}" +
      ".iv-band .iv-tbl th{background:" +
      hex +
      ";color:#ffffff;}" +
      ".iv-tate .iv-side{border-right-color:" +
      line +
      ";}" +
      ".iv-tate .iv-title{color:" +
      hex +
      ";}" +
      ".iv-card .iv-title,.iv-tate .iv-store,.iv-card .iv-store,.iv-band .iv-store{color:" +
      hex +
      ";}";
  }
  if (SETTINGS.font === "gothic") {
    out +=
      ".iv-sheet .iv-title,.iv-sheet .iv-to,.iv-sheet .iv-store,.iv-sheet .iv-cap," +
      ".iv-sheet .iv-grand span,.iv-sheet .iv-grand b,.iv-sheet .iv-sum tr.t td," +
      ".iv-sheet .iv-thanks,.iv-sheet .iv-fh{font-family:'Noto Sans JP',sans-serif;}";
  }
  return out;
}

/* 印刷／PDF ─ 別のタブを開かず、この画面のまま印刷する。
         （新しいタブだと iPhone で戻れなくなり、タスクを切る羽目になるため）
         紙の中身だけを #printArea に移し、印刷のときはそこだけを出す。 */
var _printTitle = "";
/* ★紙を刷る＝新しい窓に「紙だけ」を書いて、そこで印刷する。
           ・同じ画面のまま window.print() すると、iPhoneでは真っ白で出る（司さん実機で確認）。
             画面用のCSS（隠す・縮める・位置を固定する）が印刷にまで効いてしまうため。
           ・新しい窓には A4 の紙のCSSと紙のHTMLしか無いので、何にも邪魔されない。
             代行請求書アプリと同じやり方。
           ・ポップアップを塞がれている端末だけ、今までどおり同じ画面で印刷する。 */
/* ★紙は「自前で作ったPDF」で出す。
           ブラウザの印刷は、紙の一番下に URL・日付・ページ番号を勝手に足す。
           これは CSS では消せない（iPhone も PC も同じ）。渡す相手に見せる物なので、
           自分で PDF を組んで、その PDF を開く。＝足跡が1つも出ない。
           代行請求書アプリと同じ考え方。
           PDFが作れない端末だけ、いままでどおり「紙だけの窓」を開いて刷る。 */
var _pdfLibs = null;
function loadPdfLibs() {
  if (_pdfLibs) return _pdfLibs;
  var one = function (src, has) {
    return new Promise(function (ok, ng) {
      if (has()) return ok();
      var el = document.createElement("script");
      el.src = src;
      el.onload = function () {
        has() ? ok() : ng(new Error(src));
      };
      el.onerror = function () {
        ng(new Error(src));
      };
      document.head.appendChild(el);
    });
  };
  _pdfLibs = Promise.all([
    one("vendor/html2canvas.min.js", function () {
      return !!window.html2canvas;
    }),
    one("vendor/jspdf.umd.min.js", function () {
      return !!(window.jspdf && window.jspdf.jsPDF);
    }),
  ]).catch(function (e) {
    _pdfLibs = null; // 失敗は次に押したとき取り直す
    throw e;
  });
  return _pdfLibs;
}

/* ★明朝(Noto Serif JP)は、紙と請求書でしか使わない★
   ------------------------------------------------------------------------------
   2026-08-08 実測: 起動のときに明朝の実体を ★0本★ しか取っていなかった
   （＝起動の画面には明朝で描く文字が1つも無い）。それなのに「目録(CSS)」だけは
   起動時に読んでいて、そこに ★61KB★ 積まれていた。
   だから起動の <link> からは外し、★紙を出すこの場所で読む★。

   ★注意：外した以上、読み終わるのを待たないと紙がゴシックのまま出る★
   この紙は html2canvas で「画面に出ている物をそのまま写す」作り。
   字が届く前に写すと、写った絵はゴシックのまま固定される（あとから直らない）。 */
var SERIF_CSS = "https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@400;600&display=swap";
/* ★<link> を足しただけでは、まだ書体は「登録」されていない★
   目録(CSS)が届いて読み込まれるまで document.fonts の中に明朝は1つも無い。
   その状態で document.fonts.load() を呼んでも「該当なし」で即座に終わる＝
   ★待ったつもりで1バイトも待っていない★（2026-08-08、試験が実際にこれを捕まえた）。
   だから ★目録が読み込まれたことを待てる形★ にしておく。 */
var _serifCss = null;
function addSerifCss() {
  if (_serifCss) return _serifCss;
  _serifCss = new Promise(function (done) {
    var l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = SERIF_CSS;
    l.onload = function () {
      done(true);
    };
    l.onerror = function () {
      done(false); // 届かなくても紙は出す（今までどおりの見た目に落ちるだけ）
    };
    document.head.appendChild(l);
  });
  return _serifCss;
}

/* 紙に使う字が ぜんぶ届くまで待つ。
   ★document.fonts.load に「その紙の文字」を渡すのが肝★。
   日本語のWebフォントは文字の範囲ごとに約120枚へ切り分けて配られるので、
   文字を渡さないと「代表の1枚」しか取りに行かず、待っても揃わない。
   ★固まらせない★ため、待つのは最大12秒。それを超えたら待たずに進み、一言出す。 */
var PAPER_FONTS = [
  '400 16px "Noto Serif JP"',
  '600 16px "Noto Serif JP"',
  '400 16px "Noto Sans JP"',
  '500 16px "Noto Sans JP"',
  '700 16px "Noto Sans JP"',
  '400 16px "DM Mono"',
  '500 16px "DM Mono"',
];
async function ensurePaperFonts(inner) {
  var d = document;
  if (!d.fonts || !d.fonts.load) {
    addSerifCss();
    return true; // 対応していない端末は今までどおり
  }
  // ★まず目録が読み込まれるのを待つ（これを飛ばすと「該当なし」で素通りする）★
  await addSerifCss();
  var text = String((inner && inner.textContent) || "").slice(0, 4000);
  var wait = Promise.all(
    PAPER_FONTS.map(function (f) {
      return d.fonts.load(f, text).catch(function () {});
    })
  ).then(function () {
    return d.fonts.ready;
  });
  var timedOut = false;
  await Promise.race([
    wait.catch(function () {}),
    new Promise(function (ok) {
      setTimeout(function () {
        timedOut = true;
        ok();
      }, 12000);
    }),
  ]);
  if (timedOut) toast("⚠️ 書体が届かないまま紙を作りました（電波の良い所で作り直せます）");
  return !timedOut;
}

/* 画面に出ている紙（.sheet）を、そのままの大きさでPDFにする。
         画面では縮めて見せているので、撮るあいだだけ縮小を外して原寸に戻す。 */
async function buildPaperPdf(inner) {
  await loadPdfLibs();
  // ★字がそろってから写す（そろう前に写すと、紙がゴシックのまま固定される）★
  await ensurePaperFonts(inner);
  var sheets = Array.prototype.slice.call(inner.querySelectorAll(".sheet"));
  if (!sheets.length) throw new Error("紙がありません");
  var wrap = inner.parentElement; // .sheet-scale
  var keepInner = inner.style.transform;
  var keepWrap = wrap ? wrap.style.height : "";
  inner.style.transform = "none"; // 原寸に戻す（撮り終わったら戻す）
  if (wrap) wrap.style.height = "auto";
  try {
    var pdf = new window.jspdf.jsPDF({ orientation: "p", unit: "pt", format: "a4" });
    var W = pdf.internal.pageSize.getWidth();
    var H = pdf.internal.pageSize.getHeight();
    for (var i = 0; i < sheets.length; i++) {
      var cv = await window.html2canvas(sheets[i], {
        scale: 2, // A4の紙で約192dpi。刷って字がにじまない細かさ
        backgroundColor: "#ffffff",
        useCORS: true,
        logging: false,
      });
      if (i) pdf.addPage();
      pdf.addImage(cv.toDataURL("image/png"), "PNG", 0, 0, W, H, undefined, "FAST");
    }
    return pdf.output("blob");
  } finally {
    inner.style.transform = keepInner;
    if (wrap) wrap.style.height = keepWrap;
    fitAll();
  }
}

function printSheets(innerId, title) {
  var inner = $(innerId);
  if (!inner || !inner.innerHTML.trim()) {
    toast("⚠️ 印刷するものがありません");
    return;
  }
  toast("📄 " + title + "を作っています…");
  buildPaperPdf(inner)
    .then(function (blob) {
      var url = URL.createObjectURL(blob);
      var w = window.open(url, "_blank");
      if (!w) {
        // 新しい窓を開けない端末は、その場で保存する
        var a = document.createElement("a");
        a.href = url;
        a.download = title + ".pdf";
        a.click();
        toast("📄 " + title + " を保存しました。開いて印刷してください");
      } else {
        toast("📄 " + title + " を開きました。共有／プリントから印刷できます");
      }
      setTimeout(function () {
        URL.revokeObjectURL(url);
      }, 60000);
    })
    .catch(function (e) {
      // 何で作れなかったかを残す（端末で困ったときに聞けるように）
      window.__PDF_ERR__ = String((e && e.message) || e);
      // PDFが作れない端末＝いままでどおり「紙だけの窓」を開いて刷る
      printSheetsFallback(innerId, title);
    });
}

function printSheetsFallback(innerId, title) {
  var inner = $(innerId);
  if (!inner || !inner.innerHTML.trim()) {
    toast("⚠️ 印刷するものがありません");
    return;
  }
  var html = printableHtml(inner.innerHTML, title);
  var pw = null;
  try {
    pw = window.open("", "_blank");
  } catch (e) {
    pw = null;
  }
  if (!pw || !pw.document) {
    // ポップアップが開けない端末＝今までどおり同じ画面で印刷する
    toast("🖨 PDFにするときは、この画面で「PDFとして保存」を選んでください");
    $("printArea").innerHTML = inner.innerHTML;
    _printTitle = document.title;
    document.title = title;
    window.print();
    return;
  }
  toast("🖨 新しい画面が開きます。PDFにするときは「PDFとして保存」を選んでください");
  pw.document.open();
  pw.document.write(html);
  pw.document.close();
  wirePrintWindow(pw);
}

/* 印刷用の1枚もの。紙のCSS（SHEET_CSS）と紙のHTMLだけを入れる。
         画面用のCSSは1行も入れない＝画面の都合で真っ白になることがない。 */
function printableHtml(sheets, title) {
  return (
    '<!doctype html><html lang="ja"><head><meta charset="UTF-8">' +
    // 紙は794px＝A4の幅。スマホでも縮めずにこの幅で組ませる。
    '<meta name="viewport" content="width=794">' +
    "<title>" +
    esc(title || "印刷") +
    "</title>" +
    '<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700' +
    '&family=Noto+Serif+JP:wght@400;600&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">' +
    "<style>" +
    "*{box-sizing:border-box;margin:0;padding:0;}" +
    "@page{size:A4 portrait;margin:0;}" +
    'html,body{background:#ffffff;font-family:"Noto Sans JP",sans-serif;}' +
    SHEET_CSS +
    // ★店が選んだ請求書の色・書体（#invSkin）も一緒に持っていく。
    //   これが抜けると、画面では色が付いているのに刷ると素の色で出る。
    ($("invSkin") ? $("invSkin").textContent : "") +
    // 画面で見せるための飾り（枠・影・余白）は紙では消す
    ".sheet{border:none!important;box-shadow:none!important;margin:0 auto!important;" +
    "page-break-after:always;break-after:page;}" +
    ".sheet:last-child{page-break-after:auto;break-after:auto;}" +
    ".no-print{display:none!important;}" +
    // 画面に出す帯（刷るときは消える）。開いた窓から戻れないと困る。
    ".pbar{position:sticky;top:0;z-index:9;display:flex;gap:10px;justify-content:center;" +
    "padding:10px;background:#070f22;}" +
    ".pbar button{font-family:inherit;font-size:14px;font-weight:700;padding:10px 18px;" +
    "border-radius:12px;cursor:pointer;background:#e7ecf5;color:#1b2740;" +
    "border:1.5px solid #7a88a5;}" +
    "@media print{.pbar{display:none!important;}}" +
    "</style></head><body>" +
    '<div class="pbar">' +
    '<button type="button" id="pbClose">← 戻る</button>' +
    '<button type="button" id="pbPrint">🖨 もう一度印刷</button>' +
    "</div>" +
    sheets +
    "</body></html>"
  );
}

/* 開いた窓のボタンと、印刷の合図。
         ★窓の中に <script> を埋め込む形にはしない（document.write で書いた script は
           動かないことがあり、実際それで「戻る」も自動印刷も効いていなかった）。
           開いたこちら側から直に触る（同じ場所のページなので触れる）。 */
function wirePrintWindow(pw) {
  var doPrint = function () {
    try {
      pw.focus();
    } catch (e) {
      /* 窓に移れなくても印刷は出る */
    }
    try {
      pw.print();
    } catch (e) {
      /* 印刷できない端末は、その窓から手で刷ってもらう */
    }
  };
  var d = pw.document;
  var close = d.getElementById("pbClose");
  var again = d.getElementById("pbPrint");
  if (close)
    close.onclick = function () {
      pw.close();
    };
  if (again) again.onclick = doPrint;

  // 字と絵がそろってから刷る（そろう前に刷ると空白や字化けになる）
  var fired = false;
  var ready = function () {
    if (fired) return;
    fired = true;
    setTimeout(doPrint, 150);
  };
  var imgs = Array.prototype.slice.call(d.images || []);
  var left = imgs.filter(function (im) {
    return !im.complete;
  }).length;
  var done = function () {
    if (--left <= 0) whenFonts();
  };
  var whenFonts = function () {
    if (d.fonts && d.fonts.ready) d.fonts.ready.then(ready).catch(ready);
    else ready();
  };
  imgs.forEach(function (im) {
    if (im.complete) return;
    im.addEventListener("load", done);
    im.addEventListener("error", done);
  });
  if (left <= 0) whenFonts();
  setTimeout(ready, 2500); // 何かが返ってこなくても、必ず刷る
}
// 印刷が終わったら元に戻す（画面はそのまま・戻る操作が要らない）
window.addEventListener("afterprint", function () {
  $("printArea").innerHTML = "";
  if (_printTitle) {
    document.title = _printTitle;
    _printTitle = "";
  }
});
