import { test, expect } from "@playwright/test";

/* Castally 管理（castally-admin.html）— 司さんだけが店の利用状態を見て変える画面。
   ------------------------------------------------------------------------
   本物のクラウドには触らない。ここでは「管理者かどうか」「一覧が出るか」
   「押したら本当に書き換わるか」「管理者でない人が締め出されるか」を、
   偽のクラウドを差し込んで確かめる。 */

const PAGE = "/castally-admin.html";

// 偽のクラウド（この画面が使う分だけ）。棚の中身はページの中に持つ。
function fake(opts) {
  return `(() => {
    const OPT = ${JSON.stringify(opts || {})};
    const db = {
      exally_admins: OPT.admin ? [{ account_id: "me" }] : [],
      exally_entitlements: OPT.ents || [],
      nomiya_settings: OPT.settings || [],
    };
    window.__DB = db;
    const res = (data, error) => Promise.resolve({ data, error: error || null });
    function q(table) {
      let rows = db[table].slice();
      const b = {
        select() { return b; },
        eq(col, val) { rows = rows.filter((r) => r[col] === val); return b; },
        maybeSingle() { return res(rows[0] || null); },
        then(f) { return res(rows).then(f); },
        update(patch) {
          const u = { rows: null, conds: [] };
          const ub = {
            eq(col, val) { u.conds.push([col, val]); return ub; },
            then(f) {
              if (OPT.updateFails) return res(null, { message: "だめでした" }).then(f);
              db[table].forEach((r) => {
                if (u.conds.every(([c, v]) => r[c] === v)) Object.assign(r, patch);
              });
              window.__UPDATES = (window.__UPDATES || 0) + 1;
              return res([]).then(f);
            },
          };
          return ub;
        },
      };
      return b;
    }
    window.supabase = {
      createClient() {
        return {
          auth: {
            getSession: () => res({ session: OPT.signedIn ? { user: { id: "me" } } : null }),
            getUser: () => res({ user: { id: "me", email: "boss@example.com" } }),
            signInWithPassword: ({ email }) =>
              email === "ng@example.com"
                ? res(null, { message: "Invalid login credentials" })
                : (OPT.signedIn = true, res({ user: { id: "me" } })),
            signOut: () => { OPT.signedIn = false; return res({}); },
          },
          from: q,
        };
      },
    };
  })()`;
}

async function open(page, opts) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.route(/cdn\.jsdelivr\.net/, (r) => r.abort());
  await page.addInitScript(fake(opts));
  await page.goto(PAGE, { waitUntil: "load" });
  await page.waitForTimeout(300);
  return errors;
}

const ENTS = [
  {
    account_id: "a1",
    app: "nomiya",
    plan: "trial",
    email: "kubo@example.com",
    created_at: "2026-08-04T00:00:00Z",
  },
  {
    account_id: "a2",
    app: "nomiya",
    plan: "paid",
    email: "hana@example.com",
    created_at: "2026-08-02T00:00:00Z",
  },
  {
    account_id: "a3",
    app: "payslip",
    plan: "paid",
    email: "other@example.com",
    created_at: "2026-07-01T00:00:00Z",
  },
];
const SETTINGS = [
  { account_id: "a1", config: { store: "MASH" }, updated_at: "2026-08-05T00:00:00Z" },
  { account_id: "a2", config: { store: "華門" }, updated_at: "2026-08-03T00:00:00Z" },
];

test.describe("Castally 管理", () => {
  test("管理者でない人は、店の一覧を1件も見られない", async ({ page }) => {
    const errors = await open(page, { signedIn: true, admin: false, ents: ENTS });
    await expect(page.locator("#denied")).toBeVisible();
    await expect(page.locator("#panel")).toBeHidden();
    expect(await page.locator("#list").innerText()).toBe("");
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("ログインしていなければ、ログイン画面から始まる", async ({ page }) => {
    const errors = await open(page, { signedIn: false, admin: true });
    await expect(page.locator("#login")).toBeVisible();
    await expect(page.locator("#panel")).toBeHidden();
    // 入れない相手なら、そう言う
    await page.locator("#email").fill("ng@example.com");
    await page.locator("#pw").fill("x");
    await page.locator("#btnIn").click();
    await page.waitForTimeout(200);
    await expect(page.locator("#msg")).toContainText("入れませんでした");
    // 入れたら一覧へ
    await page.locator("#email").fill("boss@example.com");
    await page.locator("#pw").fill("x");
    await page.locator("#btnIn").click();
    await page.waitForTimeout(300);
    await expect(page.locator("#panel")).toBeVisible();
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("★店名で一覧が出る（メールだけでは誰の店か分からない）", async ({ page }) => {
    const errors = await open(page, {
      signedIn: true,
      admin: true,
      ents: ENTS,
      settings: SETTINGS,
    });
    await expect(page.locator("#panel")).toBeVisible();
    const t = await page.locator("#list").innerText();
    expect(t, "店名が出ていない").toContain("MASH");
    expect(t).toContain("華門");
    expect(t).toContain("kubo@example.com");
    // ★Castally以外のアプリの契約は混ぜない
    expect(t, "他のアプリの契約まで出ている").not.toContain("other@example.com");
    await expect(page.locator("#stat")).toContainText("全部で 2 店");
    // 新しい順（あとから入った店が上）
    const names = await page.locator("#list .shop .nm").allInnerTexts();
    expect(names).toEqual(["MASH", "華門"]);
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("店名がまだ無い店も、消えずに出る", async ({ page }) => {
    const errors = await open(page, { signedIn: true, admin: true, ents: ENTS, settings: [] });
    const t = await page.locator("#list").innerText();
    expect(t).toContain("（店名まだ）");
    expect(t).toContain("kubo@example.com");
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("★押すと本当に書き換わる（止める・戻す）", async ({ page }) => {
    const errors = await open(page, {
      signedIn: true,
      admin: true,
      ents: ENTS,
      settings: SETTINGS,
    });
    const mash = page.locator(".shop[data-acct='a1']");
    await expect(mash.locator("[data-plan='trial']")).toHaveClass(/on/);
    // 止める
    await mash.locator("[data-plan='disabled']").click();
    await page.waitForTimeout(200);
    await expect(mash.locator("[data-plan='disabled']")).toHaveClass(/on/);
    expect(
      await page.evaluate(() => window.__DB.exally_entitlements.find((r) => r.account_id === "a1").plan),
      "倉庫の中身が変わっていない"
    ).toBe("disabled");
    await expect(page.locator("#toast")).toContainText("MASH を止めました");
    await expect(page.locator("#stat")).toContainText("止めている店 1");
    // 戻す
    await mash.locator("[data-plan='paid']").click();
    await page.waitForTimeout(200);
    expect(
      await page.evaluate(() => window.__DB.exally_entitlements.find((r) => r.account_id === "a1").plan)
    ).toBe("paid");
    await expect(page.locator("#stat")).toContainText("止めている店 0");
    // ★Castallyの行だけを書き換える（同じ人の他のアプリの契約に触らない）
    expect(
      await page.evaluate(() => window.__DB.exally_entitlements.find((r) => r.app === "payslip").plan)
    ).toBe("paid");
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("書き換えに失敗したら、画面を勝手に変えたままにしない", async ({ page }) => {
    const errors = await open(page, {
      signedIn: true,
      admin: true,
      ents: ENTS,
      settings: SETTINGS,
      updateFails: true,
    });
    const mash = page.locator(".shop[data-acct='a1']");
    await mash.locator("[data-plan='disabled']").click();
    await page.waitForTimeout(300);
    await expect(page.locator("#toast")).toContainText("変えられませんでした");
    await expect(mash.locator("[data-plan='trial']"), "失敗したのに変わったまま").toHaveClass(/on/);
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("店名・メールでしぼれる", async ({ page }) => {
    const errors = await open(page, {
      signedIn: true,
      admin: true,
      ents: ENTS,
      settings: SETTINGS,
    });
    await page.locator("#q").fill("華門");
    await page.waitForTimeout(150);
    expect(await page.locator("#list .shop").count()).toBe(1);
    await page.locator("#q").fill("kubo");
    await page.waitForTimeout(150);
    expect(await page.locator("#list .shop").count()).toBe(1);
    await page.locator("#q").fill("");
    await page.waitForTimeout(150);
    expect(await page.locator("#list .shop").count()).toBe(2);
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("iPhoneで勝手に拡大しない（入力欄は16px以上）・上の空白も作らない", async ({ page }) => {
    const errors = await open(page, { signedIn: false, admin: true });
    const r = await page.evaluate(() => {
      const small = [];
      document.querySelectorAll("input,select,textarea").forEach((el) => {
        if (parseFloat(getComputedStyle(el).fontSize) < 16) small.push(el.id || el.className);
      });
      const m = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
      const v = document.querySelector('meta[name="viewport"]');
      return {
        small,
        bar: m ? m.getAttribute("content") : "",
        viewport: v ? v.getAttribute("content") : "",
        overscroll: getComputedStyle(document.documentElement).overscrollBehaviorY,
      };
    });
    expect(r.small, "16pxより小さい入力欄がある").toEqual([]);
    expect(r.bar).not.toBe("black-translucent");
    expect(r.viewport).not.toContain("maximum-scale");
    expect(r.overscroll).toBe("none");
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });
});
