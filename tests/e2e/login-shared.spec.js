import { test, expect } from "@playwright/test";

// ログイン画面は全アプリ共通の部品（exally-login.js）。
// ★製品名と色は、置いたページが決める（飲み屋＝Castally）。
//   決めていないページでは今までどおり Exally・緑のまま＝他のアプリは変わらない。
// 「言い方・並び・幅」は全アプリで同じ。それをここで固定する。
// 本物のクラウドには繋がない（偽のクラウド tests/e2e/fake-supabase.js を差し込む）。
// ★このrepoは飲み屋だけなので、ここで見るのは飲み屋の画面だけ。
//   他アプリ側の同じ確認は、それぞれのrepoが自分で持つ。

const APPS = [{ name: "売上管理", url: "/nomiya-uriage.html" }];

async function openLogin(page, url) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.route(/cdn\.jsdelivr\.net/, (r) => r.abort());
  await page.addInitScript(() => (window.__FAKE_NO_SESSION__ = true));
  await page.addInitScript({ path: "tests/e2e/fake-supabase.js" });
  await page.goto(url, { waitUntil: "load" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "load" });
  await expect(page.locator("#loginOv")).toHaveClass(/open/);
  return errors;
}

test.describe("ログイン画面（全アプリ共通）", () => {
  for (const app of APPS) {
    test(`${app.name}: 同じ見た目・同じ言い方で出る`, async ({ page }) => {
      const errors = await openLogin(page, app.url);

      // 出るものと並び順が全アプリで同じ（製品名の出し方だけアプリごと）
      // 飲み屋は文字入りのロゴ画像。字のときは .login-logo に製品名が出る。
      await expect(page.locator("#loginOv .login-mark")).toHaveAttribute("alt", "Castally");
      await expect(page.locator("#loginOv .login-title")).toHaveText(app.name); // ここだけアプリ名
      await expect(page.locator("#loginOv .login-sub")).toHaveText("メールでログイン");
      await expect(page.locator("#loginEmail")).toHaveAttribute("placeholder", "メールアドレス");
      await expect(page.locator("#loginPass")).toHaveAttribute(
        "placeholder",
        "パスワード（6文字以上）"
      );
      await expect(page.locator("#btnLogin")).toHaveText("ログイン");
      await expect(page.locator("#btnSignup")).toHaveText("新規登録");
      await expect(page.locator("#loginOv .login-mid")).toContainText(
        "はじめての方は、メールとパスワードを"
      );
      await expect(page.locator("#loginOv .login-mid")).toContainText(
        "入力してから新規登録ボタンを押して下さい"
      );

      // 案内は2行のまま（機種任せの折り返しで語の途中で割れない）
      const lines = await page.locator("#loginOv .login-mid").evaluate((el) => {
        const lh = parseFloat(getComputedStyle(el).lineHeight);
        return Math.round(el.getBoundingClientRect().height / lh);
      });
      expect(lines, `${app.name} の案内が2行になっていない`).toBe(2);

      // 幅・余白も同じ（1つの部品が作っているので数字で固定できる）。
      // ★幅は「380か、画面が狭ければ画面いっぱいまで」。iPhoneの幅（390）で試したとき
      //   380で固定していると、正しく縮んでいるのに赤くなる。
      const box = await page.locator("#loginOv .login-card").evaluate((el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return {
          w: Math.round(r.width),
          want: Math.min(380, window.innerWidth - 36),
          radius: cs.borderRadius,
          pad: cs.paddingTop,
        };
      });
      expect({ w: box.w, radius: box.radius, pad: box.pad }).toEqual({
        w: box.want,
        radius: "20px",
        pad: "26px",
      });

      expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
    });

    test(`${app.name}: 入れ間違いの言い方も同じ`, async ({ page }) => {
      const errors = await openLogin(page, app.url);

      await page.locator("#btnLogin").click();
      await expect(page.locator("#loginErr")).toHaveText("メールとパスワードを入れてください");

      await page.locator("#loginEmail").fill("mama@snack.example");
      await page.locator("#loginPass").fill("himitsu123");
      await page.locator("#btnLogin").click();
      await expect(page.locator("#loginErr")).toHaveText("メールかパスワードが違います");

      await page.locator("#loginPass").fill("123");
      await page.locator("#btnSignup").click();
      await expect(page.locator("#loginErr")).toHaveText(
        "メールと、6文字以上のパスワードを入れてください"
      );
      expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
    });
  }

  test("売上管理: 登録して入れて、開き直すと自動で入る", async ({ page }) => {
    const errors = await openLogin(page, "/nomiya-uriage.html");
    await page.locator("#loginEmail").fill("mama@snack.example");
    await page.locator("#loginPass").fill("himitsu123");
    await page.locator("#btnSignup").click();

    await expect(page.locator("#loginOv")).not.toHaveClass(/open/);
    await expect(page.locator("#scr-input")).toBeVisible();

    await page.reload({ waitUntil: "load" });
    await expect(page.locator("#scr-input")).toBeVisible();
    await expect(page.locator("#loginOv")).not.toHaveClass(/open/);
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });
});
