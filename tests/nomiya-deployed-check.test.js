import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  judgePage,
  check,
  defaultHost,
  selfTest,
} from "../scripts/check-deployed-version.mjs";
import { ROOT } from "./app-source.mjs";

/* ★「push した・CIが緑」は「客に届いた」ではない★（2026-08-18 指示役／exallyで実際に起きた）
 *
 * ここでは ★外の網に1回も出ない★。偽の網（get を差し替える）で、
 *   ・全部そろっている → 届いた
 *   ・1本だけ版が古い → ★赤★
 *   ・呼ばれる側が404  → ★赤★
 * を数える。＝この見張り自体が「何も見ていないのに緑」になっていないかを見る。
 */

const PAGE = "nomiya-uriage.html";
const html = fs.readFileSync(path.join(ROOT, PAGE), "utf8");

/** 手元の中身をそのまま配っている、正しい配信を作る */
function 偽の網(pageHtml, opt = {}) {
  const 落とす = opt.落とす || [];
  const 中身を変える = opt.中身を変える || [];
  return async (url) => {
    const rel = url.split("?")[0].replace(/^https?:\/\/[^/]+\//, "");
    if (rel === PAGE) return { status: 200, body: Buffer.from(pageHtml, "utf8") };
    if (落とす.includes(rel)) return { status: 404, body: null };
    const buf = fs.readFileSync(path.join(ROOT, rel));
    if (中身を変える.includes(rel)) return { status: 200, body: Buffer.concat([buf, Buffer.from("/*古い*/")]) };
    return { status: 200, body: buf };
  };
}

describe("配信の見張り（客に届いているか）", () => {
  it("見ている本数が0本ではない＝何も見ていない緑にならない", () => {
    const r = selfTest(ROOT);
    expect(r.見ている本数).toBeGreaterThan(5);
  });

  it("手元と同じ物が配信されていれば「届いた」", async () => {
    const r = await check({ host: "https://例", root: ROOT, get: 偽の網(html) });
    expect(r.版.length).toBeGreaterThan(5);
    expect(r.届いた, r.理由).toBe(true);
  });

  it("★1本だけ版が古い配信★を赤くする", async () => {
    const 古い = html.replace(/\?v=[0-9a-f]{8}/, "?v=deadbeef");
    const r = await check({ host: "https://例", root: ROOT, get: 偽の網(古い) });
    expect(r.届いた).toBe(false);
    expect(r.理由).toContain("配信の版が古い");
  });

  it("★呼ばれる側が404★を赤くする（HTMLだけ新しい状態）", async () => {
    const 部品 = judgePage(html, ROOT)[0].file;
    const r = await check({ host: "https://例", root: ROOT, get: 偽の網(html, { 落とす: [部品] }) });
    expect(r.届いた).toBe(false);
    expect(r.理由).toContain("呼ばれる側が届いていない");
  });

  it("★版は合うのに中身だけ違う配信★も赤くする", async () => {
    const 部品 = judgePage(html, ROOT)[0].file;
    const r = await check({ host: "https://例", root: ROOT, get: 偽の網(html, { 中身を変える: [部品] }) });
    expect(r.届いた).toBe(false);
  });

  it("画面そのものが出ない（404）なら赤", async () => {
    const r = await check({ host: "https://例", root: ROOT, get: async () => ({ status: 404, body: null }) });
    expect(r.届いた).toBe(false);
    expect(r.理由).toContain("404");
  });

  it("★見に行く先はフォルダ名ではなく package.json の名前で決まる★", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
    const host = defaultHost(ROOT);
    expect(host).toBe(
      pkg.name === "nomiya-app" ? "https://nomiya-app.vercel.app" : "https://nomiya-app-test.vercel.app"
    );
  });
});
