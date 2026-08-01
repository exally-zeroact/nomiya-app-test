import { describe, it, expect } from "vitest";
import { createRequire } from "module";

// 画面(nomiya-uriage.html)が読むのと同じ実ファイルを Node でロードし、
// 飲み屋の売上管理の「絞り込み・集計・未回収・請求書」を実数値で固定する。
const require = createRequire(import.meta.url);
const C = require("../nomiya-core.js");

// テスト用の売上（2026年7月・実際にありそうな1週間分）
function sale(o) {
  return C.normalizeSale(
    Object.assign(
      { date: "2026-07-01", name: "田中", people: 2, amount: 8000, pay: "cash", receipt: false },
      o
    ),
    "2026-07-01T00:00:00.000Z"
  );
}

const SALES = [
  sale({ date: "2026-07-01", name: "田中", people: 2, amount: 8000, pay: "cash", receipt: false }),
  sale({
    date: "2026-07-01",
    name: "山本商事",
    people: 4,
    amount: 32000,
    pay: "invoice",
    receipt: true,
  }),
  sale({
    date: "2026-07-02",
    name: "佐藤",
    people: 3,
    amount: 12000,
    pay: "paypay",
    receipt: false,
  }),
  sale({ date: "2026-07-02", name: "田中", people: 1, amount: 5000, pay: "tsuke", receipt: false }),
  sale({
    date: "2026-07-05",
    name: "鈴木",
    people: 5,
    amount: 25000,
    pay: "credit",
    receipt: true,
  }),
  sale({
    date: "2026-07-31",
    name: "山本商事",
    people: 2,
    amount: 15000,
    pay: "invoice",
    receipt: true,
  }),
  sale({ date: "2026-08-01", name: "田中", people: 2, amount: 9000, pay: "cash", receipt: false }),
];

describe("支払い方法の定義", () => {
  it("5種類・並び順が固定（現金→クレジット→PayPay→請求書送り→ツケ）", () => {
    expect(C.PAY_KEYS).toEqual(["cash", "credit", "paypay", "invoice", "tsuke"]);
    expect(C.payLabel("paypay")).toBe("PayPay");
    expect(C.payLabel("invoice")).toBe("請求書送り");
  });
  it("未回収になるのは請求書送りとツケだけ", () => {
    expect(C.UNPAID_KEYS).toEqual(["invoice", "tsuke"]);
    expect(C.isUnpaidMethod("cash")).toBe(false);
    expect(C.isUnpaidMethod("tsuke")).toBe(true);
  });
});

describe("日付ユーティリティ", () => {
  it("月の範囲（月末が31/30/28/うるう29で正しい）", () => {
    expect(C.rangeOfMonth("2026-07")).toEqual({ from: "2026-07-01", to: "2026-07-31" });
    expect(C.rangeOfMonth("2026-06")).toEqual({ from: "2026-06-01", to: "2026-06-30" });
    expect(C.rangeOfMonth("2026-02")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(C.rangeOfMonth("2024-02")).toEqual({ from: "2024-02-01", to: "2024-02-29" });
  });
  it("月送りが年をまたぐ", () => {
    expect(C.shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(C.shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(C.shiftMonth("2026-07", -13)).toBe("2025-06");
  });
  it("表示用の整形", () => {
    expect(C.mdShort("2026-07-05")).toBe("7/5");
    expect(C.jpDate("2026-07-05")).toBe("2026年7月5日");
    expect(C.jpMonth("2026-07")).toBe("2026年7月");
    expect(C.weekday("2026-07-01")).toBe("水"); // 2026-07-01 は水曜
  });
  it("Date→ISOはローカル日付（UTCずれで前日にならない）", () => {
    expect(C.toIso(new Date(2026, 6, 5, 1, 0, 0))).toBe("2026-07-05");
    expect(C.toIso(new Date(2026, 0, 1, 0, 30, 0))).toBe("2026-01-01");
  });
  it("金額のカンマ", () => {
    expect(C.comma(1234567)).toBe("1,234,567");
    expect(C.comma(0)).toBe("0");
    expect(C.yen(32000)).toBe("¥32,000");
  });
});

describe("1件の検証", () => {
  it("正しい1件は通る", () => {
    expect(
      C.validateSale({ date: "2026-07-01", name: "田中", people: 2, amount: 8000, pay: "cash" }).ok
    ).toBe(true);
  });
  it("空欄・不正値は理由付きで弾く", () => {
    const r = C.validateSale({ date: "", name: "  ", people: 0, amount: -1, pay: "bitcoin" });
    expect(r.ok).toBe(false);
    expect(r.errors.length).toBe(5);
  });
  it("金額が空文字なら0にせず弾く（黙って0円で保存しない）", () => {
    const r = C.validateSale({
      date: "2026-07-01",
      name: "田中",
      people: 2,
      amount: "",
      pay: "cash",
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toContain("金額");
  });
  it("人数が空文字なら1人にせず弾く", () => {
    const r = C.validateSale({
      date: "2026-07-01",
      name: "田中",
      people: "",
      amount: 8000,
      pay: "cash",
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toContain("人数");
  });
  it("金額0円（サービス・0円会計）は通す", () => {
    expect(
      C.validateSale({ date: "2026-07-01", name: "田中", people: 2, amount: 0, pay: "cash" }).ok
    ).toBe(true);
  });
  it("現金で保存したら paidDate は持たない（その場で回収済み）", () => {
    const s = C.normalizeSale({
      date: "2026-07-01",
      name: "田中",
      people: 2,
      amount: 8000,
      pay: "cash",
      paidDate: "2026-07-09",
    });
    expect(s.paidDate).toBe(null);
  });
  it("IDは同一ミリ秒の連投でも重複しない", () => {
    const ids = new Set();
    for (let i = 0; i < 1000; i++) ids.add(C.makeId());
    expect(ids.size).toBe(1000);
  });
});

describe("絞り込み（タブ切り替えの中身）", () => {
  const july = C.rangeOfMonth("2026-07");

  it("7月だけ（8月分は入らない）", () => {
    const rows = C.filterSales(SALES, july);
    expect(rows.length).toBe(6);
  });
  it("支払い方法別", () => {
    expect(C.filterSales(SALES, { ...july, pay: "invoice" }).length).toBe(2);
    expect(C.filterSales(SALES, { ...july, pay: "cash" }).length).toBe(1);
    expect(C.filterSales(SALES, { ...july, pay: "all" }).length).toBe(6);
  });
  it("領収書あり／なし別", () => {
    expect(C.filterSales(SALES, { ...july, receipt: "yes" }).length).toBe(3);
    expect(C.filterSales(SALES, { ...july, receipt: "no" }).length).toBe(3);
  });
  it("支払い方法と領収書の重ねがけ", () => {
    const rows = C.filterSales(SALES, { ...july, pay: "invoice", receipt: "yes" });
    expect(rows.length).toBe(2);
    expect(rows.every((r) => r.pay === "invoice" && r.receipt)).toBe(true);
  });
  it("消した行は出てこない", () => {
    const withDeleted = SALES.concat([sale({ date: "2026-07-03", amount: 99999, deletedAt: "x" })]);
    expect(C.filterSales(withDeleted, july).length).toBe(6);
    expect(C.summarize(C.filterSales(withDeleted, july)).amount).toBe(97000);
  });
  it("日付昇順→同日は入力順で並ぶ", () => {
    const rows = C.sortSales(C.filterSales(SALES, july));
    expect(rows.map((r) => r.date)).toEqual([
      "2026-07-01",
      "2026-07-01",
      "2026-07-02",
      "2026-07-02",
      "2026-07-05",
      "2026-07-31",
    ]);
  });
});

describe("集計", () => {
  const july = C.filterSales(SALES, C.rangeOfMonth("2026-07"));

  it("合計・組数・のべ人数・単価", () => {
    const s = C.summarize(july);
    expect(s.amount).toBe(8000 + 32000 + 12000 + 5000 + 25000 + 15000); // 97,000
    expect(s.amount).toBe(97000);
    expect(s.count).toBe(6);
    expect(s.people).toBe(17);
    expect(s.perGroup).toBe(Math.round(97000 / 6)); // 16,167
    expect(s.perGroup).toBe(16167);
    expect(s.perPerson).toBe(Math.round(97000 / 17)); // 5,706
    expect(s.perPerson).toBe(5706);
  });
  it("0件でも0割りしない", () => {
    const s = C.summarize([]);
    expect(s).toEqual({ count: 0, people: 0, amount: 0, perGroup: 0, perPerson: 0 });
  });

  it("支払い方法別（0件の行も消えない・構成比の合計は1）", () => {
    const rows = C.byPayMethod(july);
    expect(rows.map((r) => r.key)).toEqual(["cash", "credit", "paypay", "invoice", "tsuke"]);
    const m = Object.fromEntries(rows.map((r) => [r.key, r]));
    expect(m.cash.amount).toBe(8000);
    expect(m.credit.amount).toBe(25000);
    expect(m.paypay.amount).toBe(12000);
    expect(m.invoice.amount).toBe(47000);
    expect(m.tsuke.amount).toBe(5000);
    expect(m.invoice.count).toBe(2);
    expect(rows.reduce((a, r) => a + r.amount, 0)).toBe(97000);
    expect(rows.reduce((a, r) => a + r.ratio, 0)).toBeCloseTo(1, 10);
    expect(m.cash.ratio).toBeCloseTo(8000 / 97000, 10);
  });
  it("支払い方法別は0件でも5行返り、構成比は0", () => {
    const rows = C.byPayMethod([]);
    expect(rows.length).toBe(5);
    expect(rows.every((r) => r.amount === 0 && r.ratio === 0)).toBe(true);
  });

  it("領収書あり／なし別", () => {
    const rows = C.byReceipt(july);
    expect(rows[0].key).toBe("yes");
    expect(rows[0].amount).toBe(32000 + 25000 + 15000); // 72,000
    expect(rows[0].count).toBe(3);
    expect(rows[1].amount).toBe(8000 + 12000 + 5000); // 25,000
    expect(rows[0].amount + rows[1].amount).toBe(97000);
    expect(rows[0].ratio).toBeCloseTo(72000 / 97000, 10);
  });

  it("日別（売上のある日だけ・昇順）", () => {
    const rows = C.byDay(july);
    expect(rows.map((r) => r.date)).toEqual([
      "2026-07-01",
      "2026-07-02",
      "2026-07-05",
      "2026-07-31",
    ]);
    expect(rows[0].amount).toBe(40000);
    expect(rows[0].count).toBe(2);
    expect(rows[0].people).toBe(6);
  });
});

describe("未回収（請求書送り・ツケ）", () => {
  it("入金前は未回収に出る", () => {
    const un = C.unpaidSales(SALES);
    expect(un.length).toBe(3); // 山本商事2件 + 田中ツケ1件
    expect(un.reduce((a, s) => a + s.amount, 0)).toBe(52000);
  });
  it("相手ごとの残高（多い順）", () => {
    const g = C.unpaidByName(SALES);
    expect(g[0].name).toBe("山本商事");
    expect(g[0].amount).toBe(47000);
    expect(g[0].count).toBe(2);
    expect(g[0].first).toBe("2026-07-01");
    expect(g[0].last).toBe("2026-07-31");
    expect(g[1].name).toBe("田中");
    expect(g[1].amount).toBe(5000);
  });
  it("入金を付けたら未回収から消える", () => {
    const paid = SALES.map((s) =>
      s.name === "山本商事" ? Object.assign({}, s, { paidDate: "2026-08-10" }) : s
    );
    const g = C.unpaidByName(paid);
    expect(g.length).toBe(1);
    expect(g[0].name).toBe("田中");
    // 売上そのものは減らない（入金は回収の記録であって売上の取り消しではない）
    expect(C.summarize(C.filterSales(paid, C.rangeOfMonth("2026-07"))).amount).toBe(97000);
  });
  it("現金・クレカ・PayPayは未回収に混ざらない", () => {
    expect(C.unpaidSales(SALES).every((s) => s.pay === "invoice" || s.pay === "tsuke")).toBe(true);
  });
});

describe("領収書の3通り（なし / あり / あとで）", () => {
  it("旧データ(true/false)も画面の yes/no も同じ形に揃える", () => {
    expect(C.normalizeReceipt(true)).toBe("issued");
    expect(C.normalizeReceipt(false)).toBe("none");
    expect(C.normalizeReceipt("yes")).toBe("issued");
    expect(C.normalizeReceipt("no")).toBe("none");
    expect(C.normalizeReceipt("later")).toBe("later");
    expect(C.normalizeReceipt(undefined)).toBe("none");
    expect(C.normalizeReceipt("へんな値")).toBe("none");
  });
  it("'none' は文字列だが「あり」と数えない（!!receipt の取り違えを防ぐ）", () => {
    const s = C.normalizeSale({
      date: "2026-07-01",
      name: "田中",
      people: 2,
      amount: 8000,
      pay: "cash",
      receipt: false,
    });
    expect(s.receipt).toBe("none");
    expect(C.isIssued(s)).toBe(false);
    expect(!!s.receipt).toBe(true); // 文字列なので真になる=だから isIssued を使う
  });
  it("発行済みなら発行日が入り、出していなければ入らない", () => {
    const base = { date: "2026-07-01", name: "田中", people: 2, amount: 8000, pay: "cash" };
    expect(C.normalizeSale({ ...base, receipt: "issued" }).receiptDate).toBe("2026-07-01");
    expect(
      C.normalizeSale({ ...base, receipt: "issued", receiptDate: "2026-08-10" }).receiptDate
    ).toBe("2026-08-10");
    expect(C.normalizeSale({ ...base, receipt: "later" }).receiptDate).toBe(null);
    expect(C.normalizeSale({ ...base, receipt: "none" }).receiptDate).toBe(null);
  });
  it("紙に出す印は集計と同じ2つ（あり側=○ / なし側=空）", () => {
    expect(C.receiptMark("issued")).toBe("○");
    expect(C.receiptMark("na")).toBe("○"); // 振込・カードも「あり」側
    expect(C.receiptMark("later")).toBe(""); // あとで渡す＝まだ出していない
    expect(C.receiptMark("none")).toBe("");
    expect(C.receiptMark(true)).toBe("○");
  });

  const MIX = [
    sale({ name: "現金あり", pay: "cash", amount: 10000, receipt: "issued" }),
    sale({ name: "現金なし", pay: "cash", amount: 20000, receipt: "none" }),
    sale({ name: "ツケあとで", pay: "tsuke", amount: 30000, receipt: "later" }),
    sale({ name: "請求書あとで", pay: "invoice", amount: 40000, receipt: "later" }),
  ];

  it("「あり」は発行済み＋振込・カード・「なし」は未発行(なし＋あとで)", () => {
    expect(C.filterSales(MIX, { receipt: "yes" }).map((s) => s.name)).toEqual(["現金あり"]);
    expect(C.filterSales(MIX, { receipt: "no" }).map((s) => s.name)).toEqual([
      "現金なし",
      "ツケあとで",
      "請求書あとで",
    ]);
    expect(C.filterSales(MIX, { receipt: "later" }).map((s) => s.name)).toEqual([
      "ツケあとで",
      "請求書あとで",
    ]);
  });
  it("集計のあり/なしも同じ数え方（合計は必ず全体と一致）", () => {
    const r = C.byReceipt(MIX);
    expect(r[0].amount).toBe(10000);
    expect(r[1].amount).toBe(90000);
    expect(r[0].amount + r[1].amount).toBe(C.summarize(MIX).amount);
  });
  it("「あとで」の残りを別に数えられる（取りこぼし防止）", () => {
    const l = C.laterReceipts(MIX);
    expect(l.count).toBe(2);
    expect(l.amount).toBe(70000);
  });
});

describe("領収書は支払い方法で「要る/要らない」が違う", () => {
  it("選べる状態と既定が支払い方法ごとに決まる", () => {
    expect(C.receiptChoices("cash")).toEqual(["none", "issued"]);
    expect(C.receiptChoices("credit")).toEqual(["na", "issued"]);
    expect(C.receiptChoices("paypay")).toEqual(["na", "issued"]);
    expect(C.receiptChoices("invoice")).toEqual(["na", "issued"]); // 振込は請求書が証憑＝不要が既定
    expect(C.receiptChoices("tsuke")).toEqual(["later", "issued", "none"]); // 回収時に渡す
    expect(C.defaultReceipt("cash")).toBe("none");
    expect(C.defaultReceipt("invoice")).toBe("na");
    expect(C.defaultReceipt("tsuke")).toBe("later");
  });
  it("その支払い方法にない状態は既定に戻す（変な組み合わせを保存しない）", () => {
    expect(C.fixReceiptFor("invoice", "none")).toBe("na"); // 振込に「なし」はない
    expect(C.fixReceiptFor("cash", "na")).toBe("none"); // 現金に「不要」はない
    expect(C.fixReceiptFor("cash", "later")).toBe("none");
    expect(C.fixReceiptFor("invoice", "issued")).toBe("issued"); // 求められて出した＝あり
    expect(C.fixReceiptFor("tsuke", "later")).toBe("later");
  });

  // 現金なし / 現金あり / 振込(不要) / カード(不要) / ツケ(あとで)
  const MIX2 = [
    sale({ name: "現金なし", pay: "cash", amount: 10000, receipt: "none" }),
    sale({ name: "現金あり", pay: "cash", amount: 20000, receipt: "issued" }),
    sale({ name: "振込", pay: "invoice", amount: 30000, receipt: "na" }),
    sale({ name: "カード", pay: "credit", amount: 40000, receipt: "na" }),
    sale({ name: "ツケ", pay: "tsuke", amount: 50000, receipt: "later" }),
  ];

  it("★振込・カードは「領収書あり」側に入る（なしを外しても落ちない）", () => {
    const yes = C.filterSales(MIX2, { receipt: "yes" });
    expect(yes.map((s) => s.name)).toEqual(["現金あり", "振込", "カード"]);
    const no = C.filterSales(MIX2, { receipt: "no" });
    expect(no.map((s) => s.name)).toEqual(["現金なし", "ツケ"]); // 振込・カードは入らない
    // 細かく見たいときだけ振込・カードだけを取り出せる
    const na = C.filterSales(MIX2, { receipt: "na" });
    expect(na.map((s) => s.name)).toEqual(["振込", "カード"]);
    expect(C.summarize(na).amount).toBe(70000);
  });
  it("集計は あり / なし の2区分で、合計は必ず全体と一致", () => {
    const r = C.byReceipt(MIX2);
    expect(r.map((x) => x.key)).toEqual(["yes", "no"]);
    expect(r[0].amount).toBe(90000); // 現金あり20,000 + 振込30,000 + カード40,000
    expect(r[1].amount).toBe(60000); // 現金なし10,000 + ツケ(あとで)50,000
    expect(r.reduce((a, x) => a + x.amount, 0)).toBe(C.summarize(MIX2).amount);
    expect(r.reduce((a, x) => a + x.count, 0)).toBe(5);
  });
  it("紙の印も集計の2区分と揃っている", () => {
    expect(C.receiptMark("na")).toBe("○");
    expect(C.receiptMark("issued")).toBe("○");
    expect(C.receiptMark("later")).toBe("");
    expect(C.receiptMark("none")).toBe("");
  });
  it("振込・カードの「不要」は理由を説明する", () => {
    const inv = C.receiptNotes({ pay: "invoice", receipt: "na", amount: 30000 });
    expect(inv[0]).toContain("請求書が証憑");
    expect(inv[0]).toContain("求められたら出せます");
    const card = C.receiptNotes({ pay: "credit", receipt: "na", amount: 30000 });
    expect(card[0]).toContain("売上票");
  });
});

describe("領収書の注意（黄色い注記・止めない）", () => {
  const mk = (o) => sale({ date: "2026-07-01", name: "客", people: 2, ...o });

  it("カード払いで領収書を出すとき＝印紙不要・売上票が証憑・二重発行注意", () => {
    const n = C.receiptNotes(mk({ pay: "credit", amount: 60000, receipt: "issued" }));
    expect(n.length).toBe(1);
    expect(n[0]).toContain("クレジットカード払い");
    expect(n[0]).toContain("収入印紙も不要");
    // PayPayも同じ扱い
    expect(C.receiptNotes(mk({ pay: "paypay", amount: 60000, receipt: "issued" }))[0]).toContain(
      "売上票"
    );
  });
  it("現金で税抜5万円以上の紙の領収書＝収入印紙が必要", () => {
    // 税込55,000 → 税抜50,000 でちょうど境目に乗る
    const n = C.receiptNotes(mk({ pay: "cash", amount: 55000, receipt: "issued" }));
    expect(n.length).toBe(1);
    expect(n[0]).toContain("収入印紙が必要");
    expect(n[0]).toContain("50,000");
  });
  it("税抜5万円未満なら注意を出さない（境目は税込54,999円＝税抜50,000円）", () => {
    // 54,999 → 税抜 50,000 でちょうど必要
    expect(C.taxIncluded(54999).net).toBe(50000);
    expect(C.receiptNotes(mk({ pay: "cash", amount: 54999, receipt: "issued" })).length).toBe(1);
    // 54,998 → 税抜 49,999 で不要
    expect(C.taxIncluded(54998).net).toBe(49999);
    expect(C.receiptNotes(mk({ pay: "cash", amount: 54998, receipt: "issued" }))).toEqual([]);
    expect(C.receiptNotes(mk({ pay: "cash", amount: 10000, receipt: "issued" }))).toEqual([]);
  });
  it("領収書を出さないなら何も言わない", () => {
    expect(C.receiptNotes(mk({ pay: "cash", amount: 99999, receipt: "none" }))).toEqual([]);
  });
  it("その場で払っているのに「あとで」なら、そう言う", () => {
    const n = C.receiptNotes(mk({ pay: "cash", amount: 8000, receipt: "later" }));
    expect(n.length).toBe(1);
    expect(n[0]).toContain("「あり」で記録");
    // ツケ・請求書送りの「あとで」は普通のことなので言わない
    expect(C.receiptNotes(mk({ pay: "tsuke", amount: 8000, receipt: "later" }))).toEqual([]);
    expect(C.receiptNotes(mk({ pay: "invoice", amount: 8000, receipt: "later" }))).toEqual([]);
  });
});

describe("同じ日付は最初の行だけ出す（紙の圧迫感を減らす）", () => {
  it("同じ日が続いたら2行目以降は日付を出さない", () => {
    const rows = C.sortSales(C.filterSales(SALES, C.rangeOfMonth("2026-07")));
    const marked = C.markFirstOfDate(rows);
    // 7/1,7/1,7/2,7/2,7/5,7/31
    expect(marked.map((m) => m.showDate)).toEqual([true, false, true, false, true, true]);
    // 中身は入れ替わらない
    expect(marked.map((m) => m.sale.date)).toEqual(rows.map((r) => r.date));
  });
  it("1件だけなら出す・0件なら空", () => {
    expect(C.markFirstOfDate([{ date: "2026-07-01" }]).map((m) => m.showDate)).toEqual([true]);
    expect(C.markFirstOfDate([])).toEqual([]);
    expect(C.markFirstOfDate(null)).toEqual([]);
  });
  it("日付が飛んで戻っても、直前の行とだけ比べる（ページを跨いでも崩れない前提の素直な規則）", () => {
    const r = [{ date: "7/1" }, { date: "7/2" }, { date: "7/1" }].map((x) => ({ date: x.date }));
    expect(C.markFirstOfDate(r).map((m) => m.showDate)).toEqual([true, true, true]);
  });
});

describe("未回収は「請求書送り」と「ツケ」に分ける", () => {
  it("2グループが常に同じ順で返る（0件でも消えない）", () => {
    const g = C.unpaidGroups(SALES);
    expect(g.map((x) => x.key)).toEqual(["invoice", "tsuke"]);
    expect(g[0].label).toBe("請求書送り");
    expect(g[0].amount).toBe(47000); // 山本商事 32,000 + 15,000
    expect(g[0].count).toBe(2);
    expect(g[0].names.map((n) => n.name)).toEqual(["山本商事"]);
    expect(g[1].label).toBe("ツケ");
    expect(g[1].amount).toBe(5000); // 田中のツケ
    expect(g[1].names.map((n) => n.name)).toEqual(["田中"]);
    expect(C.unpaidGroups([]).map((x) => x.amount)).toEqual([0, 0]);
  });
  it("2グループの合計＝未回収の合計（取りこぼしがない）", () => {
    const g = C.unpaidGroups(SALES);
    const all = C.unpaidSales(SALES).reduce((a, s) => a + s.amount, 0);
    expect(g.reduce((a, x) => a + x.amount, 0)).toBe(all);
    expect(all).toBe(52000);
  });
  it("支払い方法を指定した相手別も出せる", () => {
    expect(C.unpaidByName(SALES, "tsuke").map((n) => n.name)).toEqual(["田中"]);
    expect(C.unpaidByName(SALES, "invoice")[0].amount).toBe(47000);
    expect(C.unpaidByName(SALES, "cash")).toEqual([]); // 現金は未回収にならない
  });
  it("入金したら該当グループから消える", () => {
    const paid = SALES.map((s) => (s.pay === "tsuke" ? { ...s, paidDate: "2026-08-01" } : s));
    const g = C.unpaidGroups(paid);
    expect(g[0].amount).toBe(47000);
    expect(g[1].amount).toBe(0);
    expect(g[1].names).toEqual([]);
  });
});

describe("宛先（請求書送りの相手）", () => {
  it("登録が無ければ名前をそのまま宛名にして「御中」を付ける（今までと同じ）", () => {
    const t = C.invoiceTo({}, "山本商事");
    expect(t).toEqual({ to: "山本商事", honor: "御中", person: "", registered: false });
  });
  it("登録があれば宛名・敬称・担当者を差し替える", () => {
    const partners = {
      山本商事: C.normalizePartner(
        {
          name: "山本商事",
          to: "株式会社山本商事",
          honor: "御中",
          person: "総務部 山本様",
        },
        "2026-07-28T00:00:00.000Z"
      ),
    };
    const t = C.invoiceTo(partners, "山本商事");
    expect(t.to).toBe("株式会社山本商事");
    expect(t.person).toBe("総務部 山本様");
    expect(t.registered).toBe(true);
  });
  it("個人客は「様」も選べる（変な値は御中に倒す）", () => {
    expect(C.normalizePartner({ name: "田中", honor: "様" }).honor).toBe("様");
    expect(C.normalizePartner({ name: "田中", honor: "殿" }).honor).toBe("御中");
    expect(C.normalizePartner({ name: "田中" }).honor).toBe("御中");
  });
  it("前後の空白は落とす・名前が無ければ弾く", () => {
    const p = C.normalizePartner({ name: "  山本商事  ", to: " 株式会社山本商事 " });
    expect(p.name).toBe("山本商事");
    expect(p.to).toBe("株式会社山本商事");
    expect(C.validatePartner({ name: "   " }).ok).toBe(false);
    expect(C.validatePartner({ name: "山本商事" }).ok).toBe(true);
  });
  it("登録済みは名前順に並ぶ", () => {
    const m = {
      田中: C.normalizePartner({ name: "田中" }),
      山本商事: C.normalizePartner({ name: "山本商事" }),
      あかり: C.normalizePartner({ name: "あかり" }),
    };
    expect(C.partnerList(m).map((x) => x.name)).toEqual(["あかり", "山本商事", "田中"]);
    expect(C.partnerList({})).toEqual([]);
    expect(C.partnerList(null)).toEqual([]);
  });
  it("宛名を別に打たなければ会社名がそのまま宛名になる", () => {
    const p = C.normalizePartner({ name: "株式会社山本商事" });
    expect(p.to).toBe("株式会社山本商事");
    expect(C.invoiceTo({ 株式会社山本商事: p }, "株式会社山本商事").to).toBe("株式会社山本商事");
  });
  it("選ぶと「最近選んだ順」の先頭に来る（選んでいないものは新しく登録したものが先）", () => {
    let m = {
      A社: C.normalizePartner({ name: "A社" }, "2026-07-01T00:00:00.000Z"),
      B社: C.normalizePartner({ name: "B社" }, "2026-07-02T00:00:00.000Z"),
      C社: C.normalizePartner({ name: "C社" }, "2026-07-03T00:00:00.000Z"),
    };
    // まだ一度も選んでいないうちは、あとから登録したものが上
    expect(C.partnerRecent(m).map((x) => x.name)).toEqual(["C社", "B社", "A社"]);
    m = C.touchPartner(m, "A社", "2026-07-10T00:00:00.000Z");
    expect(C.partnerRecent(m).map((x) => x.name)).toEqual(["A社", "C社", "B社"]);
    m = C.touchPartner(m, "B社", "2026-07-11T00:00:00.000Z");
    expect(C.partnerRecent(m).map((x) => x.name)).toEqual(["B社", "A社", "C社"]);
    expect(C.partnerRecent({})).toEqual([]);
    expect(C.partnerRecent(null)).toEqual([]);
  });
  it("登録していない名前を選んでも壊れない・元のデータは変えない", () => {
    const m = { A社: C.normalizePartner({ name: "A社" }, "2026-07-01T00:00:00.000Z") };
    expect(C.touchPartner(m, "知らない会社", "2026-07-10T00:00:00.000Z")).toBe(m);
    const after = C.touchPartner(m, "A社", "2026-07-10T00:00:00.000Z");
    expect(m["A社"].lastUsedAt).toBe(""); // 元は変わらない
    expect(after["A社"].lastUsedAt).toBe("2026-07-10T00:00:00.000Z");
    expect(after["A社"].updatedAt).toBe("2026-07-01T00:00:00.000Z"); // 直したわけではない
  });
});

describe("名前サジェスト", () => {
  it("最近来た人が上に来る", () => {
    const s = C.nameSuggestions(SALES);
    expect(s[0].name).toBe("田中"); // 8/1が最新
    expect(s.map((x) => x.name)).toContain("山本商事");
    expect(s.find((x) => x.name === "田中").count).toBe(3);
  });
});

describe("消費税（内税10%）", () => {
  it("税込から中の消費税を出す（1円未満切り捨て）", () => {
    expect(C.taxIncluded(10000)).toEqual({ total: 10000, tax: 909, net: 9091, rate: 0.1 });
    expect(C.taxIncluded(47000).tax).toBe(4272);
    expect(C.taxIncluded(47000).net).toBe(42728);
    expect(C.taxIncluded(1)).toEqual({ total: 1, tax: 0, net: 1, rate: 0.1 });
    expect(C.taxIncluded(0).tax).toBe(0);
  });
  it("税抜＋税＝税込がいつも一致する（1円のズレも出さない）", () => {
    for (let t = 0; t < 5000; t += 7) {
      const r = C.taxIncluded(t);
      expect(r.net + r.tax).toBe(t);
    }
  });
  it("税率8%（軽減）も出せる", () => {
    expect(C.taxIncluded(10800, 0.08)).toEqual({ total: 10800, tax: 800, net: 10000, rate: 0.08 });
  });
});

describe("請求書", () => {
  it("相手・期間で明細をまとめる（未入金だけ）", () => {
    const iv = C.buildInvoice(SALES, { name: "山本商事", from: "2026-07-01", to: "2026-07-31" });
    expect(iv.rows.length).toBe(2);
    expect(iv.count).toBe(2);
    expect(iv.people).toBe(6);
    expect(iv.total).toBe(47000);
    expect(iv.tax).toBe(4272);
    expect(iv.net).toBe(42728);
    expect(iv.net + iv.tax).toBe(iv.total);
  });
  it("現金の売上は請求書に載らない", () => {
    const iv = C.buildInvoice(SALES, { name: "田中", from: "2026-07-01", to: "2026-07-31" });
    expect(iv.rows.length).toBe(1); // ツケの1件だけ（現金8000は載らない）
    expect(iv.total).toBe(5000);
  });
  it("入金済みを含める指定もできる", () => {
    const paid = SALES.map((s) =>
      s.name === "山本商事" && s.date === "2026-07-01"
        ? Object.assign({}, s, { paidDate: "2026-07-20" })
        : s
    );
    expect(
      C.buildInvoice(paid, { name: "山本商事", from: "2026-07-01", to: "2026-07-31" }).total
    ).toBe(15000);
    expect(
      C.buildInvoice(paid, {
        name: "山本商事",
        from: "2026-07-01",
        to: "2026-07-31",
        unpaidOnly: false,
      }).total
    ).toBe(47000);
  });
  it("その月に請求書送り・ツケがある相手だけが並ぶ（現金の客は出ない）", () => {
    const r = C.rangeOfMonth("2026-07");
    expect(C.billableNames(SALES, r.from, r.to)).toEqual(["山本商事", "田中"]);
    // 8月は売上が無ければ誰も出ない
    const r8 = C.rangeOfMonth("2026-08");
    expect(C.billableNames(SALES, r8.from, r8.to)).toEqual([]);
  });
  it("入金済みでも、その月の相手として残る（あとから出し直せる）", () => {
    const paid = SALES.map((s) =>
      s.pay === "invoice" ? Object.assign({}, s, { paidDate: "2026-08-10" }) : s
    );
    const r = C.rangeOfMonth("2026-07");
    expect(C.billableNames(paid, r.from, r.to)).toContain("山本商事");
    // 中身も入金済みを含めて同じ1枚になる
    const iv = C.buildInvoice(paid, {
      name: "山本商事",
      from: r.from,
      to: r.to,
      unpaidOnly: false,
    });
    expect(iv.total).toBe(47000);
  });
  it("請求Noの採番（月ごとに001から・既存の続き）", () => {
    expect(C.formatInvoiceNo("2026-07", 1)).toBe("202607-001");
    expect(C.formatInvoiceNo("2026-07", 12)).toBe("202607-012");
    const iv = [{ no: "202607-001" }, { no: "202607-003" }, { no: "202606-009" }];
    expect(C.nextInvoiceSeq(iv, "2026-07")).toBe(4);
    expect(C.nextInvoiceSeq(iv, "2026-08")).toBe(1);
    expect(C.nextInvoiceSeq([], "2026-07")).toBe(1);
  });
});

describe("A4のページ分け", () => {
  it("行数で切る", () => {
    const rows = Array.from({ length: 70 }, (_, i) => i);
    const pages = C.paginate(rows, 30);
    expect(pages.length).toBe(3);
    expect(pages[0].length).toBe(30);
    expect(pages[2].length).toBe(10);
  });
  it("0件でも1枚は出す", () => {
    expect(C.paginate([], 30)).toEqual([[]]);
  });
  it("ちょうど割り切れるとき空ページを作らない", () => {
    expect(
      C.paginate(
        Array.from({ length: 60 }, (_, i) => i),
        30
      ).length
    ).toBe(2);
  });
});

describe("売上帳のページ割り（合計欄が最後のページに載る）", () => {
  const rows = (n) => Array.from({ length: n }, (_, i) => i);
  const pages = (n) => C.ledgerPages(rows(n), 38, 30);

  it("30件までは1枚（合計欄まで入る）", () => {
    expect(pages(1).map((p) => p.length)).toEqual([1]);
    expect(pages(30).map((p) => p.length)).toEqual([30]);
  });
  it("31件は1枚に載りきらず、合計欄用の2枚目が付く", () => {
    expect(pages(31).map((p) => p.length)).toEqual([31, 0]);
  });
  it("38件ぴったりは、合計欄のために2枚目を足す", () => {
    const p = pages(38);
    expect(p.map((x) => x.length)).toEqual([38, 0]);
  });
  it("40件は38+2", () => {
    expect(pages(40).map((p) => p.length)).toEqual([38, 2]);
  });
  it("90件でも最後のページは必ず30件以内（合計欄が必ず載る）", () => {
    const p = pages(90);
    expect(p.reduce((a, x) => a + x.length, 0)).toBe(90);
    expect(p[p.length - 1].length).toBeLessThanOrEqual(30);
    expect(p.map((x) => x.length)).toEqual([38, 38, 14]);
  });
  it("0件でも1枚は出す", () => {
    expect(C.ledgerPages([], 38, 30)).toEqual([[]]);
  });
  it("行が抜け落ちない・順番が変わらない（1〜200件を全部確認）", () => {
    for (let n = 1; n <= 200; n++) {
      const p = C.ledgerPages(rows(n), 38, 30);
      expect(p.flat()).toEqual(rows(n));
      expect(p[p.length - 1].length).toBeLessThanOrEqual(30);
      p.slice(0, -1).forEach((x) => expect(x.length).toBeLessThanOrEqual(38));
    }
  });
});

describe("クラウド同期（端末が作業台・クラウドは控え）", () => {
  const mkSale = (o) =>
    Object.assign(
      {
        id: "s1",
        date: "2026-07-01",
        name: "田中",
        people: 2,
        amount: 8000,
        pay: "cash",
        receipt: "none",
        receiptDate: null,
        memo: "",
        paidDate: null,
        paidCash: false,
        staff: "",
        crew: [], // ついた人（ヘルプ・場内など）。無ければ空
        createdAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-07-01T00:00:00.000Z",
        deletedAt: null,
      },
      o
    );

  it("売上 ⇄ DBの行 を往復しても中身が変わらない", () => {
    const s = mkSale({
      pay: "invoice",
      receipt: "issued",
      receiptDate: "2026-07-02",
      paidDate: "2026-08-10",
      memo: "ボトル入れ",
      staff: "あかり",
    });
    const row = C.saleToRow(s);
    expect(row.cid).toBe("s1");
    expect(row.ymd).toBe("2026-07-01");
    expect(row.receipt_date).toBe("2026-07-02");
    expect(row.paid_date).toBe("2026-08-10");
    expect(row.staff).toBe("あかり");
    expect(C.saleFromRow(row)).toEqual(s);
  });
  it("宛先 ⇄ DBの行 を往復しても中身が変わらない", () => {
    const p = C.normalizePartner(
      { name: "株式会社山本商事", honor: "様", person: "総務部 山本 様" },
      "2026-07-20T00:00:00.000Z"
    );
    p.lastUsedAt = "2026-07-25T00:00:00.000Z";
    const row = C.partnerToRow(p);
    expect(row.name).toBe("株式会社山本商事");
    expect(row.honor).toBe("様");
    expect(row.last_used_at).toBe("2026-07-25T00:00:00.000Z");
    const back = C.partnerFromRow(row);
    expect(back.name).toBe(p.name);
    expect(back.to).toBe(p.name);
    expect(back.honor).toBe("様");
    expect(back.person).toBe("総務部 山本 様");
    expect(back.deletedAt).toBe(null);
  });

  it("端末にしか無いものは送る／クラウドにしか無いものは取り込む", () => {
    const local = [mkSale({ id: "a" })];
    const remote = [C.saleToRow(mkSale({ id: "b" }))].map(C.saleFromRow);
    const plan = C.syncPlanSales(local, remote);
    expect(plan.merged.map((s) => s.id).sort()).toEqual(["a", "b"]);
    expect(plan.push.map((s) => s.id)).toEqual(["a"]); // bは送らない（もう向こうにある）
  });
  it("ぶつかったら新しい方が勝つ（端末が新しければ送る）", () => {
    const old = mkSale({ id: "a", amount: 8000, updatedAt: "2026-07-01T00:00:00.000Z" });
    const neo = mkSale({ id: "a", amount: 9000, updatedAt: "2026-07-02T00:00:00.000Z" });
    // 端末が新しい
    let plan = C.syncPlanSales([neo], [old]);
    expect(plan.merged[0].amount).toBe(9000);
    expect(plan.push.length).toBe(1);
    // クラウドが新しい（別のスマホで直した）
    plan = C.syncPlanSales([old], [neo]);
    expect(plan.merged[0].amount).toBe(9000);
    expect(plan.push.length).toBe(0);
    // 同じ時刻なら端末を残して送らない
    plan = C.syncPlanSales([old], [mkSale({ id: "a", amount: 8000 })]);
    expect(plan.push.length).toBe(0);
  });
  it("消したものは復活しない（消したのも“新しい更新”として扱う）", () => {
    const alive = mkSale({ id: "a", updatedAt: "2026-07-01T00:00:00.000Z" });
    const removed = mkSale({
      id: "a",
      updatedAt: "2026-07-05T00:00:00.000Z",
      deletedAt: "2026-07-05T00:00:00.000Z",
    });
    // 別のスマホで消した → 端末側でも消える
    const plan = C.syncPlanSales([alive], [removed]);
    expect(plan.merged[0].deletedAt).toBe("2026-07-05T00:00:00.000Z");
    expect(C.filterSales(plan.merged, {}).length).toBe(0);
    // こちらで消した → 送る
    const plan2 = C.syncPlanSales([removed], [alive]);
    expect(plan2.push.length).toBe(1);
    expect(plan2.push[0].deletedAt).toBe("2026-07-05T00:00:00.000Z");
  });
  it("宛先は会社名で突合する（消した宛先は一覧から消えるが控えは残る）", () => {
    const local = {
      A社: C.normalizePartner({ name: "A社" }, "2026-07-01T00:00:00.000Z"),
      B社: C.normalizePartner({ name: "B社" }, "2026-07-01T00:00:00.000Z"),
    };
    local["B社"].deletedAt = "2026-07-09T00:00:00.000Z";
    local["B社"].updatedAt = "2026-07-09T00:00:00.000Z";
    const remote = [C.partnerFromRow(C.partnerToRow(C.normalizePartner({ name: "C社" })))];
    const plan = C.syncPlanPartners(local, remote);
    expect(Object.keys(plan.merged).sort()).toEqual(["A社", "B社", "C社"]);
    expect(plan.push.map((p) => p.name).sort()).toEqual(["A社", "B社"]);
    // 画面に出るのは生きているものだけ
    expect(C.partnerList(plan.merged).map((p) => p.name)).toEqual(["A社", "C社"]);
    expect(
      C.partnerRecent(plan.merged)
        .map((p) => p.name)
        .sort()
    ).toEqual(["A社", "C社"]);
    // 消した宛先は「登録していない」扱い＝名前＋御中に戻る
    expect(C.invoiceTo(plan.merged, "B社").registered).toBe(false);
  });
  it("設定は新しい方が勝つ（クラウドに無ければ送る）", () => {
    const l = { store: "まりも" };
    const r = { store: "MARIMO" };
    expect(C.syncPlanSettings(l, "2026-07-02T00:00:00.000Z", null, null)).toEqual({
      merged: l,
      push: true,
    });
    expect(
      C.syncPlanSettings(l, "2026-07-01T00:00:00.000Z", r, "2026-07-02T00:00:00.000Z").merged
    ).toBe(r);
    expect(
      C.syncPlanSettings(l, "2026-07-03T00:00:00.000Z", r, "2026-07-02T00:00:00.000Z")
    ).toEqual({ merged: l, push: true });
    expect(
      C.syncPlanSettings(l, "2026-07-02T00:00:00.000Z", r, "2026-07-02T00:00:00.000Z")
    ).toEqual({ merged: l, push: false });
  });
});

describe("P0: 空の時刻を送らない・戻せるバックアップ・請求Noの台帳", () => {
  it("時刻や日付が空の売上でも、DBには null で送る（空文字は22007で落ちる）", () => {
    const row = C.saleToRow({
      id: "a",
      date: "",
      name: "田中",
      people: 2,
      amount: 8000,
      pay: "cash",
      receipt: "none",
      receiptDate: "",
      paidDate: "",
      createdAt: "",
      updatedAt: "",
      deletedAt: "",
    });
    expect(row.receipt_date).toBe(null);
    expect(row.paid_date).toBe(null);
    expect(row.created_at).toBe(null);
    expect(row.deleted_at).toBe(null);
    // 更新時刻は同期の勝ち負けを決める鍵なので、空なら今の時刻が入る
    expect(typeof row.updated_at).toBe("string");
    expect(isNaN(Date.parse(row.updated_at))).toBe(false);
    const p = C.partnerToRow({ name: "A社", lastUsedAt: "", updatedAt: "", deletedAt: "" });
    expect(p.last_used_at).toBe(null);
    expect(p.deleted_at).toBe(null);
    expect(isNaN(Date.parse(p.updated_at))).toBe(false);
  });
  it("日付が壊れた売上は送らずに端末に残す（1行のせいで全部失敗させない）", () => {
    const ok1 = C.normalizeSale({ date: "2026-07-01", name: "田中", people: 1, amount: 100 });
    const bad = Object.assign({}, ok1, { id: "bad", date: "" });
    const r = C.pushableSales([ok1, bad]);
    expect(r.ok.length).toBe(1);
    expect(r.bad.length).toBe(1);
    expect(r.bad[0].id).toBe("bad");
  });

  it("書き出したファイルから戻すと、戻した行が勝つ（更新時刻が今になる）", () => {
    const old = C.normalizeSale(
      { id: "a", date: "2026-07-01", name: "田中", people: 2, amount: 8000 },
      "2026-07-01T00:00:00.000Z"
    );
    // クラウドには「消した」版がある（古いファイルのままだと負けて消える）
    const removed = Object.assign({}, old, {
      deletedAt: "2026-07-05T00:00:00.000Z",
      updatedAt: "2026-07-05T00:00:00.000Z",
    });
    const restored = C.restorePlan([removed], [old], "add", "2026-07-09T00:00:00.000Z");
    expect(restored.length).toBe(1);
    expect(restored[0].updatedAt).toBe("2026-07-09T00:00:00.000Z");
    // 戻した方が新しいので、同期しても消えない
    const plan = C.syncPlanSales(restored, [removed]);
    expect(plan.merged[0].deletedAt).toBe(null);
    expect(plan.push.length).toBe(1);
  });
  it("「入れ替える」で読み込むと、ファイルに無い行に消した印が立つ（前のが残らない）", () => {
    const keep = C.normalizeSale({
      id: "a",
      date: "2026-07-01",
      name: "田中",
      amount: 8000,
      people: 1,
    });
    const gone = C.normalizeSale({
      id: "b",
      date: "2026-07-02",
      name: "佐藤",
      amount: 5000,
      people: 1,
    });
    const out = C.restorePlan([keep, gone], [keep], "replace", "2026-07-09T00:00:00.000Z");
    expect(out.length).toBe(2);
    const b = out.find((x) => x.id === "b");
    expect(b.deletedAt).toBe("2026-07-09T00:00:00.000Z");
    expect(b.updatedAt).toBe("2026-07-09T00:00:00.000Z");
    // 生きているのは1件
    expect(C.filterSales(out, {}).length).toBe(1);
    // 「足す」なら消えない
    const add = C.restorePlan([keep, gone], [keep], "add", "2026-07-09T00:00:00.000Z");
    expect(C.filterSales(add, {}).length).toBe(2);
  });

  it("請求書番号の台帳：DBの行と往復できる", () => {
    const rec = {
      key: "山本商事||2026-07-01|2026-07-31",
      no: "202607-001",
      name: "山本商事",
      from: "2026-07-01",
      to: "2026-07-31",
      issuedAt: "2026-07-31T00:00:00.000Z",
      updatedAt: "2026-07-31T00:00:00.000Z",
    };
    const row = C.invoiceRecToRow(rec);
    expect(row.ymd_from).toBe("2026-07-01");
    expect(row.no).toBe("202607-001");
    expect(C.invoiceRecFromRow(row)).toEqual(rec);
    // 期間が空でも送れる（null になる）
    expect(C.invoiceRecToRow({ key: "k", no: "n", from: "", to: "" }).ymd_from).toBe(null);
  });
  it("請求書番号は先に採番した方（古い方）を正とする＝番号が入れ替わらない", () => {
    const mine = {
      key: "k1",
      no: "202607-005",
      name: "A社",
      issuedAt: "2026-07-31T10:00:00.000Z",
      updatedAt: "2026-07-31T10:00:00.000Z",
    };
    const other = {
      key: "k1",
      no: "202607-002",
      name: "A社",
      issuedAt: "2026-07-31T09:00:00.000Z",
      updatedAt: "2026-07-31T09:00:00.000Z",
    };
    // 別の端末が先に 002 を採番していた → そちらが残る
    const plan = C.syncPlanInvoices([mine], [other]);
    expect(plan.merged[0].no).toBe("202607-002");
    expect(plan.push.length).toBe(0);
    // 端末にしか無い番号は送る
    const only = C.syncPlanInvoices([mine], []);
    expect(only.push.length).toBe(1);
    expect(only.merged[0].no).toBe("202607-005");
  });
});

describe("レジ締め（現金合わせ）", () => {
  const day = "2026-07-30";
  // ★更新時刻を固定する（今の時刻を使うと、実行した時間で結果が変わる＝時限爆弾）
  const T0 = "2026-07-30T18:00:00.000Z";
  const S = [
    C.normalizeSale({ date: day, name: "田中", people: 2, amount: 8000, pay: "cash" }, T0),
    C.normalizeSale({ date: day, name: "佐藤", people: 3, amount: 12000, pay: "paypay" }, T0),
    C.normalizeSale({ date: day, name: "山本商事", people: 4, amount: 32000, pay: "invoice" }, T0),
    C.normalizeSale({ date: day, name: "鈴木", people: 5, amount: 25000, pay: "credit" }, T0),
    // 前に打ったツケを、今日「現金で」回収した
    C.normalizeSale(
      {
        date: "2026-07-20",
        name: "田中",
        people: 1,
        amount: 5000,
        pay: "tsuke",
        paidDate: day,
        paidCash: true,
      },
      T0
    ),
    // 同じ日に振込で回収した分は、金庫の現金には入らない
    C.normalizeSale(
      {
        date: "2026-07-21",
        name: "山本商事",
        people: 2,
        amount: 9000,
        pay: "invoice",
        paidDate: day,
        paidCash: false,
      },
      T0
    ),
  ];

  it("あるべき額＝釣銭＋現金売上＋現金で回収した分−出金", () => {
    const d = C.closeDraft(
      S,
      day,
      {
        opening: 30000,
        outs: [
          { kind: "buy", amount: 3000, memo: "氷とおしぼり" },
          { kind: "pay", amount: 10000, memo: "あかり 日払い", staff: "あかり" },
        ],
        counted: 30000,
      },
      T0
    );
    expect(d.cashSales).toBe(8000);
    expect(d.collected).toBe(5000); // 現金で回収したツケだけ（振込の9,000は入らない）
    expect(d.outTotal).toBe(13000);
    expect(d.should).toBe(30000 + 8000 + 5000 - 13000); // 30,000
    expect(d.counted).toBe(30000);
    expect(d.diff).toBe(0);
  });
  it("カード・PayPay・請求書送りは金庫の現金に入れない（でも売上には入る）", () => {
    const d = C.closeDraft(S, day, { opening: 0, outs: [], counted: 13000 });
    expect(d.other).toEqual({ credit: 25000, paypay: 12000, invoice: 32000, tsuke: 0 });
    expect(d.salesTotal).toBe(8000 + 12000 + 32000 + 25000); // 77,000
    expect(d.should).toBe(8000 + 5000);
    expect(d.diff).toBe(0);
  });
  it("合わない日は差額をそのまま出す（0に見せない）", () => {
    const d = C.closeDraft(S, day, { opening: 30000, outs: [], counted: 42500 });
    expect(d.should).toBe(43000);
    expect(d.diff).toBe(-500); // 500円足りない
    const over = C.closeDraft(S, day, { opening: 30000, outs: [], counted: 43200 });
    expect(over.diff).toBe(200); // 多い日もそのまま
  });
  it("数えていないうちは差額を出さない（0円と嘘をつかない）", () => {
    const d = C.closeDraft(S, day, { opening: 30000, outs: [], counted: "" });
    expect(d.counted).toBe(null);
    expect(d.diff).toBe(null);
  });
  it("締めたあとに売上を触ったら、締め直しが要ると分かる", () => {
    const closedAt = "2026-07-31T02:00:00.000Z";
    const before = C.closeDraft(S, day, {
      opening: 0,
      outs: [],
      counted: 13000,
      closedAt: closedAt,
    });
    expect(before.needsRedo).toBe(false);
    const touched = S.map((s) =>
      s.date === day && s.pay === "cash"
        ? Object.assign({}, s, { amount: 9000, updatedAt: "2026-07-31T03:00:00.000Z" })
        : s
    );
    const after = C.closeDraft(touched, day, {
      opening: 0,
      outs: [],
      counted: 13000,
      closedAt: closedAt,
    });
    expect(after.needsRedo).toBe(true);
    expect(after.should).toBe(9000 + 5000);
  });
  it("出金は5種類に丸め、金額は整数にする（変な値で締めが狂わない）", () => {
    const o = C.normalizeOut({ kind: "とんかつ", amount: "3,000", memo: "  氷  " });
    expect(o.kind).toBe("other");
    expect(o.amount).toBe(0); // 数字にできない値は0（黙って3000にしない）
    expect(o.memo).toBe("氷");
    expect(C.normalizeOut({ kind: "taxi", amount: 1200.9 }).amount).toBe(1200);
    expect(C.OUT_KINDS.map((k) => k.key)).toEqual(["buy", "taxi", "pay", "lend", "other"]);
  });
  it("前の日に数えた実数が、次の日の釣銭になる", () => {
    const closes = {
      "2026-07-28": C.normalizeClose({ ymd: "2026-07-28", counted: 28000 }),
      "2026-07-29": C.normalizeClose({ ymd: "2026-07-29", counted: 31500 }),
    };
    expect(C.carryOver(closes, "2026-07-30")).toBe(31500);
    expect(C.carryOver(closes, "2026-07-29")).toBe(28000);
    expect(C.carryOver(closes, "2026-07-28")).toBe(null); // 前の日が無ければ自分で入れる
    expect(C.carryOver({}, "2026-07-30")).toBe(null);
  });
  it("締め ⇄ DBの行 を往復しても中身が変わらない", () => {
    const c = C.normalizeClose(
      {
        ymd: day,
        opening: 30000,
        outs: [{ kind: "taxi", amount: 1500, memo: "送り", staff: "" }],
        counted: 30000,
        memo: "500円足りない",
        closedAt: "2026-07-31T02:00:00.000Z",
      },
      "2026-07-31T02:00:00.000Z"
    );
    const row = C.closeToRow(c);
    expect(row.ymd).toBe(day);
    expect(row.counted).toBe(30000);
    expect(row.closed_at).toBe("2026-07-31T02:00:00.000Z");
    const back = C.closeFromRow(row);
    expect(back.opening).toBe(30000);
    expect(back.outs[0].amount).toBe(1500);
    expect(back.memo).toBe("500円足りない");
    // 数えていない締めは null で送る（空文字はDBが受け取れない）
    expect(C.closeToRow(C.normalizeClose({ ymd: day, counted: "" })).counted).toBe(null);
  });
  it("締めも同期できる（日付が鍵・新しい方が勝つ）", () => {
    const local = {
      "2026-07-30": C.normalizeClose(
        { ymd: "2026-07-30", counted: 30000 },
        "2026-07-31T01:00:00.000Z"
      ),
    };
    const remote = [
      C.normalizeClose({ ymd: "2026-07-30", counted: 29000 }, "2026-07-31T02:00:00.000Z"),
      C.normalizeClose({ ymd: "2026-07-29", counted: 28000 }, "2026-07-30T02:00:00.000Z"),
    ];
    const plan = C.syncPlanCloses(local, remote);
    expect(Object.keys(plan.merged).sort()).toEqual(["2026-07-29", "2026-07-30"]);
    expect(plan.merged["2026-07-30"].counted).toBe(29000); // クラウドが新しい
    expect(plan.push.length).toBe(0);
  });
});

describe("税理士に渡す紙の「お金まわり」", () => {
  const mk = (id, d, name, amt, pay, rc, extra) =>
    C.normalizeSale(
      Object.assign({ id, date: d, name, people: 2, amount: amt, pay, receipt: rc }, extra || {}),
      d + "T00:00:00.000Z"
    );
  const SALES = [
    mk("a1", "2026-07-01", "田中", 8000, "cash", "none"),
    mk("a2", "2026-07-02", "山本商事", 32000, "invoice", "na"),
    mk("a3", "2026-07-03", "田中", 5000, "tsuke", "later"),
    // 先月のツケを今月 現金で回収
    mk("a4", "2026-06-20", "田中", 9000, "tsuke", "later", {
      paidDate: "2026-07-05",
      paidCash: true,
    }),
    // 先月の請求書送りを今月 振込で回収
    mk("a5", "2026-06-25", "山本商事", 20000, "invoice", "na", {
      paidDate: "2026-07-10",
      paidCash: false,
    }),
    // 来月の売上（今月の紙には入れない）
    mk("a6", "2026-08-01", "佐藤", 7000, "tsuke", "later"),
  ];
  const CLOSES = {
    "2026-07-01": C.normalizeClose({
      ymd: "2026-07-01",
      opening: 30000,
      outs: [
        { kind: "buy", amount: 3000, memo: "氷とおしぼり" },
        { kind: "pay", amount: 12000, staff: "あかり" },
      ],
      counted: 29000,
    }),
    "2026-07-05": C.normalizeClose({
      ymd: "2026-07-05",
      opening: 29000,
      outs: [
        { kind: "taxi", amount: 1500 },
        { kind: "lend", amount: 5000, staff: "あかり" },
        { kind: "pay", amount: 8000, staff: "ゆい" },
      ],
      counted: 31000,
    }),
    // 期間の外は入れない
    "2026-08-02": C.normalizeClose({
      ymd: "2026-08-02",
      opening: 0,
      outs: [{ kind: "buy", amount: 99999 }],
      counted: 0,
    }),
  };
  const m = C.monthlyCash(SALES, CLOSES, "2026-07-01", "2026-07-31");

  it("現金で使ったお金を種類別に出す（期間の外は入れない）", () => {
    const g = (k) => m.expense.filter((x) => x.key === k)[0];
    expect(g("buy").amount).toBe(3000);
    expect(g("taxi").amount).toBe(1500);
    expect(g("pay").amount).toBe(20000); // 12,000＋8,000
    expect(g("other").amount).toBe(0);
    expect(m.expenseTotal).toBe(24500);
  });
  it("前借り・貸付は経費に混ぜない（別枠で出す）", () => {
    expect(m.lend.amount).toBe(5000);
    expect(m.expense.some((x) => x.key === "lend")).toBe(false);
    expect(m.expenseTotal).toBe(24500); // 前借りは足されていない
  });
  it("人件費は誰にいくらまで出せる（紙に出すかは画面で選ぶ）", () => {
    expect(m.staffPays.map((x) => [x.name, x.amount])).toEqual([
      ["あかり", 12000],
      ["ゆい", 8000],
    ]);
  });
  it("この期間に回収した額を、現金と振込で分ける", () => {
    expect(m.collectedCash).toBe(9000);
    expect(m.collectedBank).toBe(20000);
  });
  it("期間の終わりの未回収（来月の売上は入れない・回収済みは外す）", () => {
    expect(m.unpaidTotal).toBe(37000); // 請求書32,000＋ツケ5,000
    expect(m.unpaid.map((x) => x.name)).toEqual(["山本商事", "田中"]);
  });
  it("手許現金は最後に数えた実数、過不足は期間の合計", () => {
    expect(m.cashOnHand).toBe(31000);
    expect(m.cashOnHandYmd).toBe("2026-07-05");
    // 7/1: 30,000+8,000-15,000=23,000 → 数えた29,000 = +6,000
    // 7/5: 29,000+0+9,000-14,500=23,500 → 数えた31,000 = +7,500
    expect(m.diffTotal).toBe(13500);
    expect(m.closedDays).toBe(2);
  });
  it("締めていない期間は「—」にできる（0と嘘をつかない）", () => {
    const none = C.monthlyCash(SALES, {}, "2026-07-01", "2026-07-31");
    expect(none.cashOnHand).toBe(null);
    expect(none.diffTotal).toBe(null);
    expect(none.expenseTotal).toBe(0);
  });
});

describe("給料（キャスト・スタッフ）", () => {
  const akari = C.normalizeStaff(
    {
      id: "st1",
      name: "あかり",
      role: "キャスト",
      hourly: 1200,
      back: { shimei: 2000, jonai: 1000, douhan: 3000, drink: 500, bottle: 1000 },
      rate: 10,
      kousei: 1000,
      cycle: "daily",
      employ: "employee",
    },
    "2026-07-01T00:00:00.000Z"
  );
  const yui = C.normalizeStaff(
    { id: "st2", name: "ゆい", rate: 50, guarantee: 15000, employ: "contract", cycle: "monthly" },
    "2026-07-01T00:00:00.000Z"
  );

  it("夜をまたぐ出勤時間を正しく数える（20:00→翌1:30＝5時間30分）", () => {
    expect(C.workMinutes("20:00", "01:30")).toBe(330);
    expect(C.workMinutes("19:00", "23:00")).toBe(240);
    expect(C.workMinutes("", "01:00")).toBe(0); // 片方でも空なら0
    // 22時以降（深夜割増の対象）
    expect(C.nightMinutes("20:00", "01:30")).toBe(210); // 22:00〜25:30
    expect(C.nightMinutes("19:00", "21:00")).toBe(0);
  });

  it("時給＋バック＋歩合−控除＝差引（実数で確かめる）", () => {
    const w = C.normalizeWork({
      ymd: "2026-07-30",
      staffId: "st1",
      inAt: "20:00",
      outAt: "01:30",
      count: { shimei: 2, douhan: 1, drink: 4 },
      fine: 1000,
      repay: 5000,
    });
    const d = C.payDay(akari, w, { sales: 60000 });
    expect(d.base).toBe(6600); // 1,200×5.5h
    expect(d.backTotal).toBe(2 * 2000 + 1 * 3000 + 4 * 500); // 9,000
    expect(d.commission).toBe(6000); // 60,000の10%
    expect(d.gross).toBe(21600);
    expect(d.deduct).toBe(7000); // 罰金1,000＋厚生費1,000＋返済5,000
    expect(d.net).toBe(14600);
  });
  it("最低保証がある人は、保証と計算した額の高い方になる", () => {
    const w = C.normalizeWork({ ymd: "2026-07-30", staffId: "st2" });
    const low = C.payDay(yui, w, { sales: 20000 }); // 歩合10,000 < 保証15,000
    expect(low.commission).toBe(10000);
    expect(low.gross).toBe(15000);
    expect(low.guaranteeUsed).toBe(true);
    const high = C.payDay(yui, w, { sales: 60000 }); // 歩合30,000 > 保証15,000
    expect(high.gross).toBe(30000);
    expect(high.guaranteeUsed).toBe(false);
  });
  it("日給の人は時間で変わらない（時給と両方あれば日給が勝つ）", () => {
    const boy = C.normalizeStaff({ id: "st3", name: "ボーイ", daily: 10000, hourly: 1200 });
    const w = C.normalizeWork({ ymd: "2026-07-30", staffId: "st3", inAt: "18:00", outAt: "02:00" });
    expect(C.payDay(boy, w, {}).base).toBe(10000);
  });
  it("売上の担当から、その人の客の売上を拾う", () => {
    const sales = [
      C.normalizeSale({
        date: "2026-07-30",
        name: "客A",
        amount: 30000,
        people: 2,
        staff: "あかり",
      }),
      C.normalizeSale({ date: "2026-07-30", name: "客B", amount: 20000, people: 2, staff: "ゆい" }),
      C.normalizeSale({
        date: "2026-07-29",
        name: "客C",
        amount: 50000,
        people: 2,
        staff: "あかり",
      }),
    ];
    expect(C.salesByStaff(sales, "2026-07-30", "あかり")).toBe(30000);
    expect(C.salesByStaff(sales, "2026-07-30", "だれか")).toBe(0);
    // 手で入れた売上があれば、そちらを使う（担当を付け忘れた日を直せる）
    const w = C.normalizeWork({ ymd: "2026-07-30", staffId: "st1", sales: 45000 });
    expect(C.payDay(akari, w, { sales: 30000 }).commission).toBe(4500);
  });
  it("期間のまとめ（出勤日数・支給・控除・差引・指名の本数）", () => {
    const works = [
      C.normalizeWork({
        ymd: "2026-07-01",
        staffId: "st1",
        inAt: "20:00",
        outAt: "00:00",
        count: { shimei: 1 },
      }),
      C.normalizeWork({
        ymd: "2026-07-02",
        staffId: "st1",
        inAt: "20:00",
        outAt: "01:00",
        count: { shimei: 2, douhan: 1 },
        fine: 500,
      }),
      C.normalizeWork({ ymd: "2026-07-03", staffId: "st2", inAt: "20:00", outAt: "00:00" }),
      C.normalizeWork({ ymd: "2026-08-01", staffId: "st1", inAt: "20:00", outAt: "00:00" }), // 期間の外
    ];
    const t = C.paySummary(akari, works, [], "2026-07-01", "2026-07-31");
    expect(t.days).toBe(2);
    expect(t.base).toBe(1200 * 4 + 1200 * 5); // 4,800＋6,000
    expect(t.backTotal).toBe(2000 + (2 * 2000 + 3000)); // 2,000＋7,000
    expect(t.counts.shimei).toBe(3);
    expect(t.counts.douhan).toBe(1);
    expect(t.fine).toBe(500);
    expect(t.kousei).toBe(2000); // 1日1,000×2日
    expect(t.net).toBe(t.gross - t.deduct);
  });

  it("黄色い注意：最低賃金割れ・深夜割増・業務委託の実態", () => {
    const w = C.normalizeWork({
      ymd: "2026-07-30",
      staffId: "st1",
      inAt: "19:00",
      outAt: "21:00",
    });
    const cheap = C.normalizeStaff({ id: "st9", name: "新人", hourly: 800, employ: "employee" });
    const d = C.payDay(cheap, w, {});
    const ws = C.payWarnings(cheap, w, d, { minWage: 1000 });
    expect(ws.join()).toContain("最低賃金");
    // 深夜にかかる人（22時以降）
    const night = C.normalizeWork({
      ymd: "2026-07-30",
      staffId: "st1",
      inAt: "20:00",
      outAt: "01:00",
    });
    const dn = C.payDay(akari, night, {});
    expect(C.payWarnings(akari, night, dn, { minWage: 1000 }).join()).toContain("深夜");
    // 業務委託なのに時給・出勤で管理
    const fake = C.normalizeStaff({ id: "st8", name: "偽装", hourly: 1500, employ: "contract" });
    expect(C.payWarnings(fake, night, C.payDay(fake, night, {}), {}).join()).toContain("業務委託");
    // 何も無ければ何も言わない
    const ok = C.normalizeWork({
      ymd: "2026-07-30",
      staffId: "st1",
      inAt: "18:00",
      outAt: "21:00",
    });
    expect(C.payWarnings(akari, ok, C.payDay(akari, ok, {}), { minWage: 1000 })).toEqual([]);
  });

  it("人と実績を DBの行と往復できる", () => {
    const row = C.staffToRow(akari);
    expect(row.sid).toBe("st1");
    expect(row.back.shimei).toBe(2000);
    const back = C.staffFromRow(row);
    expect(back.name).toBe("あかり");
    expect(back.rate).toBe(10);
    expect(back.employ).toBe("employee");
    const w = C.normalizeWork({
      ymd: "2026-07-30",
      staffId: "st1",
      inAt: "20:00",
      outAt: "01:30",
      count: { shimei: 2 },
      paidAt: "2026-07-31T02:00:00.000Z",
    });
    const wr = C.workToRow(w);
    expect(wr.ymd).toBe("2026-07-30");
    expect(wr.paid_at).toBe("2026-07-31T02:00:00.000Z");
    expect(C.workFromRow(wr).count.shimei).toBe(2);
    // 空の時刻は null で送る（DBが受け取れない空文字を送らない）
    expect(C.workToRow(C.normalizeWork({ ymd: "2026-07-30", staffId: "x" })).paid_at).toBe(null);
  });
});

describe("バックの決め方（円と％）と、よく出るボトル", () => {
  it("％で決めた種類は「売った金額×％」、円で決めた種類は「本数×単価」", () => {
    const st = C.normalizeStaff(
      {
        name: "あかり",
        hourly: 1200,
        back: { shimei: 1500, douhan: 3000, drink: 400 },
        backPct: { bottle: 10 },
      },
      "2026-07-01T00:00:00.000Z"
    );
    const w = C.normalizeWork(
      {
        ymd: "2026-07-30",
        staffId: st.id,
        inAt: "20:00",
        outAt: "01:00",
        count: { shimei: 2, douhan: 1, drink: 8 },
        amount: { bottle: 80000 },
      },
      "2026-07-30T18:00:00.000Z"
    );
    const d = C.payDay(st, w, {});
    const g = (k) => d.backs.filter((b) => b.key === k)[0];
    expect(g("shimei").amount).toBe(3000); // 2本×1,500
    expect(g("drink").amount).toBe(3200); // 8杯×400
    expect(g("bottle").amount).toBe(8000); // 80,000の10%
    expect(g("bottle").pct).toBe(10);
    expect(d.backTotal).toBe(3000 + 3000 + 3200 + 8000);
    expect(d.base).toBe(6000); // 1,200×5h
    expect(d.gross).toBe(23200);
  });
  it("％が入っていれば本数は使わない（二重に足さない）", () => {
    const st = C.normalizeStaff(
      { name: "ゆい", back: { bottle: 5000 }, backPct: { bottle: 10 } },
      "2026-07-01T00:00:00.000Z"
    );
    const w = C.normalizeWork(
      { ymd: "2026-07-30", staffId: st.id, count: { bottle: 3 }, amount: { bottle: 50000 } },
      "2026-07-30T18:00:00.000Z"
    );
    const b = C.payDay(st, w, {}).backs.filter((x) => x.key === "bottle")[0];
    expect(b.amount).toBe(5000); // 50,000の10%。3本×5,000＝15,000にはならない
  });
  it("％も本数も無ければ0（勝手に付けない）", () => {
    const st = C.normalizeStaff({ name: "新人" }, "2026-07-01T00:00:00.000Z");
    const w = C.normalizeWork({ ymd: "2026-07-30", staffId: st.id }, "2026-07-30T18:00:00.000Z");
    expect(C.payDay(st, w, {}).backTotal).toBe(0);
  });
  it("よく出るボトルは、高い順に並び、名前が無いものは出さない", () => {
    const list = C.itemList(
      [
        { name: "モエ", price: 30000, kind: "bottle" },
        { name: "ドンペリ白", price: 50000, kind: "bottle" },
        { name: "", price: 99999, kind: "bottle" },
        { name: "角瓶", price: 8000, kind: "drink" },
      ],
      "bottle"
    );
    expect(list.map((x) => x.name)).toEqual(["ドンペリ白", "モエ"]);
    expect(C.itemList([{ name: "角瓶", price: 8000, kind: "drink" }], "drink")[0].price).toBe(8000);
    expect(C.normalizeItem({ name: " ドンペリ ", price: "50,000" }).price).toBe(0); // 数字にできない値は0
    expect(C.normalizeItem({ name: "ドンペリ", price: 50000 }).kind).toBe("bottle");
  });

  // ===== 並べ替え（設定のマスタで店が自分の順に並べる） =====
  // 押すボタンの並びがこれで決まるので、順番は店の言うとおりにする。
  describe("よく出るボトルの並べ替え", () => {
    const ITEMS = [
      { id: "i1", name: "モエ", price: 30000, kind: "bottle" },
      { id: "i2", name: "ドンペリ白", price: 50000, kind: "bottle" },
      { id: "i3", name: "鏡月", price: 6000, kind: "bottle" },
    ];
    it("並べ替えていない店は、今までどおり高い順のまま", () => {
      expect(C.itemList(ITEMS).map((x) => x.name)).toEqual(["ドンペリ白", "モエ", "鏡月"]);
      expect(C.normalizeItem({ name: "モエ" }).ord).toBe(0);
    });
    it("順番を決めたら、値段ではなくその順に出る", () => {
      const list = C.itemList([
        { id: "i1", name: "モエ", price: 30000, ord: 1 },
        { id: "i2", name: "ドンペリ白", price: 50000, ord: 2 },
        { id: "i3", name: "鏡月", price: 6000, ord: 3 },
      ]);
      expect(list.map((x) => x.name)).toEqual(["モエ", "ドンペリ白", "鏡月"]);
    });
    it("↑を押すと1つ上がり、全部に順番が振り直される", () => {
      const moved = C.moveItem(ITEMS, "i1", -1); // モエ（2番目）を上へ
      expect(C.itemList(moved).map((x) => x.name)).toEqual(["モエ", "ドンペリ白", "鏡月"]);
      expect(C.itemList(moved).map((x) => x.ord)).toEqual([1, 2, 3]);
      // 元の配列は書き換えない（保存に失敗しても画面と食い違わない）
      expect(ITEMS[0].ord).toBe(undefined);
    });
    it("↓を押すと1つ下がる", () => {
      const moved = C.moveItem(ITEMS, "i2", 1); // ドンペリ（1番目）を下へ
      expect(C.itemList(moved).map((x) => x.name)).toEqual(["モエ", "ドンペリ白", "鏡月"]);
    });
    it("端では何も起きない・知らないIDでも壊れない", () => {
      expect(C.itemList(C.moveItem(ITEMS, "i2", -1)).map((x) => x.name)).toEqual([
        "ドンペリ白",
        "モエ",
        "鏡月",
      ]);
      expect(C.itemList(C.moveItem(ITEMS, "i3", 1)).map((x) => x.name)).toEqual([
        "ドンペリ白",
        "モエ",
        "鏡月",
      ]);
      expect(C.itemList(C.moveItem(ITEMS, "xx", 1)).map((x) => x.name)).toEqual([
        "ドンペリ白",
        "モエ",
        "鏡月",
      ]);
      expect(C.moveItem(null, "i1", 1)).toEqual([]);
    });
    it("名前が無い行を混ぜても、並べ替えで消えない", () => {
      const raw = ITEMS.concat([{ id: "i9", name: "", price: 0 }]);
      const moved = C.moveItem(raw, "i1", -1);
      expect(moved.length).toBe(4);
      expect(moved.filter((x) => x.id === "i9").length).toBe(1);
    });
    it("種類でしぼっても、決めた順のまま出る", () => {
      const raw = [
        { id: "i1", name: "モエ", price: 30000, kind: "bottle", ord: 3 },
        { id: "i2", name: "ドンペリ白", price: 50000, kind: "bottle", ord: 1 },
        { id: "i3", name: "角瓶", price: 8000, kind: "drink", ord: 2 },
      ];
      expect(C.itemList(raw, "bottle").map((x) => x.name)).toEqual(["ドンペリ白", "モエ"]);
    });
    it("新しく足す商品は一番下に付く（勝手に上へ割り込まない）", () => {
      expect(C.nextItemOrd([])).toBe(1);
      expect(C.nextItemOrd([{ ord: 1 }, { ord: 5 }, { ord: 2 }])).toBe(6);
      expect(C.nextItemOrd(null)).toBe(1);
      const list = C.itemList(
        [
          { id: "i1", name: "モエ", price: 30000, ord: 1 },
          { id: "i2", name: "ドンペリ白", price: 50000, ord: 2 },
          { id: "i3", name: "新入り", price: 99999, ord: 3 },
        ],
        ""
      );
      expect(list.map((x) => x.name)).toEqual(["モエ", "ドンペリ白", "新入り"]);
    });
  });
  it("期間のまとめで、％バックの売った金額も足される", () => {
    const st = C.normalizeStaff(
      { id: "s1", name: "あかり", backPct: { bottle: 10 } },
      "2026-07-01T00:00:00.000Z"
    );
    const works = [
      C.normalizeWork(
        { ymd: "2026-07-01", staffId: "s1", amount: { bottle: 50000 } },
        "2026-07-01T18:00:00.000Z"
      ),
      C.normalizeWork(
        { ymd: "2026-07-02", staffId: "s1", amount: { bottle: 30000 } },
        "2026-07-02T18:00:00.000Z"
      ),
    ];
    const t = C.paySummary(st, works, [], "2026-07-01", "2026-07-31");
    expect(t.amounts.bottle).toBe(80000);
    expect(t.backTotal).toBe(8000);
  });
});

describe("給料の「使う項目」は人ごとに選ぶ（選ばれていない項目は計算に乗らない）", () => {
  // 全部入りの人。ここから項目を外して、外した分だけ消えることを実数で確かめる。
  function full(use) {
    return C.normalizeStaff(
      {
        id: "u1",
        name: "あかり",
        hourly: 1200,
        back: { shimei: 2000, jonai: 1000, douhan: 3000, drink: 500 },
        backPct: { bottle: 10 },
        rate: 10,
        guarantee: 15000,
        kousei: 1000,
        use: use,
      },
      "2026-07-01T00:00:00.000Z"
    );
  }
  function work(o) {
    return C.normalizeWork(
      Object.assign(
        {
          ymd: "2026-07-30",
          staffId: "u1",
          inAt: "20:00",
          outAt: "01:00", // 5時間 → 基本6,000
          count: { shimei: 2, jonai: 1, douhan: 1, drink: 4 },
          amount: { bottle: 50000 },
          fine: 1000,
          lend: 3000,
          repay: 2000,
        },
        o || {}
      ),
      "2026-07-30T18:00:00.000Z"
    );
  }

  it("項目の一覧は11個（バック5種＋歩合・最低保証・厚生費・罰金・前借り・返済）", () => {
    expect(C.PAY_ITEMS.map((x) => x.key)).toEqual([
      "shimei",
      "jonai",
      "douhan",
      "drink",
      "bottle",
      "rate",
      "guarantee",
      "kousei",
      "fine",
      "lend",
      "repay",
    ]);
  });

  it("既定は全部オン（今までの人はそのまま・使う項目を触っていない人も変わらない）", () => {
    const st = full(undefined);
    C.PAY_ITEMS.forEach((x) => expect(C.staffUses(st, x.key), x.key).toBe(true));
    // 空のオブジェクト（クラウドの既定値 '{}'）でも全部オン
    const empty = full({});
    C.PAY_ITEMS.forEach((x) => expect(C.staffUses(empty, x.key), x.key).toBe(true));
  });

  it("全部オンなら今までと同じ数字（外す前の基準）", () => {
    const d = C.payDay(full(undefined), work(), {});
    expect(d.base).toBe(6000); // 1,200×5h
    expect(d.backTotal).toBe(2 * 2000 + 1000 + 3000 + 4 * 500 + 5000); // 4,000+1,000+3,000+2,000+5,000
    expect(d.commission).toBe(0); // 自分の客の売上が無い
    expect(d.gross).toBe(21000);
    expect(d.deduct).toBe(1000 + 1000 + 2000); // 罰金＋厚生費＋返済
    expect(d.net).toBe(17000);
    expect(d.lend).toBe(3000);
  });

  it("バックを外すと、その種類だけ0になる（過去に打った本数・売った額は消さない）", () => {
    const st = full({ bottle: false, drink: false });
    const w = work();
    const d = C.payDay(st, w, {});
    const g = (k) => d.backs.filter((b) => b.key === k)[0];
    expect(g("bottle").amount).toBe(0);
    expect(g("bottle").used).toBe(false);
    expect(g("drink").amount).toBe(0);
    expect(g("shimei").amount).toBe(4000); // 残した種類はそのまま
    expect(g("shimei").used).toBe(true);
    expect(d.backTotal).toBe(4000 + 1000 + 3000);
    // 実績そのものは残っている（外しただけでデータは消えない）
    expect(w.amount.bottle).toBe(50000);
    expect(w.count.drink).toBe(4);
  });

  it("歩合を外すと歩合が付かない", () => {
    const d = C.payDay(full({ rate: false }), work({ sales: 60000 }), {});
    expect(d.commission).toBe(0);
    const on = C.payDay(full(undefined), work({ sales: 60000 }), {});
    expect(on.commission).toBe(6000);
  });

  it("最低保証を外すと、保証で底上げされない", () => {
    const poor = work({ count: {}, amount: {}, inAt: "", outAt: "" }); // 稼ぎ0
    const on = C.payDay(full(undefined), poor, {});
    expect(on.gross).toBe(15000);
    expect(on.guaranteeUsed).toBe(true);
    const off = C.payDay(full({ guarantee: false }), poor, {});
    expect(off.gross).toBe(0);
    expect(off.guaranteeUsed).toBe(false);
  });

  it("厚生費・罰金・返済を外すと、控除から消える", () => {
    const d = C.payDay(full({ kousei: false, fine: false }), work(), {});
    expect(d.kousei).toBe(0);
    expect(d.fine).toBe(0);
    expect(d.deduct).toBe(2000); // 返済だけ残る
    const d2 = C.payDay(full({ kousei: false, fine: false, repay: false }), work(), {});
    expect(d2.repay).toBe(0);
    expect(d2.deduct).toBe(0);
    expect(d2.net).toBe(d2.gross);
  });

  it("前借りを外すと、前借りは0で出る", () => {
    expect(C.payDay(full({ lend: false }), work(), {}).lend).toBe(0);
  });

  it("期間のまとめにも、外した項目は乗らない", () => {
    const works = [work({ ymd: "2026-07-01" }), work({ ymd: "2026-07-02" })];
    const on = C.paySummary(full(undefined), works, [], "2026-07-01", "2026-07-31");
    const off = C.paySummary(
      full({ kousei: false, bottle: false }),
      works,
      [],
      "2026-07-01",
      "2026-07-31"
    );
    expect(on.kousei).toBe(2000);
    expect(off.kousei).toBe(0);
    expect(on.backTotal - off.backTotal).toBe(5000 * 2); // ボトル10%×50,000×2日
  });

  it("使う項目は DBの行と往復できる（外した印が消えない）", () => {
    const st = full({ kousei: false, bottle: false });
    const row = C.staffToRow(st);
    expect(row.use_items.kousei).toBe(false);
    expect(row.use_items.shimei).toBe(true);
    const back = C.staffFromRow(row);
    expect(C.staffUses(back, "kousei")).toBe(false);
    expect(C.staffUses(back, "bottle")).toBe(false);
    expect(C.staffUses(back, "shimei")).toBe(true);
    // 古い行（use_items が無い）は全部オンで戻る
    const old = Object.assign({}, row);
    delete old.use_items;
    C.PAY_ITEMS.forEach((x) => expect(C.staffUses(C.staffFromRow(old), x.key), x.key).toBe(true));
  });
});

describe("バックの種類は店が決める（5つ固定をやめる）", () => {
  it("何も決めていない店は、今までの5つがそのまま出る（既存の店が壊れない）", () => {
    const k = C.backKinds({});
    expect(k.map((x) => x.key)).toEqual(["shimei", "jonai", "douhan", "drink", "bottle"]);
    expect(k.map((x) => x.label)).toEqual(["本指名", "場内指名", "同伴", "ドリンク", "ボトル"]);
  });

  it("種類を足せる・名前を変えられる・並べ替えられる", () => {
    const k = C.backKinds({
      backKinds: [
        { key: "shimei", label: "指名" }, // 名前を変えた
        { key: "champagne", label: "シャンパン" }, // 足した
        { key: "food", label: "フード" }, // 足した
      ],
    });
    expect(k.map((x) => x.key)).toEqual(["shimei", "champagne", "food"]);
    expect(k[0].label).toBe("指名");
  });

  it("名前が空の種類は捨てる／同じキーは1つに寄せる（打ち間違いで壊れない）", () => {
    const k = C.backKinds({
      backKinds: [
        { key: "a", label: "シャンパン" },
        { key: "b", label: "  " },
        { key: "a", label: "あとの方" },
      ],
    });
    expect(k.length).toBe(1);
    expect(k[0].key).toBe("a");
  });

  it("店が足した種類でも、人ごとに単価と％を持てる", () => {
    const st = C.normalizeStaff(
      {
        id: "s1",
        name: "あかり",
        back: { champagne: 0, food: 300 },
        backPct: { champagne: 15 },
      },
      "2026-08-01T00:00:00.000Z"
    );
    // 決め打ちの5つに無いキーも消えない
    expect(st.backPct.champagne).toBe(15);
    expect(st.back.food).toBe(300);
    // DBの行と往復しても消えない
    const back = C.staffFromRow(C.staffToRow(st));
    expect(back.backPct.champagne).toBe(15);
    expect(back.back.food).toBe(300);
  });

  it("店が足した種類で計算できる（シャンパン15%）", () => {
    const cfg = { backKinds: [{ key: "champagne", label: "シャンパン" }] };
    const st = C.normalizeStaff({ id: "s1", name: "あかり", backPct: { champagne: 15 } });
    const w = C.normalizeWork({ ymd: "2026-08-01", staffId: "s1", amount: { champagne: 80000 } });
    const d = C.payDay(st, w, { settings: cfg });
    expect(d.backTotal).toBe(12000);
    expect(d.backs.map((b) => b.key)).toEqual(["champagne"]);
  });
});

describe("銘柄ごとの率（ドンペリだけ20%）", () => {
  const SETTINGS = {
    backKinds: [{ key: "champagne", label: "シャンパン" }],
    items: [
      { id: "i1", name: "ドンペリ白", price: 50000, kind: "champagne", pct: 20 }, // 特別
      { id: "i2", name: "モエ", price: 20000, kind: "champagne" }, // 率なし＝種類の率
    ],
  };
  const st = C.normalizeStaff({ id: "s1", name: "あかり", backPct: { champagne: 15 } });

  it("押した銘柄に率があれば、その率で計算する", () => {
    // ドンペリ1本 → 50,000 の 20% = 10,000
    const w = C.normalizeWork({
      ymd: "2026-08-01",
      staffId: "s1",
      picks: { i1: 1 },
    });
    const d = C.payDay(st, w, { settings: SETTINGS });
    expect(d.backTotal).toBe(10000);
  });

  it("率が無い銘柄は、種類の率で計算する", () => {
    // モエ1本 → 20,000 の 15% = 3,000
    const w = C.normalizeWork({ ymd: "2026-08-01", staffId: "s1", picks: { i2: 1 } });
    expect(C.payDay(st, w, { settings: SETTINGS }).backTotal).toBe(3000);
  });

  it("混ざっても正しい（ドンペリ2本＋モエ1本）", () => {
    // 50,000×2×20% = 20,000  ／  20,000×15% = 3,000  → 23,000
    const w = C.normalizeWork({ ymd: "2026-08-01", staffId: "s1", picks: { i1: 2, i2: 1 } });
    const d = C.payDay(st, w, { settings: SETTINGS });
    expect(d.backTotal).toBe(23000);
    const b = d.backs[0];
    expect(b.sold).toBe(120000); // 売った額も自動で出る（打たなくていい）
    expect(b.count).toBe(3); // 本数も自動
  });

  it("登録していない物は、金額を直接打てば種類の率で付く", () => {
    // ドンペリ1本(20%=10,000) ＋ 手打ち30,000(15%=4,500) → 14,500
    const w = C.normalizeWork({
      ymd: "2026-08-01",
      staffId: "s1",
      picks: { i1: 1 },
      amount: { champagne: 30000 },
    });
    expect(C.payDay(st, w, { settings: SETTINGS }).backTotal).toBe(14500);
  });

  it("使う項目から外した種類は、銘柄を押していても0になる", () => {
    const off = C.normalizeStaff({
      id: "s1",
      name: "あかり",
      backPct: { champagne: 15 },
      use: { champagne: false },
    });
    const w = C.normalizeWork({ ymd: "2026-08-01", staffId: "s1", picks: { i1: 2 } });
    expect(C.payDay(off, w, { settings: SETTINGS }).backTotal).toBe(0);
  });

  it("押した銘柄の記録は、DBの行と往復しても消えない", () => {
    const w = C.normalizeWork({ ymd: "2026-08-01", staffId: "s1", picks: { i1: 2, i2: 1 } });
    const back = C.workFromRow(C.workToRow(w));
    expect(back.picks).toEqual({ i1: 2, i2: 1 });
  });

  it("期間のまとめにも、銘柄ごとの率が効く", () => {
    const works = [
      C.normalizeWork({ ymd: "2026-08-01", staffId: "s1", picks: { i1: 1 } }),
      C.normalizeWork({ ymd: "2026-08-02", staffId: "s1", picks: { i2: 1 } }),
    ];
    const t = C.paySummary(st, works, [], "2026-08-01", "2026-08-31", { settings: SETTINGS });
    expect(t.backTotal).toBe(13000); // 10,000 + 3,000
  });
});

describe("ついた人（ヘルプ・場内・同伴）— 1つの会計に何人でも付けられる", () => {
  const SETTINGS = {
    backKinds: [
      { key: "shimei", label: "本指名" },
      { key: "help", label: "ヘルプ" },
    ],
  };
  // 会計: 担当=あかり、ヘルプ=ゆい と さき
  const sale = (o) =>
    C.normalizeSale(
      Object.assign(
        {
          date: "2026-08-05",
          name: "客A",
          people: 2,
          amount: 60000,
          pay: "cash",
          staff: "あかり",
          crew: [
            { name: "ゆい", role: "help" },
            { name: "さき", role: "help" },
          ],
        },
        o || {}
      ),
      "2026-08-05T00:00:00.000Z"
    );

  it("ついた人は、そのまま持てる（DBの行と往復しても消えない）", () => {
    const s = sale();
    expect(s.crew).toEqual([
      { name: "ゆい", role: "help" },
      { name: "さき", role: "help" },
    ]);
    expect(C.saleFromRow(C.saleToRow(s)).crew).toEqual(s.crew);
  });

  it("名前が空のついた人は捨てる（打ち間違いで壊れない）", () => {
    const s = sale({ crew: [{ name: "  ", role: "help" }, { name: "ゆい", role: "help" }, {}] });
    expect(s.crew).toEqual([{ name: "ゆい", role: "help" }]);
  });

  it("その日そのの人が、何の役割で何回ついたかを数える", () => {
    const sales = [sale(), sale({ amount: 20000, crew: [{ name: "ゆい", role: "help" }] })];
    const yui = C.crewByStaff(sales, "2026-08-05", "ゆい");
    expect(yui.help.n).toBe(2); // 2回ヘルプに入った
    expect(yui.help.sold).toBe(80000); // その会計の合計（％で払う店用）
    const saki = C.crewByStaff(sales, "2026-08-05", "さき");
    expect(saki.help.n).toBe(1);
    expect(saki.help.sold).toBe(60000);
    // 担当の人は crew には入らない（歩合で払うので二重にしない）
    expect(C.crewByStaff(sales, "2026-08-05", "あかり")).toEqual({});
  });

  it("ヘルプ1回いくらの人＝回数×単価が自動で入る（出勤で手で数えない）", () => {
    const yui = C.normalizeStaff({ id: "y", name: "ゆい", back: { help: 500 } });
    const w = C.normalizeWork({ ymd: "2026-08-05", staffId: "y" });
    const d = C.payDay(yui, w, {
      settings: SETTINGS,
      crew: C.crewByStaff([sale(), sale({ amount: 20000 })], "2026-08-05", "ゆい"),
    });
    const help = d.backs.filter((b) => b.key === "help")[0];
    expect(help.count).toBe(2);
    expect(help.amount).toBe(1000); // 2回 × 500
  });

  it("ヘルプも％で払える（ついた会計の額に率をかける）", () => {
    const yui = C.normalizeStaff({ id: "y", name: "ゆい", backPct: { help: 5 } });
    const w = C.normalizeWork({ ymd: "2026-08-05", staffId: "y" });
    const d = C.payDay(yui, w, {
      settings: SETTINGS,
      crew: C.crewByStaff([sale()], "2026-08-05", "ゆい"),
    });
    expect(d.backs.filter((b) => b.key === "help")[0].amount).toBe(3000); // 60,000の5%
  });

  it("担当は歩合、ヘルプはヘルプバック。同じ会計で両方が成り立つ", () => {
    const akari = C.normalizeStaff({ id: "a", name: "あかり", rate: 10 });
    const da = C.payDay(akari, C.normalizeWork({ ymd: "2026-08-05", staffId: "a" }), {
      settings: SETTINGS,
      sales: 60000,
    });
    expect(da.commission).toBe(6000);
    const yui = C.normalizeStaff({ id: "y", name: "ゆい", back: { help: 500 } });
    const dy = C.payDay(yui, C.normalizeWork({ ymd: "2026-08-05", staffId: "y" }), {
      settings: SETTINGS,
      crew: C.crewByStaff([sale()], "2026-08-05", "ゆい"),
    });
    expect(dy.backTotal).toBe(500);
  });

  it("使う項目からヘルプを外している人には付かない", () => {
    const off = C.normalizeStaff({
      id: "y",
      name: "ゆい",
      back: { help: 500 },
      use: { help: false },
    });
    const d = C.payDay(off, C.normalizeWork({ ymd: "2026-08-05", staffId: "y" }), {
      settings: SETTINGS,
      crew: C.crewByStaff([sale()], "2026-08-05", "ゆい"),
    });
    expect(d.backTotal).toBe(0);
  });

  it("期間のまとめでも、ついた回数が自動で入る", () => {
    const yui = C.normalizeStaff({ id: "y", name: "ゆい", back: { help: 500 } });
    const sales = [sale(), sale({ date: "2026-08-06" })];
    const works = [
      C.normalizeWork({ ymd: "2026-08-05", staffId: "y" }),
      C.normalizeWork({ ymd: "2026-08-06", staffId: "y" }),
    ];
    const t = C.paySummary(yui, works, sales, "2026-08-01", "2026-08-31", { settings: SETTINGS });
    expect(t.counts.help).toBe(2);
    expect(t.backTotal).toBe(1000);
  });
});

describe("★日払いで渡した分は、月のまとめから引く（二重に払わない）", () => {
  const st = C.normalizeStaff({ id: "s1", name: "あかり", daily: 10000, cycle: "daily" });
  const day = (ymd, paid) =>
    C.normalizeWork({
      ymd: ymd,
      staffId: "s1",
      inAt: "20:00",
      outAt: "01:00",
      paidAt: paid ? ymd + "T02:00:00.000Z" : null,
    });

  it("3日ぶん働いて、2日ぶん渡し済みなら、これから渡すのは1日ぶん", () => {
    const works = [day("2026-08-01", true), day("2026-08-02", true), day("2026-08-03", false)];
    const t = C.paySummary(st, works, [], "2026-08-01", "2026-08-31");
    expect(t.net).toBe(30000); // 稼いだ額は3日ぶん（今までどおり）
    expect(t.paidNet).toBe(20000); // もう渡した額
    expect(t.unpaidNet).toBe(10000); // ★これから渡す額
    expect(t.paidDays).toBe(2);
  });

  it("全部渡し済みなら、これから渡す額は0（ここを間違えると倍払う）", () => {
    const works = [day("2026-08-01", true), day("2026-08-02", true)];
    const t = C.paySummary(st, works, [], "2026-08-01", "2026-08-31");
    expect(t.net).toBe(20000);
    expect(t.paidNet).toBe(20000);
    expect(t.unpaidNet).toBe(0);
  });

  it("1日も渡していなければ、これから渡す額＝稼いだ額（月払いの人）", () => {
    const monthly = C.normalizeStaff({ id: "s2", name: "ゆい", daily: 8000, cycle: "monthly" });
    const works = [
      C.normalizeWork({ ymd: "2026-08-01", staffId: "s2" }),
      C.normalizeWork({ ymd: "2026-08-02", staffId: "s2" }),
    ];
    const t = C.paySummary(monthly, works, [], "2026-08-01", "2026-08-31");
    expect(t.net).toBe(16000);
    expect(t.paidNet).toBe(0);
    expect(t.unpaidNet).toBe(16000);
  });

  it("控除がある日も、渡した額は差引の額で数える", () => {
    const w = C.normalizeWork({
      ymd: "2026-08-01",
      staffId: "s1",
      fine: 1000,
      paidAt: "2026-08-01T02:00:00.000Z",
    });
    const t = C.paySummary(st, [w], [], "2026-08-01", "2026-08-31");
    expect(t.net).toBe(9000); // 10,000 − 罰金1,000
    expect(t.paidNet).toBe(9000);
    expect(t.unpaidNet).toBe(0);
  });
});

describe("前借りの残高（いくら貸していて、いくら残っているか）", () => {
  const st = C.normalizeStaff({ id: "s1", name: "あかり", daily: 10000 });
  it("貸した合計 − 返した合計 が残高", () => {
    const works = [
      C.normalizeWork({ ymd: "2026-08-01", staffId: "s1", lend: 30000 }),
      C.normalizeWork({ ymd: "2026-08-05", staffId: "s1", repay: 10000 }),
      C.normalizeWork({ ymd: "2026-08-10", staffId: "s1", repay: 5000 }),
    ];
    // 期間を切っても、残高は「始めから今日まで」で数える（月をまたいでも残る）
    expect(C.lendBalance(st, works, "2026-08-31")).toBe(15000);
    expect(C.lendBalance(st, works, "2026-08-05")).toBe(20000); // 途中の日で見る
  });
  it("返しすぎてもマイナスにしない（打ち間違いで変な数字を出さない）", () => {
    const works = [
      C.normalizeWork({ ymd: "2026-08-01", staffId: "s1", lend: 10000 }),
      C.normalizeWork({ ymd: "2026-08-05", staffId: "s1", repay: 30000 }),
    ];
    expect(C.lendBalance(st, works, "2026-08-31")).toBe(0);
  });
  it("使う項目から前借り・返済を外している人は、残高0のまま", () => {
    const off = C.normalizeStaff({
      id: "s1",
      name: "あかり",
      use: { lend: false, repay: false },
    });
    const works = [C.normalizeWork({ ymd: "2026-08-01", staffId: "s1", lend: 30000 })];
    expect(C.lendBalance(off, works, "2026-08-31")).toBe(0);
  });
  it("他の人の前借りは混ざらない", () => {
    const works = [
      C.normalizeWork({ ymd: "2026-08-01", staffId: "s1", lend: 30000 }),
      C.normalizeWork({ ymd: "2026-08-01", staffId: "s2", lend: 50000 }),
    ];
    expect(C.lendBalance(st, works, "2026-08-31")).toBe(30000);
  });
});

describe("歩合の元を税込か税抜で選べる", () => {
  const st = C.normalizeStaff({ id: "s1", name: "あかり", rate: 10 });
  const w = C.normalizeWork({ ymd: "2026-08-01", staffId: "s1", sales: 11000 });

  it("何も決めていなければ今までどおり税込", () => {
    expect(C.payDay(st, w, {}).commission).toBe(1100);
  });

  it("税抜を選ぶと、消費税を抜いてから掛ける", () => {
    // 11,000(税込10%) → 税抜10,000 → 10% = 1,000
    const d = C.payDay(st, w, { settings: { rateBase: "nuki", rate: 0.1 } });
    expect(d.commission).toBe(1000);
  });
});

/* =====================================================================
   ④ 締め方（人ごと）
   日払い / 週払い(締め曜日) / 15日締め / 月末締め ＋「締めてから何日後に払う」
   ここが狂うと払う日と額が狂うので、実際の日付で固定する。
   ===================================================================== */
describe("締め方（人ごと）", () => {
  const mk = (o) => C.normalizeStaff(Object.assign({ id: "s1", name: "あかり" }, o));

  it("何も決めていない人は今までどおり日払い・その日に渡す", () => {
    const st = mk({});
    expect(st.cycle).toBe("daily");
    expect(st.payAfter).toBe(0);
    expect(C.payPeriod(st, "2026-08-05")).toEqual({
      cycle: "daily",
      from: "2026-08-05",
      to: "2026-08-05",
      payYmd: "2026-08-05",
    });
  });

  it("日払いで「3日後に払う」なら、支払日が3日ずれる", () => {
    const p = C.payPeriod(mk({ payAfter: 3 }), "2026-08-05");
    expect(p.payYmd).toBe("2026-08-08");
  });

  it("週払い：締め曜日までが1回分（締め曜日そのものは、その週に入る）", () => {
    // 締め曜日＝日曜(0)。2026-08-05は水曜 → その週は 7/30(木)〜8/5? ではなく 8/2(日)締め
    const st = mk({ cycle: "weekly", closeWday: 0 });
    expect(C.weekday("2026-08-02")).toBe("日");
    const p = C.payPeriod(st, "2026-07-30");
    expect(p.to).toBe("2026-08-02"); // 次の日曜で締める
    expect(p.from).toBe("2026-07-27"); // その7日前（月曜）から
    expect(p.payYmd).toBe("2026-08-02");
    // 締め曜日その日は、その週に入る（翌週送りにしない）
    expect(C.payPeriod(st, "2026-08-02").to).toBe("2026-08-02");
    // 翌日はもう次の週
    expect(C.payPeriod(st, "2026-08-03").to).toBe("2026-08-09");
  });

  it("週払い：締め曜日を土曜にすると、区切りが変わる", () => {
    const st = mk({ cycle: "weekly", closeWday: 6, payAfter: 2 });
    expect(C.weekday("2026-08-01")).toBe("土");
    const p = C.payPeriod(st, "2026-07-28");
    expect(p).toEqual({
      cycle: "weekly",
      from: "2026-07-26",
      to: "2026-08-01",
      payYmd: "2026-08-03",
    });
  });

  it("15日締め：16日〜翌15日でひと区切り", () => {
    const st = mk({ cycle: "half", payAfter: 5 });
    expect(C.payPeriod(st, "2026-08-20")).toEqual({
      cycle: "half",
      from: "2026-08-16",
      to: "2026-09-15",
      payYmd: "2026-09-20",
    });
    // 15日ちょうどは、前の区切りの最後の日
    expect(C.payPeriod(st, "2026-08-15")).toEqual({
      cycle: "half",
      from: "2026-07-16",
      to: "2026-08-15",
      payYmd: "2026-08-20",
    });
    // 1日は前月16日から
    expect(C.payPeriod(st, "2026-01-05").from).toBe("2025-12-16");
  });

  it("月末締め：1日〜末日。2月も30日の月もその月の末日で締める", () => {
    const st = mk({ cycle: "monthly", payAfter: 10 });
    expect(C.payPeriod(st, "2026-08-20")).toEqual({
      cycle: "monthly",
      from: "2026-08-01",
      to: "2026-08-31",
      payYmd: "2026-09-10",
    });
    expect(C.payPeriod(st, "2026-02-10").to).toBe("2026-02-28");
    expect(C.payPeriod(mk({ cycle: "monthly" }), "2024-02-10").to).toBe("2024-02-29"); // うるう年
    expect(C.payPeriod(st, "2026-09-01").to).toBe("2026-09-30");
    // 末日締め＋0日後なら、締めたその日が支払日
    expect(C.payPeriod(mk({ cycle: "monthly" }), "2026-08-20").payYmd).toBe("2026-08-31");
  });

  it("知らない締め方でも壊れない（日払い扱いに戻す）", () => {
    const st = mk({ cycle: "yonaoshi" });
    expect(st.cycle).toBe("daily");
    expect(C.payPeriod(st, "2026-08-05").to).toBe("2026-08-05");
    expect(C.payPeriod(st, "こわれた日付")).toBe(null);
  });

  it("締め曜日と支払日のずれは、変な値を入れても丸められる", () => {
    expect(mk({ closeWday: 9 }).closeWday).toBe(0);
    expect(mk({ closeWday: -1 }).closeWday).toBe(0);
    expect(mk({ closeWday: "6" }).closeWday).toBe(6);
    expect(mk({ payAfter: -5 }).payAfter).toBe(0);
    expect(mk({ payAfter: 999 }).payAfter).toBe(60); // ふた月先までで止める
    expect(mk({ payAfter: "7" }).payAfter).toBe(7);
  });
});

describe("その日に払う人と、まとめて渡す", () => {
  const staff = [
    C.normalizeStaff({ id: "s1", name: "あかり", hourly: 1000, cycle: "half", payAfter: 5 }),
    C.normalizeStaff({ id: "s2", name: "ゆい", hourly: 1000, cycle: "daily" }),
  ];
  // あかり＝8/16〜9/15締め・9/20払い。2日出勤（各5時間＝5,000円）
  const works = [
    C.normalizeWork({ id: "w1", ymd: "2026-08-20", staffId: "s1", inAt: "20:00", outAt: "01:00" }),
    C.normalizeWork({ id: "w2", ymd: "2026-09-10", staffId: "s1", inAt: "20:00", outAt: "01:00" }),
    C.normalizeWork({ id: "w3", ymd: "2026-09-20", staffId: "s2", inAt: "20:00", outAt: "01:00" }),
  ];

  it("支払日に当たる人だけ出て、額はその区切りの「これから渡す」分", () => {
    const plan = C.payPlan(staff, works, [], "2026-09-20", {});
    expect(plan.map((x) => x.staff.name)).toEqual(["あかり", "ゆい"]);
    const a = plan[0];
    expect(a.period.from).toBe("2026-08-16");
    expect(a.period.to).toBe("2026-09-15");
    expect(a.unpaid).toBe(10000); // 5,000×2日
    expect(a.paid).toBe(0);
    // 日払いのゆいは、その日ぶんだけ
    expect(plan[1].unpaid).toBe(5000);
  });

  it("支払日でない日は、誰も出ない", () => {
    expect(C.payPlan(staff, works, [], "2026-09-19", {}).length).toBe(0);
  });

  it("まとめて渡すと、その区切りの分だけ渡し済みになる（二重払いしない）", () => {
    const next = C.markPaidRange(
      works,
      "s1",
      "2026-08-16",
      "2026-09-15",
      "2026-09-20T10:00:00.000Z"
    );
    expect(next.filter((w) => w.paidAt).map((w) => w.id)).toEqual(["w1", "w2"]);
    // 他の人の分と、区切りの外は触らない
    expect(next.find((w) => w.id === "w3").paidAt).toBe(null);
    // 元の配列は書き換えない
    expect(works[0].paidAt).toBe(null);
    // 渡したあとは「これから渡す」が0になる
    const plan = C.payPlan(staff, next, [], "2026-09-20", {});
    expect(plan[0].unpaid).toBe(0);
    expect(plan[0].paid).toBe(10000);
  });

  it("もう渡した分は、押し直しても時刻が変わらない（上書きしない）", () => {
    const one = C.markPaidRange(
      works,
      "s1",
      "2026-08-16",
      "2026-09-15",
      "2026-09-20T10:00:00.000Z"
    );
    const two = C.markPaidRange(one, "s1", "2026-08-16", "2026-09-15", "2026-09-25T10:00:00.000Z");
    expect(two.find((w) => w.id === "w1").paidAt).toBe("2026-09-20T10:00:00.000Z");
  });

  it("消した出勤は数えないし、渡し済みにもしない", () => {
    const w = works.concat([
      C.normalizeWork({
        id: "w9",
        ymd: "2026-09-01",
        staffId: "s1",
        inAt: "20:00",
        outAt: "01:00",
        deletedAt: "2026-09-02T00:00:00.000Z",
      }),
    ]);
    const plan = C.payPlan(staff, w, [], "2026-09-20", {});
    expect(plan[0].unpaid).toBe(10000);
    const next = C.markPaidRange(w, "s1", "2026-08-16", "2026-09-15", "2026-09-20T10:00:00.000Z");
    expect(next.find((x) => x.id === "w9").paidAt).toBe(null);
  });
});

describe("締め方もクラウドに残る（新しいスマホでも同じ締め方）", () => {
  it("行に出して読み戻しても、締め方・締め曜日・何日後が変わらない", () => {
    const st = C.normalizeStaff(
      { id: "s1", name: "ゆい", cycle: "weekly", closeWday: 6, payAfter: 2 },
      "2026-08-01T00:00:00.000Z"
    );
    const row = C.staffToRow(st);
    expect(row.close_wday).toBe(6);
    expect(row.pay_after).toBe(2);
    const back = C.staffFromRow(row);
    expect(back.cycle).toBe("weekly");
    expect(back.closeWday).toBe(6);
    expect(back.payAfter).toBe(2);
    expect(C.payPeriod(back, "2026-07-28").payYmd).toBe("2026-08-03");
  });
  it("古い行（列がまだ無い店）から読んでも壊れない", () => {
    const back = C.staffFromRow({ sid: "s1", name: "あかり", cycle: "daily" });
    expect(back.closeWday).toBe(0);
    expect(back.payAfter).toBe(0);
  });
});
