/* measure-start.mjs — 「最初の画面が出るまで」を測る。
 * ------------------------------------------------------------------------------
 *  使い方:  npm run measure                       （配信中のこのrepoのサイト）
 *           npm run measure -- <URL> [回数]
 *
 * ★なぜ要るか★
 *   この製品の芯は「固まらない・速い・滑らか」。店の人が毎晩開く。
 *   画面のJSを7本に分けたので、取りに行く本数が増えた。
 *   ★見た目の話ではなく、数字で「遅くなっていないか」を言えるようにする★
 *
 * ★測り方★
 *   ① 初めての人  … 毎回まっさらな入れ物（キャッシュ無し）
 *   ② 2回目の人   … 同じ入れ物でもう一度開く（版付きのJSは取りに行かないはず）
 *   どちらも複数回の中央値で出す（1回目は回線の温まり待ちで大きく出るため）。
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const NAME = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).name;
const DEFAULT_URL = `https://${NAME}.vercel.app/nomiya-uriage.html`;

const URL_ = process.argv[2] || DEFAULT_URL;
const N = Number(process.argv[3] || 5);

const med = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
};

async function once(page) {
  let reqs = 0;
  let bytes = 0;
  const onFin = async (r) => {
    reqs++;
    try {
      const sz = (await r.sizes()).responseBodySize;
      if (sz > 0) bytes += sz;
    } catch {
      /* 数えられない物は足さない */
    }
  };
  page.on("requestfinished", onFin);
  await page.goto(URL_, { waitUntil: "load" });
  await page.waitForTimeout(1200);
  const t = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0] || {};
    const fcp = performance.getEntriesByName("first-contentful-paint")[0];
    return {
      fcp: fcp ? Math.round(fcp.startTime) : null,
      dcl: Math.round(nav.domContentLoadedEventEnd || 0),
      load: Math.round(nav.loadEventEnd || 0),
    };
  });
  page.off("requestfinished", onFin);
  return { ...t, reqs, kb: Math.round(bytes / 1024) };
}

const browser = await chromium.launch();
const cold = [];
const warm = [];

for (let i = 0; i < N; i++) {
  const ctx = await browser.newContext(); // まっさら＝初めての人
  const page = await ctx.newPage();
  cold.push(await once(page));
  warm.push(await once(page)); // 同じ入れ物でもう一度＝2回目の人
  await ctx.close();
}
await browser.close();

const show = (label, rows) => {
  console.log(`★${label}（${N}回の中央値）★`);
  console.log(`  FCP(最初に何か出るまで) : ${med(rows.map((r) => r.fcp))} ms`);
  console.log(`  DOMContentLoaded        : ${med(rows.map((r) => r.dcl))} ms`);
  console.log(`  load(全部読み終わり)    : ${med(rows.map((r) => r.load))} ms`);
  console.log(`  リクエスト本数          : ${med(rows.map((r) => r.reqs))} 本`);
  console.log(`  受け取り                : ${med(rows.map((r) => r.kb))} KB`);
  console.log("");
};

console.log(`測った先: ${URL_}`);
console.log("");
show("初めての人（キャッシュ無し）", cold);
show("2回目の人（同じ入れ物で開き直し）", warm);
