import { test, expect } from "@playwright/test";

// 飲み屋の売上管理(nomiya-uriage.html)を実ブラウザで開き、
// 「実際に指で押す操作」を全ボタン分たどって、値が正しく出るところまで確かめる。
// 計算そのものは tests/nomiya-core.test.js(実数値)が固定。ここは配線と画面の確認。

const PAGE = "/nomiya-uriage.html";

// 本物のクラウドには触らない。偽のクラウド（tests/e2e/fake-supabase.js）を差し込み、
// ログイン済みの状態から始める（ログインそのものの試験は下の専用テストで行う）。
async function install(page, opts) {
  const o = opts || {};
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  // 本物の supabase-js は読ませない（テストは通信しない）
  await page.route(/cdn\.jsdelivr\.net/, (r) => r.abort());
  // 印刷ダイアログは自動テストで開けないので、呼ばれた回数だけ数える
  await page.addInitScript(() => {
    window.__printed = 0;
    window.print = function () {
      window.__printed++;
    };
  });
  if (o.noSession) await page.addInitScript(() => (window.__FAKE_NO_SESSION__ = true));
  await page.addInitScript({ path: "tests/e2e/fake-supabase.js" });
  return errors;
}

async function open(page, opts) {
  const errors = await install(page, opts);
  await page.goto(PAGE, { waitUntil: "load" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "load" });
  if (!(opts && opts.noSession)) {
    await expect(page.locator("#scr-input")).toBeVisible();
    await expect(page.locator("#loginOv")).not.toHaveClass(/open/);
  }
  return errors;
}

// 1件入れる（実際の操作と同じ順: 日付→名前→人数→金額→支払い→領収書→保存）
async function addSale(page, s) {
  await page.locator(".nav-item[data-scr='input']").click();
  await page.locator("#inDate").fill(s.date);
  await page.locator(`#payChips button[data-pay="${s.pay}"]`).click();
  // 請求書送りだけは自由入力ではなく、登録した宛先から選ぶ（無ければその場で登録する）
  if (s.pay === "invoice") {
    if ((await page.locator(`#inNameSel option[value="${s.name}"]`).count()) === 0) {
      await page.locator("#inNameSel").selectOption("__new");
      await page.locator("#ptName").fill(s.name);
      await page.locator("#ptOk").click();
    }
    await page.locator("#inNameSel").selectOption(s.name);
  } else {
    await page.locator("#inName").fill(s.name);
  }
  await page.locator("#inPeople").fill(String(s.people));
  await page.locator("#inAmount").fill(String(s.amount));
  // 領収書は支払い方法ごとに選べるものが違う。true=あり / false=その方法の既定のまま。
  const rec = s.receipt === true ? "issued" : s.receipt === false ? null : s.receipt;
  if (rec) await page.locator(`#recChips button[data-rec="${rec}"]`).click();
  if (s.memo) await page.locator("#inMemo").fill(s.memo);
  await page.locator("#btnSave").click();
}

const SEED = [
  { date: "2026-07-01", name: "田中", people: 2, amount: 8000, pay: "cash", receipt: false },
  { date: "2026-07-01", name: "山本商事", people: 4, amount: 32000, pay: "invoice", receipt: true },
  { date: "2026-07-02", name: "佐藤", people: 3, amount: 12000, pay: "paypay", receipt: false },
  { date: "2026-07-02", name: "田中", people: 1, amount: 5000, pay: "tsuke", receipt: false },
  { date: "2026-07-05", name: "鈴木", people: 5, amount: 25000, pay: "credit", receipt: true },
];

// 請求書タブの「見た目を変える」は畳んである。開いてから触る。
async function openLook(page) {
  await page.locator(".nav-item[data-scr='inv']").click();
  const d = page.locator("#scr-inv .look:not(#partnerBox)");
  if (!(await d.evaluate((el) => el.open))) await d.locator("summary").click();
}

// 宛先の一覧は画面に置かない。請求書タブの「宛先を直す」で開く。
async function openPartners(page) {
  await page.locator(".nav-item[data-scr='inv']").click();
  await page.locator("#btnPartners").click();
  await expect(page.locator("#partnerList")).toBeVisible();
}

// 請求書タブは既定が「今月」。テストの売上は2026年7月なので、月バーを明示して合わせる。
// （これをしないと、今日が7月でなくなった時に全部落ちる＝時計の時限爆弾）
async function setInvMonth(page, ym) {
  await page.locator(".nav-item[data-scr='inv']").click();
  const want = +ym.slice(0, 4) * 12 + +ym.slice(5, 7);
  const read = async () => {
    const t = (await page.locator("#periodInv .period-lb").innerText()).trim();
    const m = t.match(/(\d+)年(\d+)月分/);
    if (!m) throw new Error("月バーが読めない: " + t);
    return +m[1] * 12 + +m[2];
  };
  for (let i = 0; i < 80; i++) {
    const now = await read();
    if (now === want) return;
    await page.locator(`#periodInv [data-imv="${now > want ? -1 : 1}"]`).click();
  }
  throw new Error("月バーを " + ym + " に合わせられなかった");
}

async function seed(page) {
  for (const s of SEED) await addSale(page, s);
  // 期間を7月に合わせる（今日が7月とは限らないので範囲指定で固定）
  await page.locator(".nav-item[data-scr='list']").click();
  await page.locator("#periodList .period-lb").click();
  await page.locator("#mdFrom").fill("2026-07-01");
  await page.locator("#mdTo").fill("2026-07-31");
  await page.locator("#mdOk").click();
  // 請求書タブの月も、テストの売上と同じ2026年7月に合わせる
  await setInvMonth(page, "2026-07");
  await page.locator(".nav-item[data-scr='list']").click();
}

test.describe("飲み屋 売上管理", () => {
  test("開いて1件入れると、その日の一覧と合計に出る", async ({ page }) => {
    const errors = await open(page);

    await addSale(page, {
      date: "2026-07-01",
      name: "田中",
      people: 2,
      amount: 8000,
      pay: "cash",
      receipt: false,
      memo: "ボトル入れ",
    });

    await expect(page.locator("#dayList .li-nm").first()).toContainText("田中");
    await expect(page.locator("#dayList .li-amt").first()).toHaveText("¥8,000");
    const strip = page.locator("#dayStrip .strip-v");
    await expect(strip.nth(0)).toHaveText("1 組");
    await expect(strip.nth(1)).toHaveText("2 人");
    await expect(strip.nth(2)).toHaveText("¥8,000");
    // 保存したらフォームは空に戻り、日付は残る（続けて次の組を打てる）
    await expect(page.locator("#inName")).toHaveValue("");
    await expect(page.locator("#inDate")).toHaveValue("2026-07-01");
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("空欄のまま保存すると理由が出て、勝手に0円で保存されない", async ({ page }) => {
    const errors = await open(page);
    await page.locator("#btnSave").click();
    await expect(page.locator("#inErr")).toContainText("名前");
    await expect(page.locator("#inErr")).toContainText("金額");
    expect(await page.evaluate(() => window.__NOMIYA.sales.length)).toBe(0);
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("支払い方法5つと領収書あり／なしが、タップで選べて保存される", async ({ page }) => {
    const errors = await open(page);
    for (const s of SEED) await addSale(page, s);

    const saved = await page.evaluate(() => window.__NOMIYA.sales);
    expect(saved.length).toBe(5);
    expect(saved.map((s) => s.pay)).toEqual(["cash", "invoice", "paypay", "tsuke", "credit"]);
    expect(saved.filter((s) => s.receipt === "issued").length).toBe(2);
    // 支払い方法ごとの既定が入る: 現金=なし / 振込=なし(na) / PayPay=なし(na) / ツケ=あとで
    expect(saved.map((s) => s.receipt)).toEqual(["none", "issued", "na", "later", "issued"]);
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("「今日」ボタンが効く（人数はチップを置かず数字だけ）", async ({ page }) => {
    const errors = await open(page);
    await expect(page.locator("#peopleChips")).toHaveCount(0);
    await page.locator("#inDate").fill("2020-01-01");
    await page.locator("#btnToday").click();
    const today = await page.evaluate(() => {
      const d = new Date();
      const p = (n) => (n < 10 ? "0" + n : "" + n);
      return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
    });
    await expect(page.locator("#inDate")).toHaveValue(today);
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("一覧タブ: A4の売上帳に全件が並び、合計が合う", async ({ page }) => {
    const errors = await open(page);
    await seed(page);

    await expect(page.locator("#listSheets tr[data-id]")).toHaveCount(5);
    const strip = page.locator("#listStrip .strip-v");
    await expect(strip.nth(0)).toHaveText("5 組");
    await expect(strip.nth(1)).toHaveText("15 人");
    await expect(strip.nth(2)).toHaveText("¥82,000");
    // 紙の合計欄
    await expect(page.locator("#listSheets .st-v")).toHaveText("¥82,000");
    // A4の実寸(794px = 210mm)で描いている
    const w = await page
      .locator("#listSheets .sheet")
      .first()
      .evaluate((el) => el.offsetWidth);
    expect(w).toBe(794);
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("一覧タブ: 支払い方法別・領収書別のタブ切り替えが効く", async ({ page }) => {
    const errors = await open(page);
    await seed(page);

    await page.locator("#filPay button[data-fp='invoice']").click();
    await expect(page.locator("#listSheets tr[data-id]")).toHaveCount(1);
    await expect(page.locator("#listStrip .strip-v").nth(2)).toHaveText("¥32,000");

    // 「領収書あり」には振込・カード（領収書が要らない分）も入る
    await page.locator("#filPay button[data-fp='all']").click();
    await page.locator("#filRec button[data-rec='yes']").click();
    await expect(page.locator("#listSheets tr[data-id]")).toHaveCount(3);
    await expect(page.locator("#listStrip .strip-v").nth(2)).toHaveText("¥69,000");

    // 重ねがけ（領収書ありのクレジットだけ）
    await page.locator("#filPay button[data-fp='credit']").click();
    await expect(page.locator("#listSheets tr[data-id]")).toHaveCount(1);
    await expect(page.locator("#listStrip .strip-v").nth(2)).toHaveText("¥25,000");

    // 紙の見出しに絞り込みの中身が出る
    await expect(page.locator("#listSheets .sh-meta")).toContainText("クレジット");
    await expect(page.locator("#listSheets .sh-meta")).toContainText("領収書あり");

    await page.locator("#filPay button[data-fp='all']").click();
    await page.locator("#filRec button[data-rec='all']").click();
    await expect(page.locator("#listSheets tr[data-id]")).toHaveCount(5);
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("一覧タブ: 紙の行をタップすると入力画面で直せる", async ({ page }) => {
    const errors = await open(page);
    await seed(page);

    await page.locator("#listSheets tr[data-id]").first().click();
    await expect(page.locator("#scr-input")).toBeVisible();
    await expect(page.locator("#inputMode")).toHaveText("この売上を直す");
    await expect(page.locator("#inName")).toHaveValue("田中");
    await page.locator("#inAmount").fill("9000");
    await page.locator("#btnSave").click();

    await page.locator(".nav-item[data-scr='list']").click();
    await expect(page.locator("#listStrip .strip-v").nth(2)).toHaveText("¥83,000");
    // 件数は増えていない（新規追加になっていない）
    await expect(page.locator("#listSheets tr[data-id]")).toHaveCount(5);
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("一覧タブ: 売上を消せる", async ({ page }) => {
    const errors = await open(page);
    await seed(page);

    await page.locator("#listSheets tr[data-id]").first().click();
    await page.locator("#btnDelete").click();
    await page.locator("#mdYes").click();
    await page.locator(".nav-item[data-scr='list']").click();
    await expect(page.locator("#listSheets tr[data-id]")).toHaveCount(4);
    await expect(page.locator("#listStrip .strip-v").nth(2)).toHaveText("¥74,000");
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("集計タブ: 支払い方法別・領収書別・日別・未回収が出る", async ({ page }) => {
    const errors = await open(page);
    await seed(page);
    await page.locator(".nav-item[data-scr='sum']").click();

    const stats = page.locator("#sumStrip .strip-v");
    await expect(stats.nth(0)).toHaveText("¥82,000");
    await expect(stats.nth(1)).toContainText("5");
    await expect(stats.nth(2)).toContainText("15");
    await expect(stats.nth(3)).toHaveText("¥5,467"); // 82,000 / 15人

    // 支払い方法別（0件の行も消えない = 5行）
    const payRows = page.locator("#sumPay tbody tr");
    await expect(payRows).toHaveCount(5);
    await expect(payRows.nth(0)).toContainText("現金");
    await expect(payRows.nth(0)).toContainText("8,000");
    await expect(payRows.nth(3)).toContainText("請求書送り");
    await expect(payRows.nth(3)).toContainText("32,000");
    await expect(page.locator("#sumPay tfoot")).toContainText("82,000");

    // 領収書別は2区分（振込・カードは「あり」に含める）。合計は全体と一致する
    const recRows = page.locator("#sumRec tbody tr");
    await expect(recRows).toHaveCount(2);
    await expect(recRows.nth(0)).toContainText("69,000"); // あり(請求書送り32,000+クレカ25,000+PayPay12,000)
    await expect(recRows.nth(1)).toContainText("13,000"); // なし(現金8,000+ツケ5,000)

    // 日別（3日分）
    await expect(page.locator("#sumDay tbody tr")).toHaveCount(3);

    // 未回収は請求書タブの「請求する相手」に名前だけ並ぶ（金額は紙に出る）
    await page.locator(".nav-item[data-scr='inv']").click();
    const opts = await page.locator("#invName option").allInnerTexts();
    expect(opts.map((t) => t.trim())).toEqual(["山本商事", "田中"]);
    await expect(page.locator("#invSheets .iv-grand")).toContainText("¥32,000");
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("集計タブ: 同じ相手が請求書送りとツケの両方でも、片方だけ入金できる", async ({ page }) => {
    const errors = await open(page);
    await seed(page);
    // 田中はツケ5,000。請求書送りも足す
    await addSale(page, {
      date: "2026-07-10",
      name: "田中",
      people: 2,
      amount: 7000,
      pay: "invoice",
      receipt: false,
    });
    await page.locator(".nav-item[data-scr='inv']").click();
    // 田中は ツケ5,000 + 請求書送り7,000 = 12,000（金額は紙の合計で確かめる）
    await page.locator("#invName").selectOption("田中");
    await expect(page.locator("#invSheets .iv-grand")).toContainText("¥12,000");

    // 田中の7月分を入金済みにする → 未回収は山本商事だけになる
    await page.locator("#btnPaid").click();
    await page.locator("#mdPaidOk").click();
    await expect(page.locator("#invBadge")).toHaveText("1");
    // 7月分の請求書は中身が変わらない（あとから出し直せる）
    await expect(page.locator("#invName option[value='田中']")).toHaveCount(1);
    await expect(page.locator("#invSheets .iv-grand")).toContainText("¥12,000");
    await page.locator("#invName").selectOption("山本商事");
    await expect(page.locator("#invSheets .iv-grand")).toContainText("¥32,000");
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("紙は同じ日付を繰り返さない（最初の行だけ日付を出す）", async ({ page }) => {
    const errors = await open(page);
    await seed(page);
    // 7/1が2件・7/2が2件・7/5が1件
    const dates = await page
      .locator("#listSheets tr[data-id] .c-d")
      .allInnerTexts()
      .then((a) => a.map((s) => s.trim()));
    expect(dates).toEqual(["7/1", "", "7/2", "", "7/5"]);
    const wd = await page
      .locator("#listSheets tr[data-id] .c-w")
      .allInnerTexts()
      .then((a) => a.map((s) => s.trim()));
    expect(wd).toEqual(["水", "", "木", "", "日"]);
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("売上帳の一番右に備考欄があり、メモが入る", async ({ page }) => {
    const errors = await open(page);
    await addSale(page, {
      date: "2026-07-01",
      name: "田中",
      people: 2,
      amount: 8000,
      pay: "cash",
      receipt: false,
      memo: "ボトル入れ",
    });
    await page.locator(".nav-item[data-scr='list']").click();
    await page.locator("#periodList .period-lb").click();
    await page.locator("#mdFrom").fill("2026-07-01");
    await page.locator("#mdTo").fill("2026-07-31");
    await page.locator("#mdOk").click();

    // 備考は表の一番右の列
    const heads = await page.locator("#listSheets thead th").allInnerTexts();
    expect(heads[heads.length - 1].trim()).toBe("備考");
    await expect(page.locator("#listSheets tr[data-id] .c-bk")).toHaveText("ボトル入れ");
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("入金を記録すると未回収が減り、売上もその月の請求書も変わらない", async ({ page }) => {
    const errors = await open(page);
    await seed(page);
    await page.locator(".nav-item[data-scr='inv']").click();

    await page.locator("#invName").selectOption("山本商事");
    await page.locator("#btnPaid").click();
    await page.locator("#mdPaidDate").fill("2026-08-10");
    await page.locator("#mdPaidOk").click();

    // 未回収は田中のツケだけになる（バッジが2→1）
    await expect(page.locator("#invBadge")).toHaveText("1");
    // 7月分の請求書はそのまま出せる（入金しても中身は変わらない）
    await expect(page.locator("#invName option[value='山本商事']")).toHaveCount(1);
    await expect(page.locator("#invSheets .iv-grand")).toContainText("¥32,000");
    // 売上は変わらない
    await page.locator(".nav-item[data-scr='sum']").click();
    await expect(page.locator("#sumStrip .strip-v").nth(0)).toHaveText("¥82,000");
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("集計タブ: 全体／領収書あり／領収書なし の切り替えで全部の数字が変わる", async ({
    page,
  }) => {
    const errors = await open(page);
    await seed(page);
    await page.locator(".nav-item[data-scr='sum']").click();

    // 全体
    await expect(page.locator("#sumStrip .strip-v").nth(0)).toHaveText("¥82,000");
    await expect(page.locator("#sumRecCard")).toBeVisible();

    // 領収書あり = 山本商事32,000 + 鈴木25,000 + PayPay12,000（振込・カードを含む）
    await page.locator("#sumRecTabs button[data-srec='yes']").click();
    await expect(page.locator("#sumStrip .strip-v").nth(0)).toHaveText("¥69,000");
    await expect(page.locator("#sumStrip .strip-v").nth(1)).toContainText("3");
    // 絞っているときは「領収書あり/なし別」は出さない
    await expect(page.locator("#sumRecCard")).toBeHidden();
    // 支払い方法別も絞った中身になる（現金は領収書なしなので0）
    await expect(page.locator("#sumPay tbody tr").nth(0)).toContainText("現金");
    await expect(page.locator("#sumPay tfoot")).toContainText("69,000");
    // 領収書なし = 現金8,000 + ツケ5,000（振込・カードは「あり」側なので入らない）
    await page.locator("#sumRecTabs button[data-srec='no']").click();
    await expect(page.locator("#sumStrip .strip-v").nth(0)).toHaveText("¥13,000");
    await page.locator("#sumRecTabs button[data-srec='all']").click();
    await expect(page.locator("#sumStrip .strip-v").nth(0)).toHaveText("¥82,000");
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("税理士タブ: 1ヶ月の売上報告書が出て、対象で中身が変わる", async ({ page }) => {
    const errors = await open(page);
    await seed(page);
    await page.locator(".nav-item[data-scr='tax']").click();

    const strip = page.locator("#taxStrip .strip-v");
    await expect(strip.nth(0)).toHaveText("5 組");
    await expect(strip.nth(2)).toHaveText("¥82,000");
    await expect(page.locator("#taxSheets .sh-title")).toHaveText("売 上 報 告 書");
    // 内税の消費税額も出る（82,000 → 7,454）
    await expect(page.locator("#taxSheets .sm-stats")).toContainText("7,454");
    // A4に収まる
    const h = await page
      .locator("#taxSheets .sheet")
      .first()
      .evaluate((el) => el.offsetHeight);
    expect(h).toBe(1123);

    // 領収書ありだけに絞ると紙の中身が変わる（紙に注意書きは出さない）
    await page.locator("#taxRecTabs button[data-trec='yes']").click();
    await expect(page.locator("#taxStrip .strip-v").nth(2)).toHaveText("¥69,000");
    await expect(page.locator("#taxSheets .sm-stats")).toContainText("69,000");
    await expect(page.locator("#taxSheets .sh-meta")).not.toContainText("対象");

    await page.locator("#taxRecTabs button[data-trec='no']").click();
    await expect(page.locator("#taxStrip .strip-v").nth(2)).toHaveText("¥13,000");
    await expect(page.locator("#taxSheets .sm-stats")).toContainText("13,000");

    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("税理士タブ: 印刷は同じ画面のまま（別タブを開かない）", async ({ page, context }) => {
    const errors = await open(page);
    await seed(page);
    await page.locator(".nav-item[data-scr='tax']").click();
    const before = context.pages().length;
    await page.locator("#btnPrintTax").click();
    await page.waitForTimeout(300);
    // 別タブが増えない＝iPhoneで戻れなくならない
    expect(context.pages().length, "別タブが開いている").toBe(before);
    expect(await page.evaluate(() => window.__printed)).toBe(1);
    // 印刷に渡す中身が入っている
    await expect(page.locator("#printArea .sheet")).toHaveCount(1);
    await expect(page.locator("#printArea .sh-title")).toHaveText("売 上 報 告 書");
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("入力: 備考が売上帳・請求書の備考欄に出ることが画面に書いてある", async ({ page }) => {
    const errors = await open(page);
    const hint = page.locator("#memoNote");
    await expect(hint).toContainText("売上帳");
    await expect(hint).toContainText("請求書");
    await expect(hint).toContainText("備考");
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("領収書の選択肢が支払い方法で変わる（振込・カードは「なし」が既定）", async ({ page }) => {
    const errors = await open(page);
    const recs = () =>
      page.locator("#recChips button").evaluateAll((els) => els.map((e) => e.dataset.rec));
    // 現金 = なし / あり
    expect(await recs()).toEqual(["none", "issued"]);
    await expect(page.locator("#recChips button[data-rec='none']")).toHaveClass(/on/);

    // 請求書送りもカードも言い方は同じ「なし / あり」。既定は「なし」
    await page.locator("#payChips button[data-pay='invoice']").click();
    expect(await recs()).toEqual(["na", "issued"]);
    await expect(page.locator("#recChips button[data-rec='na']")).toHaveClass(/on/);
    await expect(page.locator("#recChips button[data-rec='na']")).toHaveText("なし");

    await page.locator("#payChips button[data-pay='credit']").click();
    await expect(page.locator("#recChips button[data-rec='na']")).toHaveText("なし");

    // ツケ = あとで渡す / 渡した / なし
    await page.locator("#payChips button[data-pay='tsuke']").click();
    expect(await recs()).toEqual(["later", "issued", "none"]);
    await expect(page.locator("#recChips button[data-rec='later']")).toHaveClass(/on/);

    // 「あとで」のまま現金に変えたら「なし」に戻る（変な組み合わせで保存されない）
    await page.locator("#payChips button[data-pay='cash']").click();
    expect(await recs()).toEqual(["none", "issued"]);
    await expect(page.locator("#recChips button[data-rec='none']")).toHaveClass(/on/);
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("★振込の売上は「領収書なし」に落ちない（計上しないユーザーでも消えない）", async ({
    page,
  }) => {
    const errors = await open(page);
    await addSale(page, {
      date: "2026-07-01",
      name: "山本商事",
      people: 4,
      amount: 30000,
      pay: "invoice",
    });
    await addSale(page, { date: "2026-07-01", name: "田中", people: 2, amount: 8000, pay: "cash" });

    // 紙の領収書欄は 振込=○（領収書あり側）/ 現金=空
    await page.locator(".nav-item[data-scr='list']").click();
    await page.locator("#periodList .period-lb").click();
    await page.locator("#mdFrom").fill("2026-07-01");
    await page.locator("#mdTo").fill("2026-07-31");
    await page.locator("#mdOk").click();
    const marks = await page.locator("#listSheets tr[data-id] .c-r").allInnerTexts();
    expect(marks.map((m) => m.trim())).toEqual(["○", ""]);

    // 「領収書なし」で絞ると現金だけ（振込は落ちない）
    await page.locator("#filRec button[data-rec='no']").click();
    await expect(page.locator("#listSheets tr[data-id]")).toHaveCount(1);
    await expect(page.locator("#listStrip .strip-v").nth(2)).toHaveText("¥8,000");
    // 振込は「領収書あり」側に入る
    await page.locator("#filRec button[data-rec='yes']").click();
    await expect(page.locator("#listSheets tr[data-id]")).toHaveCount(1);
    await expect(page.locator("#listStrip .strip-v").nth(2)).toHaveText("¥30,000");
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("領収書: 印紙とカード払いの注意が出る（止めない）", async ({ page }) => {
    const errors = await open(page);
    // 現金・税抜5万円以上（税込55,000）で領収書あり → 収入印紙の注意
    await page.locator("#inAmount").fill("55000");
    await page.locator("#payChips button[data-pay='cash']").click();
    await page.locator("#recChips button[data-rec='issued']").click();
    await expect(page.locator("#recNote")).toContainText("収入印紙が必要");
    // カード払いに変えると既定が「なし」になり、理由が出る
    await page.locator("#payChips button[data-pay='credit']").click();
    await expect(page.locator("#recNote")).toContainText("売上票");
    // それでも出す場合は「あり」を選ぶ＝印紙不要と二重発行の注意
    await page.locator("#recChips button[data-rec='issued']").click();
    await expect(page.locator("#recNote")).toContainText("クレジットカード払い");
    await expect(page.locator("#recNote")).toContainText("収入印紙も不要");
    // 現金の「なし」なら何も出ない
    await page.locator("#payChips button[data-pay='cash']").click();
    await page.locator("#recChips button[data-rec='none']").click();
    await expect(page.locator("#recNote")).toHaveText("");
    // 金額を下げると印紙の注意が消える
    await page.locator("#payChips button[data-pay='cash']").click();
    await page.locator("#recChips button[data-rec='issued']").click();
    await page.locator("#inAmount").fill("10000");
    await expect(page.locator("#recNote")).toHaveText("");
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("領収書: ツケの「あとで」は入金のときに渡したことにできる", async ({ page }) => {
    const errors = await open(page);
    await addSale(page, {
      date: "2026-07-01",
      name: "鈴木",
      people: 2,
      amount: 30000,
      pay: "tsuke",
      receipt: "later",
    });
    // 売上帳では空（まだ渡していない＝「なし」側）
    await page.locator(".nav-item[data-scr='list']").click();
    await page.locator("#periodList .period-lb").click();
    await page.locator("#mdFrom").fill("2026-07-01");
    await page.locator("#mdTo").fill("2026-07-31");
    await page.locator("#mdOk").click();
    await expect(page.locator("#listSheets tr[data-id] .c-r")).toHaveText("");
    // 「あとで渡す分」で絞れる
    await page.locator("#filRec button[data-rec='later']").click();
    await expect(page.locator("#listSheets tr[data-id]")).toHaveCount(1);
    await page.locator("#filRec button[data-rec='yes']").click();
    await expect(page.locator("#listSheets tr[data-id]")).toHaveCount(0);

    // 入金のときに「領収書も渡した」で発行済みになる
    await page.locator(".nav-item[data-scr='inv']").click();
    await page.locator("#invName").selectOption("鈴木");
    await page.locator("#btnPaid").click();
    await expect(page.locator("#mdPaidRc")).toBeChecked();
    await page.locator("#mdPaidDate").fill("2026-08-10");
    await page.locator("#mdPaidOk").click();

    const saved = await page.evaluate(() => window.__NOMIYA.sales[0]);
    expect(saved.receipt).toBe("issued");
    expect(saved.receiptDate).toBe("2026-08-10"); // 発行日は入金日
    expect(saved.paidDate).toBe("2026-08-10");

    await page.locator(".nav-item[data-scr='list']").click();
    await page.locator("#filRec button[data-rec='yes']").click();
    await expect(page.locator("#listSheets tr[data-id] .c-r")).toHaveText("○");
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("請求書タブ: 3つのデザインを切り替えられて、どれもA4に収まる", async ({ page }) => {
    const errors = await open(page);
    await seed(page);
    await page.locator(".nav-item[data-scr='inv']").click();

    await openLook(page);
    for (const tpl of ["card", "band", "tate"]) {
      await page.locator(`#invTpl button[data-tpl="${tpl}"]`).click();
      await expect(page.locator("#invSheets .sheet")).toHaveClass(new RegExp("iv-" + tpl));
      const size = await page
        .locator("#invSheets .sheet")
        .first()
        .evaluate((el) => ({ w: el.offsetWidth, h: el.offsetHeight }));
      expect(size, `${tpl} がA4(794x1123)に収まっていない`).toEqual({ w: 794, h: 1123 });
      // 縦組みの見出しとグラスの飾りは3種共通
      await expect(page.locator("#invSheets .iv-title")).toContainText("請");
    }
    // 選んだデザインは開き直しても残る
    await page.reload({ waitUntil: "load" });
    await page.locator(".nav-item[data-scr='inv']").click();
    await expect(page.locator("#invSheets .sheet")).toHaveClass(/iv-tate/);
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("見た目（デザイン・色・書体・ロゴ位置）は請求書タブで変えられて、開き直しても残る", async ({
    page,
  }) => {
    const errors = await open(page);
    await seed(page);
    await openLook(page);

    // 設定タブには見た目の選択を置いていない（画像を入れる場所だけ）
    await expect(page.locator("#setTpl")).toHaveCount(0);
    await expect(page.locator("#setAccent")).toHaveCount(0);
    await expect(page.locator("#setFont")).toHaveCount(0);

    await page.locator("#invTpl button[data-tpl='tate']").click();
    await expect(page.locator("#invSheets .sheet")).toHaveClass(/iv-tate/);
    await page.locator("#invFont button[data-font='gothic']").click();
    await page.locator("#invLogoPos button[data-lpos='bottom']").click();

    await page.reload({ waitUntil: "load" });
    await openLook(page);
    await expect(page.locator("#invTpl button[data-tpl='tate']")).toHaveClass(/on/);
    await expect(page.locator("#invFont button[data-font='gothic']")).toHaveClass(/on/);
    await expect(page.locator("#invLogoPos button[data-lpos='bottom']")).toHaveClass(/on/);
    await expect(page.locator("#invSheets .sheet")).toHaveClass(/iv-tate/);
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("自分の店らしくする: 色・書体・ロゴが請求書に反映され、印刷にも乗る", async ({
    page,
    context,
  }) => {
    const errors = await open(page);
    await seed(page);
    await openLook(page);

    // 色（ワイン）を選ぶ → 紙の見出し・罫の色が変わる
    await page.locator("#invAccent [data-accent='#7d3a44']").click();
    await expect(page.locator("#invAccent [data-accent='#7d3a44']")).toHaveClass(/on/);
    const skin = () => page.evaluate(() => document.getElementById("invSkin").textContent);
    expect(await skin()).toContain("#7d3a44");

    await page.locator(".nav-item[data-scr='inv']").click();
    const capColor = await page
      .locator("#invSheets .iv-cap")
      .evaluate((el) => getComputedStyle(el).color);
    expect(capColor).toBe("rgb(125, 58, 68)"); // #7d3a44

    // 書体をゴシックへ
    await page.locator("#invFont button[data-font='gothic']").click();
    const titleFont = await page
      .locator("#invSheets .iv-title")
      .evaluate((el) => getComputedStyle(el).fontFamily);
    expect(titleFont).toContain("Noto Sans JP");

    // ロゴを入れる → 発行者の上に出る
    await page.locator(".nav-item[data-scr='set']").click();
    await page.evaluate(() => {
      const png =
        "data:image/svg+xml;base64," +
        btoa('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="30"></svg>');
      window.__NOMIYA.settings.logo = png;
      window.__NOMIYA.renderAll();
    });
    await page.locator(".nav-item[data-scr='inv']").click();
    // 既定は「上（右上）」＝請求書の定番の位置
    await expect(page.locator("#invSheets .iv-logo-top")).toBeVisible();

    // 「下（店名の上）」にも変えられる
    await page.locator("#invLogoPos button[data-lpos='bottom']").click();
    await expect(page.locator("#invSheets .iv-logo-top")).toHaveCount(0);
    await expect(page.locator("#invSheets .iv-issuer .iv-logo")).toBeVisible();
    await page.locator("#invLogoPos button[data-lpos='top']").click();

    // 印刷に渡す紙にも色と書体が乗る（画面だけ変わって紙が変わらない、を防ぐ）
    await page.locator("#btnPrintInv").click();
    await page.waitForTimeout(300);
    expect(context.pages().length, "別タブが開いている").toBe(1);
    const printed = await page.evaluate(() => {
      const el = document.querySelector("#printArea .iv-cap");
      const t = document.querySelector("#printArea .iv-title");
      return {
        color: el ? getComputedStyle(el).color : "",
        font: t ? getComputedStyle(t).fontFamily : "",
      };
    });
    expect(printed.color).toBe("rgb(125, 58, 68)"); // #7d3a44 が紙にも乗る
    expect(printed.font).toContain("Noto Sans JP");

    // 「デザインのまま」で元に戻る
    await page.locator("#invAccent [data-accent='']").click();
    expect(await skin()).not.toContain("#7d3a44");
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("請求書タブ: 相手ごとに1枚にまとまり、内税の内訳が合う", async ({ page }) => {
    const errors = await open(page);
    await seed(page);
    // 山本商事にもう1件（請求書送り）を足して2件まとめる
    await addSale(page, {
      date: "2026-07-31",
      name: "山本商事",
      people: 2,
      amount: 15000,
      pay: "invoice",
      receipt: true,
    });

    await page.locator(".nav-item[data-scr='inv']").click();
    await page.locator("#invName").selectOption("山本商事");

    await expect(page.locator("#invSheets .iv-to")).toContainText("山本商事　御中");
    await expect(page.locator("#invSheets .iv-grand b")).toHaveText("¥47,000");
    const sumRows = page.locator("#invSheets .iv-sum tr");
    await expect(sumRows.nth(0)).toContainText("42,728"); // 税抜
    await expect(sumRows.nth(1)).toContainText("4,272"); // 消費税10%
    await expect(sumRows.nth(2)).toContainText("¥47,000"); // 合計
    // 明細は2行（現金・PayPayは載らない）
    await expect(page.locator("#invSheets .iv-tbl tbody tr")).toHaveCount(2);
    // 請求Noが採番される
    await expect(page.locator("#invSheets .iv-meta")).toContainText("202607-");
    // 一番右は備考欄
    const ivHeads = await page.locator("#invSheets .iv-tbl thead th").allInnerTexts();
    expect(ivHeads[ivHeads.length - 1].trim()).toBe("備考");
    // A4に収まっている
    const h = await page
      .locator("#invSheets .sheet")
      .first()
      .evaluate((el) => el.offsetHeight);
    expect(h).toBe(1123);

    // 「この請求分を入金済みにする」で未回収が減る（紙は7月分のまま）
    await page.locator("#btnPaid").click();
    await page.locator("#mdPaidOk").click();
    await expect(page.locator("#invBadge")).toHaveText("1");
    await expect(page.locator("#invName option[value='山本商事']")).toHaveCount(1);
    await expect(page.locator("#invSheets .iv-grand b")).toHaveText("¥47,000");
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("請求書: 明細が多くてもA4からはみ出さない（ほかn件で受ける）", async ({ page }) => {
    const errors = await open(page);
    for (let i = 1; i <= 25; i++) {
      await addSale(page, {
        date: "2026-07-" + String(i).padStart(2, "0"),
        name: "山本商事",
        people: 2,
        amount: 5000 + i * 100,
        pay: "invoice",
        receipt: false,
        memo: i % 5 === 0 ? "ボトル入れ" : "",
      });
    }
    await setInvMonth(page, "2026-07");
    await openLook(page);
    // 1枚に載る行数はレイアウトごとに違う（カード14 / 帯13 / 縦組み14）。
    // どのレイアウトでも「載らない分は ほかn件」で受けて、A4を割らないこと。
    const rowsByTpl = { card: 14, band: 13, tate: 14 };
    for (const tpl of ["card", "band", "tate"]) {
      await page.locator(`#invTpl button[data-tpl="${tpl}"]`).click();
      const n = rowsByTpl[tpl];
      await expect(page.locator("#invSheets .iv-tbl tbody tr")).toHaveCount(n);
      await expect(page.locator("#invSheets .iv-more")).toContainText("ほか " + (25 - n) + " 件");
      const h = await page
        .locator("#invSheets .sheet")
        .first()
        .evaluate((el) => el.offsetHeight);
      expect(h, `${tpl} がA4(1123px)を超えている`).toBe(1123);
    }
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("請求書タブ: 未回収がゼロでも見本の請求書が出る（デザインを比べられる）", async ({
    page,
  }) => {
    const errors = await open(page);
    await addSale(page, {
      date: "2026-07-01",
      name: "田中",
      people: 2,
      amount: 8000,
      pay: "cash",
      receipt: false,
    });
    await page.locator(".nav-item[data-scr='inv']").click();
    // 紙が出る（真っ白にならない）＋「見本」と分かる
    await expect(page.locator("#invSheets .iv-title")).toContainText("請");
    await expect(page.locator("#invSample")).toBeVisible();
    await expect(page.locator("#invSheets .iv-tbl tbody tr")).toHaveCount(3);
    const h = await page
      .locator("#invSheets .sheet")
      .first()
      .evaluate((el) => el.offsetHeight);
    expect(h).toBe(1123);
    // デザインは3つとも見本で切り替えられる
    await openLook(page);
    for (const tpl of ["band", "tate", "card"]) {
      await page.locator(`#invTpl button[data-tpl="${tpl}"]`).click();
      await expect(page.locator("#invSheets .sheet")).toHaveClass(new RegExp("iv-" + tpl));
    }
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("設定タブ: 店名と税率を変えると、紙と請求書に反映される", async ({ page }) => {
    const errors = await open(page);
    await seed(page);

    await page.locator(".nav-item[data-scr='set']").click();
    await page.locator("#setStore").fill("スナック ゼロ");
    await page.locator("#setBank").fill("伊予銀行 今治支店 普通 1234567");
    await page.locator("#btnSaveSet").click();

    await page.locator(".nav-item[data-scr='list']").click();
    await expect(page.locator("#listSheets .sh-store").first()).toHaveText("スナック ゼロ");

    // 税率8%に切り替え → 請求書の内訳が変わる（32,000 → 税2,370）
    await page.locator(".nav-item[data-scr='set']").click();
    await page.locator("#setRate button[data-rate='0.08']").click();
    await page.locator(".nav-item[data-scr='inv']").click();
    await page.locator("#invName").selectOption("山本商事");
    await expect(page.locator("#invSheets .iv-sum tr").nth(1)).toContainText("2,370");
    await expect(page.locator("#invSheets .iv-bank")).toContainText("伊予銀行");
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("設定タブ: 全部消すが効く", async ({ page }) => {
    const errors = await open(page);
    await seed(page);
    await page.locator(".nav-item[data-scr='set']").click();
    await page.locator("#btnWipe").click();
    await page.locator("#mdYes").click();
    // 消した印が付く（クラウドにも「消した」を伝えるため、控えとしては残る）
    expect(
      await page.evaluate(() => window.__NOMIYA.sales.filter((s) => !s.deletedAt).length)
    ).toBe(0);
    await page.locator(".nav-item[data-scr='list']").click();
    await expect(page.locator("#listSheets tr[data-id]")).toHaveCount(0);

    // 開き直してクラウドと同期しても、消したものは戻ってこない
    await page.reload({ waitUntil: "load" });
    await expect(page.locator("#acctInfo")).toContainText("同期済み");
    await page.locator(".nav-item[data-scr='list']").click();
    await expect(page.locator("#listSheets tr[data-id]")).toHaveCount(0);
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("期間の月送り（◀▶）が効く", async ({ page }) => {
    const errors = await open(page);
    await addSale(page, {
      date: "2026-07-01",
      name: "田中",
      people: 2,
      amount: 8000,
      pay: "cash",
      receipt: false,
    });
    await addSale(page, {
      date: "2026-08-01",
      name: "佐藤",
      people: 2,
      amount: 6000,
      pay: "cash",
      receipt: false,
    });

    await page.locator(".nav-item[data-scr='list']").click();
    await page.locator("#periodList .period-lb").click();
    await page.locator("#mdFrom").fill("2026-07-01");
    await page.locator("#mdTo").fill("2026-07-31");
    await page.locator("#mdOk").click();
    await expect(page.locator("#listSheets tr[data-id]")).toHaveCount(1);

    // 範囲指定 → タップで月モードに戻す → 月送り
    await page.locator("#periodList .period-lb").click();
    await expect(page.locator("#periodList .period-lb")).toContainText("年");
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("印刷/PDFは同じ画面のまま出す（別タブを開かない・原寸A4）", async ({ page, context }) => {
    const errors = await open(page);
    await seed(page);

    for (const btn of ["#btnPrintList"]) {
      await page.locator(btn).click();
      await page.waitForTimeout(300);
      expect(context.pages().length, "別タブが開いている").toBe(1);
      // 印刷の見た目で確かめる（画面の部品が隠れ、紙だけが原寸A4で出る）
      await page.emulateMedia({ media: "print" });
      const m = await page.evaluate(() => {
        const sheet = document.querySelector("#printArea .sheet");
        const cs = (sel) => getComputedStyle(document.querySelector(sel)).display;
        return {
          w: sheet ? sheet.offsetWidth : 0,
          h: sheet ? sheet.offsetHeight : 0,
          title: document.querySelector("#printArea .sh-title").textContent.trim(),
          header: cs(".app-header"),
          nav: cs(".bottom-nav"),
          screen: cs(".screen.active"),
          area: cs("#printArea"),
        };
      });
      await page.emulateMedia({ media: "screen" });
      expect(m.title).toBe("売 上 帳");
      expect(m.w, "紙が原寸A4(794px)でない").toBe(794);
      expect(m.h).toBe(1123);
      expect([m.header, m.nav, m.screen]).toEqual(["none", "none", "none"]);
      expect(m.area).toBe("block");
    }

    // 税理士の紙も同じように出せる
    await page.locator(".nav-item[data-scr='tax']").click();
    await page.locator("#btnPrintTax").click();
    await page.waitForTimeout(300);
    await expect(page.locator("#printArea .sh-title").first()).toHaveText("売 上 報 告 書");
    expect(context.pages().length).toBe(1);
    // 印刷が終われば中身は片付けられる
    await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
    await expect(page.locator("#printArea .sheet")).toHaveCount(0);
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("iPhone幅で横にはみ出さない（表が枠から出ない）", async ({ page }) => {
    const errors = await open(page);
    await page.setViewportSize({ width: 390, height: 664 });
    await seed(page);
    for (const scr of ["input", "list", "sum", "inv", "tax", "set"]) {
      await page.evaluate((s) => window.__NOMIYA.showScreen(s), scr);
      await page.waitForTimeout(250);
      const m = await page.evaluate(() => {
        const over = [];
        document.querySelectorAll(".screen.active table, .screen.active .card").forEach((el) => {
          if (el.scrollWidth > el.clientWidth + 1) {
            over.push((el.className || el.tagName) + " " + el.scrollWidth + ">" + el.clientWidth);
          }
        });
        return { docW: document.documentElement.scrollWidth, view: window.innerWidth, over };
      });
      expect(m.over, `${scr} ではみ出し`).toEqual([]);
      expect(m.docW, `${scr} で横スクロールが出る`).toBeLessThanOrEqual(m.view);
    }
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("iPhone幅で下に余分な空白が出ない", async ({ page }) => {
    const errors = await open(page);
    await page.setViewportSize({ width: 390, height: 664 });
    await seed(page);
    for (const scr of ["input", "list", "sum", "inv", "tax", "set"]) {
      await page.locator(`.nav-item[data-scr='${scr}']`).click();
      await page.waitForTimeout(250);
      const m = await page.evaluate(() => {
        const active = document.querySelector(".screen.active");
        const r = active.getBoundingClientRect();
        return {
          doc: Math.round(document.documentElement.scrollHeight),
          contentBottom: Math.round(r.bottom + window.scrollY),
        };
      });
      // 中身の下から、下ナビのぶん(72px)＋少しの余白しか無いこと
      const gap = m.doc - m.contentBottom;
      expect(gap, `${scr} の下に余分な空白 ${gap}px`).toBeLessThanOrEqual(90);
    }
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("請求書送りは名前を打たずに、登録した会社から選ぶ（最近選んだ順）", async ({ page }) => {
    const errors = await open(page);

    // ふだんは自由入力。請求書送りを押した瞬間だけドロップダウンになる
    await page.locator("#inDate").fill("2026-07-03");
    await expect(page.locator("#inName")).toBeVisible();
    await expect(page.locator("#inNameSel")).toBeHidden();
    await page.locator("#payChips button[data-pay='invoice']").click();
    await expect(page.locator("#inName")).toBeHidden();
    await expect(page.locator("#inNameSel")).toBeVisible();
    // まだ登録が無いので「選んでください」と「＋ 新しく登録する」だけ
    expect(await page.locator("#inNameSel option").allInnerTexts()).toEqual([
      "（選んでください）",
      "＋ 新しく登録する",
    ]);

    // その場で登録する → 選ばれた状態で戻ってくる
    await page.locator("#inNameSel").selectOption("__new");
    await page.locator("#ptName").fill("株式会社山本商事");
    await page.locator("#ptPerson").fill("総務部 山本 様");
    await page.locator("#ptOk").click();
    await expect(page.locator("#scr-input")).toBeVisible();
    await expect(page.locator("#inNameSel")).toHaveValue("株式会社山本商事");

    await page.locator("#inPeople").fill("4");
    await page.locator("#inAmount").fill("32000");
    await page.locator("#btnSave").click();
    expect(await page.evaluate(() => window.__NOMIYA.sales[0].name)).toBe("株式会社山本商事");

    // 現金に戻すと自由入力に戻る（個人客は打てる）
    await page.locator("#payChips button[data-pay='cash']").click();
    await expect(page.locator("#inName")).toBeVisible();
    await expect(page.locator("#inNameSel")).toBeHidden();

    // 2社目を登録すると、最後に選んだ会社が上に来る
    await page.locator("#payChips button[data-pay='invoice']").click();
    await page.locator("#inNameSel").selectOption("__new");
    await page.locator("#ptName").fill("田中建設株式会社");
    await page.locator("#ptOk").click();
    await page.locator("#inPeople").fill("2");
    await page.locator("#inAmount").fill("9000");
    await page.locator("#btnSave").click();

    await page.locator("#payChips button[data-pay='invoice']").click();
    expect(await page.locator("#inNameSel option").allInnerTexts()).toEqual([
      "（選んでください）",
      "田中建設株式会社",
      "株式会社山本商事",
      "＋ 新しく登録する",
    ]);
    // 選び直さないまま保存はできない（相手を間違えないため）
    await page.locator("#inAmount").fill("5000");
    await page.locator("#btnSave").click();
    await expect(page.locator("#inErr")).toContainText("名前");
    expect(await page.evaluate(() => window.__NOMIYA.sales.length)).toBe(2);
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("請求書は「◯月分」で1枚（月送りで前の月も出せる・紙に期間が出る）", async ({ page }) => {
    const errors = await open(page);
    await seed(page); // 7月に 山本商事(請求書送り32,000) と 田中(ツケ5,000)
    // 6月にも1件入れておく
    await addSale(page, {
      date: "2026-06-20",
      name: "山本商事",
      people: 2,
      amount: 9000,
      pay: "invoice",
      receipt: false,
    });

    await page.locator(".nav-item[data-scr='inv']").click();
    // 起動時は今月。テストの月に合わせるため、2026年7月まで送る
    const label = () => page.locator("#periodInv .period-lb");
    for (let i = 0; i < 36; i++) {
      if ((await label().innerText()).trim() === "2026年7月分") break;
      const now = (await label().innerText()).trim();
      await page.locator(`#periodInv [data-imv="${now > "2026年7月分" ? -1 : 1}"]`).click();
    }
    await expect(label()).toHaveText("2026年7月分");

    // その月に請求書送り・ツケがある相手だけ出る
    expect((await page.locator("#invName option").allInnerTexts()).map((t) => t.trim())).toEqual([
      "山本商事",
      "田中",
    ]);
    await page.locator("#invName").selectOption("山本商事");
    await expect(page.locator("#invSheets .iv-grand b")).toHaveText("¥32,000");
    // 紙に「◯月分（期間）」が出る
    await expect(page.locator("#invSheets .iv-cap")).toContainText("2026年7月分");
    await expect(page.locator("#invSheets .iv-meta")).toContainText("202607-");

    // ◀ で6月分。中身も番号も6月のものに変わる
    await page.locator('#periodInv [data-imv="-1"]').click();
    await expect(label()).toHaveText("2026年6月分");
    expect((await page.locator("#invName option").allInnerTexts()).map((t) => t.trim())).toEqual([
      "山本商事",
    ]);
    await expect(page.locator("#invSheets .iv-grand b")).toHaveText("¥9,000");
    await expect(page.locator("#invSheets .iv-cap")).toContainText("2026年6月分");
    // 過ぎた月なので請求日は締め日（その月の末日）
    await expect(page.locator("#invSheets .iv-meta")).toContainText("2026年6月30日");
    await expect(page.locator("#invSheets .iv-meta")).toContainText("202606-");

    // 売上が無い月は相手がいない＝見本になる
    await page.locator('#periodInv [data-imv="-1"]').click();
    await expect(label()).toHaveText("2026年5月分");
    await expect(page.locator("#invName")).toContainText("この月は請求書送り・ツケがありません");
    await expect(page.locator("#invSample")).toBeVisible();
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("宛先を登録したら、入力タブの名前にもすぐ出る（登録の場所は1つ）", async ({ page }) => {
    const errors = await open(page);
    // 請求書タブの「宛先を登録・修正する」から登録
    await openPartners(page);
    await page.locator("#btnPartnerNew").click();
    await page.locator("#ptName").fill("株式会社たちばな");
    await page.locator("#ptOk").click();

    // 入力タブ：文字で打つとき（現金など）も候補に出る
    await page.locator(".nav-item[data-scr='input']").click();
    const cands = await page
      .locator("#nameList option")
      .evaluateAll((els) => els.map((e) => e.value));
    expect(cands, "登録した宛先が名前の候補に出ていない").toContain("株式会社たちばな");

    // 請求書送りにすると、そのままドロップダウンに出る（売上が1件も無くても）
    await page.locator("#payChips button[data-pay='invoice']").click();
    expect((await page.locator("#inNameSel option").allInnerTexts()).map((t) => t.trim())).toEqual([
      "（選んでください）",
      "株式会社たちばな",
      "＋ 新しく登録する",
    ]);
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("宛先マスタ: 請求書の宛名が会社名になり、担当者が出る（A4を割らない）", async ({ page }) => {
    const errors = await open(page);
    await seed(page);

    // 担当者を足す（相手の住所は請求書には出さない）
    await openPartners(page);
    await expect(page.locator("#partnerList .li")).toHaveCount(1);
    await page.locator("#partnerList .li").click();
    await expect(page.locator("#ptName")).toHaveValue("山本商事");
    await page.locator("#ptPerson").fill("総務部 山本 様");
    await page.locator("#ptOk").click();

    await page.locator("#invName").selectOption("山本商事");
    await expect(page.locator("#invSheets .iv-to")).toHaveText("山本商事　御中");
    await expect(page.locator("#invSheets .iv-tosub")).toHaveText("総務部 山本 様");
    // 相手の住所は出さない（登録する欄も置いていない）
    await expect(page.locator("#invSheets")).not.toContainText("愛媛県今治市栄町");

    // 明細が多くても、担当者のぶんだけ行を減らしてA4に収める
    for (let i = 6; i <= 26; i++) {
      await addSale(page, {
        date: "2026-07-" + String(i).padStart(2, "0"),
        name: "山本商事",
        people: 2,
        amount: 5000,
        pay: "invoice",
        receipt: false,
      });
    }
    await openLook(page);
    for (const tpl of ["band", "tate", "card"]) {
      await page.locator(`#invTpl button[data-tpl="${tpl}"]`).click();
      const m = await page
        .locator("#invSheets .sheet")
        .first()
        .evaluate((el) => ({ h: el.offsetHeight, sh: el.scrollHeight }));
      expect(m.h, `${tpl} がA4(1123px)を超えている`).toBe(1123);
      expect(m.sh, `${tpl} の中身が紙からはみ出している`).toBeLessThanOrEqual(1123);
    }

    // 登録していない相手（ツケの田中）は名前＋御中のまま
    await page.locator("#invName").selectOption("田中");
    await expect(page.locator("#invSheets .iv-to")).toHaveText("田中　御中");
    await expect(page.locator("#invSheets .iv-tosub")).toHaveCount(0);
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("宛先マスタ: 会社名を直すと売上の名前も一緒に直る・様にできる・消せる", async ({ page }) => {
    const errors = await open(page);
    await seed(page);

    // 会社名を「株式会社」付きに直す → 売上帳の名前も請求書の宛名も一緒に変わる
    await openPartners(page);
    await page.locator("#partnerList .li").click();
    await page.locator("#ptName").fill("株式会社山本商事");
    await page.locator("#ptHonor button[data-h='様']").click();
    await page.locator("#ptOk").click();
    expect(await page.evaluate(() => window.__NOMIYA.sales.map((s) => s.name))).toContain(
      "株式会社山本商事"
    );
    await page.locator("#invName").selectOption("株式会社山本商事");
    await expect(page.locator("#invSheets .iv-to")).toHaveText("株式会社山本商事　様");
    // 売上帳にも新しい名前で出る（件数は増えていない）
    await page.locator(".nav-item[data-scr='list']").click();
    await expect(page.locator("#listSheets tr[data-id]")).toHaveCount(5);
    await expect(page.locator("#listSheets")).toContainText("株式会社山本商事");

    // 開き直しても残る
    await page.reload({ waitUntil: "load" });
    await openPartners(page);
    await expect(page.locator("#partnerList .li-nm")).toHaveText("株式会社山本商事　様");

    // 同じ会社名は2つ作れない
    await page.locator("#btnPartnerNew").click();
    await page.locator("#ptName").fill("株式会社山本商事");
    await page.locator("#ptOk").click();
    await expect(page.locator("#ptErr")).toContainText("もう登録されています");
    // 会社名が空でも保存できない
    await page.locator("#ptName").fill("");
    await page.locator("#ptOk").click();
    await expect(page.locator("#ptErr")).toContainText("会社名");
    await page.locator("#modalX").click();

    // 消すと売上はそのまま残り、宛名は名前＋御中に戻る
    await openPartners(page);
    await page.locator("#partnerList .li").click();
    await page.locator("#ptDel").click();
    await openPartners(page);
    await expect(page.locator("#partnerList .empty")).toBeVisible();
    await page.locator("#modalX").click();
    await page.locator("#invName").selectOption("株式会社山本商事");
    await expect(page.locator("#invSheets .iv-to")).toHaveText("株式会社山本商事　御中");
    expect(await page.evaluate(() => window.__NOMIYA.sales.length)).toBe(5);
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("ログイン: 初めては登録から入り、次からは自動で入る", async ({ page }) => {
    const errors = await install(page, { noSession: true });
    await page.goto(PAGE, { waitUntil: "load" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "load" });

    // ログイン画面が出る
    await expect(page.locator("#loginOv")).toHaveClass(/open/);

    // 空のまま押すと理由が出る
    await page.locator("#btnLogin").click();
    await expect(page.locator("#loginErr")).toContainText("メールとパスワード");
    // 登録していないメールでは入れない
    await page.locator("#loginEmail").fill("mama@snack.example");
    await page.locator("#loginPass").fill("himitsu123");
    await page.locator("#btnLogin").click();
    await expect(page.locator("#loginErr")).toContainText("メールかパスワードが違います");
    // 短いパスワードでは登録できない
    await page.locator("#loginPass").fill("123");
    await page.locator("#btnSignup").click();
    await expect(page.locator("#loginErr")).toContainText("6文字以上");

    // 登録するとそのまま入れる
    await page.locator("#loginPass").fill("himitsu123");
    await page.locator("#btnSignup").click();
    await expect(page.locator("#loginOv")).not.toHaveClass(/open/);
    await expect(page.locator("#scr-input")).toBeVisible();

    // 打った売上はクラウドに送られ、開き直してもログインし直さずに見られる
    await addSale(page, {
      date: "2026-07-01",
      name: "田中",
      people: 2,
      amount: 8000,
      pay: "cash",
      receipt: false,
    });
    await page.locator(".nav-item[data-scr='set']").click();
    await expect(page.locator("#acctInfo")).toContainText("mama@snack.example");
    await page.reload({ waitUntil: "load" });
    await expect(page.locator("#loginOv")).not.toHaveClass(/open/);
    expect(await page.evaluate(() => window.__NOMIYA.sales.length)).toBe(1);
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("ログアウトすると次はログイン画面（別の店で入ると前の店の売上は出ない）", async ({
    page,
  }) => {
    const errors = await open(page);
    await addSale(page, {
      date: "2026-07-01",
      name: "田中",
      people: 2,
      amount: 8000,
      pay: "cash",
      receipt: false,
    });
    await page.locator(".nav-item[data-scr='set']").click();
    await page.locator("#btnLogout").click();
    await expect(page.locator("#loginOv")).toHaveClass(/open/);

    // 別の店のアカウントで入る → 前の店の売上は見えない
    await page.locator("#loginEmail").fill("betten@snack.example");
    await page.locator("#loginPass").fill("himitsu123");
    await page.locator("#btnSignup").click();
    await expect(page.locator("#loginOv")).not.toHaveClass(/open/);
    expect(await page.evaluate(() => window.__NOMIYA.sales.length)).toBe(0);
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("別のスマホで打った分が入ってくる（同じ売上は新しい方が残る）", async ({ page }) => {
    const errors = await open(page);
    await addSale(page, {
      date: "2026-07-01",
      name: "田中",
      people: 2,
      amount: 8000,
      pay: "cash",
      receipt: false,
    });
    // 「別のスマホ」＝同じアカウントでクラウドに直接1件足す
    await page.evaluate(async () => {
      const sb = window.__NOMIYA_FAKE_SB__;
      await sb.from("nomiya_sales").upsert(
        [
          {
            account_id: window.__NOMIYA.account,
            cid: "phone2",
            ymd: "2026-07-02",
            name: "佐藤",
            people: 3,
            amount: 12000,
            pay: "cash",
            receipt: "none",
            memo: "別のスマホ",
            created_at: "2026-07-02T10:00:00.000Z",
            updated_at: "2026-07-02T10:00:00.000Z",
          },
        ],
        { onConflict: "account_id,cid" }
      );
    });
    await page.evaluate(() => window.__NOMIYA.syncNow(false));
    expect(await page.evaluate(() => window.__NOMIYA.sales.length)).toBe(2);
    await page.locator(".nav-item[data-scr='list']").click();
    await expect(page.locator("#listSheets")).toContainText("佐藤");

    // 同じ売上を「別のスマホ」で新しく直す → 同期すると新しい方が残る
    await page.evaluate(async () => {
      const sb = window.__NOMIYA_FAKE_SB__;
      const mine = window.__NOMIYA.sales.find((s) => s.name === "田中");
      await sb.from("nomiya_sales").upsert(
        [
          {
            account_id: window.__NOMIYA.account,
            cid: mine.id,
            ymd: mine.date,
            name: "田中",
            people: 2,
            amount: 9500,
            pay: "cash",
            receipt: "none",
            memo: "",
            created_at: mine.createdAt,
            updated_at: "2099-01-01T00:00:00.000Z",
          },
        ],
        { onConflict: "account_id,cid" }
      );
    });
    await page.evaluate(() => window.__NOMIYA.syncNow(false));
    expect(
      await page.evaluate(() => window.__NOMIYA.sales.find((s) => s.name === "田中").amount)
    ).toBe(9500);
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("打ったらすぐクラウドに送られる（同期ボタンを押さなくていい）", async ({ page }) => {
    const errors = await open(page);
    await addSale(page, {
      date: "2026-07-01",
      name: "田中",
      people: 2,
      amount: 8000,
      pay: "cash",
      receipt: false,
    });
    await page.locator(".nav-item[data-scr='set']").click();
    // 未送信が0になる＝送れた（同期ボタンもリロードもしていない）
    await expect(page.locator("#acctInfo")).toContainText("同期済み");
    const rows = await page.evaluate(async () => {
      const r = await window.__NOMIYA_FAKE_SB__.from("nomiya_sales").select("*").range(0, 999);
      return r.data;
    });
    expect(rows.length).toBe(1);
    expect(rows[0].name).toBe("田中");
    expect(rows[0].amount).toBe(8000);
    expect(rows[0].ymd).toBe("2026-07-01");
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("オフラインでも打てて、つながったら送られる", async ({ page }) => {
    const errors = await open(page);
    // 電波が無い状態にする
    await page.evaluate(() => {
      window.__FAKE_OFFLINE__ = true;
      Object.defineProperty(window.navigator, "onLine", { get: () => false, configurable: true });
      window.dispatchEvent(new Event("offline"));
    });
    await addSale(page, {
      date: "2026-07-01",
      name: "田中",
      people: 2,
      amount: 8000,
      pay: "cash",
      receipt: false,
    });
    // 打てているし、未送信だと画面で分かる
    expect(await page.evaluate(() => window.__NOMIYA.sales.length)).toBe(1);
    await page.locator(".nav-item[data-scr='set']").click();
    await expect(page.locator("#acctInfo")).toContainText("オフライン");
    await expect(page.locator("#acctInfo")).toContainText("未送信 1 件");

    // つながったら自動で送られる
    await page.evaluate(() => {
      window.__FAKE_OFFLINE__ = false;
      Object.defineProperty(window.navigator, "onLine", { get: () => true, configurable: true });
      window.dispatchEvent(new Event("online"));
    });
    await expect(page.locator("#acctInfo")).toContainText("同期済み");
    expect(await page.evaluate(() => window.__NOMIYA.pending)).toBe(0);

    // 端末の控えを消しても、クラウドから戻ってくる（機種変しても消えない）
    await page.evaluate(() => {
      ["nomiya_sales_v1", "nomiya_partners_v1", "nomiya_sync_at_v1", "nomiya_sync_ok_v1"].forEach(
        (k) => localStorage.removeItem(k)
      );
    });
    await page.reload({ waitUntil: "load" });
    await page.locator(".nav-item[data-scr='set']").click();
    await expect(page.locator("#acctInfo")).toContainText("同期済み");
    expect(await page.evaluate(() => window.__NOMIYA.sales.length)).toBe(1);
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("宛先と店の設定もクラウドに残る（新しいスマホでも出てくる）", async ({ page }) => {
    const errors = await open(page);
    await openPartners(page);
    await page.locator("#btnPartnerNew").click();
    await page.locator("#ptName").fill("株式会社山本商事");
    await page.locator("#ptPerson").fill("総務部 山本 様");
    await page.locator("#ptOk").click();
    await page.locator(".nav-item[data-scr='set']").click();
    await page.locator("#setStore").fill("スナック まりも");
    await page.locator("#btnSaveSet").click();
    await expect(page.locator("#acctInfo")).toContainText("同期済み");

    // 端末の控えを全部消して開き直す＝新しいスマホと同じ
    await page.evaluate(() => {
      [
        "nomiya_sales_v1",
        "nomiya_partners_v1",
        "nomiya_settings_v1",
        "nomiya_set_at_v1",
        "nomiya_sync_at_v1",
        "nomiya_sync_ok_v1",
      ].forEach((k) => localStorage.removeItem(k));
    });
    await page.reload({ waitUntil: "load" });
    await page.locator(".nav-item[data-scr='set']").click();
    await expect(page.locator("#acctInfo")).toContainText("同期済み");
    await expect(page.locator("#setStore")).toHaveValue("スナック まりも");
    await openPartners(page);
    await expect(page.locator("#partnerList .li-nm")).toHaveText("株式会社山本商事　御中");
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("新しく契約した店の初回同期が落ちない（設定を一度も保存していない状態）", async ({
    page,
  }) => {
    const errors = await install(page, { noSession: true });
    await page.goto(PAGE, { waitUntil: "load" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "load" });
    // まっさらな状態で登録して入る
    await page.locator("#loginEmail").fill("shinki@snack.example");
    await page.locator("#loginPass").fill("himitsu123");
    await page.locator("#btnSignup").click();
    await expect(page.locator("#loginOv")).not.toHaveClass(/open/);

    // 設定を一度も保存していないのに、同期が通る（前は空の時刻を送って22007で落ちていた）
    await page.locator(".nav-item[data-scr='set']").click();
    await expect(page.locator("#acctInfo")).toContainText("同期済み");
    await expect(page.locator("#acctInfo")).not.toContainText("invalid input syntax");
    await expect(page.locator("#acctInfo")).not.toContainText("22007");
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("書き出したファイルから戻せる（全部消しても復元できる）", async ({ page }) => {
    const errors = await open(page);
    await addSale(page, {
      date: "2026-07-01",
      name: "田中",
      people: 2,
      amount: 8000,
      pay: "cash",
      receipt: false,
      memo: "ボトル入れ",
    });
    await page.locator(".nav-item[data-scr='set']").click();
    await expect(page.locator("#acctInfo")).toContainText("同期済み");

    // 書き出す（ファイルを受け取る）
    const dl = await Promise.race([
      page.waitForEvent("download", { timeout: 15000 }),
      page
        .locator("#btnExport")
        .click()
        .then(() => page.waitForEvent("download")),
    ]);
    const file = await dl.path();
    expect(file, "書き出したファイルが取れない").toBeTruthy();

    // 全部消す（クラウドにも「消した」が伝わる）
    await page.locator("#btnWipe").click();
    await page.locator("#mdYes").click();
    await expect(page.locator("#acctInfo")).toContainText("同期済み");
    expect(
      await page.evaluate(() => window.__NOMIYA.sales.filter((s) => !s.deletedAt).length)
    ).toBe(0);

    // 消した時刻を覚えておく（戻した行がこれより新しくないとクラウドに負けて消える）
    const wipedAt = await page.evaluate(() =>
      window.__NOMIYA.sales
        .map((s) => s.updatedAt)
        .sort()
        .pop()
    );

    // 読み込んで「入れ替える」で戻す
    await page.locator("#fileImport").setInputFiles(file);
    await page.locator("#mdRep").click();
    // ★戻した行の更新時刻が「今」になっていること（これが無いと次の同期で消える）
    const restoredAt = await page.evaluate(
      () => window.__NOMIYA.sales.filter((s) => !s.deletedAt)[0].updatedAt
    );
    expect(
      restoredAt > wipedAt,
      `戻した行が古いまま（${restoredAt} <= ${wipedAt}）＝次の同期で消える`
    ).toBe(true);
    await expect(page.locator("#acctInfo")).toContainText("同期済み");
    expect(
      await page.evaluate(() => window.__NOMIYA.sales.filter((s) => !s.deletedAt).length)
    ).toBe(1);

    // ★開き直して同期しても、戻した売上が消えない（前はクラウドの「消した」に負けて消えた）
    await page.reload({ waitUntil: "load" });
    // 「同期済み」の表示は前回の値が残るので、同期そのものを待ってから見る
    await page.evaluate(() => window.__NOMIYA.syncNow(false));
    await page.locator(".nav-item[data-scr='set']").click();
    const alive = await page.evaluate(() =>
      window.__NOMIYA.sales.filter((s) => !s.deletedAt).map((s) => [s.name, s.amount, s.memo])
    );
    expect(alive).toEqual([["田中", 8000, "ボトル入れ"]]);
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("請求書番号は端末の控えを消しても続く（クラウドに台帳がある）", async ({ page }) => {
    const errors = await open(page);
    await seed(page);
    // 2枚出す＝001と002が採番される
    //（1枚だけだと台帳が消えても偶然001に戻るので、試験として成り立たない）
    await page.locator(".nav-item[data-scr='inv']").click();
    await page.locator("#invName").selectOption("山本商事");
    const no1 = (await page.locator("#invSheets .iv-meta").innerText()).match(/No\.\s*(\S+)/)[1];
    await page.locator("#invName").selectOption("田中");
    const no2 = (await page.locator("#invSheets .iv-meta").innerText()).match(/No\.\s*(\S+)/)[1];
    expect(no1).toBe("202607-001");
    expect(no2).toBe("202607-002");
    await page.locator(".nav-item[data-scr='set']").click();
    await expect(page.locator("#acctInfo")).toContainText("同期済み");

    // 端末の控え（番号台帳も）を消して開き直す＝新しいスマホと同じ
    await page.evaluate(() => {
      ["nomiya_invoices_v1", "nomiya_sync_at_v1", "nomiya_sync_ok_v1"].forEach((k) =>
        localStorage.removeItem(k)
      );
    });
    await page.reload({ waitUntil: "load" });
    await page.evaluate(() => window.__NOMIYA.syncNow(false));
    // ★番号は「見た順」で偶然そろうことがあるので、台帳そのものが戻っているかを見る
    const led = await page.evaluate(() => window.__NOMIYA.invoices.map((x) => x.no).sort());
    expect(led, "番号の台帳がクラウドから戻っていない＝機種を替えると番号が重複する").toEqual([
      no1,
      no2,
    ]);
    await setInvMonth(page, "2026-07");
    await page.locator("#invName").selectOption("田中");
    const again = (await page.locator("#invSheets .iv-meta").innerText()).match(/No\.\s*(\S+)/)[1];
    expect(again, "台帳が端末にしか無いと番号が001に戻る＝重複・欠番").toBe(no2);
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("別の店で入ると、前の店の判子・振込先・登録番号が残らない", async ({ page }) => {
    const errors = await open(page);
    // A店：店の情報を全部入れる
    await page.locator(".nav-item[data-scr='set']").click();
    await page.locator("#setStore").fill("スナック まりも");
    await page.locator("#setBank").fill("伊予銀行 本店 普通 1234567");
    await page.locator("#setInvoiceNo").fill("T1111111111111");
    await page.locator("#btnSaveSet").click();
    await expect(page.locator("#acctInfo")).toContainText("同期済み");

    // B店（別のアカウント）で入り直す
    await page.locator("#btnLogout").click();
    await expect(page.locator("#loginOv")).toHaveClass(/open/);
    await page.locator("#loginEmail").fill("betten@snack.example");
    await page.locator("#loginPass").fill("himitsu123");
    await page.locator("#btnSignup").click();
    await expect(page.locator("#loginOv")).not.toHaveClass(/open/);

    // ★前の店の情報が1つも残っていないこと（残ると他店の請求書が客に届く）
    await page.locator(".nav-item[data-scr='set']").click();
    await expect(page.locator("#setStore")).toHaveValue("");
    await expect(page.locator("#setBank")).toHaveValue("");
    await expect(page.locator("#setInvoiceNo")).toHaveValue("");
    const leaked = await page.evaluate(() => {
      const s = window.__NOMIYA.settings;
      return [s.store, s.bank, s.regNo, s.hanko, s.logo].filter(Boolean);
    });
    expect(leaked, "前の店の設定が残っている").toEqual([]);

    // ★ログアウトを通らずにアカウントが変わる場合（スイートの別アプリで入り直した等）も同じこと
    await page.locator("#setStore").fill("スナック べつてん");
    await page.locator("#btnSaveSet").click();
    await expect(page.locator("#acctInfo")).toContainText("同期済み");
    await page.evaluate(() => {
      const db = JSON.parse(localStorage.getItem("__fake_supa_db__"));
      db.users["hoka@snack.example"] = {
        id: "u_hoka",
        email: "hoka@snack.example",
        password: "himitsu123",
      };
      db.session = { user: { id: "u_hoka", email: "hoka@snack.example" } };
      localStorage.setItem("__fake_supa_db__", JSON.stringify(db));
    });
    await page.reload({ waitUntil: "load" });
    await page.locator(".nav-item[data-scr='set']").click();
    await expect(page.locator("#acctInfo")).toContainText("hoka@snack.example");
    await expect(page.locator("#setStore")).toHaveValue("");
    expect(
      await page.evaluate(() => window.__NOMIYA.sales.length),
      "別のアカウントなのに前の店の売上が残っている"
    ).toBe(0);
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("ログアウトすると端末に売上を残さない（落としても読まれない）", async ({ page }) => {
    const errors = await open(page);
    await addSale(page, {
      date: "2026-07-01",
      name: "田中",
      people: 2,
      amount: 8000,
      pay: "cash",
      receipt: false,
    });
    await page.locator(".nav-item[data-scr='set']").click();
    await expect(page.locator("#acctInfo")).toContainText("同期済み");
    await page.locator("#btnLogout").click();
    await expect(page.locator("#loginOv")).toHaveClass(/open/);

    // 端末の控えが空になっていること
    const left = await page.evaluate(() =>
      ["nomiya_sales_v1", "nomiya_partners_v1", "nomiya_invoices_v1", "nomiya_settings_v1"].filter(
        (k) => localStorage.getItem(k)
      )
    );
    expect(left, "ログアウトしたのに端末に残っている").toEqual([]);
    expect(await page.evaluate(() => window.__NOMIYA.sales.length)).toBe(0);

    // 入り直せば、クラウドから戻ってくる（消えたのではなく預けてある）
    await page.locator("#loginEmail").fill("test@example.com");
    await page.locator("#loginPass").fill("test1234");
    await page.locator("#btnLogin").click();
    await expect(page.locator("#loginOv")).not.toHaveClass(/open/);
    await page.evaluate(() => window.__NOMIYA.syncNow(false));
    expect(await page.evaluate(() => window.__NOMIYA.sales.length)).toBe(1);
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("時計が進んだ端末の行があっても「未送信0件」と嘘をつかない", async ({ page }) => {
    const errors = await open(page);
    // 別の端末（時計が2099年）が書いた行がクラウドにある状態を作る
    await page.evaluate(async () => {
      await window.__NOMIYA_FAKE_SB__.from("nomiya_sales").upsert(
        [
          {
            account_id: window.__NOMIYA.account,
            cid: "future",
            ymd: "2026-07-01",
            name: "未来の端末",
            people: 1,
            amount: 1000,
            pay: "cash",
            receipt: "none",
            memo: "",
            created_at: "2099-01-01T00:00:00.000Z",
            updated_at: "2099-01-01T00:00:00.000Z",
          },
        ],
        { onConflict: "account_id,cid" }
      );
    });
    await page.evaluate(() => window.__NOMIYA.syncNow(false));

    // このあとに打った売上は「未送信」として数えられ、ちゃんと送られること
    await page.evaluate(() => {
      window.__FAKE_OFFLINE__ = true;
      Object.defineProperty(window.navigator, "onLine", { get: () => false, configurable: true });
      window.dispatchEvent(new Event("offline"));
    });
    await addSale(page, {
      date: "2026-07-02",
      name: "佐藤",
      people: 2,
      amount: 5000,
      pay: "cash",
      receipt: false,
    });
    await page.locator(".nav-item[data-scr='set']").click();
    await expect(page.locator("#acctInfo")).toContainText("未送信 1 件");

    await page.evaluate(() => {
      window.__FAKE_OFFLINE__ = false;
      Object.defineProperty(window.navigator, "onLine", { get: () => true, configurable: true });
      window.dispatchEvent(new Event("online"));
    });
    await expect(page.locator("#acctInfo")).toContainText("同期済み");
    const rows = await page.evaluate(async () => {
      const r = await window.__NOMIYA_FAKE_SB__.from("nomiya_sales").select("*").range(0, 99);
      return (r.data || []).map((x) => x.name).sort();
    });
    expect(rows, "未来の時刻の行に隠れて、打った売上が送られていない").toEqual([
      "佐藤",
      "未来の端末",
    ]);
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  // レジ締めは「その日」を見るので、テストの売上と同じ日に合わせる
  async function setCloseDay(page, ymd) {
    await page.locator(".nav-item[data-scr='close']").click();
    const want = ymd;
    for (let i = 0; i < 400; i++) {
      const now = await page.evaluate(() => window.__NOMIYA.closeYmd);
      if (now === want) return;
      await page.locator(`#periodClose [data-cmv="${now > want ? -1 : 1}"]`).click();
    }
    throw new Error("締めの日を " + ymd + " に合わせられなかった");
  }

  test("レジ締め: 現金だけを数えて、あるべき額と差額が出る", async ({ page }) => {
    const errors = await open(page);
    await seed(page); // 7/1 現金8,000 ／請求書送り32,000 ／7/2 PayPay12,000・ツケ5,000 ／7/5 クレカ25,000
    await setCloseDay(page, "2026-07-01");

    // 釣銭3万＋現金売上8,000 − 出金3,000 ＝ 35,000
    await page.locator("#clOpen").fill("30000");
    await page.locator("#btnOutAdd").click();
    await page.locator("#outKind button[data-ok='buy']").click();
    await page.locator("#outAmt").fill("3000");
    await page.locator("#outMemo").fill("氷とおしぼり");
    await page.locator("#outOk").click();
    await expect(page.locator("#clCash")).toHaveText("¥8,000");
    await expect(page.locator("#clOut")).toHaveText("−¥3,000");
    await expect(page.locator("#clShould")).toHaveText("¥35,000");
    // 数えるまで差額は出さない（0円と嘘をつかない）
    await expect(page.locator("#clDiff")).toHaveText("—");

    // 500円足りない日
    await page.locator("#clCount").fill("34500");
    await expect(page.locator("#clDiff")).toHaveText("−¥500");
    await expect(page.locator("#clDiff")).toHaveClass(/cl-minus/);

    // 請求書送りの32,000は金庫に入らない（現金以外に出る）
    await expect(page.locator("#clOther")).toContainText("¥32,000");
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("レジ締め: 締めると動かなくなり、売上を直すと締め直しが要ると出る", async ({ page }) => {
    const errors = await open(page);
    await seed(page);
    await setCloseDay(page, "2026-07-01");
    await page.locator("#clOpen").fill("0");

    // 数えていないと締められない
    await page.locator("#btnClose").click();
    await expect(page.locator("#clState")).not.toContainText("締めました");

    await page.locator("#clCount").fill("8000");
    await page.locator("#btnClose").click();
    await expect(page.locator("#clState")).toContainText("に締めました");
    await expect(page.locator("#clCount")).toHaveAttribute("readonly", "");
    // 締めた日は出金も足せない
    await page.locator("#btnOutAdd").click();
    await expect(page.locator("#modalOv")).not.toHaveClass(/open/);

    // 売上を直すと「締め直してください」に変わる
    await page.locator(".nav-item[data-scr='list']").click();
    await page.locator("#listSheets tr[data-id]").first().click();
    await page.locator("#inAmount").fill("9000");
    await page.locator("#btnSave").click();
    await setCloseDay(page, "2026-07-01");
    await expect(page.locator("#clState")).toContainText("締め直してください");
    await expect(page.locator("#clShould")).toHaveText("¥9,000");

    // 締め直せる（鍵を外す→もう一度締める）
    await page.locator("#btnClose").click();
    await expect(page.locator("#clCount")).not.toHaveAttribute("readonly", "");
    await page.locator("#clCount").fill("9000");
    await page.locator("#btnClose").click();
    await expect(page.locator("#clState")).toContainText("に締めました");
    await expect(page.locator("#clDiff")).toHaveText("¥0");
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("レジ締め: 現金で回収したツケは金庫に入り、振込なら入らない", async ({ page }) => {
    const errors = await open(page);
    await seed(page);
    // 田中のツケ5,000を 7/1 に現金で回収する
    await page.locator(".nav-item[data-scr='inv']").click();
    await page.locator("#invName").selectOption("田中");
    await page.locator("#btnPaid").click();
    await page.locator("#mdPaidDate").fill("2026-07-01");
    await page.locator("#mdPaidHow button[data-how='cash']").click();
    await page.locator("#mdPaidOk").click();

    await setCloseDay(page, "2026-07-01");
    await expect(page.locator("#clColl")).toHaveText("¥5,000");
    await page.locator("#clOpen").fill("0");
    await expect(page.locator("#clShould")).toHaveText("¥13,000"); // 現金8,000＋回収5,000

    // 振込で受け取ったなら金庫は増えない
    await page.locator(".nav-item[data-scr='inv']").click();
    await page.locator("#invName").selectOption("山本商事");
    await page.locator("#btnPaid").click();
    await page.locator("#mdPaidDate").fill("2026-07-01");
    await page.locator("#mdPaidOk").click(); // 既定は「振込・カード」
    await setCloseDay(page, "2026-07-01");
    await expect(page.locator("#clColl")).toHaveText("¥5,000");
    await expect(page.locator("#clShould")).toHaveText("¥13,000");
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("レジ締め: 前の日に数えた実数が次の日の釣銭になり、クラウドにも残る", async ({ page }) => {
    const errors = await open(page);
    await seed(page);
    await setCloseDay(page, "2026-07-01");
    await page.locator("#clOpen").fill("30000");
    await page.locator("#clCount").fill("38000");
    await page.locator("#btnClose").click();
    await expect(page.locator("#clState")).toContainText("に締めました");

    // 翌日を開くと、前の日の実数が釣銭に入っている
    await page.locator("#periodClose [data-cmv='1']").click();
    await expect(page.locator("#clOpen")).toHaveValue("38000");

    // クラウドに送られている
    await page.locator(".nav-item[data-scr='set']").click();
    await expect(page.locator("#acctInfo")).toContainText("同期済み");
    const cloud = await page.evaluate(async () => {
      const r = await window.__NOMIYA_FAKE_SB__.from("nomiya_closes").select("*").range(0, 99);
      return (r.data || []).map((x) => [x.ymd, x.opening, x.counted]);
    });
    expect(cloud).toEqual([["2026-07-01", 30000, 38000]]);

    // 端末の控えを消して開き直しても戻ってくる
    await page.evaluate(() => {
      ["nomiya_closes_v1", "nomiya_sync_at_v1", "nomiya_sync_ok_v1"].forEach((k) =>
        localStorage.removeItem(k)
      );
    });
    await page.reload({ waitUntil: "load" });
    await page.evaluate(() => window.__NOMIYA.syncNow(false));
    const back = await page.evaluate(() => window.__NOMIYA.closes["2026-07-01"]);
    expect(back.counted, "締めがクラウドから戻っていない").toBe(38000);
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("レジ締め: A4の日報が1枚に収まり、印刷は同じ画面のまま", async ({ page }) => {
    const errors = await open(page);
    await seed(page);
    await setCloseDay(page, "2026-07-01");
    await page.locator("#clOpen").fill("30000");
    for (const [kind, amt, memo] of [
      ["buy", "3000", "氷とおしぼり"],
      ["pay", "12000", "日払い"],
      ["taxi", "1500", "送り"],
      ["lend", "5000", "前借り"],
      ["other", "800", "雑費"],
    ]) {
      await page.locator("#btnOutAdd").click();
      await page.locator(`#outKind button[data-ok='${kind}']`).click();
      await page.locator("#outAmt").fill(amt);
      await page.locator("#outMemo").fill(memo);
      await page.locator("#outOk").click();
    }
    await page.locator("#clCount").fill("15000");
    await page.locator("#clMemo").fill("数え直しても合わず");

    const m = await page.locator("#closeSheets .sheet").evaluate((el) => ({
      w: el.offsetWidth,
      h: el.offsetHeight,
      sh: el.scrollHeight,
    }));
    expect(m.w).toBe(794);
    expect(m.h).toBe(1123);
    expect(m.sh, "日報がA4からはみ出している").toBeLessThanOrEqual(1123);
    await expect(page.locator("#closeSheets")).toContainText("日報（レジ締め）");
    await expect(page.locator("#closeSheets")).toContainText("数え直しても合わず");

    await page.locator("#btnPrintClose").click();
    expect(await page.evaluate(() => window.__printed)).toBe(1);
    // 別タブを開かず、同じ画面の #printArea に紙を移して出す
    await expect(page.locator("#printArea .sheet")).toHaveCount(1);
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("税理士の紙: 領収書ありで絞っても、使ったお金・売掛・現金は期間ぜんぶ出る", async ({
    page,
  }) => {
    const errors = await open(page);
    await seed(page); // 7月：現金8,000／請求書送り32,000／PayPay12,000／ツケ5,000／クレカ25,000
    // 7/1を締める（氷3,000・日払い12,000を出金）
    await setCloseDay(page, "2026-07-01");
    await page.locator("#clOpen").fill("30000");
    for (const [kind, amt, memo, staff] of [
      ["buy", "3000", "氷とおしぼり", ""],
      ["pay", "12000", "日払い", "あかり"],
    ]) {
      await page.locator("#btnOutAdd").click();
      await page.locator(`#outKind button[data-ok='${kind}']`).click();
      await page.locator("#outAmt").fill(amt);
      await page.locator("#outMemo").fill(memo);
      if (staff) await page.locator("#outStaff").fill(staff);
      await page.locator("#outOk").click();
    }
    await page.locator("#clCount").fill("23000");
    await page.locator("#btnClose").click();

    await page.locator(".nav-item[data-scr='tax']").click();
    await page.locator("#taxRecTabs button[data-trec='all']").click();
    const read = async () =>
      (await page.locator("#taxSheets .sheet").innerText()).replace(/[\s\u3000]+/g, " ");

    // 全体：売上も、お金まわりも出る
    const all = await read();
    expect(all).toContain("¥82,000"); // 売上（全体）
    expect(all).toContain("買い出し（1件） 3,000");
    expect(all).toContain("日払い・給料（1件） 12,000");
    expect(all).toContain("合計 15,000"); // 現金で使ったお金の合計
    expect(all).toContain("期間の終わりの未回収 37,000"); // 請求書32,000＋ツケ5,000
    expect(all).toContain("手許現金");
    expect(all).toContain("23,000");

    // 「領収書あり」で絞る → 売上だけ変わり、お金まわりは同じ
    await page.locator("#taxRecTabs button[data-trec='yes']").click();
    const yes = await read();
    expect(yes).toContain("¥69,000"); // 売上（領収書あり分）
    expect(yes, "使ったお金まで絞られている").toContain("買い出し（1件） 3,000");
    expect(yes).toContain("日払い・給料（1件） 12,000");
    expect(yes, "未回収まで絞られている").toContain("期間の終わりの未回収 37,000");
    expect(yes).toContain("手許現金");

    const m = await page
      .locator("#taxSheets .sheet")
      .evaluate((el) => ({ h: el.offsetHeight, sh: el.scrollHeight }));
    expect(m.h).toBe(1123);
    expect(m.sh, "税理士の紙がA4からはみ出している").toBeLessThanOrEqual(1123);
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("税理士の紙: 人件費は既定で合計だけ、切り替えると誰にいくらも出る", async ({ page }) => {
    const errors = await open(page);
    await seed(page);
    await setCloseDay(page, "2026-07-01");
    await page.locator("#btnOutAdd").click();
    await page.locator("#outKind button[data-ok='pay']").click();
    await page.locator("#outAmt").fill("12000");
    await page.locator("#outStaff").fill("あかり");
    await page.locator("#outOk").click();

    await page.locator(".nav-item[data-scr='tax']").click();
    await expect(page.locator("#taxSheets .sheet")).toContainText("日払い・給料");
    await expect(page.locator("#taxSheets .sheet")).not.toContainText("あかり");

    await page.locator("#taxNames button[data-tn='1']").click();
    await expect(page.locator("#taxSheets .sheet")).toContainText("あかり（1回）");

    // 開き直しても選んだままで残る
    await page.reload({ waitUntil: "load" });
    await page.locator(".nav-item[data-scr='tax']").click();
    await expect(page.locator("#taxSheets .sheet")).toContainText("あかり（1回）");
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  // 給料タブは「その日」を見る
  async function setPayDay(page, ymd) {
    await page.locator(".nav-item[data-scr='pay']").click();
    for (let i = 0; i < 400; i++) {
      const now = await page.evaluate(() => window.__NOMIYA.payYmd);
      if (now === ymd) return;
      await page.locator(`#periodPay [data-pmv="${now > ymd ? -1 : 1}"]`).click();
    }
    throw new Error("給料の日を " + ymd + " に合わせられなかった");
  }
  async function addStaff(page, o) {
    await page.locator(".nav-item[data-scr='pay']").click();
    await page.locator("#btnStaffAdd").click();
    await page.locator("#st_name").fill(o.name);
    if (o.hourly) await page.locator("#st_hourly").fill(String(o.hourly));
    if (o.daily) await page.locator("#st_daily").fill(String(o.daily));
    if (o.shimei) await page.locator("#st_b_shimei").fill(String(o.shimei));
    if (o.bottlePct) {
      await page.locator("#st_u_bottle button[data-u='pct']").click();
      await page.locator("#st_b_bottle").fill(String(o.bottlePct));
    }
    if (o.douhan) await page.locator("#st_b_douhan").fill(String(o.douhan));
    if (o.rate) await page.locator("#st_rate").fill(String(o.rate));
    if (o.guarantee) await page.locator("#st_guarantee").fill(String(o.guarantee));
    if (o.kousei) await page.locator("#st_kousei").fill(String(o.kousei));
    if (o.contract) await page.locator("#st_employ button[data-em='contract']").click();
    await page.locator("#st_ok").click();
  }

  test("給料: 時給＋バック＋歩合−控除で、その日の払う額が出る", async ({ page }) => {
    const errors = await open(page);
    await addStaff(page, {
      name: "あかり",
      hourly: 1200,
      shimei: 2000,
      douhan: 3000,
      rate: 10,
      kousei: 1000,
    });
    await setPayDay(page, "2026-07-30");
    await page.locator("#btnWorkAdd").click();
    await page.locator("#wk_in").fill("20:00");
    await page.locator("#wk_out").fill("01:30");
    await page.locator("#wk_c_shimei").fill("2");
    await page.locator("#wk_c_douhan").fill("1");
    await page.locator("#wk_sales").fill("60000");
    await page.locator("#wk_fine").fill("1000");
    // 保存する前に、その場で計算が出る
    // 6,600（時給1,200×5.5h）＋7,000（指名2×2,000＋同伴3,000）＋6,000（60,000の10%）＝19,600
    await expect(page.locator("#wk_calc")).toContainText("支給 ¥19,600");
    await expect(page.locator("#wk_calc")).toContainText("¥17,600"); // 差引（控除2,000）
    await page.locator("#wk_ok").click();

    await expect(page.locator("#payDayList")).toContainText("あかり");
    await expect(page.locator("#payDayList")).toContainText("5.5h");
    await expect(page.locator("#payDayList")).toContainText("本指名2・同伴1");
    await expect(page.locator("#payDayList .li-amt")).toHaveText("¥17,600");
    // 月のまとめにも出る
    await expect(page.locator("#payMonth")).toContainText("あかり");
    await expect(page.locator("#payMonth")).toContainText("17,600");
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("給料: 最低保証の人は、保証と歩合の高い方になる", async ({ page }) => {
    const errors = await open(page);
    await addStaff(page, { name: "ゆい", rate: 50, guarantee: 15000, contract: true });
    await setPayDay(page, "2026-07-30");
    await page.locator("#btnWorkAdd").click();
    await page.locator("#wk_sales").fill("20000"); // 歩合10,000 < 保証15,000
    await expect(page.locator("#wk_calc")).toContainText("最低保証を使いました");
    await page.locator("#wk_sales").fill("60000"); // 歩合30,000 > 保証15,000
    await expect(page.locator("#wk_calc")).not.toContainText("最低保証を使いました");
    await page.locator("#wk_ok").click();
    await expect(page.locator("#payDayList .li-amt")).toHaveText("¥30,000");
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("給料: 日払いで渡すと、その日のレジ締めの出金に自動で入る（二度打ちしない）", async ({
    page,
  }) => {
    const errors = await open(page);
    await addStaff(page, { name: "あかり", daily: 10000 });
    await setPayDay(page, "2026-07-30");
    await page.locator("#btnWorkAdd").click();
    await page.locator("#wk_ok").click();
    await page.locator("#payDayList .li").first().click();
    await page.locator("#wk_pay").click();
    await expect(page.locator("#payDayList")).toContainText("渡した");

    // 締めタブに出金として入っている
    await setCloseDay(page, "2026-07-30");
    await expect(page.locator("#clOuts")).toContainText("日払い・給料");
    await expect(page.locator("#clOuts")).toContainText("あかり");
    await expect(page.locator("#clOuts .li-amt")).toHaveText("−¥10,000");
    await expect(page.locator("#clOut")).toHaveText("−¥10,000");
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("給料: 黄色い注意（最低賃金割れ・深夜割増・業務委託の実態）", async ({ page }) => {
    const errors = await open(page);
    // 県の最低賃金を入れる
    await page.locator(".nav-item[data-scr='set']").click();
    await page.evaluate(() => {
      const N = window.__NOMIYA;
      N.settings.minWage = 1000;
      N.renderAll();
    });
    await addStaff(page, { name: "新人", hourly: 800 });
    await setPayDay(page, "2026-07-30");
    await page.locator("#btnWorkAdd").click();
    await page.locator("#wk_in").fill("19:00");
    await page.locator("#wk_out").fill("21:00");
    await page.locator("#wk_ok").click();
    await expect(page.locator("#payDayList")).toContainText("最低賃金");

    // 深夜にかかる人
    await page.locator("#payDayList .li").first().click();
    await page.locator("#wk_out").fill("01:00");
    await page.locator("#wk_ok").click();
    await expect(page.locator("#payDayList")).toContainText("22時以降");
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("給料: 人も出勤もクラウドに残る（新しいスマホでも出てくる）", async ({ page }) => {
    const errors = await open(page);
    await addStaff(page, { name: "あかり", hourly: 1200, shimei: 2000 });
    await setPayDay(page, "2026-07-30");
    await page.locator("#btnWorkAdd").click();
    await page.locator("#wk_in").fill("20:00");
    await page.locator("#wk_out").fill("00:00");
    await page.locator("#wk_c_shimei").fill("3");
    await page.locator("#wk_ok").click();
    await page.locator(".nav-item[data-scr='set']").click();
    await expect(page.locator("#acctInfo")).toContainText("同期済み");

    // 端末の控えを消して開き直す
    await page.evaluate(() => {
      ["nomiya_staff_v1", "nomiya_work_v1", "nomiya_sync_at_v1", "nomiya_sync_ok_v1"].forEach((k) =>
        localStorage.removeItem(k)
      );
    });
    await page.reload({ waitUntil: "load" });
    await page.evaluate(() => window.__NOMIYA.syncNow(false));
    expect(await page.evaluate(() => window.__NOMIYA.staff.length)).toBe(1);
    expect(await page.evaluate(() => window.__NOMIYA.works.length)).toBe(1);
    await setPayDay(page, "2026-07-30");
    await expect(page.locator("#payDayList")).toContainText("あかり");
    await expect(page.locator("#payDayList")).toContainText("本指名3");
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("給料: A4の給与一覧が1枚に収まり、印刷は同じ画面のまま", async ({ page }) => {
    const errors = await open(page);
    for (let i = 1; i <= 6; i++) {
      await addStaff(page, { name: "キャスト" + i, hourly: 1200, shimei: 2000, rate: 10 });
    }
    await setPayDay(page, "2026-07-30");
    for (let i = 0; i < 6; i++) {
      await page.locator("#btnWorkAdd").click();
      await page.locator("#wk_staff").selectOption({ index: i });
      await page.locator("#wk_in").fill("20:00");
      await page.locator("#wk_out").fill("01:00");
      await page.locator("#wk_c_shimei").fill("2");
      await page.locator("#wk_ok").click();
    }
    const m = await page
      .locator("#paySheets .sheet")
      .evaluate((el) => ({ w: el.offsetWidth, h: el.offsetHeight, sh: el.scrollHeight }));
    expect(m.w).toBe(794);
    expect(m.h).toBe(1123);
    expect(m.sh, "給与一覧がA4からはみ出している").toBeLessThanOrEqual(1123);
    await expect(page.locator("#paySheets")).toContainText("給 与 一 覧");
    // 合計の行に歯抜けが無い（日数・時間・本指名・同伴・基本・バック・歩合・支給・控除・差引）
    const foot = await page
      .locator("#paySheets tfoot tr td")
      .evaluateAll((tds) => tds.map((td) => td.textContent.trim()));
    expect(foot[0]).toBe("合計");
    expect(foot.length).toBe(11);
    expect(foot.slice(1), "合計の行が歯抜け").not.toContain("");
    expect(foot[1]).toBe("6"); // 6人×1日
    expect(foot[2]).toBe("30.0"); // 5h×6人
    expect(foot[3]).toBe("12"); // 本指名2×6人
    expect(foot[5]).toBe("36,000"); // 基本 1,200×5h×6人
    expect(foot[6]).toBe("24,000"); // バック 2,000×2×6人
    // 控除の内訳が紙に出る
    await expect(page.locator("#paySheets .pay-sub")).toContainText("罰金");
    await expect(page.locator("#paySheets .pay-sub")).toContainText("厚生費");
    await expect(page.locator("#paySheets .pay-sub")).toContainText("前借りの返済");
    await page.locator("#btnPrintPay").click();
    expect(await page.evaluate(() => window.__printed)).toBe(1);
    await expect(page.locator("#printArea .sheet")).toHaveCount(1);
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("給料: シャンパンのバックは％で決められる（本数を数えなくていい）", async ({ page }) => {
    const errors = await open(page);
    await addStaff(page, { name: "あかり", hourly: 1200, shimei: 2000, bottlePct: 15 });
    // スタッフ一覧に「ボトル15%」と出る
    await expect(page.locator("#staffList")).toContainText("ボトル15%");

    await setPayDay(page, "2026-07-30");
    await page.locator("#btnWorkAdd").click();
    // ％で決めた種類は本数ではなく「売った額」を聞く
    await expect(page.locator("#wk_row_a_bottle")).toBeVisible();
    await expect(page.locator("#wk_row_c_bottle")).toBeHidden();
    // 円で決めた種類は今までどおり本数
    await expect(page.locator("#wk_row_c_shimei")).toBeVisible();
    await expect(page.locator("#wk_row_a_shimei")).toBeHidden();

    await page.locator("#wk_in").fill("20:00");
    await page.locator("#wk_out").fill("01:00");
    await page.locator("#wk_a_bottle").fill("80000");
    await expect(page.locator("#wk_calc")).toContainText("ボトル 80,000の15% = 12,000");
    await page.locator("#wk_ok").click();
    // 6,000（時給5h）＋12,000＝18,000
    await expect(page.locator("#payDayList .li-amt")).toHaveText("¥18,000");
    await expect(page.locator("#payDayList")).toContainText("ボトル80,000");
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("給料: よく出るボトルを登録すると、押すだけで金額が入る", async ({ page }) => {
    const errors = await open(page);
    await addStaff(page, { name: "あかり", bottlePct: 10 });
    await page.locator(".nav-item[data-scr='pay']").click();
    await page.locator("#btnItemAdd").click();
    await page.locator("#it_name").fill("ドンペリ白");
    await page.locator("#it_price").fill("50000");
    await page.locator("#it_ok").click();
    await expect(page.locator("#itemList")).toContainText("ドンペリ白");
    await expect(page.locator("#itemList")).toContainText("¥50,000");

    await setPayDay(page, "2026-07-30");
    await page.locator("#btnWorkAdd").click();
    const chip = page.locator("#wk_items_bottle button", { hasText: "ドンペリ白" });
    await chip.click();
    await expect(page.locator("#wk_a_bottle")).toHaveValue("50000");
    await chip.click(); // 2本目
    await expect(page.locator("#wk_a_bottle")).toHaveValue("100000");
    await expect(page.locator("#wk_calc")).toContainText("100,000の10% = 10,000");
    await page.locator("#wk_items_bottle button", { hasText: "0にもどす" }).click();
    await expect(page.locator("#wk_a_bottle")).toHaveValue("");
    await chip.click();
    await page.locator("#wk_ok").click();
    await expect(page.locator("#payDayList .li-amt")).toHaveText("¥5,000");

    // 登録した商品はクラウドにも残る（開き直しても出る）
    await page.locator(".nav-item[data-scr='set']").click();
    await expect(page.locator("#acctInfo")).toContainText("同期済み");
    await page.evaluate(() => {
      ["nomiya_settings_v1", "nomiya_sync_at_v1", "nomiya_sync_ok_v1"].forEach((k) =>
        localStorage.removeItem(k)
      );
    });
    await page.reload({ waitUntil: "load" });
    await page.evaluate(() => window.__NOMIYA.syncNow(false));
    await page.evaluate(() => window.__NOMIYA.syncNow(false));
    await page.locator(".nav-item[data-scr='pay']").click();
    await expect(page.locator("#itemList")).toContainText("ドンペリ白");
    // 端末の控えが消えただけで、クラウドの設定を空で上書きしていない
    expect(
      await page.evaluate(async () => {
        const db = JSON.parse(localStorage.getItem("__fake_supa_db__"));
        return (db.tables.nomiya_settings[0].config.items || []).length;
      }),
      "クラウドの設定が空で上書きされた"
    ).toBe(1);
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("給料: 円と％を入れ替えても、二重に付かない", async ({ page }) => {
    const errors = await open(page);
    await addStaff(page, { name: "ゆい", shimei: 2000 });
    // あとから「本指名は％で」に変える
    await page.locator("#staffList .li", { hasText: "ゆい" }).click();
    await page.locator("#st_u_shimei button[data-u='pct']").click();
    await page.locator("#st_b_shimei").fill("20");
    await page.locator("#st_ok").click();
    await expect(page.locator("#staffList")).toContainText("本指名20%");
    await expect(page.locator("#staffList")).not.toContainText("本指名2,000");
    expect(
      await page.evaluate(() => window.__NOMIYA.staff[0].back.shimei),
      "円で決めた単価が残っている＝二重に付く"
    ).toBe(0);

    await setPayDay(page, "2026-07-30");
    await page.locator("#btnWorkAdd").click();
    await page.locator("#wk_a_shimei").fill("30000");
    await page.locator("#wk_ok").click();
    await expect(page.locator("#payDayList .li-amt")).toHaveText("¥6,000");
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("入れ直しても消えない（開き直しても残る）", async ({ page }) => {
    const errors = await open(page);
    await addSale(page, {
      date: "2026-07-01",
      name: "田中",
      people: 2,
      amount: 8000,
      pay: "tsuke",
      receipt: false,
    });
    await page.reload({ waitUntil: "load" });
    expect(await page.evaluate(() => window.__NOMIYA.sales.length)).toBe(1);
    await setInvMonth(page, "2026-07");
    await expect(page.locator("#invName option[value='田中']")).toHaveCount(1);
    await expect(page.locator("#invSheets .iv-grand")).toContainText("¥8,000");
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });
});
