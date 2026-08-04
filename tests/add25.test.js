/* 回収予定日（いつまでにもらう約束か）
   ------------------------------------------------------------------
   今までは「一番古い日から何日たった」しか出せなかった。
   店が知りたいのは「いつ入るはずか」「もう過ぎているのはどれか」。 */
import { describe, it, expect } from "vitest";
import { createRequire } from "module";
const C = createRequire(import.meta.url)("../nomiya-core.js");

describe("支払いの約束（決め方）", () => {
  it("決め方は5つ。決めていない店は今までどおり", () => {
    expect(C.PAY_TERMS.map((x) => x.key)).toEqual(["none", "days", "eom", "nextEom", "nextDay"]);
    expect(C.normalizeTerm(null)).toEqual({ kind: "none", n: 0 });
    expect(C.normalizeTerm({ kind: "days", n: "30" })).toEqual({ kind: "days", n: 30 });
    // 知らない決め方は「決めていない」に寄せる（変な値で紙が壊れない）
    expect(C.normalizeTerm({ kind: "あああ", n: 5 })).toEqual({ kind: "none", n: 0 });
  });

  it("その日から数えて期限を出す", () => {
    const d = (kind, n, ymd) => C.dueDate(ymd, { kind: kind, n: n });
    expect(d("none", 0, "2026-08-02")).toBe(""); // 決めていない＝期限なし
    expect(d("days", 30, "2026-08-02")).toBe("2026-09-01"); // 30日後
    expect(d("eom", 0, "2026-08-02")).toBe("2026-08-31"); // その月の末日
    expect(d("nextEom", 0, "2026-08-02")).toBe("2026-09-30"); // 翌月の末日
    expect(d("nextDay", 25, "2026-08-02")).toBe("2026-09-25"); // 翌月25日
  });
  it("月末の数え方が狂わない（2月・31日・年またぎ）", () => {
    expect(C.dueDate("2026-01-31", { kind: "eom", n: 0 })).toBe("2026-01-31");
    expect(C.dueDate("2026-01-31", { kind: "nextEom", n: 0 })).toBe("2026-02-28");
    expect(C.dueDate("2028-01-31", { kind: "nextEom", n: 0 })).toBe("2028-02-29"); // うるう年
    expect(C.dueDate("2026-12-10", { kind: "nextEom", n: 0 })).toBe("2027-01-31"); // 年またぎ
    // 31日を指定した月に31日が無ければ、その月の末日にする（勝手に翌月へ送らない）
    expect(C.dueDate("2026-01-15", { kind: "nextDay", n: 31 })).toBe("2026-02-28");
    expect(C.dueDate("2026-12-15", { kind: "nextDay", n: 10 })).toBe("2027-01-10");
  });
  it("日付が読めないときは空で返す（勝手な期限を作らない）", () => {
    expect(C.dueDate("", { kind: "eom", n: 0 })).toBe("");
    expect(C.dueDate("あ", { kind: "eom", n: 0 })).toBe("");
  });
});

describe("未回収に「いつまでに」を出す", () => {
  const sale = (id, date, name, amount, pay) =>
    C.normalizeSale({ id: id, date: date, name: name, amount: amount, pay: pay || "tsuke" }, "x");
  const sales = [
    sale("s1", "2026-07-01", "山本商事", 30000, "invoice"),
    sale("s2", "2026-08-20", "山本商事", 20000, "invoice"),
    sale("s3", "2026-08-01", "田中", 8000),
  ];
  // 山本商事＝翌月末払い ／ ツケ（田中）は店ぜんぶ共通の決め方を使う
  const opt = {
    today: "2026-08-20",
    terms: { 山本商事: { kind: "nextEom", n: 0 } },
    tsukeTerm: { kind: "days", n: 30 },
  };

  it("売上ごとに期限が付く", () => {
    const r = C.receivables(sales, [], opt);
    const y = r.filter((x) => x.name === "山本商事")[0];
    expect(y.rows.map((x) => x.due)).toEqual(["2026-08-31", "2026-09-30"]);
    const t = r.filter((x) => x.name === "田中")[0];
    expect(t.rows[0].due).toBe("2026-08-31");
  });
  it("相手ごとに「一番早い期限」と「あと何日」が出る", () => {
    const y = C.receivables(sales, [], opt).filter((x) => x.name === "山本商事")[0];
    expect(y.due).toBe("2026-08-31");
    expect(y.dueIn).toBe(11); // 8/20 から 8/31 まで
    expect(y.overdue).toBe(0);
  });
  it("期限を過ぎた分は、額と件数で分かる", () => {
    const late = C.receivables(sales, [], Object.assign({}, opt, { today: "2026-09-10" }));
    const y = late.filter((x) => x.name === "山本商事")[0];
    expect(y.overdue).toBe(30000); // 8/31が期限の3万だけ過ぎている
    expect(y.overdueCount).toBe(1);
    expect(y.dueIn).toBe(-10); // 10日過ぎた
  });
  it("決め方を決めていない店は、今までどおり期限なし（止めない）", () => {
    const r = C.receivables(sales, [], { today: "2026-09-10" });
    r.forEach((x) => {
      expect(x.due).toBe("");
      expect(x.dueIn).toBe(null);
      expect(x.overdue).toBe(0);
    });
  });
  it("入金で埋まった売上は、期限からも外れる", () => {
    const pays = [C.normalizePayment({ name: "山本商事", ymd: "2026-09-01", amount: 30000 }, "x")];
    const y = C.receivables(sales, pays, Object.assign({}, opt, { today: "2026-09-10" })).filter(
      (x) => x.name === "山本商事"
    )[0];
    expect(y.left).toBe(20000);
    expect(y.due).toBe("2026-09-30"); // 残っているのは翌月末の分だけ
    expect(y.overdue).toBe(0);
  });
  it("期限が近い順に並べ替えられる（期限なしは後ろ）", () => {
    const r = C.receivables(sales, [], Object.assign({}, opt, { order: "due" }));
    expect(r.map((x) => x.name)).toEqual(["山本商事", "田中"]);
    // 期限を決めていない相手は後ろへ
    const mixed = C.receivables(sales, [], {
      today: "2026-08-20",
      order: "due",
      terms: { 山本商事: { kind: "none", n: 0 } },
      tsukeTerm: { kind: "days", n: 30 },
    });
    expect(mixed.map((x) => x.name)).toEqual(["田中", "山本商事"]);
  });
});

describe("宛先に支払いの約束を持たせる", () => {
  it("クラウドに行って戻っても、約束は消えない", () => {
    const p = C.normalizePartner(
      { name: "山本商事", term: { kind: "nextDay", n: 25 } },
      "2026-08-04T00:00:00.000Z"
    );
    expect(p.term).toEqual({ kind: "nextDay", n: 25 });
    const back = C.partnerFromRow(C.partnerToRow(p));
    expect(back.term).toEqual({ kind: "nextDay", n: 25 });
  });
  it("前からある宛先（約束なし）は「決めていない」になる", () => {
    const back = C.partnerFromRow({ name: "田中商店" });
    expect(back.term).toEqual({ kind: "none", n: 0 });
  });
});
