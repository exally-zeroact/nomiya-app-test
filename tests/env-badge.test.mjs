/* env-badge.test.mjs — ★テスト環境の帯★
 *
 * ★正本は rakually-test/tests/env-badge.test.mjs（指示役 2026-08-28）★
 *   ★借りたのは仕組みだけ★。飲み屋向けに直したのは次の3つだけ:
 *     ・配信される画面の数え方（Rakually は kyuyo/seikyu の下も見る。飲み屋は直下だけ）
 *     ・画面の下限（飲み屋は 2枚＝nomiya-uriage.html / castally-admin.html）
 *     ・部品の名前（js/env-badge.js は同じ・色と言葉だけ飲み屋の物）
 *
 * なぜ必要か（2026-08-11 指示役の実測）:
 *   Exally だけ URL が他の5アプリと違う形で（本番=Vercel／テスト=GitHub Pages）、
 *   ★見た目で本番かテストか分からない★。本番だと思ってテストに打つ／
 *   テストのつもりで本番を触る、が起きる。だから画面の一番上に帯を出す。
 *
 * ここで止めたい事故（重い順）:
 *   ① ★本番に「テスト環境」と出る★  … 本番を軽く扱って壊す。いちばん危ない。
 *   ② ★1画面でも帯が出ない★        … 出ない画面を本番だと思い込む。
 *   ③ 帯のせいで ★画面の頭が隠れる★ … 上の帯・1行目が読めなくなる（iOSの前科）。
 *   ④ 帯の文が ★1文字ずつ縦に割れる★（前科3回）
 *
 * 使い方: node tests/env-badge.test.mjs
 *         node tests/env-badge.test.mjs --self-test
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { repoEnv, envOf } from "../scripts/repo-env.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const require_ = createRequire(path.join(ROOT, "package.json"));
const BADGE = require_(path.join(ROOT, "js/env-badge.js"));

let pass = 0,
  fail = 0;
const T = (n, fn) => {
  try {
    fn();
    pass++;
    console.log("  ✓ " + n);
  } catch (e) {
    fail++;
    console.log("  ✗ " + n + " — " + (e && e.message));
  }
};
const eq = (a, b, m) => {
  if (a !== b)
    throw new Error(
      (m ? m + ": " : "") + "expected " + JSON.stringify(b) + " got " + JSON.stringify(a)
    );
};
const ok = (v, m) => {
  if (!v) throw new Error(m || "false");
};

/* ★この検査も倉庫のIDを書かない★（向き先を持つのは js/supa-config.js だけ）。
   見るのは「配信の名札(env)」だけ。 */
const PROD = { env: "prod" };
const TEST = { env: "test" };

/* ★この見張りは 本番(rakually)へも そのまま運ばれる★（2026-08-26 請求書を本番へ出した日）。
   ＝同じ1本で「テスト線では帯が出る／★本番では帯が出ない★」の両方を見る。
   だから ★この repo が どちらなのか★ を 名札(env)から読んでから 判定を分ける。
   ★読み方は 1か所★＝scripts/repo-env.mjs（覚書に書いた env:'prod' に釣られない）。 */
const ENV = repoEnv(ROOT);

/* 配信される画面＝直下の *.html（飲み屋は 下の階層に画面を置いていない） */
function shippedHtml() {
  return fs
    .readdirSync(ROOT)
    .filter((f) => /\.html$/i.test(f))
    .sort();
}

/* ★純関数（self-test で作り物を通せる）★ やってはいけない方の決め方＝ホスト名で決める */
export function showByHost(host) {
  return String(host || "").indexOf("github.io") >= 0;
}

/* ── self-test：わざと壊して赤になるか ─────────────────────────────── */
if (process.argv.includes("--self-test")) {
  console.log("\n[env-badge --self-test] わざと壊して赤になるか");
  let sp = 0,
    sf = 0;
  const S = (n, fn) => {
    try {
      fn();
      sp++;
      console.log("  ✓ " + n);
    } catch (e) {
      sf++;
      console.log("  ✗ " + n + " — " + (e && e.message));
    }
  };

  S("① ホスト名で決める作り方は、配り方を変えた日に間違える（本物は倉庫で決める）", () => {
    // 本番をVercel以外へ移した/テストをVercelへ移した日に、ホスト名の判定は逆になる
    ok(showByHost("exally-zeroact.github.io"), "作り物が判定していない＝この検査が空振り");
    ok(!showByHost("exally.vercel.app"), "作り物が判定していない＝この検査が空振り");
    // ★本物は配信の名札で決めるので、ホストが変わっても答えは変わらない
    eq(BADGE.shouldShow(TEST), true, "本物がテストの倉庫で出さない");
    eq(BADGE.shouldShow(PROD), false, "★本物が本番の倉庫で出している★");
  });

  S("② 「分からない時は出す」に倒すと、本番に出てしまう（本物は出さない）", () => {
    const naive = (c) => !(c && c.env === "prod"); // 本番と書いていなければ全部 出す
    ok(naive(null) && naive({}), "作り物が出していない＝この検査が空振り");
    eq(BADGE.shouldShow(""), false, "★本物が「分からない」で出している★");
  });

  /* ★2026-08-26 追加★ この見張りは 本番(rakually)へも そのまま運ばれる。
     ＝「この repo はどちらか」を名札から読んで 判定を分ける所が、
       ★名札を読み違えても 気づけるか★ を ここで確かめる。 */
  S("③ 名札が読めない/知らない値なら 赤にする（どちらとも分からないを通さない）", () => {
    /* ★本物の読み手(scripts/repo-env.mjs)を使う★＝ここに写しの正規表現を書くと
       片方だけ直して 本番で判定が逆になる。 */
    /* ★飲み屋向けの直し（5つめ）★ 正本は歯抜けの配列で書いているが、この repo の eslint は
       それを error にする。中身は同じ（1番目を取るだけ）。 */
    const naive = (s) => (String(s).match(/env:\s*'([a-z]+)'/) || ["", ""])[1];
    const trap = "/* 本番は env:'prod' */\nwindow.SUPA = { env: 'test' };";
    eq(naive(trap), "prod", "作り物が釣られていない＝この検査が空振り");
    eq(envOf(trap), "test", "★本物が 覚書の env:'prod' に釣られている★");
    eq(envOf("window.SUPA={ url: 1 };"), "", "名札が無いのに 何かを読んでいる");
    const okEnv = (e) => e === "test" || e === "prod";
    ok(!okEnv(""), "★名札が無いのに 通してしまう★");
    ok(!okEnv("staging"), "★知らない名札を 通してしまう★");
    ok(okEnv(ENV), "★この repo の名札が test でも prod でもない★");
  });

  S("④ 本番で「帯を出す」作りに戻したら 赤になる（本番に嘘の帯を出さない）", () => {
    const bad = (c) => String((c || {}).env || "") !== ""; // 名札が在れば何でも出す
    ok(bad(PROD), "作り物が出していない＝この検査が空振り");
    eq(BADGE.shouldShow(PROD), false, "★本物が本番で帯を出している★");
  });

  console.log("\n[self-test] " + sp + " passed, " + sf + " failed");
  if (sf) process.exit(1);
}

/* ── 本体 ──────────────────────────────────────────────────────── */
console.log("\n[テスト環境の帯]");

/* ① ★本番には絶対に出ない★ ---------------------------------------- */
T("★本番の倉庫では絶対に出さない（いちばん危ない事故）", () => {
  eq(BADGE.shouldShow(PROD), false);
  eq(BADGE.shouldShow("prod"), false, "文字で渡しても本番なら出さない");
  eq(BADGE.shouldShow({ env: "production" }), false, "知らない書き方は出さない");
  eq(BADGE.shouldShow({ env: "TEST" }), false, "大文字違いは「知らない値」として出さない");
});

T("★どちらとも分からない時も出さない（安全側に倒す）", () => {
  eq(BADGE.shouldShow(""), false, "接続設定が空");
  eq(BADGE.shouldShow(null), false);
  eq(BADGE.shouldShow(undefined), false);
  eq(BADGE.shouldShow({}), false, "名札が無い");
  eq(BADGE.shouldShow({ url: "https://example.supabase.co" }), false, "名札の無い接続設定");
});

T("★テストの倉庫だと分かった時だけ出す", () => {
  eq(BADGE.shouldShow(TEST), true);
  eq(BADGE.shouldShow("test"), true, "文字で渡しても効く");
  // ★この repo の接続設定が どの名札を持っているか（配信そのものを見る）
  //   ★どちらでもない・名札が無い は 赤★（「どちらとも分からない」を黙って通さない）
  ok(
    ENV === "test" || ENV === "prod",
    "js/supa-config.js の env が 'test' でも 'prod' でもない: " + JSON.stringify(ENV)
  );
  if (ENV === "test") {
    eq(BADGE.shouldShow(TEST), true, "テスト線なのに帯が出ない");
    console.log("     この repo は ★テスト線★＝帯が出る");
  } else {
    eq(BADGE.shouldShow(PROD), false, "★本番なのに「テスト環境」の帯が出る★");
    console.log("     この repo は ★本番★＝帯は出ない");
  }
});

T("★本番とテストの見分けは「今どの倉庫か」だけで決める（ホスト名を見ていない）", () => {
  const src = fs.readFileSync(path.join(ROOT, "js/env-badge.js"), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, " ");
  ok(!/location\s*\.\s*(host|hostname|href)/.test(code), "ホスト名で決めている");
  ok(!/github\.io|vercel\.app/.test(code), "配り先の名前で決めている");
  ok(code.indexOf("SUPA") >= 0, "接続設定を見ていない");
  // ★倉庫のIDを書かない（向き先を持つのは js/supa-config.js だけ）
  ok(!/[a-z]{20}\.supabase\.co/.test(code), "倉庫のIDを直書きしている");
});

/* ② ★1画面も漏らさない★ ------------------------------------------- */
T("★配信される画面すべてが帯を読み込んでいる（1画面でも抜けたら赤）", () => {
  const files = shippedHtml();
  /* ★実測 5枚★（2026-08-17 rakually-test）＝ index.html ／ kyuyo の3枚 ／ seikyu/index.html。
     前は8枚だった（Exally の book.html・chat.html・hub.html を含んでいた＝Rakunally には無い）。
     ★画面を足したら この下限も上げる★＝「数え漏れ」を人の記憶に頼らないための数。 */
  /* ★本番(rakually)は 入口＋請求書の2枚★（給与は exally に間借りのまま＝運んでいない）。
     下限を repo ごとに分ける＝どちらでも「数え漏れ」を人の記憶に頼らない。 */
  /* ★飲み屋は テスト線も本番も 2枚★（nomiya-uriage.html / castally-admin.html）
     ★画面を足したら この下限も上げる★＝数え漏れを人の記憶に頼らない */
  const floor = 2;
  ok(
    files.length >= floor,
    "画面が少なすぎる（数え漏れ）: " + files.length + " ／ この repo(" + ENV + ") の下限 " + floor
  );
  const miss = files.filter(
    (f) => fs.readFileSync(path.join(ROOT, f), "utf8").indexOf("env-badge.js") < 0
  );
  ok(miss.length === 0, "帯が入っていない画面: " + miss.join(", "));
  console.log("     実測: " + files.length + "画面すべてに入っている（" + files.join(" / ") + "）");
});

T("★帯より先に接続設定を読んでいる（読む順が逆だと判定できず出ない）", () => {
  for (const f of shippedHtml()) {
    const s = fs.readFileSync(path.join(ROOT, f), "utf8");
    const cfg = s.indexOf("supa-config.js");
    const bar = s.indexOf("env-badge.js");
    ok(cfg >= 0, f + " が接続設定を読んでいない（帯が判定できない）");
    ok(cfg < bar, f + " が帯より後に接続設定を読んでいる");
  }
});

/* ③ ★頭が隠れない★ ------------------------------------------------ */
T("★帯のぶんだけ中身を下げる（上の帯・1行目を隠さない）", () => {
  const src = fs.readFileSync(path.join(ROOT, "js/env-badge.js"), "utf8");
  ok(/paddingTop/.test(src), "中身を下げていない（帯が1行目に被る）");
  ok(/sticky/.test(src), "画面の上に貼り付く物（appbar）をずらしていない");
  // ★被せ物(fixed)は動かさない★ 下げると隙間が空き、下がはみ出す（2026-08-11 実機で確認）
  /* ★飲み屋向けの直し（4つめ）★ この repo は prettier が二重引用符に揃えるので
     囲みを どちらでも通す（正本は ' 決め打ち）。見ている中身は同じ。 */
  ok(/cs\.position !== ['\"]sticky['\"]/.test(src), "fixed（ログイン画面・小窓）まで下げている");
  ok(!/cs\.position !== ['\"]fixed['\"]/.test(src), "fixed を対象に含めている");
  ok(/offsetHeight/.test(src), "帯の高さを実際に測っていない（決め打ちは2行になった時に破れる）");
  ok(/resize/.test(src), "幅が変わった時に合わせ直していない");
});

T("★iOSの時計に潜らない（safe-area を足している）", () => {
  ok(/env\(safe-area-inset-top\)/.test(BADGE.CSS), "safe-area を見ていない");
});

/* ④ ★文が縦に割れない★ -------------------------------------------- */
T("★帯の文が1文字ずつ縦に割れない書き方（前科3回）", () => {
  ok(!/word-break\s*:\s*break-all/.test(BADGE.CSS), "break-all がある");
  ok(/white-space\s*:\s*normal/.test(BADGE.CSS), "折り返せない");
  ok(/overflow-wrap\s*:\s*break-word/.test(BADGE.CSS), "長い語がはみ出す");
  ok(!/display\s*:\s*flex|display\s*:\s*grid/.test(BADGE.CSS), "flex/grid の箱に文を入れている");
});

T("★紙には出さない（印刷したら消える）", () => {
  ok(/@mediaprint\{#envbar\{display:none/.test(BADGE.CSS.replace(/\s/g, "")), "刷った紙に帯が出る");
});

T("★文言が「何が起きるか」を言っている（ただの札にしない）", () => {
  const src = fs.readFileSync(path.join(ROOT, "js/env-badge.js"), "utf8");
  ok(/テスト環境/.test(src), "見出しが無い");
  ok(/本番には入りません/.test(src), "「ここで入れた物は本番に入らない」と言っていない");
});

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
