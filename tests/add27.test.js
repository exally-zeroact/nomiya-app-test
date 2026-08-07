/* 源泉徴収（所得税法204条1項6号＝ホステス等の報酬）
   ------------------------------------------------------------------
   ★出典（国税庁 タックスアンサー No.2807「ホステス等に支払う報酬・料金」）
     「報酬・料金の額から、同一人に対し1回に支払われる金額について、
       5,000円にその報酬・料金の『計算期間の日数』を乗じて計算した金額を
       差し引いた残額に 10.21％ の税率を乗じて算出します」
     ★「計算期間の日数」＝「営業日数」でも「出勤日数」でもなく、
       支払金額の計算の基礎となった期間の初日から末日までの★全日数（暦日）★。
   ------------------------------------------------------------------
   これまでは「支払額 × 10.21％」だけで、5,000円×日数 を引いていなかった＝★引き過ぎ★。
   ※Kyually には6号の式は入っていない（docs/SPEC_gensen_shiharai_tax_K3.md で
     「実需が薄いので A/B/C だけ実装し、他は非該当扱いに逃がす」と明記）。
     なので流用元が無く、国税庁の一次情報から作った。 */
import { describe, it, expect } from "vitest";
import C from "../nomiya-core.js";

describe("㉗-① 6号の式そのもの（国税庁の言い回しどおり）", () => {
  it("1日分（日払い）：20,000円・1日 → (20,000−5,000)×10.21% = 1,531円", () => {
    expect(C.gensen6(20000, 1)).toBe(1531); // 15,000×0.1021=1531.5 → 切り捨て
  });
  it("1か月分：300,000円・31日 → (300,000−155,000)×10.21% = 14,804円", () => {
    expect(C.gensen6(300000, 31)).toBe(14804); // 145,000×0.1021=14804.5 → 切り捨て
  });
  it("2月の月末締め：200,000円・28日 → (200,000−140,000)×10.21% = 6,126円", () => {
    expect(C.gensen6(200000, 28)).toBe(6126); // 60,000×0.1021=6126
  });
  it("★控除しきったら0（マイナスにしない）：4,000円・1日 → 0", () => {
    expect(C.gensen6(4000, 1)).toBe(0);
  });
  it("★境界：ちょうど5,000円・1日 → 0（残額0）", () => {
    expect(C.gensen6(5000, 1)).toBe(0);
  });
  it("★境界：5,001円・1日 → 1円×10.21%＝0円（切り捨て）", () => {
    expect(C.gensen6(5001, 1)).toBe(0);
  });
  it("★境界：5,010円・1日 → 10×0.1021=1.021 → 1円", () => {
    expect(C.gensen6(5010, 1)).toBe(1);
  });
  it("1か月分でも稼ぎが少なければ0：100,000円・31日（控除155,000）→ 0", () => {
    expect(C.gensen6(100000, 31)).toBe(0);
  });
  it("日数が0や変な値なら、控除なしで計算する（勝手に引き過ぎない側に倒さない）", () => {
    expect(C.gensen6(20000, 0)).toBe(2042);
    expect(C.gensen6(20000, null)).toBe(2042);
  });
  it("★出勤日数ではなく、期間の暦日数で引く（8日出た月末締めでも31日分）", () => {
    // 8日しか出ていなくても、計算期間が31日なら 5,000×31 を引く
    expect(C.gensen6(300000, 31)).toBe(14804);
    expect(C.gensen6(300000, 8)).not.toBe(14804);
  });
  it("率を店が変えたときも、5,000円×日数の控除は残る", () => {
    expect(C.gensen6(20000, 1, 20.42)).toBe(3063); // 15,000×0.2042=3063
  });
});

describe("㉗-② 計算期間の日数（初日から末日までの全日数）", () => {
  it("同じ日なら1日", () => {
    expect(C.periodDays("2026-08-01", "2026-08-01")).toBe(1);
  });
  it("8月は31日", () => {
    expect(C.periodDays("2026-08-01", "2026-08-31")).toBe(31);
  });
  it("うるう年の2月は29日", () => {
    expect(C.periodDays("2028-02-01", "2028-02-29")).toBe(29);
  });
  it("うるう年でない2月は28日", () => {
    expect(C.periodDays("2026-02-01", "2026-02-28")).toBe(28);
  });
  it("16日〜翌15日の締めは31日（月をまたぐ）", () => {
    expect(C.periodDays("2026-07-16", "2026-08-15")).toBe(31);
  });
  it("週払いは7日", () => {
    expect(C.periodDays("2026-08-03", "2026-08-09")).toBe(7);
  });
  it("日付が変なら0", () => {
    expect(C.periodDays("", "2026-08-31")).toBe(0);
  });
});

describe("㉗-③ 実際の給料での引き方（1回の支払いごと）", () => {
  const staff = (over) =>
    Object.assign(
      {
        id: "s1",
        name: "あや",
        alive: true,
        employ: "contract",
        cycle: "daily",
        payAfter: 0,
        wage: 0,
        useItems: { time: true, guarantee: true },
        guarantee: 20000,
      },
      over || {}
    );
  const work = (ymd) => ({ id: "w" + ymd, staffId: "s1", ymd, in: "20:00", out: "24:00" });
  const cfg = { gensen: true };

  it("★日払い：1日ぶんの支払いなので、5,000円×1日を引く", () => {
    const d = C.payDay(staff(), work("2026-08-01"), { settings: cfg });
    expect(d.gross).toBe(20000);
    expect(d.gensen, "引き過ぎている（5,000円の控除が無い）").toBe(1531);
  });

  it("★月末締め：1か月ぶんをまとめて払うので、5,000円×その月の日数を引く", () => {
    const works = [];
    for (let i = 1; i <= 8; i++) works.push(work("2026-08-" + String(i).padStart(2, "0")));
    const t = C.paySummary(staff({ cycle: "monthly" }), works, [], "2026-08-01", "2026-08-31", {
      settings: cfg,
    });
    expect(t.days).toBe(8);
    expect(t.gross).toBe(160000); // 20,000 × 8日
    // ★8日しか出ていなくても、計算期間は31日 → 5,000×31=155,000 を引く
    expect(t.gensen).toBe(C.gensen6(160000, 31));
    expect(t.gensen).toBe(510); // (160,000−155,000)×0.1021=510.5 → 510
    expect(t.deduct).toBe(510);
    expect(t.net).toBe(160000 - 510);
  });

  it("★日払いの人を1か月ぶん見たときは、日ごとの合計のまま（1回ずつ払っているから）", () => {
    const works = [work("2026-08-01"), work("2026-08-02")];
    const t = C.paySummary(staff(), works, [], "2026-08-01", "2026-08-31", { settings: cfg });
    expect(t.gensen).toBe(1531 * 2);
  });

  it("15日締めは、その区切りの日数で引く（月をまたぐ31日）", () => {
    const works = [work("2026-07-20"), work("2026-08-10")];
    const t = C.paySummary(staff({ cycle: "half" }), works, [], "2026-07-16", "2026-08-15", {
      settings: cfg,
    });
    expect(t.gross).toBe(40000);
    expect(t.gensen).toBe(C.gensen6(40000, 31)); // 40,000 < 155,000 → 0
    expect(t.gensen).toBe(0);
  });

  it("源泉を使わない店は、今までどおり1円も引かない", () => {
    const t = C.paySummary(
      staff({ cycle: "monthly" }),
      [work("2026-08-01")],
      [],
      "2026-08-01",
      "2026-08-31",
      {
        settings: {},
      }
    );
    expect(t.gensen).toBe(0);
    expect(t.net).toBe(20000);
  });

  it("雇用の人（従業員）からは、ここでは引かない（税額表が別なので）", () => {
    const t = C.paySummary(
      staff({ cycle: "monthly", employ: "employee" }),
      [work("2026-08-01")],
      [],
      "2026-08-01",
      "2026-08-31",
      { settings: cfg }
    );
    expect(t.gensen).toBe(0);
  });
});
