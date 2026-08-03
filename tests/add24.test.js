/* 司さんの指摘 8件のうち、計算の本体（core）で決まる分。
   ここが正。画面はこれを出すだけ。 */
import { describe, it, expect } from "vitest";
import { createRequire } from "module";
const C = createRequire(import.meta.url)("../nomiya-core.js");

describe("① 集計は「組」に対しての割合も出す", () => {
  const sales = [
    C.normalizeSale({ id: "a", date: "2026-07-01", name: "1", amount: 10000, pay: "cash" }, "x"),
    C.normalizeSale({ id: "b", date: "2026-07-01", name: "2", amount: 1000, pay: "cash" }, "x"),
    C.normalizeSale({ id: "c", date: "2026-07-01", name: "3", amount: 9000, pay: "tsuke" }, "x"),
  ];
  it("支払い方法別：金額の割合と、組の割合を両方持つ", () => {
    const r = C.byPayMethod(sales);
    const cash = r.filter((x) => x.key === "cash")[0];
    const tsuke = r.filter((x) => x.key === "tsuke")[0];
    // 金額 11,000/20,000＝55%。組は 2/3＝67%（金額だけ見ていると「現金が多い」を見誤る）
    expect(Math.round(cash.ratio * 100)).toBe(55);
    expect(Math.round(cash.countRatio * 100)).toBe(67);
    expect(Math.round(tsuke.ratio * 100)).toBe(45);
    expect(Math.round(tsuke.countRatio * 100)).toBe(33);
  });
  it("領収書別も同じように持つ", () => {
    const r = C.byReceipt(sales);
    expect(r.map((x) => Math.round(x.countRatio * 100)).reduce((a, b) => a + b, 0)).toBe(100);
  });
  it("1件も無い期間でも壊れない（0で返す）", () => {
    C.byPayMethod([]).forEach((x) => expect(x.countRatio).toBe(0));
  });
});

describe("② 給料の使う項目は、足したばかりの人は「なし」から選ぶ", () => {
  it("emptyUse は、決まった項目も店が足した種類も全部オフで返す", () => {
    const u = C.emptyUse([{ key: "champagne", label: "シャンパン" }]);
    expect(u.shimei).toBe(false);
    expect(u.rate).toBe(false);
    expect(u.champagne).toBe(false);
    expect(C.staffUses({ use: u }, "shimei")).toBe(false);
  });
  it("前からいる人（use が空）は今までどおり全部オン＝数字が変わらない", () => {
    expect(C.staffUses({ use: {} }, "shimei")).toBe(true);
    expect(C.staffUses({}, "bottle")).toBe(true);
  });
  it("オフの印はクラウドに行って戻っても残る", () => {
    const st = C.normalizeStaff({ id: "a", name: "あかり", use: C.emptyUse([]) }, "x");
    const back = C.staffFromRow(C.staffToRow(st));
    expect(C.staffUses(back, "shimei")).toBe(false);
    expect(C.staffUses(back, "rate")).toBe(false);
  });
});

describe("③ 同伴は1回だけ（本数はいらない）", () => {
  it("何も決めていない店では、同伴だけ「1回だけ」になる", () => {
    const k = C.backKinds({});
    expect(k.filter((x) => x.key === "douhan")[0].once).toBe(true);
    expect(k.filter((x) => x.key === "bottle")[0].once).toBe(false);
  });
  it("店が決めた種類でも once を持てる（要る店は本数に戻せる＝止めない）", () => {
    const k = C.backKinds({
      backKinds: [
        { key: "douhan", label: "同伴" },
        { key: "afuta", label: "アフター", once: true },
      ],
    });
    expect(k[0].once).toBe(true); // 決め打ちの同伴は既定で1回だけ
    expect(k[1].once).toBe(true);
    const k2 = C.backKinds({ backKinds: [{ key: "douhan", label: "同伴", once: false }] });
    expect(k2[0].once).toBe(false);
  });
  it("1回だけの種類は、2と打っても1回として数える", () => {
    const st = C.normalizeStaff({ id: "a", name: "あかり", back: { douhan: 3000 } }, "x");
    const w = C.normalizeWork(
      { id: "w", ymd: "2026-08-01", staffId: "a", count: { douhan: 2 } },
      "x"
    );
    const d = C.payDay(st, w, {});
    const douhan = d.backs.filter((x) => x.key === "douhan")[0];
    expect(douhan.count).toBe(1);
    expect(douhan.amount).toBe(3000);
  });
});

describe("⑥ 出勤・退勤は打って入れられる", () => {
  it("2000 と打てば 20:00 になる", () => {
    expect(C.normalizeTime("2000")).toBe("20:00");
    expect(C.normalizeTime("930")).toBe("09:30");
    expect(C.normalizeTime("9")).toBe("09:00");
    expect(C.normalizeTime("20:5")).toBe("20:05");
    expect(C.normalizeTime("20：00")).toBe("20:00"); // 全角のコロン
    expect(C.normalizeTime("２０００")).toBe("20:00"); // 全角の数字
  });
  it("そのままの形も通す", () => {
    expect(C.normalizeTime("20:00")).toBe("20:00");
    expect(C.normalizeTime("01:00")).toBe("01:00");
  });
  it("入れていない・読めない物は空で返す（勝手な時刻を作らない）", () => {
    expect(C.normalizeTime("")).toBe("");
    expect(C.normalizeTime(null)).toBe("");
    expect(C.normalizeTime("あ")).toBe("");
    expect(C.normalizeTime("2560")).toBe(""); // 25時60分は無い
    expect(C.normalizeTime("99")).toBe("");
  });
  it("打った物がそのまま計算に使われる（20:00〜翌1:00＝5時間）", () => {
    const st = C.normalizeStaff({ id: "a", name: "あかり", hourly: 1200 }, "x");
    const w = C.normalizeWork(
      {
        id: "w",
        ymd: "2026-08-01",
        staffId: "a",
        inAt: C.normalizeTime("2000"),
        outAt: C.normalizeTime("100"),
      },
      "x"
    );
    expect(C.payDay(st, w, {}).minutes).toBe(300);
  });
});

describe("⑦ 選んだ項目は、明細にも一覧にも全部出す", () => {
  const settings = {};
  const st = C.normalizeStaff(
    {
      id: "a",
      name: "あかり",
      hourly: 0,
      back: { shimei: 2000, jonai: 1500, douhan: 3000, drink: 500, bottle: 1000 },
    },
    "x"
  );
  const works = [
    C.normalizeWork(
      { id: "w1", ymd: "2026-08-01", staffId: "a", count: { shimei: 2, jonai: 1, douhan: 1 } },
      "x"
    ),
  ];
  it("バックの内訳を種類ごとに持つ（場内指名も消えない）", () => {
    const t = C.paySummary(st, works, [], "2026-08-01", "2026-08-31", { settings });
    expect(t.counts.jonai).toBe(1);
    expect(t.backAmts.jonai).toBe(1500);
    expect(t.backAmts.shimei).toBe(4000);
    expect(t.backAmts.douhan).toBe(3000);
    // 打っていない種類も 0 で並ぶ（列が消えない＝紙の形が毎月変わらない）
    expect(t.backAmts.drink).toBe(0);
    expect(t.backAmts.bottle).toBe(0);
    // 内訳の合計＝バックの合計
    expect(Object.keys(t.backAmts).reduce((a, k) => a + t.backAmts[k], 0)).toBe(t.backTotal);
  });
  it("使わない項目を外した人は、その種類が内訳に出ない", () => {
    const st2 = C.normalizeStaff(Object.assign({}, st, { use: { jonai: false } }), "x");
    const t = C.paySummary(st2, works, [], "2026-08-01", "2026-08-31", { settings });
    expect(t.backAmts.jonai).toBeUndefined();
    expect(t.backAmts.shimei).toBe(4000);
  });
  it("一覧の列＝誰か1人でも使う種類だけ（誰も使わない種類で紙を汚さない）", () => {
    const list = [
      C.normalizeStaff({ id: "a", name: "あかり", use: { drink: false, bottle: false } }, "x"),
      C.normalizeStaff(
        { id: "b", name: "ゆい", use: { drink: false, bottle: false, douhan: false } },
        "x"
      ),
    ];
    expect(C.usedKinds(list, settings).map((x) => x.key)).toEqual(["shimei", "jonai", "douhan"]);
  });
  it("スタッフが0人でも壊れない（決め打ちの種類を返す）", () => {
    expect(C.usedKinds([], settings).length).toBe(5);
  });
});

describe("並べ替えは、同期しても巻き戻らない", () => {
  it("スタッフを動かすと、並びを書いた人みんなの「直した時刻」が新しくなる", () => {
    const a = C.normalizeStaff({ id: "a", name: "あかり" }, "2026-08-01T00:00:00.000Z");
    const b = C.normalizeStaff({ id: "b", name: "ゆい" }, "2026-08-01T00:00:00.000Z");
    const c = C.normalizeStaff({ id: "c", name: "みく" }, "2026-08-01T00:00:00.000Z");
    const now = "2026-08-03T10:00:00.000Z";
    const out = C.moveStaff([a, b, c], "c", -1, now);
    // 並べ替えは全員の ord を書き直すので、全員が「直した」ことになる。
    // ここで時刻を新しくしないと、クラウドの古い並びに負けて元へ戻る。
    out.forEach((x) => expect(x.updatedAt).toBe(now));
    expect(C.aliveStaff(out).map((x) => x.name)).toEqual(["あかり", "みく", "ゆい"]);
  });
  it("時刻が古いままだと、クラウドの古い並びに負ける（それを防ぐ）", () => {
    const list = [
      C.normalizeStaff({ id: "a", name: "あかり" }, "2026-08-01T00:00:00.000Z"),
      C.normalizeStaff({ id: "b", name: "ゆい" }, "2026-08-01T00:00:00.000Z"),
    ];
    const moved = C.moveStaff(list, "b", -1, "2026-08-03T10:00:00.000Z");
    const cloud = list; // クラウドにはまだ古い並びが入っている
    // 後勝ちの決まり（updatedAt が新しい方を採る）で、動かした方が残る
    const win = moved.map((m) => {
      const old = cloud.filter((x) => x.id === m.id)[0];
      return m.updatedAt >= old.updatedAt ? m : old;
    });
    expect(C.aliveStaff(win).map((x) => x.name)).toEqual(["ゆい", "あかり"]);
  });
  it("動かせないとき（端）は、時刻も触らない", () => {
    const list = [C.normalizeStaff({ id: "a", name: "あかり" }, "2026-08-01T00:00:00.000Z")];
    const out = C.moveStaff(list, "a", -1, "2026-08-03T10:00:00.000Z");
    expect(out[0].updatedAt).toBe("2026-08-01T00:00:00.000Z");
  });
});

describe("一覧の「数」の列は、本数で数える種類だけ", () => {
  const kindsOf = (list) => C.countedKinds(list, {}).map((x) => x.key);
  it("全員が％で決めている種類は、数の列に出さない（0しか出ないので）", () => {
    const list = [
      C.normalizeStaff(
        { id: "a", name: "あかり", back: { shimei: 2000 }, backPct: { bottle: 15 } },
        "x"
      ),
      C.normalizeStaff(
        { id: "b", name: "ゆい", back: { shimei: 1500 }, backPct: { bottle: 10 } },
        "x"
      ),
    ];
    expect(kindsOf(list)).toEqual(["shimei"]);
  });
  it("1人でも「1本いくら」で決めていれば、その種類は出す", () => {
    const list = [
      C.normalizeStaff({ id: "a", name: "あかり", backPct: { bottle: 15 } }, "x"),
      C.normalizeStaff({ id: "b", name: "ゆい", back: { bottle: 1000 } }, "x"),
    ];
    expect(kindsOf(list)).toContain("bottle");
  });
  it("誰も金額を決めていない種類は出さない（0が並ぶだけなので）", () => {
    const list = [C.normalizeStaff({ id: "a", name: "あかり", back: { shimei: 2000 } }, "x")];
    expect(kindsOf(list)).toEqual(["shimei"]);
  });
  it("使わない人しかいない種類は出さない", () => {
    const list = [
      C.normalizeStaff(
        { id: "a", name: "あかり", back: { drink: 300, shimei: 2000 }, use: { drink: false } },
        "x"
      ),
    ];
    expect(kindsOf(list)).toEqual(["shimei"]);
  });
  it("スタッフが0人でも壊れない", () => {
    expect(C.countedKinds([], {}).length).toBe(5);
  });
  it("明細のほうは、％の種類も出したまま（金額があるので消さない）", () => {
    const list = [C.normalizeStaff({ id: "a", name: "あかり", backPct: { bottle: 15 } }, "x")];
    expect(C.usedKinds(list, {}).map((x) => x.key)).toContain("bottle");
  });
});

describe("紙には、選んだ項目を全部のせる", () => {
  const settings = {};
  const st = C.normalizeStaff(
    {
      id: "a",
      name: "あかり",
      hourly: 1000,
      back: { shimei: 2000, jonai: 1500, douhan: 3000, drink: 500 },
      backPct: { bottle: 15 },
      rate: 10,
      guarantee: 50000,
      kousei: 1000,
    },
    "x"
  );
  const works = [
    C.normalizeWork(
      {
        id: "w1",
        ymd: "2026-08-01",
        staffId: "a",
        inAt: "20:00",
        outAt: "01:00",
        count: { shimei: 1 },
        amount: { bottle: 100000 },
        sales: 50000,
        fine: 2000,
        lend: 30000,
        repay: 5000,
      },
      "x"
    ),
  ];
  it("保証で足した分を、紙に出せるように持つ", () => {
    const t = C.paySummary(st, works, [], "2026-08-01", "2026-08-31", { settings });
    // 計算＝基本5,000＋バック(本指名2,000＋ボトル100,000×15%=15,000)＋歩合5,000 ＝ 27,000
    expect(t.earned).toBe(27000);
    // 保証50,000のほうが高いので、支給は50,000。足した分は23,000。
    expect(t.gross).toBe(50000);
    expect(t.guaranteeAdd).toBe(23000);
  });
  it("保証を使わなかった月は、足した分は0", () => {
    const st2 = C.normalizeStaff(Object.assign({}, st, { guarantee: 10000 }), "x");
    const t = C.paySummary(st2, works, [], "2026-08-01", "2026-08-31", { settings });
    expect(t.gross).toBe(27000);
    expect(t.guaranteeAdd).toBe(0);
  });
  it("紙に出す控除の内訳は、合計と必ず合う", () => {
    const t = C.paySummary(st, works, [], "2026-08-01", "2026-08-31", { settings });
    expect(t.kousei + t.fine + t.repay + t.gensen).toBe(t.deduct);
    expect(t.gross - t.deduct).toBe(t.net);
  });
  it("前借りは控除ではない（別で持つ）", () => {
    const t = C.paySummary(st, works, [], "2026-08-01", "2026-08-31", { settings });
    expect(t.lend).toBe(30000);
    expect(t.deduct).toBe(1000 + 2000 + 5000);
  });
});
