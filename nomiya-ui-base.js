/* nomiya-ui-base.js — 土台・小物・保存/読み込み・クラウド(ログインと同期)・期間・モーダル
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
         飲み屋の売上管理 ─ 画面。計算は nomiya-core.js が唯一の正。
         保存はこの端末の中(localStorage)。書き出し/読み込みでバックアップできる。
         =================================================================== */
var C = window.NomiyaCore;

var K_SALES = "nomiya_sales_v1";
var K_SET = "nomiya_settings_v1";
var K_INV = "nomiya_invoices_v1";
var K_PARTNER = "nomiya_partners_v1";
var K_CLOSE = "nomiya_closes_v1"; // レジ締め（日付ごと）
var K_STAFF = "nomiya_staff_v1"; // スタッフ（人と決め方）
var K_WORK = "nomiya_work_v1"; // 日々の実績（1人×1日）
var K_PAYMENT = "nomiya_payments_v1"; // 入金（ツケ・請求書送りの回収）
var K_SET_AT = "nomiya_set_at_v1"; // 設定を直した時刻（同期の後勝ち判定に使う）
var K_SYNC_AT = "nomiya_sync_at_v1"; // ここまでは送った、という目印
var K_SYNC_OK = "nomiya_sync_ok_v1"; // 最後に同期できた時刻（画面に出すだけ）
var K_ACCOUNT = "nomiya_account_v1"; // 前にログインしていたアカウント

var SALES = [];
function defaultSettings() {
  return {
    store: "",
    addr: "",
    tel: "",
    regNo: "",
    bank: "",
    rate: 0.1,
    tpl: "card",
    hanko: "",
    hankoSize: "m", // 請求書に載る判子の大きさ s=小 / m=中(角印16mm相当) / l=大
    logo: "",
    logoPos: "top",
    accent: "",
    font: "mincho",
    taxNames: false, // 税理士の紙に、日払いを渡した相手の名前まで出すか
    minWage: 0,
    items: [], // よく出るボトル・シャンパン（押すだけで金額が入る）
    backKinds: [], // バックの種類（空なら、はじめの5つがそのまま出る）
    rateBase: "komi", // 歩合の元 komi=税込 / nuki=税抜
    backBase: "komi", // ％バックの元 komi=会計そのまま / nuki=税抜 / service=サービス料も抜く
    serviceRate: 0, // サービス料(%)。backBase=service のときだけ使う
    tsukeComm: "now", // ツケの歩合 now=すぐ出す / collected=回収できてから
    // ツケ（会社でない客）の「いつまでにもらう」約束。店ぜんぶ共通。
    tsukeTerm: { kind: "none", n: 0 },
    nightPay: false, // 深夜割増を付けるか（既定は付けない＝今までどおり）
    nightRate: 25, // 深夜割増(%)
    gensen: false, // 源泉を引くか（既定は引かない）
    gensenRate: 10.21, // 源泉(%)
  };
}
// ★設定の項目は defaultSettings() が唯一の正。
//   ここに同じ物を書き並べると、片方に足し忘れたとき load() が黙って捨てる
//   （実際にそれで「決め方が開き直すと消える」が出た）。
var SETTINGS = defaultSettings();
var INVOICES = []; // [{no, name, from, to, issuedAt}]
// 宛先（請求書送りの相手）。売上に打つ名前をキーにする { 名前: {name,to,honor,addr,person} }
var PARTNERS = {};
var CLOSES = {}; // { 'YYYY-MM-DD': 締め }
var STAFF = []; // スタッフ
var PAYMENTS = []; // 入金（1件ずつ。古いツケから順に充てる）
var WORKS = []; // 日々の実績
var SET_AT = ""; // 設定を直した時刻
// 設定の時刻が空のままだとDBが受け取れない（22007で落ちる）＝初回同期が必ず失敗していた。
// 無ければ今の時刻を入れて、端末にも残す。
function setAtOrNow() {
  if (!SET_AT) {
    SET_AT = new Date().toISOString();
    try {
      localStorage.setItem(K_SET_AT, SET_AT);
    } catch (e) {
      /* 端末に書けなくても送れる */
    }
  }
  return SET_AT;
}

// 画面の状態
var UI = {
  screen: "input",
  inName: "", // 請求書送りのとき、ドロップダウンで選んでいる会社
  editId: null,
  inPay: "cash",
  inRec: "none", // 領収書 none/issued/later/na（支払い方法で選べるものが変わる）
  period: { mode: "month", ym: "", from: "", to: "" },
  filPay: "all", // 一覧の支払い方法
  filRec: "all", // 一覧の領収書
  sumRec: "all", // 集計の対象（全体/領収書あり/領収書なし）
  taxRec: "all", // 税理士用の対象
  invName: "",
  invYm: "", // 請求書は「◯月分」で1枚（起動時に今月が入る）
  closeYmd: "", // 締めはその日1枚（起動時に今日が入る）
  payYmd: "", // 給料はその日の出勤を見る
  listSeg: "list", // 一覧の中の切替 list/sum/tax
  invSeg: "inv", // 請求書の中の切替 inv/due/paid
  dueOrder: "old", // 未回収の並び old=古い順 / due=期限が近い順
  setSeg: "self", // 設定の中の切替 self/partner/staff/item
  backTo: "input", // 歯車を閉じたときに戻る画面
};

// 売上帳 1ページの行数（A4縦=1123pxに収まる実測値。1行27px・上下の見出しと合計欄の分を引いた数）
var ROWS_FULL = 35; // 合計欄が無いページ
var ROWS_LAST = 28; // 合計欄が載る最後のページ

/* ===== 小物 ===== */
function $(id) {
  return document.getElementById(id);
}
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
var _toastT = null;
function toast(msg) {
  var t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  if (_toastT) clearTimeout(_toastT);
  _toastT = setTimeout(function () {
    t.classList.remove("show");
  }, 2200);
}
function todayIso() {
  return C.toIso(new Date());
}

/* ===== 保存・読み込み ===== */
/* ★端末の控えが壊れていたとき、黙って立ち直らない。
         黙って直すと、店の人は「何かあった」と気付けないまま数字が減って見える。
         （倉庫（クラウド）には残っているので、読み直せば戻る） */
var BROKEN_LOCAL = false;
function load() {
  try {
    var s = JSON.parse(localStorage.getItem(K_SALES) || "[]");
    SALES = Array.isArray(s) ? s : [];
  } catch (e) {
    SALES = [];
    BROKEN_LOCAL = true;
  }
  try {
    var st = JSON.parse(localStorage.getItem(K_SET) || "{}");
    if (st && typeof st === "object") {
      Object.keys(SETTINGS).forEach(function (k) {
        if (st[k] != null) SETTINGS[k] = st[k];
      });
    }
  } catch (e2) {
    /* 壊れた設定は既定値のまま使う */
  }
  try {
    var iv = JSON.parse(localStorage.getItem(K_INV) || "[]");
    INVOICES = Array.isArray(iv) ? iv : [];
  } catch (e3) {
    INVOICES = [];
  }
  try {
    var pt = JSON.parse(localStorage.getItem(K_PARTNER) || "{}");
    PARTNERS = pt && typeof pt === "object" ? pt : {};
  } catch (e4) {
    PARTNERS = {};
  }
  try {
    var cl = JSON.parse(localStorage.getItem(K_CLOSE) || "{}");
    CLOSES = cl && typeof cl === "object" ? cl : {};
  } catch (e5) {
    CLOSES = {};
  }
  try {
    var stf = JSON.parse(localStorage.getItem(K_STAFF) || "[]");
    STAFF = Array.isArray(stf) ? stf : [];
  } catch (e7) {
    STAFF = [];
  }
  try {
    var wk = JSON.parse(localStorage.getItem(K_WORK) || "[]");
    WORKS = Array.isArray(wk) ? wk : [];
  } catch (e8) {
    WORKS = [];
  }
  try {
    var pm = JSON.parse(localStorage.getItem(K_PAYMENT) || "[]");
    PAYMENTS = Array.isArray(pm) ? pm : [];
  } catch (e9) {
    PAYMENTS = [];
  }
  try {
    // 端末の設定の控えが無いのに時刻だけ残っていると、
    // 「空の設定が新しい」と勘違いしてクラウドを空で上書きしてしまう。
    // 控えが無いときは時刻も無かったことにする（クラウドの方を正にする）。
    SET_AT = localStorage.getItem(K_SET) ? localStorage.getItem(K_SET_AT) || "" : "";
    if (!SET_AT) localStorage.removeItem(K_SET_AT);
  } catch (e6) {
    SET_AT = "";
  }
  loadSync();
}
function saveSales() {
  try {
    localStorage.setItem(K_SALES, JSON.stringify(SALES));
  } catch (e) {
    toast("⚠️ 端末の空きが足りず保存できませんでした");
  }
  queuePush();
}
function saveSettings(keepAt) {
  try {
    if (!keepAt) SET_AT = new Date().toISOString();
    localStorage.setItem(K_SET, JSON.stringify(SETTINGS));
    localStorage.setItem(K_SET_AT, SET_AT);
  } catch (e) {
    /* 設定が保存できなくても画面は動かす */
  }
  if (!keepAt) queuePush();
}
function savePartners() {
  try {
    localStorage.setItem(K_PARTNER, JSON.stringify(PARTNERS));
  } catch (e) {
    toast("⚠️ 端末の空きが足りず保存できませんでした");
  }
  queuePush();
}
function saveStaff() {
  try {
    localStorage.setItem(K_STAFF, JSON.stringify(STAFF));
  } catch (e) {
    toast("⚠️ 端末の空きが足りず保存できませんでした");
  }
  queuePush();
}
function saveWorks() {
  try {
    localStorage.setItem(K_WORK, JSON.stringify(WORKS));
  } catch (e) {
    toast("⚠️ 端末の空きが足りず保存できませんでした");
  }
  queuePush();
}
function savePayments() {
  try {
    localStorage.setItem(K_PAYMENT, JSON.stringify(PAYMENTS));
  } catch (e) {
    toast("⚠️ 端末の空きが足りず保存できませんでした");
  }
  queuePush();
}
function saveCloses() {
  try {
    localStorage.setItem(K_CLOSE, JSON.stringify(CLOSES));
  } catch (e) {
    toast("⚠️ 端末の空きが足りず保存できませんでした");
  }
  queuePush();
}
function saveInvoices() {
  queuePush();
  try {
    localStorage.setItem(K_INV, JSON.stringify(INVOICES));
  } catch (e) {
    /* 番号履歴が保存できなくても請求書は出せる */
  }
}

/* ===================================================================
         クラウド（Supabase）── ログインと同期
         ★どの倉庫に繋ぐかは js/supa-config.js だけが決める。
           本番repo(nomiya-app)＝本番倉庫 ／ テストrepo(nomiya-app-test)＝DB-test。
           このHTMLは2つのrepoで同じ物なので、ここには倉庫の名前を書かない。
           公開鍵はクライアント埋め込みで安全＝RLS(account_id=auth.uid())で各店を隔てる。
         考え方：端末の中が作業台。電波が無くても打てて、つながったら送る。
         =================================================================== */
var SUPA_URL = (window.SUPA || {}).url || "";
var SUPA_KEY = (window.SUPA || {}).key || "";
// テストは偽のクラウドを差し込む（本物に通信せず配線だけ確かめる）
var SB =
  window.__NOMIYA_FAKE_SB__ ||
  (window.supabase ? window.supabase.createClient(SUPA_URL, SUPA_KEY) : null);
var ACCOUNT = null; // ログイン中のアカウントID
var ACCOUNT_EMAIL = "";
// 同期の状態。at = ここまでは送った、という目印（これより新しい更新が「未送信」）
var SYNC = { at: "", running: false, err: "", lastOkAt: "" };

function loadSync() {
  try {
    SYNC.at = localStorage.getItem(K_SYNC_AT) || "";
    SYNC.lastOkAt = localStorage.getItem(K_SYNC_OK) || "";
  } catch (e) {
    /* 読めなくても同期はやり直せる */
  }
}
function saveSync() {
  try {
    localStorage.setItem(K_SYNC_AT, SYNC.at);
    localStorage.setItem(K_SYNC_OK, SYNC.lastOkAt);
  } catch (e) {
    /* 目印が残せなくても、次の同期で送り直すだけ */
  }
}
// この端末に残している控えを全部捨てる（別の店で入った時／ログアウトした時）
function forgetLocal() {
  SALES = [];
  PARTNERS = {};
  INVOICES = [];
  CLOSES = {};
  STAFF = [];
  WORKS = [];
  PAYMENTS = [];
  SET_AT = "";
  SYNC.at = "";
  SYNC.lastOkAt = "";
  SYNC.err = "";
  // 店の情報（判子・振込先・登録番号・ロゴ）も必ず捨てる。
  // 残すと、次に入った別の店の請求書に前の店の判子と振込先が出る。
  SETTINGS = defaultSettings();
  try {
    [
      K_SALES,
      K_PARTNER,
      K_INV,
      K_CLOSE,
      K_STAFF,
      K_WORK,
      K_PAYMENT,
      K_SET,
      K_SET_AT,
      K_SYNC_AT,
      K_SYNC_OK,
    ].forEach(function (k) {
      localStorage.removeItem(k);
    });
  } catch (e) {
    /* 消せなくても、このあとの同期で入れ替わる */
  }
}

function partnersArr() {
  return Object.keys(PARTNERS).map(function (k) {
    return PARTNERS[k];
  });
}
// まだ送っていないもの（この目印より新しい更新）。
// ★「今より先の時刻」は、時計が進んだ別の端末が書いた行。この端末の未送信ではないので数えない
//   （数えると永久に「未送信1件」が消えず、毎回送り直すことになる）。
function isMine(u) {
  var t = String(u || "");
  return t > SYNC.at && t <= new Date().toISOString();
}
function pendingSales() {
  return SALES.filter(function (x) {
    return isMine(x.updatedAt);
  });
}
function pendingPartners() {
  return partnersArr().filter(function (x) {
    return isMine(x.updatedAt);
  });
}
function pendingSettings() {
  return isMine(SET_AT);
}
function closesArr() {
  return Object.keys(CLOSES).map(function (k) {
    return CLOSES[k];
  });
}
function pendingStaff() {
  return STAFF.filter(function (x) {
    return isMine(x.updatedAt);
  });
}
function pendingWorks() {
  return WORKS.filter(function (x) {
    return isMine(x.updatedAt);
  });
}
function pendingPayments() {
  return PAYMENTS.filter(function (x) {
    return isMine(x.updatedAt);
  });
}
function pendingCloses() {
  return closesArr().filter(function (x) {
    return isMine(x.updatedAt);
  });
}
function pendingInvoices() {
  return INVOICES.filter(function (x) {
    return isMine(x.updatedAt || x.issuedAt);
  });
}
function pendingCount() {
  return (
    pendingSales().length +
    pendingPartners().length +
    pendingInvoices().length +
    pendingCloses().length +
    pendingStaff().length +
    pendingWorks().length +
    pendingPayments().length +
    (pendingSettings() ? 1 : 0)
  );
}
// 目印は「今」を超えない。時計が進んだ端末が書いた未来の時刻をそのまま目印にすると、
// それより古い（＝本当はまだ送っていない）変更が全部「送信済み」に見えてしまう。
function bumpSyncMark() {
  var mx = SYNC.at;
  var nowMark = new Date().toISOString();
  SALES.concat(partnersArr())
    .concat(closesArr())
    .concat(STAFF)
    .concat(WORKS)
    .forEach(function (x) {
      var u = String(x.updatedAt || "");
      if (u > mx) mx = u;
    });
  INVOICES.forEach(function (x) {
    var u = String(x.updatedAt || x.issuedAt || "");
    if (u > mx) mx = u;
  });
  if (String(SET_AT || "") > mx) mx = String(SET_AT || "");
  if (mx > nowMark) mx = nowMark;
  SYNC.at = mx;
  SYNC.lastOkAt = new Date().toISOString();
  saveSync();
}

// 1000行で黙って切れないように、総数と突き合わせて全部取る
async function fetchAll(table) {
  var out = [];
  var from = 0;
  var size = 1000;
  for (;;) {
    var r = await SB.from(table)
      .select("*", { count: "exact" })
      .range(from, from + size - 1);
    if (r.error) throw r.error;
    var got = r.data || [];
    out = out.concat(got);
    if (!got.length) break;
    if (r.count == null || out.length >= r.count) break;
    from += size;
  }
  return out;
}

function withAccount(row) {
  row.account_id = ACCOUNT;
  return row;
}

// 送るだけ（打った直後に呼ぶ。つながっていなければ何もしない＝次に送る）
async function pushNow() {
  if (!SB || !ACCOUNT || SYNC.running) return false;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
  var sales = C.pushableSales(pendingSales()).ok;
  var partners = pendingPartners();
  var invoices = pendingInvoices();
  var closes = pendingCloses();
  var staff = pendingStaff();
  var works = pendingWorks();
  var payments = pendingPayments();
  var setDirty = pendingSettings();
  if (
    !sales.length &&
    !partners.length &&
    !invoices.length &&
    !closes.length &&
    !staff.length &&
    !works.length &&
    !payments.length &&
    !setDirty
  )
    return true;
  SYNC.running = true;
  renderAcct();
  var ok = true;
  try {
    if (sales.length) {
      var rs = await SB.from("nomiya_sales").upsert(
        sales.map(function (x) {
          return withAccount(C.saleToRow(x));
        }),
        { onConflict: "account_id,cid" }
      );
      if (rs.error) throw rs.error;
    }
    if (partners.length) {
      var rp = await SB.from("nomiya_partners").upsert(
        partners.map(function (x) {
          return withAccount(C.partnerToRow(x));
        }),
        { onConflict: "account_id,name" }
      );
      if (rp.error) throw rp.error;
    }
    if (closes.length) {
      var rcl = await SB.from("nomiya_closes").upsert(
        closes.map(function (x) {
          return withAccount(C.closeToRow(x));
        }),
        { onConflict: "account_id,ymd" }
      );
      if (rcl.error) throw rcl.error;
    }
    if (staff.length) {
      var rst = await SB.from("nomiya_staff").upsert(
        staff.map(function (x) {
          return withAccount(C.staffToRow(x));
        }),
        { onConflict: "account_id,sid" }
      );
      if (rst.error) throw rst.error;
    }
    if (works.length) {
      var rwk = await SB.from("nomiya_work").upsert(
        works.map(function (x) {
          return withAccount(C.workToRow(x));
        }),
        { onConflict: "account_id,wid" }
      );
      if (rwk.error) throw rwk.error;
    }
    if (payments.length) {
      var rpm = await SB.from("nomiya_payments").upsert(
        payments.map(function (x) {
          return withAccount(C.paymentToRow(x));
        }),
        { onConflict: "account_id,pid" }
      );
      if (rpm.error) throw rpm.error;
    }
    if (invoices.length) {
      var ri = await SB.from("nomiya_invoices").upsert(
        invoices.map(function (x) {
          return withAccount(C.invoiceRecToRow(x));
        }),
        { onConflict: "account_id,key" }
      );
      if (ri.error) throw ri.error;
    }
    if (setDirty) {
      var rc = await SB.from("nomiya_settings").upsert(
        { account_id: ACCOUNT, config: SETTINGS, updated_at: setAtOrNow() },
        { onConflict: "account_id" }
      );
      if (rc.error) throw rc.error;
    }
    bumpSyncMark();
    SYNC.err = "";
  } catch (e) {
    ok = false;
    SYNC.err = window.ExallyLogin ? ExallyLogin.friendly(e) : String((e && e.message) || e);
  }
  SYNC.running = false;
  renderAcct();
  return ok;
}

var _pushT = null;
function queuePush() {
  if (!SB || !ACCOUNT) return;
  if (_pushT) clearTimeout(_pushT);
  _pushT = setTimeout(function () {
    _pushT = null;
    pushNow();
  }, 900);
}

// 取ってきて突き合わせて、こちらが新しいものを送る（開いたとき・つながったとき）
async function syncNow(loud) {
  if (!SB || !ACCOUNT || SYNC.running) return false;
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    if (loud) toast("📴 いまはオフラインです。つながったら送ります");
    renderAcct();
    return false;
  }
  SYNC.running = true;
  SYNC.err = "";
  renderAcct();
  var ok = true;
  try {
    var rows = await fetchAll("nomiya_sales");
    var prow = await fetchAll("nomiya_partners");
    var irow = await fetchAll("nomiya_invoices");
    var crow = await fetchAll("nomiya_closes");
    var strow = await fetchAll("nomiya_staff");
    var wkrow = await fetchAll("nomiya_work");
    var pmrow = await fetchAll("nomiya_payments");
    var cfg = await SB.from("nomiya_settings").select("config, updated_at").maybeSingle();
    if (cfg.error) throw cfg.error;

    var planS = C.syncPlanSales(SALES, rows.map(C.saleFromRow));
    var planP = C.syncPlanPartners(PARTNERS, prow.map(C.partnerFromRow));
    var planI = C.syncPlanInvoices(INVOICES, irow.map(C.invoiceRecFromRow));
    var planCl = C.syncPlanCloses(CLOSES, crow.map(C.closeFromRow));
    var planSt = C.syncPlanStaff(STAFF, strow.map(C.staffFromRow));
    var planWk = C.syncPlanWorks(WORKS, wkrow.map(C.workFromRow));
    var planPm = C.syncPlanPayments(PAYMENTS, pmrow.map(C.paymentFromRow));
    var rcfg = cfg.data && cfg.data.config ? cfg.data.config : null;
    var rat = (cfg.data && cfg.data.updated_at) || "";
    var planC = C.syncPlanSettings(SETTINGS, SET_AT, rcfg, rat);

    SALES = planS.merged;
    PARTNERS = planP.merged;
    INVOICES = planI.merged;
    CLOSES = planCl.merged;
    STAFF = planSt.merged;
    WORKS = planWk.merged;
    PAYMENTS = planPm.merged;
    if (planC.merged !== SETTINGS) {
      Object.keys(SETTINGS)
        .concat(Object.keys(planC.merged))
        .forEach(function (k) {
          if (planC.merged[k] != null) SETTINGS[k] = planC.merged[k];
        });
      SET_AT = rat;
    }
    try {
      localStorage.setItem(K_SALES, JSON.stringify(SALES));
      localStorage.setItem(K_PARTNER, JSON.stringify(PARTNERS));
      localStorage.setItem(K_INV, JSON.stringify(INVOICES));
      localStorage.setItem(K_CLOSE, JSON.stringify(CLOSES));
      localStorage.setItem(K_STAFF, JSON.stringify(STAFF));
      localStorage.setItem(K_WORK, JSON.stringify(WORKS));
      localStorage.setItem(K_PAYMENT, JSON.stringify(PAYMENTS));
      localStorage.setItem(K_SET, JSON.stringify(SETTINGS));
      localStorage.setItem(K_SET_AT, SET_AT);
    } catch (e0) {
      /* 端末に書けなくても画面は動く */
    }
    // ★取り込んだ分は先に画面へ出す。このあとの送信が失敗しても「売上が消えた」に見えない。
    renderAll();

    var up = C.pushableSales(planS.push);
    if (up.bad.length) {
      SYNC.err = "送れない売上が " + up.bad.length + " 件あります（日付が入っていません）";
    }
    if (up.ok.length) {
      var rs2 = await SB.from("nomiya_sales").upsert(
        up.ok.map(function (x) {
          return withAccount(C.saleToRow(x));
        }),
        { onConflict: "account_id,cid" }
      );
      if (rs2.error) throw rs2.error;
    }
    if (planP.push.length) {
      var rp2 = await SB.from("nomiya_partners").upsert(
        planP.push.map(function (x) {
          return withAccount(C.partnerToRow(x));
        }),
        { onConflict: "account_id,name" }
      );
      if (rp2.error) throw rp2.error;
    }
    if (planCl.push.length) {
      var rc3 = await SB.from("nomiya_closes").upsert(
        planCl.push.map(function (x) {
          return withAccount(C.closeToRow(x));
        }),
        { onConflict: "account_id,ymd" }
      );
      if (rc3.error) throw rc3.error;
    }
    if (planSt.push.length) {
      var rst2 = await SB.from("nomiya_staff").upsert(
        planSt.push.map(function (x) {
          return withAccount(C.staffToRow(x));
        }),
        { onConflict: "account_id,sid" }
      );
      if (rst2.error) throw rst2.error;
    }
    if (planWk.push.length) {
      var rwk2 = await SB.from("nomiya_work").upsert(
        planWk.push.map(function (x) {
          return withAccount(C.workToRow(x));
        }),
        { onConflict: "account_id,wid" }
      );
      if (rwk2.error) throw rwk2.error;
    }
    if (planPm.push.length) {
      var rpm2 = await SB.from("nomiya_payments").upsert(
        planPm.push.map(function (x) {
          return withAccount(C.paymentToRow(x));
        }),
        { onConflict: "account_id,pid" }
      );
      if (rpm2.error) throw rpm2.error;
    }
    if (planI.push.length) {
      var ri2 = await SB.from("nomiya_invoices").upsert(
        planI.push.map(function (x) {
          return withAccount(C.invoiceRecToRow(x));
        }),
        { onConflict: "account_id,key" }
      );
      if (ri2.error) throw ri2.error;
    }
    if (planC.push) {
      var rc2 = await SB.from("nomiya_settings").upsert(
        { account_id: ACCOUNT, config: SETTINGS, updated_at: setAtOrNow() },
        { onConflict: "account_id" }
      );
      if (rc2.error) throw rc2.error;
    }
    bumpSyncMark();
    renderAll();
    if (loud) toast("☁️ 同期しました");
  } catch (e) {
    ok = false;
    // 生のDBエラーは見せない（共通部品と同じ言い方にそろえる）
    SYNC.err = window.ExallyLogin ? ExallyLogin.friendly(e) : String((e && e.message) || e);
    if (loud) toast("⚠️ 同期できませんでした");
  }
  SYNC.running = false;
  renderAcct();
  return ok;
}

// 設定タブの「アカウント」の1行
function renderAcct() {
  var el = $("acctInfo");
  if (!el) return;
  if (!SB) {
    el.textContent = "このブラウザではクラウドに繋げませんでした（端末の中だけで動いています）";
    return;
  }
  if (!ACCOUNT) {
    el.textContent = "ログインしていません";
    return;
  }
  var n = pendingCount();
  var line = "ログイン中：" + ACCOUNT_EMAIL;
  if (SYNC.running) line += " ／ 同期中…";
  else if (typeof navigator !== "undefined" && navigator.onLine === false)
    line += " ／ オフライン（未送信 " + n + " 件・つながったら送ります）";
  else if (n) line += " ／ 未送信 " + n + " 件";
  else if (SYNC.lastOkAt) line += " ／ 同期済み " + hhmm(SYNC.lastOkAt);
  if (SYNC.err) line += "\n" + SYNC.err;
  el.textContent = line;
}
function hhmm(iso) {
  var d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2);
}

/* ===== ログイン（画面と手続きは共通部品 exally-login.js） ===== */
var LOGIN = null;
function showLogin(show) {
  if (!LOGIN) return;
  // ★「パスワードを作り直す」メールから戻ってきたときは閉じない。
  //   閉じると、入れてはいるのに新しいパスワードを決める画面が消えてしまう。
  if (!show && LOGIN.isRecovery && LOGIN.isRecovery()) return;
  if (show) LOGIN.show();
  else LOGIN.hide();
}
// ログインした後：別のアカウントなら端末の控えを捨ててから同期する
async function afterLogin(user) {
  ACCOUNT = user.id;
  ACCOUNT_EMAIL = user.email || "";
  var last = "";
  try {
    last = localStorage.getItem(K_ACCOUNT) || "";
  } catch (e) {
    /* 読めなければ別アカウント扱いにはしない */
  }
  if (last && last !== ACCOUNT) forgetLocal();
  try {
    localStorage.setItem(K_ACCOUNT, ACCOUNT);
  } catch (e3) {
    /* 覚えられなくても動く */
  }
  showLogin(false);
  renderAll();
  await syncNow(false);
  await checkEntitlement();
  await checkAdmin();
}
/* ★利用の状態（体験／有料／無料／停止）。決めるのは管理画面 castally-admin.html。
         棚は Exally と同じ exally_entitlements を使う（app='nomiya' の行がCastally）。
         ★つながらないときは絶対に止めない★
           電波が悪いだけで店が使えなくなるのが一番まずい。読めなければ黙って通す。
         止めてもデータは1行も消さない＝また使えるようにすれば元どおり。 */
var ENT_APP = "nomiya";
async function checkEntitlement() {
  if (!SB || !ACCOUNT) return;
  try {
    var r = await SB.from("exally_entitlements")
      .select("plan")
      .eq("account_id", ACCOUNT)
      .eq("app", ENT_APP)
      .maybeSingle();
    if (r.error) return; // 読めない＝止めない
    if (!r.data) {
      // はじめての店は「体験」で始める（自分の行だけ作れる決まり）
      await SB.from("exally_entitlements").insert({
        account_id: ACCOUNT,
        app: ENT_APP,
        plan: "trial",
        email: ACCOUNT_EMAIL || null,
      });
      return;
    }
    showStopped(r.data.plan === "disabled");
  } catch (e) {
    /* 何かあっても店は止めない */
  }
}
function showStopped(on) {
  $("stopOv").classList.toggle("open", !!on);
}
/* ★管理者（司さん）だけに、設定の中へ管理画面の入口を出す。
         ここから開けば、いま入っているまま管理画面に行ける＝もう一度ログインしなくていい。
         管理者でない店には、入口そのものが出ない。 */
async function checkAdmin() {
  if (!SB || !ACCOUNT) return;
  try {
    var r = await SB.from("exally_admins")
      .select("account_id")
      .eq("account_id", ACCOUNT)
      .maybeSingle();
    if (r.error || !r.data) return;
    $("adminRow").style.display = "";
  } catch (e) {
    /* 分からなければ出さない（ふつうの店の画面を汚さない） */
  }
}

async function doLogout() {
  var n = pendingCount();
  if (n) {
    var okSend = await pushNow();
    if (!okSend) {
      toast("⚠️ 送れていない " + n + " 件があります。つながってからログアウトしてください");
      return;
    }
  }
  try {
    await SB.auth.signOut();
  } catch (e) {
    /* 通信できなくても画面は閉じる */
  }
  ACCOUNT = null;
  ACCOUNT_EMAIL = "";
  // ★落とした・貸したスマホから客の名前と金額が読めないように、控えも消す
  //   （未送信があるときは上で止めているので、ここに来た時点で全部クラウドにある）
  forgetLocal();
  try {
    localStorage.removeItem(K_ACCOUNT);
  } catch (e2) {
    /* 消せなくてもログイン画面は出る */
  }
  showScreen("input");
  showLogin(true);
  renderAll();
  renderAcct();
}
// 起動時：セッションが残っていればそのまま入る（オフラインでも入れる）
async function startAuth() {
  if (!SB) {
    renderAcct();
    return;
  }
  if (!LOGIN) {
    LOGIN = ExallyLogin.mount({
      app: "売上管理",
      // 製品名は Castally。文字入りのロゴをそのまま出す。
      brand: "Castally",
      brandSub: "",
      logo: "/icons/logo-castally.png",
      sb: SB,
      note: "売上はこのお店のものだけが見えます。一度ログインすれば、次からは自動で入れます。",
      onLogin: function (user) {
        afterLogin(user);
      },
    });
  }
  var sess = null;
  try {
    sess = await SB.auth.getSession();
  } catch (e) {
    sess = null;
  }
  var user = sess && sess.data && sess.data.session ? sess.data.session.user : null;
  if (!user) {
    showLogin(true);
    renderAcct();
    return;
  }
  // ★前に入っていたアカウントと違うなら、端末の控えを捨ててから入る。
  //   （スイート共通ログインで別アプリから入り直した時に、前の店のデータが混ざるのを防ぐ）
  var lastAcc = "";
  try {
    lastAcc = localStorage.getItem(K_ACCOUNT) || "";
  } catch (e0) {
    lastAcc = "";
  }
  if (lastAcc && lastAcc !== user.id) forgetLocal();
  ACCOUNT = user.id;
  ACCOUNT_EMAIL = user.email || "";
  try {
    localStorage.setItem(K_ACCOUNT, ACCOUNT);
  } catch (e2) {
    /* 覚えられなくても動く */
  }
  showLogin(false);
  renderAll();
  renderAcct();
  await syncNow(false);
  await checkEntitlement();
  await checkAdmin();
}

/* ===== 期間 ===== */
function periodRange() {
  if (UI.period.mode === "range") return { from: UI.period.from, to: UI.period.to };
  return C.rangeOfMonth(UI.period.ym);
}
function periodLabel() {
  if (UI.period.mode === "range") {
    return C.jpDate(UI.period.from) + " 〜 " + C.jpDate(UI.period.to);
  }
  return C.jpMonth(UI.period.ym);
}
function periodSales() {
  var r = periodRange();
  return C.sortSales(C.filterSales(SALES, { from: r.from, to: r.to }));
}

function renderPeriodBars() {
  ["periodList", "periodSum", "periodTax"].forEach(function (id) {
    var el = $(id);
    if (!el) return;
    var isMonth = UI.period.mode === "month";
    el.innerHTML =
      '<button class="period-arrow" type="button" data-mv="-1"' +
      (isMonth ? "" : " disabled") +
      ">◀</button>" +
      '<span class="period-lb">' +
      esc(isMonth ? C.jpMonth(UI.period.ym) : periodLabel()) +
      '<span class="period-sub">' +
      (isMonth ? "タップで期間を指定" : "タップで月に戻す") +
      "</span></span>" +
      '<button class="period-arrow" type="button" data-mv="1"' +
      (isMonth ? "" : " disabled") +
      ">▶</button>";
    el.querySelectorAll("[data-mv]").forEach(function (b) {
      b.onclick = function () {
        UI.period.ym = C.shiftMonth(UI.period.ym, +b.getAttribute("data-mv"));
        renderAll();
      };
    });
    el.querySelector(".period-lb").onclick = function () {
      if (UI.period.mode === "range") {
        UI.period.mode = "month";
        renderAll();
      } else {
        openRangeModal();
      }
    };
  });
}

function openRangeModal() {
  var r = periodRange();
  openModal(
    "期間を指定する",
    '<div class="frow"><span class="flabel">はじめ</span>' +
      '<input class="finput" type="date" id="mdFrom" value="' +
      esc(r.from) +
      '"></div>' +
      '<div class="frow"><span class="flabel">おわり</span>' +
      '<input class="finput" type="date" id="mdTo" value="' +
      esc(r.to) +
      '"></div>' +
      '<div style="margin-top:12px"><button class="btn btn-primary" id="mdOk">この期間で見る</button></div>'
  );
  $("mdOk").onclick = function () {
    var f = $("mdFrom").value;
    var t = $("mdTo").value;
    if (!C.isIsoDate(f) || !C.isIsoDate(t)) {
      toast("⚠️ 日付を両方入れてください");
      return;
    }
    if (f > t) {
      var tmp = f;
      f = t;
      t = tmp;
    }
    UI.period = { mode: "range", ym: UI.period.ym, from: f, to: t };
    closeModal();
    renderAll();
  };
}

/* ===== モーダル ===== */
function openModal(title, html) {
  $("modalTitle").textContent = title;
  $("modalBody").innerHTML = html;
  $("modalOv").classList.add("open");
}
function closeModal() {
  $("modalOv").classList.remove("open");
}

/* 判子の余白を切る。
         白を抜いただけだと、まわりに透明な帯が残って、紙に載せたとき
         「決めた大きさの箱」の中で判子が小さく浮く（社名に重ならない）。
         前に入れた判子にも効くよう、開いたときに一度だけ切って入れ直す。 */
function trimHankoOnce() {
  if (!SETTINGS.hanko || !window.HankoTool || !HankoTool.trim) return;
  var before = SETTINGS.hanko;
  HankoTool.trim(before)
    .then(function (after) {
      if (!after || after === before) return; // 余白が無かった＝何もしない
      SETTINGS.hanko = after;
      saveSettings();
      renderAll();
    })
    .catch(function () {
      /* 切れなくても、判子はそのまま載る */
    });
}
