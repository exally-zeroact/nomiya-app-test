import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/* 「テストはテスト、本番は本番」を機械で縛る。
 *
 *   nomiya-app       … 本番。本番倉庫 tnfwipbgfgjaymlszeid を見る
 *   nomiya-app-test  … テスト。DB-test khawdrnvssdenumbiwfg を見る
 *
 * ★2つのrepoで違ってよいのは4本★（2026-08-07 実測して数え直した）
 *     js/supa-config.js … どの倉庫を見るか
 *     package.json / package-lock.json … repoの名前
 *     CLAUDE.md … そのrepo向けの作業の決まり
 *   前はここに「違うのは js/supa-config.js の1本だけ」と書いてあったが、
 *   ★実際は4本違っていた＝書いてある決まりと実物がズレていた★。
 *   4本かどうかを機械で数えるのは scripts/compare-repos.mjs（npm run compare・手元専用）。
 *
 * このテストファイル自体は両方のrepoで同じ物で、package.json の名前を見て
 * 「このrepoはどっちを向いているべきか」を判定する＝取り違えたら赤くなる。
 */
/* ★どこに書いてあるかは tests/app-source.mjs だけが知っている★
   HTML の中でも、分割した nomiya-ui-*.js の中でも、同じ物が返る。 */
import { ROOT, HTML, PAGE_JS, SCRIPT_SRCS } from "./app-source.mjs";
/* ★元が空なら その場で赤になる部品（他アプリにもそのまま配れる）★ */
import { expectNoneOf, expectCountOf } from "./check-kit.mjs";

const R = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const CONF = R("js/supa-config.js");
const SQL = R("supabase/schema-nomiya.sql");
const LIVE = R("tests/live-nomiya.mjs");
const LIVEUI = R("tests/live-nomiya-ui.mjs");
const PKG = JSON.parse(R("package.json"));

const PROD = "tnfwipbgfgjaymlszeid"; // 本番倉庫
const DBTEST = "khawdrnvssdenumbiwfg"; // テスト用DB
// このrepoが向いているべき倉庫（名前で決まる。名前を変えたら向き先も変える）
const IS_PROD_REPO = PKG.name === "nomiya-app";
const MUST = IS_PROD_REPO ? PROD : DBTEST;

describe("飲み屋アプリ 倉庫の向き先（テストはテスト・本番は本番）", () => {
  it("repoの名前が nomiya-app か nomiya-app-test のどちらかである", () => {
    expect(["nomiya-app", "nomiya-app-test"]).toContain(PKG.name);
  });

  it("向き先を決めているのは js/supa-config.js の1本だけ", () => {
    const m = CONF.match(/https:\/\/([a-z]+)\.supabase\.co/);
    expect(m, "supa-config.js に倉庫のURLが無い").not.toBe(null);
    expect(m[1], PKG.name + " が向くべき倉庫と違う").toBe(MUST);
    expect(CONF).toContain("window.SUPA");
    const key = CONF.match(/key:\s*"([^"]+)"/);
    expect(key, "公開鍵が無い").not.toBe(null);
    expect(key[1].length).toBeGreaterThan(20);
  });

  it("配る物には倉庫の名前を1文字も書かない（2つのrepoで同じ物にするため）", () => {
    expect(HTML.includes(PROD), "HTMLに本番倉庫が直書きされている").toBe(false);
    expect(HTML.includes(DBTEST), "HTMLにDB-testが直書きされている").toBe(false);
    expect(PAGE_JS.includes(PROD), "画面のJSに本番倉庫が直書きされている").toBe(false);
    expect(PAGE_JS.includes(DBTEST), "画面のJSにDB-testが直書きされている").toBe(false);
    // 倉庫は supa-config から受け取る（分割しても、画面のJSのどこかに1回はある）
    expect(PAGE_JS).toMatch(/var SUPA_URL = \(window\.SUPA \|\| \{\}\)\.url/);
    expect(PAGE_JS).toMatch(/var SUPA_KEY = \(window\.SUPA \|\| \{\}\)\.key/);
  });

  /* ★読み込む順番★
     supa-config.js が先。これを使う exally-login.js と画面のJSは後。
     ★?v=<SHA> が付いても壊れないように、SCRIPT_SRCS（?以降を落とした一覧）で見る★
     （前は HTML.indexOf('src="js/supa-config.js"') で見ていたので、
       版を付けた瞬間に -1 になって赤くなった） */
  it("supa-config.js は、それを使う部品より先に読み込む（?v= が付いても効く）", () => {
    const at = (f) => SCRIPT_SRCS.indexOf(f);
    expect(at("js/supa-config.js"), "supa-config.js を読んでいない").toBeGreaterThan(-1);
    expect(at("exally-login.js"), "exally-login.js を読んでいない").toBeGreaterThan(-1);
    expect(at("exally-login.js")).toBeGreaterThan(at("js/supa-config.js"));
    // 画面のJSを分割したら、それも supa-config より後で読む
    SCRIPT_SRCS.filter((s) => s.includes("nomiya-ui-")).forEach((s) =>
      expect(at(s), s + " が supa-config より先に読まれている").toBeGreaterThan(
        at("js/supa-config.js")
      )
    );
  });

  it("CSPは supabase 全体を許す形（倉庫名を書かない）＋つなぐ先は絞ったまま", () => {
    const csp = HTML.match(/content="default-src[^"]+"/);
    expect(csp, "CSP が見つからない").not.toBe(null);
    expect(csp[0]).toContain("https://*.supabase.co");
    expect(csp[0]).toContain("object-src 'none'");
    expect(csp[0]).toContain("base-uri 'none'");
  });

  /* ★倉庫の場所（どのSupabaseにつなぐか）を書いてよいのは js/supa-config.js だけ。
     2つのrepoで違うのはこの1本と package.json の名前だけ、という決まりを機械で守る。
     配るファイルのどこかに倉庫の名前が混ざると、テストrepoが本番に書く事故になる。
     ※CSPの "https://*.supabase.co" は「どこにつないでよいか」の許可であって
       倉庫の場所ではないので、これは通す（倉庫名が入っていたら赤）。 */
  it("★倉庫の場所を書いてよいのは js/supa-config.js だけ（配る物に混ぜない）", () => {
    const REFS = /(khawdrnvssdenumbiwfg|tnfwipbgfgjaymlszeid)/;
    const ship = [];
    const walk = (dir, rel) => {
      for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        if (e.name === "node_modules" || e.name === ".git" || e.name === "test-results") continue;
        const r = rel ? rel + "/" + e.name : e.name;
        if (e.isDirectory()) {
          if (r === "tests" || r === "supabase" || r === ".github") continue;
          walk(path.join(dir, e.name), r);
        } else if (/\.(html|js)$/.test(e.name) && r !== "js/supa-config.js") {
          ship.push(r);
        }
      }
    };
    walk(".", "");
    expect(ship.length, "配るファイルが1つも見つからない").toBeGreaterThan(2);
    const bad = [];
    for (const f of ship) {
      const t = fs.readFileSync(path.join(ROOT, f), "utf8");
      if (REFS.test(t)) bad.push(f + " に倉庫の名前が書いてある");
      // supabase.co を書いてよいのは CSP の「*.supabase.co」だけ
      const hits = (t.match(/[a-z0-9*.-]*\.supabase\.co/gi) || []).filter(
        (h) => h.toLowerCase() !== "*.supabase.co"
      );
      if (hits.length) bad.push(f + " に倉庫のURLが書いてある: " + hits.join(","));
    }
    expect(bad, bad.join(" / ")).toEqual([]);
  });

  it("★実機検証は本番倉庫では走らない（テストが本番に書かないための鍵）", () => {
    for (const [f, name] of [
      [LIVE, "live-nomiya.mjs"],
      [LIVEUI, "live-nomiya-ui.mjs"],
    ]) {
      // 倉庫は自分で書かず supa-config から読む
      expect(f.includes(PROD), name + " に本番倉庫が直書きされている").toBe(false);
      expect(f.includes(DBTEST), name + " にDB-testが直書きされている").toBe(false);
      expect(f, name + " が supa-from-config を読んでいない").toContain("supa-from-config.mjs");
      expect(f, name + " が readSupaConfig を呼んでいない").toMatch(/readSupaConfig\(\)/);
    }
    // その readSupaConfig が、本番倉庫なら本当に止めること
    const gate = R("tests/supa-from-config.mjs");
    expect(gate).toContain('PROD_WAREHOUSE = "' + PROD + '"');
    expect(gate, "本番倉庫でも止まらない").toMatch(
      /if \(url\.includes\(PROD_WAREHOUSE\)\)[\s\S]{0,400}?process\.exit\(1\)/
    );
  });

  it("★実機検証は「使い捨て（匿名）」でしか動かない＝人のアカウントには入らない", () => {
    // 合言葉(パスワード)を持ち回らない。その場かぎりの匿名アカウントで試す形。
    // こうすると、人手も要らないし、漏れて困る物も無い。
    for (const [f, name] of [
      [LIVE, "live-nomiya.mjs"],
      [LIVEUI, "live-nomiya-ui.mjs"],
    ]) {
      expect(f, name + " が匿名サインインを使っていない").toContain("signInAnonymously()");
      // 合言葉を使う道が残っていないこと（残っていると人の垢で走れてしまう）
      expect(f.includes("signInWithPassword"), name + " がまだ合言葉でログインする").toBe(false);
      expect(f.includes("cred.json"), name + " がまだ合言葉のファイルを読む").toBe(false);
      expect(f.includes("#loginPass"), name + " がまだ合言葉を打ち込む").toBe(false);
      // 匿名でなければ止まる、と書いてあること
      expect(f, name + " に「匿名でなければ中止」が無い").toMatch(/user\.email[\s\S]{0,160}?die\(/);
    }
  });

  it("棚のDDLは、どちらの倉庫にもそのまま当てられる（冪等・RLS込み）", () => {
    expect(SQL).toContain("create table if not exists castally.nomiya_staff");
    expect(SQL).toContain("enable row level security");
    expect(SQL).toMatch(/alter table castally\.nomiya_staff add column if not exists back_pct/);
    expect(SQL).toMatch(/alter table castally\.nomiya_work add column if not exists amount/);
    // ★public の窓口(view)は「呼んだ人の権利」で開く＝RLSがそのまま効く。
    //   ここが抜けると、他の店のデータが見えるようになる。
    expect(SQL).toMatch(
      /create or replace view public\.nomiya_sales with \(security_invoker = true\)/
    );
    const views = [...SQL.matchAll(/create or replace view public\.(\w+) with \(([^)]*)\)/g)];
    expect(views.length, "public の窓口が8つない").toBe(8);
    views.forEach((m) =>
      expect(m[2].replace(/\s/g, ""), m[1] + " が security_invoker=true でない").toBe(
        "security_invoker=true"
      )
    );
  });

  /* ★SQLを1文ずつに割る。割れていなければ その場で赤にする★
     ------------------------------------------------------------------------------
     2026-08-08 に見つけた自分の穴:
     ここは「push したら自動で当たる」仕組みの ★最後の砦★ なのに、
     割った結果が空でないことを1度も確かめていなかった。
     stmts が [] になると、下の3つの確認は ★全部 素通りで緑★ になる。
     「いま空にならないのは、ファイルが無ければ読み込みで落ちるから」という
     ★偶然に頼っていた★。だから ここで自分の足元を確かめる:
       ① 文の数が現実的にあること（実測 76文）
       ② ★本当に1文ずつに割れていること★（; を使わない書き方に変えられても気づく）
          ＝棚8つ・窓口8つが、それぞれ別の文として数えられること
     ★3つの確認は別々の it にしてある★＝ここが崩れたら3つとも赤になる。 */
  /** SQLを1文ずつに割る。★割れていなければ ここで赤にする★
      2026-08-08: ここは「push したら自動で当たる」仕組みの最後の砦なのに、
      割った結果が空でも下の確認が素通りで緑になっていた。
      いまは ★expectNoneOf が「元が空です」と言って落ちる★ ので、
      うっかり空にしても気づける。ここでは「区切れているか」だけを見る。 */
  function statements() {
    const stmts = SQL.split(/\r?\n/)
      .filter((l) => !/^\s*--/.test(l))
      .join("\n")
      .split(";")
      .map((s) => s.trim().replace(/\s+/g, " "))
      .filter(Boolean);
    // ★1文ずつに割れているか（; を使わない書き方に変えられても気づく）★
    expectCountOf(
      stmts,
      (s) => /^create table if not exists castally\.nomiya_/i.test(s),
      8,
      "棚を作る文が1文ずつに割れているか"
    );
    expectCountOf(
      stmts,
      (s) => /^create or replace view public\.nomiya_/i.test(s),
      8,
      "窓口を作る文が1文ずつに割れているか"
    );
    return stmts;
  }

  it("★棚のDDLに「消す系」が1つも無い（自動で当てても、データが消えない）", () => {
    // push したら自動で当たる仕組みにしたので、ここが最後の砦。
    // うっかり drop table を書いたら、当てる前にCIが落ちる。
    const stmts = statements();
    expectNoneOf(
      stmts,
      (s) =>
        /\b(drop\s+table|drop\s+schema|drop\s+database|drop\s+column|truncate|delete\s+from|update\s+\w+\s+set)\b/i.test(
          s
        ),
      "棚のDDLに消す系のSQLが入っている",
      { min: 20 }
    );
  });

  it("★棚のDDLは、飲み屋の棚以外に触らない（他アプリと同じ倉庫に同居している）", () => {
    const stmts = statements();
    expectNoneOf(
      stmts,
      (s) =>
        !/nomiya_/i.test(s) &&
        !/create extension/i.test(s) &&
        !/^create schema if not exists castally$/i.test(s),
      "飲み屋以外の棚に触っている",
      { min: 20 }
    );
  });

  it("★棚のDDLは、他のアプリの部屋(kyuyo/daikome/amakase/daikou/exally)に1文字も触らない", () => {
    const stmts = statements();
    expectNoneOf(
      stmts,
      (s) => /(kyuyo|daikome|amakase|daikou|exally)\./i.test(s),
      "他のアプリの部屋に触っている",
      { min: 20 }
    );
  });

  it("このrepoに、別のアプリのファイルが混ざっていない（飲み屋だけのrepo）", () => {
    const files = fs.readdirSync(ROOT);
    for (const ng of ["daikou-seikyu.html", "book.html", "kyuuryoumeisai.html", "seikyusyo.html"]) {
      expect(files, "別のアプリが混ざっている: " + ng).not.toContain(ng);
    }
  });
});
