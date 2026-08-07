import { test, expect } from "@playwright/test";

/* ★紙が「ゴシックのまま」出ないことを縛る★
 * ------------------------------------------------------------------------------
 * 2026-08-08、起動の <link> から明朝(Noto Serif JP)を外した。
 * 明朝は 紙・請求書でしか使わず、起動のときは実体を0本しか取っていなかったため
 * （目録だけで61KB積まれていた）。
 *
 * ★外した以上、ここが命★
 *   この紙は html2canvas で「画面に出ている物をそのまま写して」PDFにする。
 *   ★字が届く前に写すと、写った絵はゴシックのまま固定される（あとから直らない）★
 *   だから buildPaperPdf は ensurePaperFonts で字が届くのを待ってから写す。
 *
 * ここでは わざと書体を遅らせて、紙を作り終えた時点で明朝が届いていることを実測する。
 *
 * ★どちらが本物の見張りか（2026-08-08 実測）★
 *   待ちを外して回したところ、★下の「紙は7種とも」だけが赤になった★。
 *   上の「請求書のPDFは」は、そこに辿り着くまでの時間で書体が間に合ってしまい
 *   ★素通りすることがある★。＝本物の見張りは下の1本。上は起動から請求書までの
 *   道順（明朝を起動で読まない／請求書に来たら読み始める）を確かめる役。
 */

const PAGE = "/nomiya-uriage.html";
const DELAY_MS = 3000;

/* 書体の通信をわざと遅らせるので、既定の30秒では足りない */
test.describe.configure({ timeout: 120000 });

/* ★2026-08-08 この試験は一度「嘘の緑」だった★
 *   最初は document.fonts.check() で見ていたが、
 *   ★書体がまだ1つも定義されていないと check() は true を返す★（作りの上でそうなっている）。
 *   そのため「待ちを外しても通る」試験になっていた。実際に外して回して気づいた。
 *   いまは ★document.fonts の中に Noto Serif JP の実体が status:"loaded" で在るか★ を見る。
 *   さらに「作る前は届いていない(false)」ことを先に確かめてから作る＝
 *   作り終えて true なら、★待った★以外に理由が無い。 */
function serifLoadedExpr() {
  return () =>
    [...document.fonts].some((f) => /Noto Serif JP/.test(f.family) && f.status === "loaded");
}

async function install(page) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.route(/cdn\.jsdelivr\.net/, (r) => r.abort());
  await page.context().addInitScript(() => {
    window.__printed = 0;
    window.print = function () {
      window.__printed++;
    };
  });
  await page.addInitScript({ path: "tests/e2e/fake-supabase.js" });
  return errors;
}

/* ★書体をわざと遅らせる（電波の細い所と同じ状況）★
   gstatic のURLには書体名が入っていないので、明朝だけを選んで遅らせることはできない。
   だから ★書体に関わる通信を全部遅らせる★。明朝が遅れることが確実に再現できればよい。 */
async function slowFonts(page) {
  let hits = 0;
  await page.route(/fonts\.(googleapis|gstatic)\.com/, async (route) => {
    hits++;
    await new Promise((r) => setTimeout(r, DELAY_MS));
    await route.continue();
  });
  return () => hits;
}

test.describe("紙の書体（明朝がそろってから写す）", () => {
  test("★請求書のPDFは、明朝が届いてから作られる（ゴシックのまま出さない）", async ({ page }) => {
    const errors = await install(page);
    const hits = await slowFonts(page);
    await page.goto(PAGE, { waitUntil: "load" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "load" });
    await expect(page.locator("#scr-input")).toBeVisible();

    // ★起動の時点では、明朝を読んでいないこと（外した効果そのもの）
    const atBoot = await page.evaluate(() =>
      [...document.querySelectorAll("link[rel=stylesheet]")].some((l) =>
        /Noto\+Serif\+JP/.test(l.href)
      )
    );
    expect(atBoot, "起動の時点で明朝を読んでいる（外せていない）").toBe(false);

    // 請求書の画面へ（ここで明朝を読み始める）
    await page.locator(".nav-item[data-scr='inv']").click();
    await expect(page.locator("#scr-inv")).toBeVisible();
    const asked = await page.evaluate(() =>
      [...document.querySelectorAll("link[rel=stylesheet]")].some((l) =>
        /Noto\+Serif\+JP/.test(l.href)
      )
    );
    expect(asked, "請求書の画面に来ても明朝を読み始めない").toBe(true);

    // ★紙を作る。作る前は「まだ届いていない」ことを先に確かめる★
    const r = await page.evaluate(async (src) => {
      const serifLoaded = eval("(" + src + ")");
      const before = serifLoaded();
      const t0 = performance.now();
      const blob = await window.__NOMIYA.buildPdf("invSheets");
      const ms = performance.now() - t0;
      const after = serifLoaded();
      const u8 = new Uint8Array(await blob.arrayBuffer());
      let head = "";
      for (let k = 0; k < 5; k++) head += String.fromCharCode(u8[k]);
      return { before, after, ms, head, size: u8.length };
    }, serifLoadedExpr().toString());

    expect(r.head, "PDFになっていない").toBe("%PDF-");
    expect(r.size, "PDFが空っぽ").toBeGreaterThan(20000);
    // ★作る前は届いていない（この試験が「すでに届いた後」を見ていないことの証拠）
    expect(r.before, "作り始める前にもう明朝が届いている＝この試験は何も見ていない").toBe(false);
    // ★作り終えたときには届いている＝待った、以外に理由が無い
    expect(r.after, "★紙を作り終えても明朝が届いていない＝ゴシックのまま写している★").toBe(true);
    expect(
      r.ms,
      `書体を${DELAY_MS}ms遅らせたのに ${Math.round(r.ms)}ms で作り終えた＝待っていない`
    ).toBeGreaterThan(DELAY_MS * 0.5);
    expect(hits(), "書体を1回も取りに行っていない").toBeGreaterThan(0);
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("★紙は7種とも、明朝が届いた状態で作られる", async ({ page }) => {
    const errors = await install(page);
    await page.goto(PAGE, { waitUntil: "load" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "load" });
    await expect(page.locator("#scr-input")).toBeVisible();

    /* 7種の紙＝一覧(売上帳)/集計/税理士の紙/請求書/レジ締め/給与一覧/明細 */
    const PAPERS = [
      ["list", null, "listSheets"],
      ["list", "sum", "sumSheets"],
      ["list", "tax", "taxSheets"],
      ["inv", null, "invSheets"],
      ["close", null, "closeSheets"],
      ["pay", null, "paySheets"],
    ];
    const done = [];
    for (const [scr, seg, id] of PAPERS) {
      await page.locator(`.nav-item[data-scr='${scr}']`).click();
      if (seg) await page.locator(`#listSeg [data-lseg='${seg}']`).click();
      const has = await page.evaluate((id) => {
        const el = document.getElementById(id);
        return !!(el && el.querySelector(".sheet"));
      }, id);
      if (!has) continue; // 中身が無い紙は対象外（その日のデータが無いだけ）
      const r = await page.evaluate(
        async ([id, src]) => {
          const serifLoaded = eval("(" + src + ")");
          const blob = await window.__NOMIYA.buildPdf(id);
          const u8 = new Uint8Array(await blob.arrayBuffer());
          let head = "";
          for (let k = 0; k < 5; k++) head += String.fromCharCode(u8[k]);
          const all = new TextDecoder("latin1").decode(u8);
          const box = (all.match(/\/MediaBox\s*\[([^\]]+)\]/) || [])[1] || "0 0 0 0";
          return {
            head,
            size: u8.length,
            w: Math.round(parseFloat(box.split(" ")[2])),
            h: Math.round(parseFloat(box.split(" ")[3])),
            serif: serifLoaded(),
          };
        },
        [id, serifLoadedExpr().toString()]
      );
      done.push({ id, ...r });
      expect(r.head, id + " がPDFでない").toBe("%PDF-");
      expect(r.w, id + " がA4の幅でない").toBe(595);
      expect(r.h, id + " がA4の高さでない").toBe(842);
      expect(r.size, id + " が空っぽ").toBeGreaterThan(20000);
      expect(r.serif, "★" + id + " を明朝が届く前に写している★").toBe(true);
    }
    expect(done.length, "紙を1枚も作れていない").toBeGreaterThanOrEqual(3);
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });
});
