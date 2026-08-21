/* nomiya-ui-boot.js — 画面切り替え・全体描画・起動
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
         画面切り替え・全体描画
         =================================================================== */
/* 集計・税理士の紙は「一覧」の中に入った。前の名前(sum/tax)で呼ばれても迷子にしない。
         下ナビの「一覧」を押したときは、いつでも一覧そのものに戻す（探させない）。 */
/* ★画面を変えたら、必ずその画面の一番上から見せる。
         前の画面の位置のまま残ると、途中から始まって「スクロールがおかしい」ことになる。 */
function toTop() {
  window.scrollTo(0, 0);
}
/* ★他のアプリから戻ってきたとき・向きを変えたときに、位置を測り直させる。
         iOSはここで上の余白を測り違えることがあり、ヘッダーの上に空白が残る。
         同じ位置に置き直すだけ＝見ている場所は動かない。 */
function resnap() {
  var y = window.scrollY;
  window.scrollTo(0, y < 0 ? 0 : y);
}
window.addEventListener("pageshow", resnap);
window.addEventListener("orientationchange", function () {
  setTimeout(resnap, 250);
});
document.addEventListener("visibilitychange", function () {
  if (!document.hidden) setTimeout(resnap, 50);
});
function showScreen(name) {
  /* ★一覧＝見て直す所／集計＝紙を作る所★（司さん 2026-08-21 で分けた）
     「集計」「税理士の紙」は 集計タブの中の面。 */
  if (name === "tax") {
    UI.sumSeg = "tax";
    name = "sum";
  } else if (name === "ledger") {
    UI.sumSeg = "ledger";
    name = "sum";
  }
  if (name !== "set") UI.backTo = name;
  UI.screen = name;
  ["input", "list", "sum", "inv", "close", "pay", "set"].forEach(function (n) {
    $("scr-" + n).classList.toggle("active", n === name);
  });
  document.querySelectorAll(".nav-item").forEach(function (b) {
    b.classList.toggle("active", b.getAttribute("data-scr") === name);
  });
  $("btnGear").classList.toggle("on", name === "set");
  /* ★請求書の画面に来たら、明朝(Noto Serif JP)を読み始める★
     明朝を使うのは ★請求書の紙だけ★（2026-08-08、computed font-family で実測）。
     売上帳・集計・税理士の紙・締め・給与の紙は明朝を1文字も使わないので、
     ここで読むと ★使いもしない 61KB＋487KB を取ることになる★。だから請求書だけ。
     起動の <link> から外してあるぶん（-61KB）は、ここで先に読み始めて取り返す
     ＝押したときには もう届いている。
     押した時点でまだ届いていなくても buildPaperPdf が届くまで待つので、
     ★紙がゴシックのまま出ることはない★。 */
  if (name === "inv" && typeof addSerifCss === "function") addSerifCss();
  syncPanes();
  renderAll();
  fitAll();
  renderAcct();
  toTop();
}
// 画面の中の切替（一覧＝一覧/集計/税理士の紙、設定＝自社情報/会社/従業員/商品）
function syncPanes() {
  [
    ["sumSeg", "data-mseg", UI.sumSeg, ["ledger", "sum", "tax"]],
    ["invSeg", "data-iseg", UI.invSeg, ["inv", "due", "paid"]],
    ["setSeg", "data-sseg", UI.setSeg, ["self", "partner", "staff", "item", "acct"]],
  ].forEach(function (x) {
    $(x[0])
      .querySelectorAll("[" + x[1] + "]")
      .forEach(function (b) {
        b.classList.toggle("on", b.getAttribute(x[1]) === x[2]);
      });
    x[3].forEach(function (n) {
      $("pane-" + n).classList.toggle("active", n === x[2]);
    });
  });
}
function setSumSeg(seg) {
  UI.sumSeg = seg;
  syncPanes();
  fitAll();
  toTop();
}
function showSettings(seg) {
  UI.setSeg = seg || UI.setSeg;
  showScreen("set");
}
// 歯車＝押すと設定、もう一度押すとさっきまでの画面に戻る
function toggleGear() {
  if (UI.screen === "set") showScreen(UI.backTo || "input");
  else showScreen("set");
}

/* ついた人（ヘルプ・場内・同伴など）。1つの会計に何人でも足せる。
         ここに入れておけば、給料の「ヘルプ○回」を手で数えなくてよくなる。 */
function staffNames() {
  var names = C.aliveStaff(STAFF).map(function (st) {
    return st.name;
  });
  SALES.forEach(function (s) {
    if (s.staff && names.indexOf(s.staff) < 0) names.push(s.staff);
    (s.crew || []).forEach(function (c) {
      if (c.name && names.indexOf(c.name) < 0) names.push(c.name);
    });
  });
  return names;
}
function crewRowHtml(c) {
  var names = staffNames();
  return (
    '<div class="f2 crew-row" style="margin-bottom:6px">' +
    '<select class="fselect crew-who">' +
    '<option value="">（誰か選ぶ）</option>' +
    names
      .map(function (n) {
        return (
          '<option value="' +
          esc(n) +
          '"' +
          (c && c.name === n ? " selected" : "") +
          ">" +
          esc(n) +
          "</option>"
        );
      })
      .join("") +
    "</select>" +
    '<select class="fselect crew-role">' +
    BACK_KINDS()
      .map(function (k) {
        return (
          '<option value="' +
          esc(k.key) +
          '"' +
          (c && c.role === k.key ? " selected" : "") +
          ">" +
          esc(k.label) +
          "</option>"
        );
      })
      .join("") +
    "</select>" +
    '<button class="btn btn-ghost btn-sm crew-del" type="button" style="flex:0 0 44px">✕</button>' +
    "</div>"
  );
}
function bindCrewRows() {
  $("crewList")
    .querySelectorAll(".crew-del")
    .forEach(function (b) {
      b.onclick = function () {
        b.closest(".crew-row").remove();
      };
    });
}
function setCrew(list) {
  $("crewList").innerHTML = (list || []).map(crewRowHtml).join("");
  bindCrewRows();
}
function readCrew() {
  var out = [];
  $("crewList")
    .querySelectorAll(".crew-row")
    .forEach(function (row) {
      var name = row.querySelector(".crew-who").value;
      var role = row.querySelector(".crew-role").value;
      if (name) out.push({ name: name, role: role });
    });
  return out;
}

// 担当（誰の客か）の選び先。いま居る従業員から選ぶ。
// 消した人でも、過去の売上に付いている名前は選択肢に残す（直せなくならないように）。
function syncStaffSelect() {
  var sel = $("inStaff");
  var keep = sel.value;
  var names = C.aliveStaff(STAFF).map(function (st) {
    return st.name;
  });
  SALES.forEach(function (s) {
    if (s.staff && names.indexOf(s.staff) < 0) names.push(s.staff);
  });
  sel.innerHTML =
    '<option value="">（担当なし）</option>' +
    names
      .map(function (n) {
        return '<option value="' + esc(n) + '">' + esc(n) + "</option>";
      })
      .join("");
  sel.value = keep;
}

function renderAll() {
  // 名前の候補＝「前に打った名前」＋「登録した宛先の会社名」。
  // 宛先を登録しただけ（まだ売上が無い）の相手も候補に出るようにする。
  var cand = C.nameSuggestions(SALES, 50).map(function (n) {
    return n.name;
  });
  C.partnerRecent(PARTNERS).forEach(function (x) {
    if (cand.indexOf(x.name) < 0) cand.push(x.name);
  });
  $("nameList").innerHTML = cand
    .map(function (n) {
      return '<option value="' + esc(n) + '"></option>';
    })
    .join("");
  // 宛先を足した直後でも、入力の相手の一覧をその場で作り直す
  syncNameField();
  syncStaffSelect();
  renderPeriodBars();
  renderDay();
  renderList();
  renderLedger();
  renderSum();
  renderTax();
  renderInv();
  renderDue();
  renderPaidLog();
  renderClose();
  renderPay();
  renderSettings();
}

/* ===================================================================
         起動
         =================================================================== */
function init() {
  $("sheetCss").textContent = SHEET_CSS;
  load();
  // 控えが壊れていたら、開いたときに必ず言う（黙って直さない）
  if (BROKEN_LOCAL) {
    setTimeout(function () {
      toast("⚠️ 端末の控えが壊れていたので読み直しました。数字が足りなければ知らせてください");
    }, 400);
  }
  // 前に入れた判子の余白も切る（一度だけ。切る所が無ければ何もしない）
  trimHankoOnce();
  var t = todayIso();
  UI.period.ym = C.ymOf(t);
  UI.invYm = C.ymOf(t);
  UI.closeYmd = t;
  UI.payYmd = t;
  $("inDate").value = t;

  buildInputChips();
  buildListFilters();
  syncInputChips();

  $("btnToday").onclick = function () {
    setWorkDay(todayIso());
  };
  $("inDate").onchange = function () {
    setWorkDay($("inDate").value);
  };
  $("inDate").oninput = syncDateNote;
  // 金額を打つと印紙の注意が変わるので、入力に合わせて注記を出し直す。
  // ★赤くなった欄は、直した時点で赤を消す（押し直すまで赤いままにしない）
  $("inAmount").oninput = function () {
    syncInputChips();
    $("inAmount").classList.remove("ng");
  };
  ["inDate", "inName", "inPeople"].forEach(function (id) {
    $(id).addEventListener("input", function () {
      $(id).classList.remove("ng");
    });
  });
  $("btnSave").onclick = onSave;
  $("btnDelete").onclick = onDelete;
  $("btnCancelEdit").onclick = function () {
    clearForm(true);
  };

  /* ★紙の名前は「いま その画面が見ている期間」から作る★（指示役 2026-08-22 裁定2）
     期間を持っているのは押した側なので、押した側が渡す（紙の名前で場合分けしない）。 */
  $("btnPrintList").onclick = function () {
    printSheets("listSheets", "売上帳", periodLabel());
  };
  $("btnXlsxList").onclick = exportListXlsx;
  $("sumRecTabs")
    .querySelectorAll("[data-srec]")
    .forEach(function (b) {
      b.onclick = function () {
        UI.sumRec = b.getAttribute("data-srec");
        renderSum();
      };
    });
  $("taxRecTabs")
    .querySelectorAll("[data-trec]")
    .forEach(function (b) {
      b.onclick = function () {
        UI.taxRec = b.getAttribute("data-trec");
        renderTax();
        fitSheets("taxScale", "taxSheets");
      };
    });
  $("taxNames")
    .querySelectorAll("[data-tn]")
    .forEach(function (b) {
      b.onclick = function () {
        SETTINGS.taxNames = b.getAttribute("data-tn") === "1";
        saveSettings();
        renderTax();
      };
    });
  $("btnPrintTax").onclick = function () {
    printSheets("taxSheets", "売上報告書", periodLabel());
  };
  $("btnPrintInv").onclick = function () {
    printSheets("invSheets", "請求書", C.jpMonth(UI.invYm));
  };

  ["clOpen", "clCount", "clMemo"].forEach(function (id) {
    $(id).oninput = function () {
      writeClose({});
      renderClose();
    };
  });
  /* ★入力タブからの出金★＝入力タブで選んでいる日に付ける（窓の題に日付が出る） */
  $("btnInOutAdd").onclick = function () {
    var d = $("inDate").value;
    if (!C.isIsoDate(d)) {
      toast("先に日付を入れてください");
      return;
    }
    openOut("", d);
  };
  $("btnOutAdd").onclick = function () {
    if (closeInput(UI.closeYmd).closedAt) {
      toast("締めた日です。直すなら「締め直す」を押してください");
      return;
    }
    openOut("");
  };
  $("btnClose").onclick = function () {
    var inp = closeInput(UI.closeYmd);
    if (inp.closedAt) {
      writeClose({ closedAt: null });
      renderClose();
      toast("鍵を外しました。直したらもう一度締めてください");
      return;
    }
    if ($("clCount").value === "") {
      toast("⚠️ 数えた実数を入れてください");
      return;
    }
    writeClose({ closedAt: new Date().toISOString() });
    renderClose();
    toast("✅ 締めました");
  };
  $("btnItemAdd").onclick = function () {
    openItem("");
  };
  $("btnCrewAdd").onclick = function () {
    $("crewList").insertAdjacentHTML("beforeend", crewRowHtml(null));
    bindCrewRows();
  };
  $("btnKindAdd").onclick = function () {
    openKind("");
  };
  $("btnStaffAdd").onclick = function () {
    openStaff("");
  };
  $("btnWorkAdd").onclick = function () {
    openWork("");
  };
  $("btnPrintPay").onclick = function () {
    printSheets("paySheets", "給与一覧", C.jpDate(UI.payYmd));
  };
  $("btnPrintLog").onclick = function () {
    printSheets("logSheets", "渡した記録", C.jpDate(UI.payYmd));
  };
  $("btnPrintCast").onclick = function () {
    printSheets("castSheets", "給与明細", C.jpDate(UI.payYmd));
  };
  $("btnCastClose").onclick = function () {
    $("castBox").style.display = "none";
    $("castSheets").innerHTML = "";
  };
  $("btnPrintClose").onclick = function () {
    printSheets("closeSheets", "日報", C.jpDate(UI.closeYmd));
  };
  $("btnPartners").onclick = function () {
    openPartnerList();
  };
  $("inNameSel").onchange = function () {
    var v = $("inNameSel").value;
    if (v === "__new") {
      $("inNameSel").value = UI.inName || "";
      openPartner("", function (nm) {
        UI.inName = nm;
        showScreen("input");
        syncNameField();
      });
      return;
    }
    UI.inName = v;
  };
  $("invTpl")
    .querySelectorAll("[data-tpl]")
    .forEach(function (b) {
      b.onclick = function () {
        SETTINGS.tpl = b.getAttribute("data-tpl");
        saveSettings();
        renderInv();
        fitSheets("invScale", "invSheets");
      };
    });
  $("invName").onchange = function () {
    UI.invName = $("invName").value;
    renderInv();
    fitSheets("invScale", "invSheets");
  };
  $("setHankoSize")
    .querySelectorAll("[data-hs]")
    .forEach(function (b) {
      b.onclick = function () {
        SETTINGS.hankoSize = b.getAttribute("data-hs");
        saveSettings();
        renderAll();
        fitSheets("invScale", "invSheets");
      };
    });
  $("btnPaid").onclick = function () {
    if (!UI.invName) {
      toast("請求する相手がいません");
      return;
    }
    var r = invRange();
    askPay(UI.invName);
  };

  $("setRate")
    .querySelectorAll("[data-rate]")
    .forEach(function (b) {
      b.onclick = function () {
        SETTINGS.rate = Number(b.getAttribute("data-rate"));
        saveSettings();
        renderSettings();
        renderInv();
      };
    });
  // 判子の画像（白い背景は hanko.js で自動的に抜く。処理に失敗しても元画像で載せる）
  $("invFont")
    .querySelectorAll("[data-font]")
    .forEach(function (b) {
      b.onclick = function () {
        SETTINGS.font = b.getAttribute("data-font");
        saveSettings();
        renderInv();
      };
    });
  $("invLogoPos")
    .querySelectorAll("[data-lpos]")
    .forEach(function (b) {
      b.onclick = function () {
        SETTINGS.logoPos = b.getAttribute("data-lpos");
        saveSettings();
        renderInv();
      };
    });
  $("btnLogo").onclick = function () {
    $("fileLogo").click();
  };
  $("fileLogo").onchange = function () {
    var f = this.files && this.files[0];
    this.value = "";
    if (!f) return;
    var fr = new FileReader();
    fr.onload = function () {
      SETTINGS.logo = String(fr.result);
      saveSettings();
      renderSettings();
      renderInv();
      toast("✅ ロゴを入れました");
    };
    fr.readAsDataURL(f);
  };
  $("btnLogoClear").onclick = function () {
    SETTINGS.logo = "";
    saveSettings();
    renderSettings();
    renderInv();
    toast("ロゴを外しました");
  };
  $("btnHanko").onclick = function () {
    $("fileHanko").click();
  };
  $("fileHanko").onchange = function () {
    var f = this.files && this.files[0];
    this.value = "";
    if (!f) return;
    var fr = new FileReader();
    fr.onload = function () {
      var raw = String(fr.result);
      var done = function (url) {
        SETTINGS.hanko = url;
        saveSettings();
        renderSettings();
        renderInv();
        toast("✅ 判子を入れました");
      };
      if (window.HankoTool) {
        window.HankoTool.process(raw, { mode: "auto" })
          .then(function (r) {
            done(r.dataURL || raw);
          })
          .catch(function () {
            done(raw);
          });
      } else {
        done(raw);
      }
    };
    fr.readAsDataURL(f);
  };
  $("btnHankoClear").onclick = function () {
    SETTINGS.hanko = "";
    saveSettings();
    renderSettings();
    renderInv();
    toast("判子を外しました");
  };
  $("btnSaveSet").onclick = onSaveSettings;
  $("btnExport").onclick = onExport;
  $("btnImport").onclick = function () {
    $("fileImport").click();
  };
  $("fileImport").onchange = function () {
    if (this.files && this.files[0]) onImportFile(this.files[0]);
    this.value = "";
  };
  $("btnWipe").onclick = onWipe;
  $("btnLogout").onclick = doLogout;
  $("btnSyncNow").onclick = function () {
    syncNow(true);
  };
  window.addEventListener("online", function () {
    renderAcct();
    syncNow(false);
  });
  window.addEventListener("offline", renderAcct);

  document.querySelectorAll(".nav-item").forEach(function (b) {
    b.onclick = function () {
      showScreen(b.getAttribute("data-scr"));
    };
  });
  $("btnGear").onclick = toggleGear;
  $("stopOut").onclick = doLogout;
  $("btnAdmin").onclick = function () {
    location.href = "castally-admin.html";
  };
  $("sumSeg")
    .querySelectorAll("[data-mseg]")
    .forEach(function (b) {
      b.onclick = function () {
        setSumSeg(b.getAttribute("data-mseg"));
      };
    });
  $("invSeg")
    .querySelectorAll("[data-iseg]")
    .forEach(function (b) {
      b.onclick = function () {
        UI.invSeg = b.getAttribute("data-iseg");
        syncPanes();
        fitAll();
        toTop();
      };
    });
  $("setSeg")
    .querySelectorAll("[data-sseg]")
    .forEach(function (b) {
      b.onclick = function () {
        UI.setSeg = b.getAttribute("data-sseg");
        syncPanes();
        toTop();
      };
    });
  $("btnPartnerNew").onclick = function () {
    openPartner("");
  };
  $("ruleTsukeDays").oninput = function () {
    SETTINGS.tsukeTerm = C.normalizeTerm({
      kind: C.normalizeTerm(SETTINGS.tsukeTerm).kind,
      n: $("ruleTsukeDays").value,
    });
    saveSettings();
    renderAll();
  };
  // お店の給料の決め方。押した瞬間に決まる（保存ボタンを探させない）
  [
    ["ruleBackBase", "data-bb", "backBase"],
    ["ruleTsuke", "data-tk", "tsukeComm"],
  ].forEach(function (x) {
    $(x[0])
      .querySelectorAll("[" + x[1] + "]")
      .forEach(function (b) {
        b.onclick = function () {
          SETTINGS[x[2]] = b.getAttribute(x[1]);
          saveSettings();
          renderAll();
        };
      });
  });
  [
    ["ruleNight", "data-np", "nightPay"],
    ["ruleGensen", "data-gs", "gensen"],
  ].forEach(function (x) {
    $(x[0])
      .querySelectorAll("[" + x[1] + "]")
      .forEach(function (b) {
        b.onclick = function () {
          SETTINGS[x[2]] = b.getAttribute(x[1]) === "1";
          saveSettings();
          renderAll();
        };
      });
  });
  [
    ["ruleService", "serviceRate"],
    ["ruleNightRate", "nightRate"],
    ["ruleGensenRate", "gensenRate"],
  ].forEach(function (x) {
    $(x[0]).onchange = function () {
      var v = $(x[0]).value.trim();
      SETTINGS[x[1]] = v === "" ? (x[1] === "serviceRate" ? 0 : null) : Number(v);
      saveSettings();
      renderAll();
    };
  });
  $("modalX").onclick = closeModal;
  $("modalOv").onclick = function (ev) {
    if (ev.target === $("modalOv")) closeModal();
  };

  var _rt = null;
  window.addEventListener("resize", function () {
    if (_rt) clearTimeout(_rt);
    _rt = setTimeout(fitAll, 120);
  });

  renderAll();
  fitAll();
  renderAcct();
  startAuth();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

// 画面テスト用（E2Eから中身を確かめる）
window.__NOMIYA = {
  // 試験から倉庫を覗くための入口（利用の状態の行を確かめる）
  get sb() {
    return SB;
  },
  get sales() {
    return SALES;
  },
  get settings() {
    return SETTINGS;
  },
  get partners() {
    return PARTNERS;
  },
  get invoices() {
    return INVOICES;
  },
  get closes() {
    return CLOSES;
  },
  get closeYmd() {
    return UI.closeYmd;
  },
  get staff() {
    return STAFF;
  },
  get works() {
    return WORKS;
  },
  get payYmd() {
    return UI.payYmd;
  },
  get account() {
    return ACCOUNT;
  },
  get pending() {
    return pendingCount();
  },
  showScreen: showScreen,
  // 紙のPDFを作る（試験から中身を確かめるため。画面の動きは変えない）
  buildPdf: function (id) {
    return buildPaperPdf($(id || "listSheets"));
  },
  renderAll: renderAll,
  syncNow: syncNow,
};
