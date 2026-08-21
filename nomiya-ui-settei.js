/* nomiya-ui-settei.js — 設定・データ・締め(レジの現金合わせ)
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
         設定・データ
         =================================================================== */
function renderSettings() {
  $("setStore").value = SETTINGS.store || "";
  $("setAddr").value = SETTINGS.addr || "";
  $("setTel").value = SETTINGS.tel || "";
  $("setInvoiceNo").value = SETTINGS.regNo || "";
  $("setBank").value = SETTINGS.bank || "";
  $("setRate")
    .querySelectorAll("[data-rate]")
    .forEach(function (b) {
      b.classList.toggle("on", Number(b.getAttribute("data-rate")) === Number(SETTINGS.rate));
    });
  $("logoPrev").innerHTML = SETTINGS.logo
    ? '<img src="' + esc(SETTINGS.logo) + '" alt="ロゴ">'
    : "なし";
  // 入れていない物を「外す」は、出すだけで迷わせる（大きさの行と同じ考え方）
  $("btnLogoClear").hidden = !SETTINGS.logo;
  $("setHankoSize")
    .querySelectorAll("[data-hs]")
    .forEach(function (b) {
      b.classList.toggle("on", b.getAttribute("data-hs") === (SETTINGS.hankoSize || "m"));
    });
  // 判子を入れていない店に、大きさだけ聞いても仕方がない
  $("rowHankoSize").style.display = SETTINGS.hanko ? "" : "none";
  $("btnHankoClear").hidden = !SETTINGS.hanko;
  $("hankoPrev").innerHTML = SETTINGS.hanko
    ? '<img src="' + esc(SETTINGS.hanko) + '" alt="判子">'
    : "なし";
  var alive = SALES.filter(function (s) {
    return !s.deletedAt;
  });
  $("dataInfo").textContent =
    "売上 " + alive.length + " 件。ファイルに書き出して手元にも残せます。";
  /* ★戻せない物を作らない★（指示役 2026-08-21）
     この画面を開いてから1回も書き出していないうちは「全部消す」を押せない。
     押せない理由は ボタンの中に書く（さっき決めた形と同じ）。 */
  gateBtn("btnWipe", !UI.exported, "全部消す", "先に書き出してください");
  renderPayRules();
  renderMasters();
}

/* お店の給料の決め方（バックの元・ツケの歩合・深夜割増・源泉）
         どれも既定は「今までどおり」。選んだ店だけ、その通りに計算する。 */
function renderPayRules() {
  var on = function (id, attr, val) {
    $(id)
      .querySelectorAll("[" + attr + "]")
      .forEach(function (b) {
        b.classList.toggle("on", b.getAttribute(attr) === String(val));
      });
  };
  var base = SETTINGS.backBase || "komi";
  on("ruleBackBase", "data-bb", base);
  on("ruleTsuke", "data-tk", SETTINGS.tsukeComm || "now");
  var tt = C.normalizeTerm(SETTINGS.tsukeTerm);
  $("ruleTsukeTerm").innerHTML = C.PAY_TERMS.map(function (t) {
    return (
      '<button class="chip chip-sm' +
      (t.key === tt.kind ? " on" : "") +
      '" type="button" data-tt="' +
      t.key +
      '">' +
      esc(t.label) +
      "</button>"
    );
  }).join("");
  $("ruleTsukeTerm")
    .querySelectorAll("[data-tt]")
    .forEach(function (b) {
      b.onclick = function () {
        SETTINGS.tsukeTerm = C.normalizeTerm({
          kind: b.getAttribute("data-tt"),
          n: $("ruleTsukeDays").value,
        });
        saveSettings();
        renderAll();
      };
    });
  var needN = tt.kind === "days" || tt.kind === "nextDay";
  $("ruleTsukeTermRow").style.display = needN ? "" : "none";
  $("ruleTsukeUnit").textContent =
    tt.kind === "days" ? "日後にもらう" : tt.kind === "nextDay" ? "日にもらう" : "";
  if (document.activeElement !== $("ruleTsukeDays")) $("ruleTsukeDays").value = tt.n || "";
  on("ruleNight", "data-np", SETTINGS.nightPay ? "1" : "0");
  on("ruleGensen", "data-gs", SETTINGS.gensen ? "1" : "0");
  $("ruleServiceRow").style.display = base === "service" ? "" : "none";
  $("ruleNightRow").style.display = SETTINGS.nightPay ? "" : "none";
  $("ruleGensenRow").style.display = SETTINGS.gensen ? "" : "none";
  if (document.activeElement !== $("ruleService"))
    $("ruleService").value = SETTINGS.serviceRate || "";
  if (document.activeElement !== $("ruleNightRate"))
    $("ruleNightRate").value = SETTINGS.nightRate == null ? "" : SETTINGS.nightRate;
  if (document.activeElement !== $("ruleGensenRate"))
    $("ruleGensenRate").value = SETTINGS.gensenRate == null ? "" : SETTINGS.gensenRate;
  // 事実だけを黄色で置く（止めない・こうしろとは言わない）
  var note = [];
  if (!SETTINGS.nightPay)
    note.push("⚠️ 深夜割増は付けていません。22時〜5時は2割5分以上の割増が要る決まりです。");
  if (!SETTINGS.gensen)
    note.push(
      "⚠️ 源泉は引いていません。ホステス等の報酬は、1回の支払いごとに" +
        "「5,000円×その支払いの計算期間の日数」を引いた残りに税率を掛けて引くのが本来です。"
    );
  // 引く店には、どう計算しているかを1行だけ出す（率は設定から取る＝書き写さない）
  $("gensenHow").textContent = SETTINGS.gensen
    ? "1回の支払いごとに「5,000円×その支払いの計算期間の日数（出勤日数ではなく暦の日数）」を" +
      "引いた残りに、下の率を掛けて引きます。日払いの人は1日ぶん、締めてまとめて払う人は" +
      "その区切りの日数ぶんです。"
    : "";
  $("gensenHow").style.display = SETTINGS.gensen ? "" : "none";
  $("ruleNote").innerHTML = note
    .map(function (t) {
      return "<div>" + esc(t) + "</div>";
    })
    .join("");
}

function onSaveSettings() {
  SETTINGS.store = $("setStore").value.trim();
  SETTINGS.addr = $("setAddr").value.trim();
  SETTINGS.tel = $("setTel").value.trim();
  SETTINGS.regNo = $("setInvoiceNo").value.trim();
  SETTINGS.bank = $("setBank").value.trim();
  saveSettings();
  renderAll();
  toast("✅ 設定を保存しました");
}

function onExport() {
  var data = {
    v: 1,
    exportedAt: new Date().toISOString(),
    sales: SALES,
    settings: SETTINGS,
    invoices: INVOICES,
    partners: PARTNERS,
    closes: CLOSES,
    staff: STAFF,
    works: WORKS,
    /* ★入金が入っていなかった★（2026-08-21 実測）＝「先に書き出してから消せ」と言うのに、
       戻せない物が残っていた。書き出す物と読み込む物は 必ず同じにする。 */
    payments: PAYMENTS,
  };
  UI.exported = true; // ★書き出したら「全部消す」の鍵が開く★
  var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  // ★渡し口は saveAsFile ただ1つ★（target=_blank が付く。ホーム画面から開いたアプリで
  //   同じ窓にファイルが開くと、戻る導線が無くて閉じ込められる）
  saveAsFile(blob, "uriage-" + todayIso() + ".json");
  renderSettings(); // ★鍵が開いた事を、その場で画面に出す★
  toast("💾 書き出しました");
}

function onImportFile(file) {
  var fr = new FileReader();
  fr.onload = function () {
    var data = null;
    try {
      data = JSON.parse(String(fr.result));
    } catch (e) {
      toast("⚠️ 読み込めないファイルです");
      return;
    }
    if (!data || !Array.isArray(data.sales)) {
      toast("⚠️ 売上のデータが入っていません");
      return;
    }
    openModal(
      "読み込む",
      '<div class="hint">今のデータに ' +
        data.sales.length +
        " 件を足しますか、入れ替えますか。</div>" +
        '<div class="btn-row" style="margin-top:14px">' +
        '<button class="btn btn-ghost" id="mdAdd">足す</button>' +
        '<button class="btn btn-ghost btn-danger" id="mdRep">入れ替える</button></div>'
    );
    // ★戻した行に「今」の更新時刻を押す＝クラウドの古い行に上書きされない。
    //   入れ替えのときは、ファイルに無い行に「消した印」を立てて クラウドにも伝える。
    $("mdAdd").onclick = function () {
      SALES = C.restorePlan(SALES, data.sales, "add");
      finishImport(data);
    };
    $("mdRep").onclick = function () {
      SALES = C.restorePlan(SALES, data.sales, "replace");
      finishImport(data);
    };
  };
  fr.readAsText(file);
}
function finishImport(data) {
  var nowIso = new Date().toISOString();
  if (data.settings && typeof data.settings === "object") {
    Object.keys(SETTINGS).forEach(function (k) {
      if (data.settings[k] != null) SETTINGS[k] = data.settings[k];
    });
    saveSettings();
  }
  if (Array.isArray(data.invoices)) {
    // 番号台帳は「先に採番した方」が正なので issuedAt は触らず、送るための時刻だけ押す
    INVOICES = data.invoices.map(function (x) {
      return Object.assign({}, x, { updatedAt: nowIso });
    });
    saveInvoices();
  }
  if (Array.isArray(data.staff)) {
    STAFF = data.staff.map(function (x) {
      return Object.assign({}, x, { updatedAt: nowIso });
    });
    saveStaff();
  }
  if (Array.isArray(data.works)) {
    WORKS = data.works.map(function (x) {
      return Object.assign({}, x, { updatedAt: nowIso });
    });
    saveWorks();
  }
  if (data.closes && typeof data.closes === "object") {
    var cl2 = {};
    Object.keys(data.closes).forEach(function (k) {
      cl2[k] = Object.assign({}, data.closes[k], { updatedAt: nowIso });
    });
    CLOSES = cl2;
    saveCloses();
  }
  if (Array.isArray(data.payments)) {
    PAYMENTS = data.payments.map(function (x) {
      return Object.assign({}, x, { updatedAt: nowIso });
    });
    savePayments();
  }
  if (data.partners && typeof data.partners === "object") {
    var pt = {};
    Object.keys(data.partners).forEach(function (k) {
      pt[k] = Object.assign({}, data.partners[k], { updatedAt: nowIso });
    });
    PARTNERS = pt;
    savePartners();
  }
  saveSales();
  closeModal();
  renderAll();
  toast("✅ 読み込みました");
}

function onWipe() {
  /* ★押す前に「何が」「いくつ」消えるかを数で見せる★（指示役 2026-08-21）
     ＝「全部消す」と書いてあるのに、消えない物が在る（スタッフ・出勤・入金・締め）。
     数と、残る物を はっきり出す。 */
  var nSales = SALES.filter(function (s) {
    return !s.deletedAt;
  }).length;
  var nPt = Object.keys(PARTNERS).filter(function (k) {
    return !PARTNERS[k].deletedAt;
  }).length;
  var nInv = (INVOICES || []).length;
  var nStaff = C.aliveStaff(STAFF).length;
  var nWork = (WORKS || []).filter(function (w) {
    return !w.deletedAt;
  }).length;
  var nPay = (PAYMENTS || []).filter(function (p) {
    return !p.deletedAt;
  }).length;
  openModal(
    "全部消す",
    '<div class="hint">★消えるもの★<br>売上 <b>' +
      nSales +
      "</b> 件 ／ 宛先（会社） <b>" +
      nPt +
      "</b> 件 ／ 請求書番号 <b>" +
      nInv +
      /* ★2026-08-22 指示役 裁定1-③：窓の言葉を実態に合わせる★
         押す前に1回 書き出させている＝そのファイルを読み込めば戻せる。
         「取り消せません」と書くと、戻せる物まで諦めさせてしまう。 */
      "</b> 件<br>クラウドの分も消えます。<b>この画面からは戻せません。</b><br>" +
      "いま書き出したファイルを「読み込む」で戻せます。</div>" +
      '<div class="hint">残るもの：スタッフ ' +
      nStaff +
      " 人 ／ 出勤 " +
      nWork +
      " 件 ／ 入金 " +
      nPay +
      " 件 ／ レジ締め ／ お店の情報</div>" +
      '<div class="btn-right" style="margin-top:14px">' +
      '<button class="btn btn-ghost btn-sm" id="mdNo">やめる</button>' +
      '<button class="btn btn-ghost btn-danger btn-sm" id="mdYes">全部消す</button></div>'
  );
  $("mdNo").onclick = closeModal;
  $("mdYes").onclick = function () {
    // クラウドにも「消した」を伝える＝端末だけ空にすると、次の同期で戻ってくる
    var nowIso = new Date().toISOString();
    SALES = SALES.map(function (s) {
      return Object.assign({}, s, { deletedAt: nowIso, updatedAt: nowIso });
    });
    Object.keys(PARTNERS).forEach(function (k) {
      PARTNERS[k] = Object.assign({}, PARTNERS[k], {
        deletedAt: nowIso,
        updatedAt: nowIso,
      });
    });
    INVOICES = [];
    saveSales();
    savePartners();
    saveInvoices();
    closeModal();
    renderAll();
    toast("🗑 消しました");
  };
}

/* ===================================================================
         締め（レジの現金合わせ）
         ─ 閉店後の本業。ここが合わないと店は電卓を手放さない。
           合わない日は必ずあるので、差額は隠さずそのまま出す。
         =================================================================== */
function closeOf(ymd) {
  return CLOSES[ymd] || null;
}
// 画面に入れる「下書き」（保存前の入力もここに入れて計算する）
function closeInput(ymd) {
  var c = closeOf(ymd);
  var carried = C.carryOver(CLOSES, ymd);
  return {
    ymd: ymd,
    opening: c ? c.opening : carried == null ? 0 : carried,
    outs: c ? c.outs : [],
    counted: c ? c.counted : "",
    memo: c ? c.memo : "",
    closedAt: c ? c.closedAt : null,
  };
}
function renderClosePeriod() {
  var el = $("periodClose");
  el.innerHTML =
    '<button class="period-arrow" type="button" data-cmv="-1">◀</button>' +
    '<span class="period-lb">' +
    esc(C.jpDate(UI.closeYmd)) +
    "（" +
    esc(C.weekday(UI.closeYmd)) +
    "）</span>" +
    '<button class="period-arrow" type="button" data-cmv="1">▶</button>';
  el.querySelectorAll("[data-cmv]").forEach(function (b) {
    b.onclick = function () {
      var d = new Date(
        +UI.closeYmd.slice(0, 4),
        +UI.closeYmd.slice(5, 7) - 1,
        +UI.closeYmd.slice(8, 10) + +b.getAttribute("data-cmv")
      );
      setWorkDay(C.toIso(d)); // 入力タブの日も一緒に動く（見ている日は1つ）
    };
  });
}
function renderClose() {
  if (!UI.closeYmd) UI.closeYmd = todayIso();
  renderClosePeriod();
  var inp = closeInput(UI.closeYmd);
  // 入力中の値を優先（打ち込んでいる途中で描き直しても消えないように）
  if (document.activeElement !== $("clOpen")) $("clOpen").value = inp.opening;
  if (document.activeElement !== $("clCount")) $("clCount").value = inp.counted;
  if (document.activeElement !== $("clMemo")) $("clMemo").value = inp.memo;
  var d = C.closeDraft(
    SALES,
    UI.closeYmd,
    {
      opening: $("clOpen").value === "" ? 0 : Number($("clOpen").value),
      outs: inp.outs,
      counted: $("clCount").value,
      closedAt: inp.closedAt,
    },
    PAYMENTS
  );
  $("clCash").textContent = C.yen(d.cashSales);
  $("clColl").textContent = C.yen(d.collected);
  $("clOut").textContent = d.outTotal ? "−" + C.yen(d.outTotal) : "¥0";
  $("clShould").textContent = C.yen(d.should);
  var dv = $("clDiff");
  if (d.diff == null) {
    dv.textContent = "—";
    dv.className = "cl-v";
  } else {
    dv.textContent = (d.diff < 0 ? "−" : d.diff > 0 ? "＋" : "") + C.yen(Math.abs(d.diff));
    dv.className = "cl-v" + (d.diff < 0 ? " cl-minus" : d.diff > 0 ? " cl-plus" : "");
  }
  // 締めた日は入力を閉じる（触ったら締め直し）
  var locked = !!d.closedAt;
  $("scr-close").classList.toggle("cl-locked", locked);
  ["clOpen", "clCount", "clMemo"].forEach(function (id) {
    $(id).readOnly = locked;
  });
  /* ★数えた実数を入れるまでは押せない★（押してから「入れてください」は遅い） */
  gateBtn(
    "btnClose",
    !locked && String($("clCount").value).trim() === "",
    locked ? "締め直す" : "この日を締める",
    "数えた実数を入れてください"
  );
  $("clState").textContent = !locked
    ? "数えた実数を入れて「この日を締める」を押すと、この日は動かなくなります。"
    : d.needsRedo
      ? "⚠️ 締めたあとに売上を直しました。もう一度締め直してください（" +
        hhmm(d.closedAt) +
        " に締め）"
      : "✅ " + hhmm(d.closedAt) + " に締めました。";
  // 担当の付け忘れ（付け忘れると、その分の歩合が付かないので教える）
  var noStaff = SALES.filter(function (s) {
    return !s.deletedAt && s.date === UI.closeYmd && !s.staff;
  });
  var anyRate = C.aliveStaff(STAFF).some(function (st) {
    return st.rate > 0 && C.staffUses(st, "rate");
  });
  // ★締めたあとに、その日の売上が動いていたら必ず出す（黙って差額が変わらないように）
  var movedN = C.movedAfterCloseCount(SALES, UI.closeYmd, inp);
  $("clMoved").textContent = movedN
    ? "⚠️ 締めたあとに、この日の売上が " +
      movedN +
      " 件 動いています。あるべき額と差額が変わっています。数え直して締め直してください"
    : "";
  $("clNoStaff").textContent =
    anyRate && noStaff.length
      ? "⚠️ 担当が入っていない売上が " +
        noStaff.length +
        " 件あります。このままだと、その分の歩合が付きません（一覧からタップで直せます）"
      : "";
  // 出金の一覧
  drawOuts("clOuts", d.outs, UI.closeYmd, locked);
  // 現金以外
  var o = d.other;
  $("clOther").innerHTML =
    '<table class="sum-tbl"><tbody>' +
    [
      ["クレジット", o.credit],
      ["電子決済", o.paypay],
      ["請求書送り", o.invoice],
      ["ツケ（この日の分）", o.tsuke],
    ]
      .map(function (r) {
        return "<tr><td>" + esc(r[0]) + "</td><td>" + C.yen(r[1]) + "</td></tr>";
      })
      .join("") +
    "</tbody></table>";
  $("closeSheets").innerHTML = closeSheetHtml(d);
  fitSheets("closeScale", "closeSheets");
}

// 出金の追加・修正
/** ★出金の一覧は ここ1か所で描く★（締めタブと入力タブの両方が呼ぶ）
 *  2か所に書くと、必ずどちらかが古くなる。押した先も同じ窓（openOut）。 */
function drawOuts(boxId, outs, ymd, locked) {
  var box = $(boxId);
  if (!box) return;
  box.innerHTML = outs.length
    ? outs
        .map(function (o) {
          return (
            '<div class="li" data-out="' +
            esc(o.id) +
            '"><div class="li-main"><div class="li-nm">' +
            esc(C.outKindLabel(o.kind)) +
            (o.staff ? "　" + esc(o.staff) : "") +
            '</div><div class="li-sub">' +
            esc(o.memo || "") +
            '</div></div><div class="li-amt">−' +
            C.yen(o.amount) +
            "</div></div>"
          );
        })
        .join("")
    : '<div class="empty">ありません。買い出し・送り・日払いで金庫から出したら足してください。</div>';
  box.querySelectorAll("[data-out]").forEach(function (el) {
    el.onclick = function () {
      if (locked) {
        toast("締めた日です。直すなら「締め直す」を押してください");
        return;
      }
      openOut(el.getAttribute("data-out"), ymd);
    };
  });
}

/** 出金の窓。★どの日に付くかを、押す前に窓の中に出す★
 *  ymd を渡すと その日に付ける（入力タブから開いたとき）。渡さなければ 締めタブの日。 */
function openOut(id, ymd) {
  /* ★付ける日は1つ★＝先に締めの日を合わせてから開く。
     ここを合わせないと、入力タブで 8/21 を見ているのに 締めタブの日（8/19）に付く。 */
  if (ymd && ymd !== UI.closeYmd) {
    UI.closeYmd = ymd;
    renderClosePeriod();
    renderClose();
  }
  var inp = closeInput(UI.closeYmd);
  var cur =
    inp.outs.filter(function (x) {
      return x.id === id;
    })[0] || null;
  openModal(
    (C.isIsoDate(UI.closeYmd)
      ? C.mdShort(UI.closeYmd) + "（" + C.weekday(UI.closeYmd) + "）の "
      : "") + (cur ? "出金を直す" : "出金を足す"),
    '<div class="frow"><span class="flabel">種類</span><div class="chips" id="outKind">' +
      C.OUT_KINDS.map(function (k) {
        return (
          '<button class="chip chip-sm" type="button" data-ok="' +
          k.key +
          '">' +
          esc(k.label) +
          "</button>"
        );
      }).join("") +
      "</div></div>" +
      '<div class="frow"><span class="flabel">金額</span>' +
      '<input class="finput" type="number" inputmode="numeric" id="outAmt" value="' +
      esc(cur ? cur.amount : "") +
      '"></div>' +
      '<div class="frow"><span class="flabel">誰に（日払いのとき・任意）</span>' +
      '<input class="finput" id="outStaff" value="' +
      esc(cur ? cur.staff : "") +
      '"></div>' +
      '<div class="frow"><span class="flabel">メモ（任意）</span>' +
      '<input class="finput" id="outMemo" value="' +
      esc(cur ? cur.memo : "") +
      '" placeholder="例）氷とおしぼり"></div>' +
      '<div class="err" id="outErr"></div>' +
      '<div style="margin-top:12px"><button class="btn btn-primary" id="outOk">保存する</button></div>' +
      (cur
        ? '<div class="btn-right" style="margin-top:10px">' +
          '<button class="btn btn-ghost btn-danger btn-sm" id="outDel">この出金を消す</button></div>'
        : "")
  );
  var kind = cur ? cur.kind : "buy";
  var syncKind = function () {
    $("outKind")
      .querySelectorAll("[data-ok]")
      .forEach(function (b) {
        b.classList.toggle("on", b.getAttribute("data-ok") === kind);
        b.onclick = function () {
          kind = b.getAttribute("data-ok");
          syncKind();
        };
      });
  };
  syncKind();
  $("outOk").onclick = function () {
    var amt = $("outAmt").value;
    if (amt === "" || !isFinite(Number(amt)) || Number(amt) <= 0) {
      $("outErr").textContent = "金額を入れてください";
      return;
    }
    var o = C.normalizeOut({
      id: cur ? cur.id : "",
      kind: kind,
      amount: amt,
      memo: $("outMemo").value,
      staff: $("outStaff").value,
    });
    var outs = inp.outs.filter(function (x) {
      return x.id !== o.id;
    });
    outs.push(o);
    writeClose({ outs: outs });
    closeModal();
    renderClose();
    renderDay(); // 入力タブの「この日の出金」も出し直す
    toast("✅ 出金を入れました");
  };
  if ($("outDel")) {
    $("outDel").onclick = function () {
      writeClose({
        outs: inp.outs.filter(function (x) {
          return x.id !== cur.id;
        }),
      });
      closeModal();
      renderClose();
      renderDay();
      toast("🗑 出金を消しました");
    };
  }
}

// 画面の値を締めに書き込む（1か所に集約）
function writeClose(patch) {
  var inp = closeInput(UI.closeYmd);
  var next = C.normalizeClose(
    Object.assign(
      {
        ymd: UI.closeYmd,
        opening: $("clOpen").value === "" ? 0 : Number($("clOpen").value),
        outs: inp.outs,
        counted: $("clCount").value,
        memo: $("clMemo").value,
        closedAt: inp.closedAt,
      },
      patch || {}
    )
  );
  CLOSES[UI.closeYmd] = next;
  saveCloses();
  return next;
}

/* 締めのA4（日報） */
function closeSheetHtml(d) {
  var rows = d.outs.length
    ? d.outs
        .map(function (o) {
          return (
            "<tr><td>" +
            esc(C.outKindLabel(o.kind)) +
            "</td><td>" +
            esc(o.staff || o.memo || "") +
            '</td><td class="c-a">' +
            C.comma(o.amount) +
            "</td></tr>"
          );
        })
        .join("")
    : '<tr><td colspan="3" class="c-mid">なし</td></tr>';
  var line = function (l, v, cls) {
    return "<tr><th>" + esc(l) + '</th><td class="c-a ' + (cls || "") + '">' + v + "</td></tr>";
  };
  return (
    '<div class="sheet cl-sheet">' +
    '<div class="sh-head"><div class="sh-title">日報（レジ締め）</div>' +
    '<div class="sh-meta">' +
    esc(SETTINGS.store || "") +
    "　" +
    esc(C.jpDate(d.ymd)) +
    "（" +
    esc(C.weekday(d.ymd)) +
    "）</div></div>" +
    '<table class="cl-p2"><tbody>' +
    line("釣銭（開けたとき）", C.comma(d.opening)) +
    line("現金の売上", C.comma(d.cashSales)) +
    line("現金で回収したツケ", C.comma(d.collected)) +
    line("出金", "−" + C.comma(d.outTotal)) +
    line("あるべき額", C.comma(d.should), "c-bold") +
    line("数えた実数", d.counted == null ? "—" : C.comma(d.counted)) +
    line("差額", d.diff == null ? "—" : (d.diff > 0 ? "+" : "") + C.comma(d.diff), "c-bold") +
    "</tbody></table>" +
    '<div class="cl-p3"><div class="cl-cap">出金の内訳</div>' +
    '<table class="cl-p4"><tbody>' +
    rows +
    "</tbody></table></div>" +
    '<div class="cl-p3"><div class="cl-cap">現金以外（金庫に入らない分）</div>' +
    '<table class="cl-p4"><tbody>' +
    '<tr><td>クレジット</td><td></td><td class="c-a">' +
    C.comma(d.other.credit) +
    "</td></tr>" +
    '<tr><td>電子決済</td><td></td><td class="c-a">' +
    C.comma(d.other.paypay) +
    "</td></tr>" +
    '<tr><td>請求書送り</td><td></td><td class="c-a">' +
    C.comma(d.other.invoice) +
    "</td></tr>" +
    '<tr><td>ツケ</td><td></td><td class="c-a">' +
    C.comma(d.other.tsuke) +
    "</td></tr>" +
    '<tr><td class="c-bold">この日の売上合計</td><td></td><td class="c-a c-bold">' +
    C.comma(d.salesTotal) +
    "</td></tr>" +
    "</tbody></table></div>" +
    ($("clMemo").value
      ? '<div class="cl-p3"><div class="cl-cap">ひとこと</div><div class="cl-memo">' +
        esc($("clMemo").value) +
        "</div></div>"
      : "") +
    '<div class="cl-sign">' +
    (d.closedAt ? "締め " + esc(C.jpDate(d.ymd)) + " " + hhmm(d.closedAt) : "未締め") +
    "　　確認印　　　　</div>" +
    "</div>"
  );
}
