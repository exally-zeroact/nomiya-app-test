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
      // 「新しいパスワードを決めてください」も同じ見出しの形なので、1つめを見る
      await expect(page.locator("#loginOv .login-sub").first()).toHaveText("メールでログイン");
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

/* ★パスワードを作り直すメールから戻ってきた人の道（2026-08-07）
   これが無いと、戻ってきた人はログインだけできて新しいパスワードを決められず、
   次に開いたときにまた「忘れた」を押す羽目になる（＝直っていない）。 */
test.describe("パスワードを作り直して戻ってきたとき", () => {
  test("★新しいパスワードを決める画面が出て、決めたら中に入れる", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.route(/cdn\.jsdelivr\.net/, (r) => r.abort());
    await page.addInitScript(() => {
      window.__NEWPASS = null;
      window.supabase = {
        createClient() {
          const res = (d, e) => Promise.resolve({ data: d, error: e || null });
          return {
            auth: {
              getSession: () => res({ session: { user: { id: "u1", email: "a@b.c" } } }),
              getUser: () => res({ user: { id: "u1", email: "a@b.c" } }),
              updateUser: ({ password }) => {
                window.__NEWPASS = password;
                return res({ user: { id: "u1" } });
              },
              signInWithPassword: () => res({ user: { id: "u1" } }),
              signUp: () => res({ user: { id: "u1" } }),
              resetPasswordForEmail: () => res({}),
              signOut: () => res({}),
              onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
            },
            from: () => ({
              select: function () {
                return this;
              },
              eq: function () {
                return this;
              },
              maybeSingle: () => res(null),
              then: (f) => res([]).then(f),
            }),
          };
        },
      };
    });
    // ★メールのリンクと同じ形。戻り方は版によって違うので、どれでも拾えること。
    await page.goto("/nomiya-uriage.html#access_token=xxx&type=recovery");
    await page.waitForTimeout(700);
    await expect(page.locator("#loginOv"), "戻ってきたのにログイン画面が閉じている").toHaveClass(
      /open/
    );
    await expect(page.locator("#loginReset"), "新しいパスワードを決める所が無い").toBeVisible();
    await expect(page.locator("#loginPass"), "ふだんのログイン欄が出たまま").toBeHidden();
    // 短いパスワードは断る
    await page.locator("#loginNew").fill("123");
    await page.locator("#btnNewPass").click();
    await page.waitForTimeout(200);
    await expect(page.locator("#loginResetErr")).toContainText("6文字以上");
    expect(await page.evaluate(() => window.__NEWPASS)).toBe(null);
    // 決めたら中に入れる
    await page.locator("#loginNew").fill("newpass123");
    await page.locator("#btnNewPass").click();
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => window.__NEWPASS), "新しいパスワードにしていない").toBe(
      "newpass123"
    );
    await expect(page.locator("#loginOv"), "決めたのに閉じない").not.toHaveClass(/open/);
    expect(page.url(), "#のゴミが残っている").not.toContain("type=recovery");
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });


  /* ★司さん実機（2026-08-07）：メールから行ったら「そのままログイン」になった。
     ＝戻り方に type=recovery が付かない版があるということ。
     だから、こちらで付ける目印と、Supabaseからの合図でも拾えること。 */
  for (const [name, url] of [
    ["自分で付けた目印だけ（type=recovery が付かない版）", "/nomiya-uriage.html?pwreset=1"],
    ["? に type=recovery が付く版", "/nomiya-uriage.html?type=recovery"],
    ["目印と合図の両方", "/nomiya-uriage.html?pwreset=1#access_token=x&type=recovery"],
  ]) {
    test(`★どの戻り方でも決める画面になる：${name}`, async ({ page }) => {
      const errors = [];
      page.on("pageerror", (e) => errors.push(String(e)));
      await page.route(/cdn\.jsdelivr\.net/, (r) => r.abort());
      await page.addInitScript({ path: "tests/e2e/fake-supabase.js" });
      await page.goto(url);
      await page.waitForTimeout(800);
      await expect(page.locator("#loginOv"), "そのままログインになっている").toHaveClass(/open/);
      await expect(page.locator("#loginReset"), "決める画面が出ない").toBeVisible();
      expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
    });
  }

  test("★Supabaseからの合図（PASSWORD_RECOVERY）だけでも決める画面になる", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.route(/cdn\.jsdelivr\.net/, (r) => r.abort());
    await page.addInitScript(() => {
      window.__FIRE = null;
      const res = (d, e) => Promise.resolve({ data: d, error: e || null });
      window.supabase = {
        createClient() {
          return {
            auth: {
              getSession: () => res({ session: { user: { id: "u1", email: "a@b.c" } } }),
              getUser: () => res({ user: { id: "u1", email: "a@b.c" } }),
              updateUser: () => res({ user: { id: "u1" } }),
              signInWithPassword: () => res({ user: { id: "u1" } }),
              signUp: () => res({ user: { id: "u1" } }),
              resetPasswordForEmail: () => res({}),
              signOut: () => res({}),
              onAuthStateChange: (cb) => {
                window.__FIRE = cb;
                return { data: { subscription: { unsubscribe() {} } } };
              },
            },
            from: () => ({
              select: function () {
                return this;
              },
              eq: function () {
                return this;
              },
              maybeSingle: () => res(null),
              then: (f) => res([]).then(f),
            }),
          };
        },
      };
    });
    // 目印も type=recovery も付かない、ふつうのURLで開く
    await page.goto("/nomiya-uriage.html");
    await page.waitForTimeout(700);
    await expect(page.locator("#loginReset")).toBeHidden();
    // ここで Supabase が「作り直しだ」と教えてくる
    await page.evaluate(() => window.__FIRE && window.__FIRE("PASSWORD_RECOVERY", {}));
    await page.waitForTimeout(300);
    await expect(page.locator("#loginOv"), "合図が来たのに閉じたまま").toHaveClass(/open/);
    await expect(page.locator("#loginReset"), "合図が来たのに決める画面が出ない").toBeVisible();
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("★メールの戻り先に、自分の目印を付けて送っている", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.route(/cdn\.jsdelivr\.net/, (r) => r.abort());
    await page.addInitScript(() => {
      window.__BACK = null;
      const res = (d, e) => Promise.resolve({ data: d, error: e || null });
      window.supabase = {
        createClient() {
          return {
            auth: {
              getSession: () => res({ session: null }),
              getUser: () => res({ user: null }),
              updateUser: () => res({ user: { id: "u1" } }),
              signInWithPassword: () => res(null, { message: "Invalid login credentials" }),
              signUp: () => res({ user: { id: "u1" } }),
              signOut: () => res({}),
              onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
              resetPasswordForEmail: (email, opt) => {
                window.__BACK = opt && opt.redirectTo;
                return res({});
              },
            },
            from: () => ({
              select: function () {
                return this;
              },
              eq: function () {
                return this;
              },
              maybeSingle: () => res(null),
              then: (f) => res([]).then(f),
            }),
          };
        },
      };
    });
    await page.goto("/nomiya-uriage.html");
    await expect(page.locator("#loginOv")).toHaveClass(/open/);
    await page.locator("#loginEmail").fill("mama@snack.example");
    await page.locator("#btnForgot").click();
    await page.waitForTimeout(400);
    const back = await page.evaluate(() => window.__BACK);
    expect(back, "「パスワードを忘れた」を押しても送っていない").toBeTruthy();
    expect(back, "戻り先に目印が付いていない").toContain("pwreset=1");
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("ふつうに開いたときは、新しいパスワードの欄は出ない", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.route(/cdn\.jsdelivr\.net/, (r) => r.abort());
    await page.addInitScript({ path: "tests/e2e/fake-supabase.js" });
    await page.goto("/nomiya-uriage.html");
    await page.waitForTimeout(600);
    await expect(page.locator("#loginReset")).toBeHidden();
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });
});

/* ★向こうの言葉（英語）を、そのまま店の人に見せない（司さん指摘 2026-08-07）
   実機に出た：「For security purposes, you can only request this after 53 seconds.」
   知らない英語が増えるたびに読めない画面になるので、最後の砦を入れた。 */
test.describe("エラーの言い方は必ず日本語", () => {
  test("★英語のまま出さない（知らない言い方でも日本語に落とす）", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.route(/cdn\.jsdelivr\.net/, (r) => r.abort());
    await page.addInitScript({ path: "tests/e2e/fake-supabase.js" });
    await page.goto("/nomiya-uriage.html");
    await page.waitForTimeout(400);
    const out = await page.evaluate(() => {
      const list = [
        "For security purposes, you can only request this after 53 seconds.",
        "Email rate limit exceeded",
        "Too many requests",
        "Unable to validate email address: invalid format",
        "Token has expired or is invalid",
        "Invalid login credentials",
        "Password should be at least 6 characters",
        "Something nobody has ever seen before",
        "",
      ];
      return list.map((m) => ({ in: m, out: window.ExallyLogin.friendly({ message: m }) }));
    });
    for (const r of out) {
      expect(
        /[぀-ヿ一-鿿]/.test(r.out),
        `英語のまま出ている: 「${r.in}」→「${r.out}」`
      ).toBe(true);
    }
    // 「あと何秒」は、その秒数をそのまま伝える
    const wait = out.find((r) => r.in.includes("53 seconds"));
    expect(wait.out).toContain("53秒");
    expect(wait.out).toContain("もう一度");
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("今までの言い方は変えない（他のアプリの画面を壊さない）", async ({ page }) => {
    await page.route(/cdn\.jsdelivr\.net/, (r) => r.abort());
    await page.addInitScript({ path: "tests/e2e/fake-supabase.js" });
    await page.goto("/nomiya-uriage.html");
    await page.waitForTimeout(400);
    const f = (m) => page.evaluate((x) => window.ExallyLogin.friendly({ message: x }), m);
    expect(await f("Invalid login credentials")).toBe("メールかパスワードが違います");
    expect(await f("User already registered")).toContain("もう登録されています");
    expect(await f("Failed to fetch")).toContain("電波");
    // 日本語で来た物は、そのまま通す
    expect(await f("すでに使われています")).toBe("すでに使われています");
  });
});
