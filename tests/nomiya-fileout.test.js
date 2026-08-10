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
import { ROOT, SCRIPT_SRCS } from "./app-source.mjs";

/** 配っている自前のJS（vendor は他人の物なので見ない） */
const APP_JS = SCRIPT_SRCS.filter((s) => !s.startsWith("vendor/")).filter((s) =>
  fs.existsSync(path.join(ROOT, s))
);
const SRC = APP_JS.map((f) => ({ file: f, text: fs.readFileSync(path.join(ROOT, f), "utf8") }));

/** コメントを外して見る（説明文の中の `a.download` を本物と間違えないため） */
function code(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

const OWNER = "nomiya-ui-base.js"; // 渡し口を持ってよい ただ1つのファイル

describe("ファイルの渡し口（ホーム画面アプリで閉じ込められない）", () => {
  it("★配っている自前のJSを読めている（読めていなければ、この見張りは何も見ていない）★", () => {
    expect(APP_JS.length, "HTMLが読んでいる自前のJSが1本も取れない").toBeGreaterThanOrEqual(8);
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
