/* exally-login.js — Exally 共通のログイン画面
 * ==================================================================
 * 全アプリ（売上管理・代行請求・給料明細…）で同じ見た目・同じ言い方にするための部品。
 * 画面の作りも文言もここが一次情報＝各アプリに書き写さない。
 *
 * 使い方:
 *   <script src="exally-login.js"></script>
 *   var LOGIN = ExallyLogin.mount({
 *     app: "売上管理",          // カードに出すアプリ名
 *     brand: "Castally",        // 製品名（省くと Exally）
 *     brandSub: "",             // 製品名の右の小さい字（省くと エクサリー）
 *     logo: "/icons/logo.png",  // 文字入りのロゴ画像（あれば文字の代わりに出す）
 *     sb: SB,                   // supabase クライアント
 *     onLogin: function (user) {…}, // ログインできたら呼ばれる
 *   });
 *
 * ★色は、置いたページが :root に --c-* を決めていれば、それに合わせる。
 *   決めていないページでは今までの緑のまま（＝他のアプリの見た目は変わらない）。
 *   LOGIN.show();  // ログイン画面を出す
 *   LOGIN.hide();  // 閉じる
 *
 * 出す要素のid（テストや他アプリからも触れるよう固定）:
 *   #loginOv / #loginEmail / #loginPass / #loginErr / #btnLogin / #btnSignup
 */
(function (root) {
  "use strict";

  var CSS_ID = "exally-login-css";
  var CSS = [
    ".login-ov{position:fixed;inset:0;background:var(--c-bg,#eef7f1);z-index:400;display:none;",
    "align-items:center;justify-content:center;overflow:auto;",
    "padding:24px 18px calc(24px + env(safe-area-inset-bottom));}",
    ".login-ov.open{display:flex;}",
    ".login-card{width:100%;max-width:380px;background:var(--c-card,#ffffff);border:1px solid var(--c-line,#d4eae0);",
    "border-radius:20px;box-shadow:0 6px 22px rgba(30,80,46,.10);padding:26px 20px 22px;",
    "text-align:center;box-sizing:border-box;}",
    ".login-logo{font-family:'DM Mono',ui-monospace,monospace;font-size:27px;letter-spacing:2px;",
    "color:var(--c-hd-logo,#52b788);}",
    ".login-logo span{font-family:'Noto Sans JP',sans-serif;font-size:11px;letter-spacing:1px;",
    "color:var(--c-label,#7aa08c);margin-left:6px;}",
    ".login-title{font-size:15px;font-weight:700;color:var(--c-text,#2f5d45);margin:10px 0 2px;}",
    ".login-sub{font-size:12px;color:var(--c-label,#7aa08c);margin-bottom:16px;}",
    ".login-inp{width:100%;box-sizing:border-box;font-size:16px;padding:13px 14px;",
    "border:1.5px solid var(--c-line,#d4eae0);border-radius:12px;background:var(--c-card,#ffffff);color:var(--c-text,#24422f);",
    "margin-bottom:10px;font-family:inherit;outline:none;-webkit-appearance:none;}",
    ".login-inp:focus{border-color:var(--c-accent,#52b788);}",
    ".login-err{min-height:18px;font-size:12px;color:var(--c-danger,#c0392b);margin-bottom:6px;white-space:pre-wrap;}",
    /* ログインと新規登録の間の案内。近い方（新規登録）に付いて見えるよう上を空けて下は詰める */
    ".login-mid{font-size:11.5px;color:var(--c-label,#7aa08c);line-height:1.9;margin:16px 0 7px;word-break:keep-all;}",
    ".login-note{font-size:11px;color:var(--c-label,#7aa08c);line-height:1.7;margin-top:14px;}",
    ".login-forgot{display:inline-block;margin-top:12px;font-size:11.5px;color:var(--c-flabel,#3d6b53);",
    "background:none;border:none;padding:4px 6px;text-decoration:underline;cursor:pointer;",
    "font-family:inherit;}",
    ".login-btn{width:100%;box-sizing:border-box;font-family:inherit;font-size:14px;",
    "font-weight:700;padding:14px 16px;border-radius:14px;cursor:pointer;border:1px solid transparent;}",
    ".login-btn-main{background:var(--c-btn,#2f8f5b);color:var(--c-btn-t,#ffffff);border:2px solid var(--c-btn-line,#2f8f5b);}",
    ".login-btn-sub{background:var(--c-btn2,#eef7f1);color:var(--c-btn2-t,#2f8f5b);border:1.5px solid var(--c-btn2-line,#d4eae0);}",
    ".login-btn:disabled{opacity:.55;}",
    // 文字入りのロゴ画像（渡されたときだけ出す）。潰れないよう高さで決める。
    ".login-mark{display:block;margin:0 auto 2px;height:82px;width:auto;",
    "border-radius:18px;}",
  ].join("");

  function injectCss() {
    if (document.getElementById(CSS_ID)) return;
    var st = document.createElement("style");
    st.id = CSS_ID;
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // 出す言葉は全アプリ共通。生のエラー文をそのまま見せない。
  function friendly(e) {
    var m = String((e && e.message) || e || "");
    if (/Invalid login credentials/i.test(m)) return "メールかパスワードが違います";
    if (/User already registered/i.test(m))
      return "そのメールはもう登録されています。ログインしてください";
    if (/Password should be at least/i.test(m)) return "パスワードは6文字以上にしてください";
    if (/Email not confirmed/i.test(m))
      return "メールの確認がまだです。届いたメールを開いてください";
    if (/Failed to fetch|NetworkError|fetch failed/i.test(m))
      return "つながりませんでした。電波を確かめてください";
    // 短い間に何度も押したときの断り（あと何秒かは向こうが教えてくれる）
    var wait = m.match(/after (\d+) seconds?/i);
    if (wait) return "送ったばかりです。あと" + wait[1] + "秒たってから、もう一度押してください";
    if (/rate limit|too many requests|only request this/i.test(m))
      return "短い間に何度も試しました。少し待ってから、もう一度やってください";
    if (/Unable to validate email|invalid format/i.test(m)) return "メールアドレスの形が違います";
    if (/expired|invalid.*(token|otp)/i.test(m))
      return "リンクの期限が切れています。もう一度「パスワードを忘れた」を押してください";
    /* ★最後の砦：ひらがな・カタカナ・漢字が1文字も無い言い方は、そのまま画面に出さない。
         向こうの言葉は英語で増えていくので、知らない物が出るたびに
         店の人が読めない画面になる（実機に出た：
         "For security purposes, you can only request this after 53 seconds."）。 */
    if (!/[぀-ヿ一-鿿]/.test(m))
      return "うまくいきませんでした。少し待ってから、もう一度やってみてください";
    return m;
  }

  /* ★「パスワードを作り直す」メールから戻ってきたか。
       これを見ないと、戻ってきた人はログインだけできて
       ★新しいパスワードを決める画面が出ない＝毎回「忘れた」を押す羽目になる★。
       ★戻り方は当てにならない★（版や設定で # だったり ? だったり、type=recovery が
       付かないこともある。実際に「そのままログインになった」と司さんに出た）。
       だから3本立てで見る：
         ①自分で戻り先に付けた目印（これが主）
         ②Supabase が付ける type=recovery（# でも ? でも）
         ③Supabase からの合図 PASSWORD_RECOVERY（mount の中で拾う） */
  var RESET_MARK = "pwreset=1";
  var recoveryOn = false;
  function isRecovery() {
    if (recoveryOn) return true;
    try {
      var h = String(location.hash || "") + "&" + String(location.search || "");
      if (h.indexOf(RESET_MARK) >= 0) return true;
      return /(^|[#&?])type=recovery(&|$)/.test(h);
    } catch {
      return false;
    }
  }

  function mount(opt) {
    var o = opt || {};
    var sb = o.sb;
    injectCss();

    var ov = document.getElementById("loginOv");
    if (!ov) {
      ov = document.createElement("div");
      ov.className = "login-ov";
      ov.id = "loginOv";
      document.body.appendChild(ov);
    }
    ov.innerHTML =
      '<div class="login-card">' +
      // 製品名。渡されなければ今までどおり Exally（他のアプリは1文字も変わらない）
      (o.logo
        ? '<img class="login-mark" src="' +
          esc(o.logo) +
          '" alt="' +
          esc(o.brand || "Exally") +
          '">'
        : '<div class="login-logo">' +
          esc(o.brand || "Exally") +
          (o.brandSub === "" ? "" : " <span>" + esc(o.brandSub || "エクサリー") + "</span>") +
          "</div>") +
      '<div class="login-title">' +
      esc(o.app || "") +
      "</div>" +
      '<div class="login-sub">メールでログイン</div>' +
      '<input class="login-inp" id="loginEmail" type="email" inputmode="email" ' +
      'autocomplete="email" placeholder="メールアドレス">' +
      '<input class="login-inp" id="loginPass" type="password" ' +
      'autocomplete="current-password" placeholder="パスワード（6文字以上）">' +
      '<div class="login-err" id="loginErr"></div>' +
      '<button class="login-btn login-btn-main" type="button" id="btnLogin">ログイン</button>' +
      // 折り返しの位置は自分で決める（機種任せだと語の途中で割れる）
      '<div class="login-mid">はじめての方は、メールとパスワードを<br>' +
      "入力してから新規登録ボタンを押して下さい</div>" +
      '<button class="login-btn login-btn-sub" type="button" id="btnSignup">新規登録</button>' +
      // パスワードを忘れた人の逃げ道（これが無いと、その店は自分の売上に二度と入れない）
      (sb && sb.auth && sb.auth.resetPasswordForEmail
        ? '<div><button class="login-forgot" type="button" id="btnForgot">パスワードを忘れた</button></div>'
        : "") +
      '<div class="login-note">' +
      esc(o.note || "一度ログインすれば、次からは自動で入れます。") +
      "</div>" +
      // ★メールから戻ってきた人が、その場で新しいパスワードを決める所
      '<div id="loginReset" style="display:none">' +
      '<div class="login-sub">新しいパスワードを決めてください</div>' +
      '<input class="login-inp" id="loginNew" type="password" ' +
      'autocomplete="new-password" placeholder="新しいパスワード（6文字以上）">' +
      '<div class="login-err" id="loginResetErr"></div>' +
      '<button class="login-btn login-btn-main" type="button" id="btnNewPass">' +
      "このパスワードにする</button>" +
      "</div>" +
      "</div>";

    var $ = function (id) {
      return document.getElementById(id);
    };
    function err(msg) {
      $("loginErr").textContent = msg || "";
    }
    function busy(on) {
      $("btnLogin").disabled = on;
      $("btnSignup").disabled = on;
    }
    function ok(user) {
      err("");
      $("loginPass").value = "";
      hide();
      if (o.onLogin) o.onLogin(user);
    }
    function show() {
      ov.classList.add("open");
    }
    function hide() {
      ov.classList.remove("open");
    }

    async function login() {
      var email = $("loginEmail").value.trim();
      var pass = $("loginPass").value;
      if (!email || !pass) {
        err("メールとパスワードを入れてください");
        return;
      }
      err("");
      busy(true);
      var r = await sb.auth.signInWithPassword({ email: email, password: pass });
      busy(false);
      if (r.error) {
        err(friendly(r.error));
        return;
      }
      ok(r.data.user);
    }

    async function signup() {
      var email = $("loginEmail").value.trim();
      var pass = $("loginPass").value;
      if (!email || pass.length < 6) {
        err("メールと、6文字以上のパスワードを入れてください");
        return;
      }
      err("");
      busy(true);
      var r = await sb.auth.signUp({ email: email, password: pass });
      if (r.error) {
        busy(false);
        err(friendly(r.error));
        return;
      }
      // メール確認オフのときは、登録の直後にそのまま入れる
      if (r.data.session) {
        busy(false);
        ok(r.data.user);
        return;
      }
      var li = await sb.auth.signInWithPassword({ email: email, password: pass });
      busy(false);
      if (li.error) {
        err("登録できました。そのままログインしてください");
        return;
      }
      ok(li.data.user);
    }

    async function forgot() {
      var email = $("loginEmail").value.trim();
      if (!email) {
        err("メールアドレスを入れてから押してください");
        return;
      }
      err("");
      busy(true);
      // ★戻り先に自分で目印を付ける（戻り方が版によって違っても拾えるように）
      var back = location.origin + location.pathname + "?" + RESET_MARK;
      var r = await sb.auth.resetPasswordForEmail(email, { redirectTo: back });
      busy(false);
      if (r && r.error) {
        err(friendly(r.error));
        return;
      }
      err("");
      $("loginErr").textContent =
        "パスワードを作り直すメールを送りました。届いたメールを開いてください";
    }

    // ★新しいパスワードを決める（メールから戻ってきた人だけ）
    function showReset(on) {
      var box = $("loginReset");
      if (!box) return;
      box.style.display = on ? "" : "none";
      ["loginEmail", "loginPass", "btnLogin", "btnSignup", "btnForgot"].forEach(function (id) {
        var el = $(id);
        if (el) el.style.display = on ? "none" : "";
      });
      var mid = ov.querySelector(".login-mid");
      if (mid) mid.style.display = on ? "none" : "";
    }
    async function setNewPass() {
      var pw = $("loginNew").value;
      if (!pw || pw.length < 6) {
        $("loginResetErr").textContent = "6文字以上で決めてください";
        return;
      }
      $("loginResetErr").textContent = "";
      busy(true);
      var r = await sb.auth.updateUser({ password: pw });
      busy(false);
      if (r && r.error) {
        $("loginResetErr").textContent = friendly(r.error);
        return;
      }
      // #のゴミを消してから、ふつうに入る
      recoveryOn = false;
      try {
        var q = String(location.search || "").replace(RESET_MARK, "").replace(/[?&]+$/, "");
        history.replaceState(null, "", location.pathname + q);
      } catch {
        /* 消せなくても入れる */
      }
      showReset(false);
      var u = null;
      try {
        u = (await sb.auth.getUser()).data.user;
      } catch {
        u = null;
      }
      hide();
      if (o.onLogin) o.onLogin(u || {});
    }
    if ($("btnNewPass")) $("btnNewPass").onclick = setNewPass;
    if ($("loginNew"))
      $("loginNew").onkeydown = function (ev) {
        if (ev.key === "Enter") setNewPass();
      };
    // メールから戻ってきていたら、開いた時点でその画面にする
    if (isRecovery()) {
      showReset(true);
      show();
    }
    // ★もう1つの道：Supabase からの合図。目印が消えていてもこれで拾える。
    try {
      if (sb && sb.auth && sb.auth.onAuthStateChange) {
        sb.auth.onAuthStateChange(function (ev) {
          if (ev === "PASSWORD_RECOVERY") {
            recoveryOn = true;
            showReset(true);
            show();
          }
        });
      }
    } catch {
      /* 合図が取れなくても、目印の方で拾える */
    }

    $("btnLogin").onclick = login;
    $("btnSignup").onclick = signup;
    if ($("btnForgot")) $("btnForgot").onclick = forgot;
    $("loginPass").onkeydown = function (ev) {
      if (ev.key === "Enter") login();
    };

    return {
      show: show,
      hide: hide,
      error: err,
      el: ov,
      isRecovery: isRecovery,
      showReset: showReset,
    };
  }

  root.ExallyLogin = { mount: mount, friendly: friendly, isRecovery: isRecovery };
})(typeof window !== "undefined" ? window : this);
