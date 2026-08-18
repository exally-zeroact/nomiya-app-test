/* ファイルの渡し口（保存・書き出し）の見張り。
 * ------------------------------------------------------------------------------
 * ★何を守るか★
 *   ホーム画面に登録したアプリ（standalone）では、URL欄も戻るボタンも無い。
 *   そこで `<a download href=blob:…>` を ★同じ窓★ で開くと、端末のファイル画面に
 *   飛んだきり ★アプリを殺すしか帰れない★（AIラジオ 2026-08-05 で実際に閉じ込められた）。
 *   → 全アプリ共通の決まり：生ファイル／blob へ渡す `<a>` には ★必ず target="_blank"★。
 *
 * ★どう守るか★
 *   渡し口を `saveAsFile()`（nomiya-ui-base.js）★ただ1つ★にして、
 *   ① saveAsFile が download / target=_blank / rel=noopener を全部書いている
 *   ② それ以外の所で `a.download = …` を書いていない（増やしたらここで赤くなる）
 *   を、★配っているJSそのもの★（HTMLが読んでいる物）から測る。
 *
 * ※これは「書いてあるか」の見張り。★実際に押した時に本当に付くか★は
 *   tests/e2e/nomiya-uriage.spec.js の「㉗ ファイルの渡し口」で、
 *   実UIのボタンを押して <a> を捕まえて測っている（両方要る）。
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ROOT, SCRIPT_SRCS, LAZY_JS } from "./app-source.mjs";

/** 配っている自前のJS（vendor は他人の物なので見ない） */
const APP_JS = SCRIPT_SRCS.filter((s) => !s.startsWith("vendor/")).filter((s) =>
  fs.existsSync(path.join(ROOT, s))
);
/* ★あとから読む物まで入れる★（2026-08-18）
   HTMLの <script src> だけを見ていたので、押した時に読む nomiya-owntpl.js などを
   ★1文字も見ていなかった★＝その範囲については「何も見ていない緑」だった。 */
const SRC = APP_JS.map((f) => ({
  file: f,
  text: fs.readFileSync(path.join(ROOT, f), "utf8"),
})).concat(LAZY_JS);

/** コメントを外して見る（説明文の中の `a.download` を本物と間違えないため） */
function code(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

const OWNER = "nomiya-ui-base.js"; // 渡し口を持ってよい ただ1つのファイル

describe("ファイルの渡し口（ホーム画面アプリで閉じ込められない）", () => {
  it("★配っている自前のJSを読めている（読めていなければ、この見張りは何も見ていない）★", () => {
    expect(APP_JS.length, "HTMLが読んでいる自前のJSが1本も取れない").toBeGreaterThanOrEqual(8);
    /* ★あとから読む物も範囲に入っているか★＝ここが空だと、その分だけ黙って見なくなる */
    expect(
      SRC.map((s) => s.file),
      "★あとから読むJSが範囲に入っていない＝そこは何も見ていない★"
    ).toEqual(expect.arrayContaining(["nomiya-owntpl.js", "nomiya-tpl.js", "nomiya-xlsx-tpl.js"]));
    expect(
      SRC.some((s) => path.basename(s.file) === OWNER),
      OWNER + " を読んでいない（渡し口の置き場所が変わったのに、この見張りを直していない）"
    ).toBe(true);
  });

  it("★渡し口 saveAsFile は download / target=_blank / rel=noopener を全部書く★", () => {
    const base = SRC.find((s) => path.basename(s.file) === OWNER);
    const fn = code(base.text).match(/function\s+saveAsFile\s*\([\s\S]*?\n\}/);
    expect(fn, "saveAsFile() が見つからない").toBeTruthy();
    const body = fn[0];
    expect(/\.download\s*=/.test(body), "saveAsFile がファイル名を付けていない").toBe(true);
    expect(
      /\.target\s*=\s*["']_blank["']/.test(body),
      "★saveAsFile に target=_blank が無い＝ホーム画面アプリが閉じ込められる★"
    ).toBe(true);
    expect(
      /\.rel\s*=\s*["']noopener["']/.test(body),
      "saveAsFile に rel=noopener が無い（別窓から元の画面を触れてしまう）"
    ).toBe(true);
  });

  it("★保存は saveAsFile 以外に作らない（a.download を勝手に増やさない）★", () => {
    const hits = [];
    for (const s of SRC) {
      const c = code(s.text);
      const n = (c.match(/\.download\s*=/g) || []).length;
      if (!n) continue;
      if (path.basename(s.file) === OWNER && n === 1) continue; // 渡し口ぴったり1つ
      hits.push(s.file + "(" + n + "か所)");
    }
    expect(
      hits,
      "★saveAsFile を通さない保存がある: " +
        hits.join(" ") +
        " ／ 通さないと target=_blank が付かず、ホーム画面アプリで戻れなくなる★"
    ).toEqual([]);
  });

  it("★渡し口が1つも無い＝この見張りは何も見ていない★", () => {
    const total = SRC.reduce((a, s) => a + (code(s.text).match(/\.download\s*=/g) || []).length, 0);
    expect(total, "a.download を書いている所が1つも無い").toBe(1);
    const users = SRC.filter((s) => /\bsaveAsFile\s*\(/.test(code(s.text))).map((s) =>
      path.basename(s.file)
    );
    expect(
      users.filter((f) => f !== OWNER).length,
      "saveAsFile を呼んでいる画面が1つも無い（渡し口が使われていない）"
    ).toBeGreaterThanOrEqual(2);
  });
});

/* ★ボタンの言葉は「何が手に入るか」だけ書く（中の動きを書かない）★
   司さん「意味わからない」2026-08-17。「入れて出す」＝中で何をするかの説明。
   ★画面の字はJSが上書きするので、HTMLだけ直しても直った気になる★（実測）。
   だからHTMLとJSの両方から、人に見せる字として残っていないかを見る。
   実UIの側は tests/e2e/own-template-repair.spec.js の④が押して測る。 */
describe("人に見せるボタンの言葉", () => {
  const HTML_AND_JS = [
    { file: "nomiya-uriage.html", text: fs.readFileSync(path.join(ROOT, "nomiya-uriage.html"), "utf8") },
  ].concat(SRC);
  const ALL = HTML_AND_JS.map((s) => s.text).join("\n");
  /* ★コメントを外すのは「ファイルごと」★
     束ねてから外すと、HTMLの中の "/*" が別のファイルの終わりと組になって
     ★間の中身を丸ごと消す★（この見張りを書いた1回目で実際に踏んだ＝0件になった）。 */
  const CODE = HTML_AND_JS.map((s) => code(s.text)).join("\n");

  /* ★同じ動きは、アプリのどこでも同じ言い方★（司さん 2026-08-17「なんで統一させてないんど」）
     私は請求書側だけ「Excelにする」と付けて、★一覧タブに既に在る「Excelに書き出す」を数えなかった★。
     ＝CLAUDE.md 5章「作る前に、社内に同じ物が無いか探す」を飛ばした。
     だから ★言い方が2通りになったら赤★ にする。 */
  const BANNED = [
    ["入れて出す", "中の動きを書いている"],
    ["入れて渡す", "中の動きを書いている"],
    ["Excelにする", "書き出しの言い方が2通りになる（正は「Excelに書き出す」）"],
    ["テンプレを選ぶ", "読み込みの言い方が2通りになる（正は「お店の様式を読み込む」）"],
    /* ★中の言葉を見せない★（2026-08-18 実測：0コ空にしたのに「割り当てを決めました」と出ていた）
       画面はどこでも「書く場所」で言う。 */
    ["割り当て", "中の言葉（人に見せる字は「書く場所」）"],
  ];

  it("★言い方が2通りになる言葉が、配る物に残っていない★", () => {
    const hits = [];
    for (const s of HTML_AND_JS) {
      const c = code(s.text);
      BANNED.forEach(function (b) {
        if (c.includes(b[0])) hits.push(s.file + "の「" + b[0] + "」＝" + b[1]);
      });
    }
    expect(hits, "★" + hits.join(" / ") + "★").toEqual([]);
  });

  it("★正しい言い方が、要る所ぜんぶに在る（消しただけになっていない）★", () => {
    // Excelを受け取るボタンは2か所（一覧の売上帳／請求書のお店の様式）＝同じ言葉で始まる
    const n = (ALL.match(/Excelに書き出す/g) || []).length;
    expect(n, "「Excelに書き出す」が足りない（一覧と請求書の2か所に要る）").toBeGreaterThanOrEqual(3);
    expect(ALL.includes("Excelに書き出す（お店の様式）"), "請求書側の言葉が無い").toBe(true);
    expect(ALL.includes("お店の様式を"), "読み込み側の言葉が無い").toBe(true);
    expect(ALL.includes("印刷 / PDFにする"), "印刷の言葉が変わっている").toBe(true);
  });

  it("★同じ動きの言い方を数える（増えたら気づく）★", () => {
    const 書き出し = ["Excelに書き出す", "Excelにする", "Excelで出す", "Excelを作る", "入れて出す"].filter(
      (w) => CODE.includes(w)
    );
    const 読み込み = ["お店の様式を", "テンプレを選ぶ", "様式を選ぶ", "紙を選ぶ"].filter((w) =>
      CODE.includes(w)
    );
    expect(書き出し, "★書き出しの言い方が2通り以上ある: " + 書き出し.join("・") + "★").toEqual([
      "Excelに書き出す",
    ]);
    expect(読み込み, "★読み込みの言い方が2通り以上ある: " + 読み込み.join("・") + "★").toEqual([
      "お店の様式を",
    ]);
    /* ★当てた結果の言い方も1通りにする★＝「当てておきました」「当て直しました」「で決めました」は
       どれも ★「書く場所を ○コ」★ で始める。数え方が2通りになるのを、増えた瞬間に赤くする。 */
    const 場所 = ["書く場所", "割り当て", "入れる所", "書き込み先"].filter((w) => CODE.includes(w));
    expect(場所, "★書く場所の言い方が2通り以上ある: " + 場所.join("・") + "★").toEqual(["書く場所"]);
  });

  /* ★同じ物を2通りで数えたら、どちらが本当か分からなくなる★（指示役 2026-08-18 ②）
     画面は「入っている 12 コ」、書き出す前は「10マス」。数が違うのは正しいが、
     ★言葉の中で結び付いていないと「12と言われた直後に10」になる★。 */
  it("★書き出す前の断り書きは、2つの数を結び付けて出す★", () => {
    const src = SRC.map((s) => s.text).join(String.fromCharCode(10));
    expect(src.includes("マス★ に入れます（決めてある書く場所は "), "マスの数と書く場所の数が結び付いていない").toBe(true);
  });
});
