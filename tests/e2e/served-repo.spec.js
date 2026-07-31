import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/* ★E2Eが「別のrepoのファイル」を試していないことを確かめる。
 *
 * 2026-08-01 の事故: 別repoのサーバーが同じポートに残っていて、
 * こっちのファイルを1つも開かないまま「全部緑」と出た。
 * 画面のテストは全部この確認のあとに意味を持つので、ここを最初に置く。
 */
const PKG = JSON.parse(fs.readFileSync(path.resolve("package.json"), "utf8"));
const PROD = "tnfwipbgfgjaymlszeid";
const DBTEST = "khawdrnvssdenumbiwfg";
const EXPECT = PKG.name === "nomiya-app" ? PROD : DBTEST;

test.describe("配信しているのは、このrepoの物か", () => {
  test("画面が受け取る倉庫が、このrepoの supa-config と一致する", async ({ page }) => {
    await page.goto("/nomiya-uriage.html", { waitUntil: "load" });
    const url = await page.evaluate(() => (window.SUPA || {}).url || "");
    expect(url, "supa-config.js が読み込まれていない").toContain(".supabase.co");
    expect(url, PKG.name + " なのに別の倉庫を配信している").toContain(EXPECT);
  });

  test("このrepoに無いページは、配信されない（別repoを掴んでいない）", async ({ page }) => {
    for (const ng of ["/daikou-seikyu.html", "/book.html", "/kyuuryoumeisai.html"]) {
      const res = await page.request.get(ng);
      expect(res.status(), ng + " が返ってきた＝別repoを配信している").toBe(404);
    }
  });
});
