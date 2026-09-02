import { test, expect } from "@playwright/test";

/* ★本番の名札なら 帯は出ない★ を、実物のブラウザで毎回 見る
 * ------------------------------------------------------------------------------
 *  tests/env-badge.test.mjs は ★素の node で 部品の判定★ を見る（速い・CIの前段）。
 *  ここは ★実際に画面を開いて★ 見る:
 *    ・本番の名札(env:"prod")を配ったら ★帯が1つも出ない★
 *    ・帯が無いのに ★中身が下がっていない★（上に空白が出ない）
 *  ＝一番 危ない事故（★本番に「テスト環境」と出る★）を、字の検査だけで済ませない。
 *
 *  ★どうやって本番のふりをするか★
 *    repo の js/supa-config.js は 触らない（触ると テスト線が本番の倉庫を向く）。
 *    ★配信の途中で その1本だけ すり替える★（page.route）＝画面から見れば本番と同じ。
 */
const PAGE = "/nomiya-uriage.html";

/** supa-config.js を 好きな名札に差し替えて配る（倉庫の向き先は変えない）
 *  ★2026-09-02：この1本は テスト線と本番の両方で走る★ ので、
 *  「この repo がどちらか」に頼らず ★両方向とも 差し替えて確かめる★。
 *  （前は「テストの名札なら出る」を repo 任せにしていて、本番repoで赤になった） */
async function serveConfig(page, env) {
  await page.route(/js\/supa-config\.js.*/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/javascript; charset=utf-8",
      body:
        'window.SUPA = { env: "' +
        env +
        '", url: "https://example.supabase.co", key: "dummy" };' +
        String.fromCharCode(10),
    })
  );
}

test.describe("テスト環境の帯（実物の画面で見る）", () => {
  test("★本番の名札(prod)なら 帯は出ない・中身も下がらない★", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route(/cdn\.jsdelivr\.net/, (r) => r.abort());
    await serveConfig(page, "prod");
    await page.goto(PAGE, { waitUntil: "load" });
    await page.waitForTimeout(600);

    const m = await page.evaluate(() => ({
      env: (window.SUPA || {}).env,
      bar: !!document.getElementById("envbar"),
      pad: document.body.style.paddingTop || "0px",
      headTop: Math.round(document.querySelector(".app-header").getBoundingClientRect().top),
      text: document.body.innerText.includes("テスト環境"),
    }));
    expect(m.env, "差し替えが効いていない＝この試験は何も見ていない").toBe("prod");
    expect(m.bar, "★本番の名札なのに帯が出ている★").toBe(false);
    expect(m.text, "★画面の字に「テスト環境」が出ている★").toBe(false);
    expect(m.pad, "帯が無いのに中身を下げている").toBe("0px");
    expect(m.headTop, "帯が無いのにヘッダーの上に空白がある").toBe(0);
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("★テストの名札(test)なら 帯が出る・頭は隠れない★", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route(/cdn\.jsdelivr\.net/, (r) => r.abort());
    await serveConfig(page, "test"); // ★repo の名札に頼らない（本番repoでも同じ結果）★
    await page.goto(PAGE, { waitUntil: "load" });
    await page.waitForTimeout(600);

    const m = await page.evaluate(() => {
      const b = document.getElementById("envbar");
      const r = b ? b.getBoundingClientRect() : null;
      return {
        env: (window.SUPA || {}).env,
        bar: !!b,
        text: b ? b.innerText.replace(/\n/g, " ") : "",
        h: r ? Math.round(r.height) : 0,
        headTop: Math.round(document.querySelector(".app-header").getBoundingClientRect().top),
        lines: b ? Math.round(r.height / 12) : 0,
      };
    });
    expect(m.env).toBe("test");
    expect(m.bar, "テストの名札なのに帯が出ない").toBe(true);
    expect(m.text).toContain("テスト環境");
    expect(m.text, "何が起きるかを書いていない").toContain("本番には入りません");
    // ★頭が隠れない＝ヘッダーは帯の真下★（1pxのズレも許さない）
    expect(m.headTop, "ヘッダーが帯に隠れている／間に空白が在る").toBe(m.h);
    // ★1文字ずつ縦に割れていないか＝高さで見る（割れると 何百pxにもなる）
    expect(m.h, "帯が縦に伸びている＝字が1文字ずつ割れている疑い").toBeLessThan(120);
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });
});
