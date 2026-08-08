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

  /* ★明朝を使う紙だけ、明朝を待つ★（2026-08-08）
     明朝を当てているのは請求書の紙だけ。売上帳のPDFを出すのに明朝を待たせると、
     使いもしない 61KB＋487KB を取って店の人を待たせる（CIでも1件 flaky になった）。
     判定は ★クラス名ではなく computed font-family★ で行う。 */
  test("★明朝を使わない紙は、明朝を取りに行かない（待たされない）", async ({ page }) => {
    const errors = await install(page);
    await page.goto(PAGE, { waitUntil: "load" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "load" });
    await expect(page.locator("#scr-input")).toBeVisible();

    // 売上帳（明朝を使わない紙）へ。★ここに来ただけで明朝を読み始めないこと★
    await page.locator(".nav-item[data-scr='list']").click();
    await expect(page.locator("#scr-list")).toBeVisible();

    const r = await page.evaluate(async (src) => {
      const serifLoaded = eval("(" + src + ")");
      const inner = document.getElementById("listSheets");
      // その紙が実際に使っている書体（画面に聞く）
      const fams = new Set();
      [inner, ...inner.querySelectorAll("*")].forEach((el) => {
        (getComputedStyle(el).fontFamily || "").split(",").forEach((n) => {
          n = n.trim().replace(/^["']|["']$/g, "");
          if (n) fams.add(n);
        });
      });
      const t0 = performance.now();
      const blob = await window.__NOMIYA.buildPdf("listSheets");
      const ms = performance.now() - t0;
      const u8 = new Uint8Array(await blob.arrayBuffer());
      let head = "";
      for (let k = 0; k < 5; k++) head += String.fromCharCode(u8[k]);
      return {
        ms,
        head,
        size: u8.length,
        使う書体: [...fams],
        明朝を使うか: fams.has("Noto Serif JP"),
        明朝を読んだか: [...document.querySelectorAll("link[rel=stylesheet]")].some((l) =>
          /Noto\+Serif\+JP/.test(l.href)
        ),
        明朝が届いたか: serifLoaded(),
      };
    }, serifLoadedExpr().toString());

    // 前提：この紙は明朝を使っていない（使うようになったら、この試験は作り直す）
    expect(r.明朝を使うか, "売上帳が明朝を使うようになった＝この試験を見直すこと").toBe(false);
    expect(r.head, "PDFになっていない").toBe("%PDF-");
    expect(r.size, "PDFが空っぽ").toBeGreaterThan(20000);
    // ★使わない書体は取りに行かない★
    expect(r.明朝を読んだか, "★明朝を使わない紙なのに、明朝の目録を読んでいる★").toBe(false);
    expect(r.明朝が届いたか, "★明朝を使わない紙なのに、明朝を取り終えるまで待っている★").toBe(
      false
    );
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
          const inner = document.getElementById(id);
          // ★その紙が実際に使う書体を、画面に聞く（クラス名では見分けない）★
          const fams = new Set();
          [inner, ...inner.querySelectorAll("*")].forEach((el) => {
            (getComputedStyle(el).fontFamily || "").split(",").forEach((n) => {
              n = n.trim().replace(/^["']|["']$/g, "");
              if (n) fams.add(n);
            });
          });
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
            usesSerif: fams.has("Noto Serif JP"),
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
      // ★明朝を使う紙だけ、明朝が届いた状態で写せていること★
      if (r.usesSerif) {
        expect(r.serif, "★" + id + " を明朝が届く前に写している★").toBe(true);
      }
    }
    expect(done.length, "紙を1枚も作れていない").toBeGreaterThanOrEqual(3);
    // ★明朝を使う紙が1枚も無い＝この試験が何も見ていない、を防ぐ★
    expect(
      done.filter((x) => x.usesSerif).length,
      "明朝を使う紙が1枚も無い（この試験は何も確かめていない）"
    ).toBeGreaterThanOrEqual(1);
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  /* ★紙が出ないのが一番まずい★
     店は電波の細い所でも紙を出す。書体が来ないなら
     ★ゴシックで出てでも、紙は出さないといけない★。
     2026-08-08、最初の実装は「目録(CSS)の読み込み待ち」だけ時間制限の外にあり、
     目録が永久に返ってこない回線では ★紙が一生出なかった★。ここで固める。 */
  test("★書体が永久に来なくても、紙は出る（12秒で待つのをやめる）", async ({ page }) => {
    const errors = await install(page);
    await page.goto(PAGE, { waitUntil: "load" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "load" });
    await expect(page.locator("#scr-input")).toBeVisible();

    // ★ここから先、明朝の目録は「返事が返ってこない」ままにする（圏外に近い回線）
    let hung = 0;
    await page.route(/fonts\.(googleapis|gstatic)\.com/, async (route) => {
      if (/Noto\+Serif\+JP/.test(route.request().url())) {
        hung++;
        return; // ★応答しない（握ったまま離さない）★
      }
      await route.continue();
    });

    /* ★明朝を使う紙（請求書）で試す★
       売上帳は明朝を1文字も使わないので、そもそも明朝を取りに行かない＝この状況を作れない。 */
    await page.locator(".nav-item[data-scr='inv']").click();
    await expect(page.locator("#scr-inv")).toBeVisible();

    const r = await page.evaluate(async () => {
      const t0 = performance.now();
      const blob = await window.__NOMIYA.buildPdf("invSheets");
      const ms = performance.now() - t0;
      const u8 = new Uint8Array(await blob.arrayBuffer());
      let head = "";
      for (let k = 0; k < 5; k++) head += String.fromCharCode(u8[k]);
      const all = new TextDecoder("latin1").decode(u8);
      const box = (all.match(/\/MediaBox\s*\[([^\]]+)\]/) || [])[1] || "0 0 0 0";
      return {
        ms,
        head,
        size: u8.length,
        w: Math.round(parseFloat(box.split(" ")[2])),
        h: Math.round(parseFloat(box.split(" ")[3])),
      };
    });

    expect(hung, "明朝の目録を取りに行っていない（この試験が効いていない）").toBeGreaterThan(0);
    // ★出ること★（これが一番大事）
    expect(r.head, "★書体が来ないと紙が出ない★").toBe("%PDF-");
    expect(r.w, "A4の幅でない").toBe(595);
    expect(r.h, "A4の高さでない").toBe(842);
    expect(r.size, "紙が空っぽ").toBeGreaterThan(20000);
    // ★決めた時間で見切りを付けていること（永久に待っていない）
    expect(r.ms, `${Math.round(r.ms)}ms かかった＝12秒で見切りを付けていない`).toBeLessThan(20000);
    expect(
      r.ms,
      `${Math.round(r.ms)}ms で出た＝待たずに素通りしている（待ちが効いていない）`
    ).toBeGreaterThan(8000);
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });
});
