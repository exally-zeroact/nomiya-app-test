/* 試験に「今日が何月か」を書き込まないための小道具（指示役／経営者 2026-09-02）
 * ------------------------------------------------------------------------------
 *  ★実際に起きた事★ 2026-09-01 を過ぎた瞬間、飲み屋の試験14本が赤になった。
 *  中身も画面も壊れていない。★試験が「今月＝8月」を前提にしていただけ★。
 *    ・売上帳／集計 は ★今月★ を見る → 8月に入れた売上が 0件に見える
 *    ・請求書は ★今月分★ を見る → 8月の相手が 選べない
 *  ★直し方は2つだけ★
 *    ① 見る期間を ★狙いの月に合わせる★（このファイル）
 *    ② 日付を ★きょう★ にする（月をまたいでも同じ結果になる）
 *  ★どの月に走らせても同じ答えになる★ことを、この道具で守る。
 */

/** きょう（★ローカル時刻★。toISOString は UTC で前日になるので使わない） */
export async function todayYmd(page) {
  return await page.evaluate(() => {
    const d = new Date();
    const p2 = (n) => String(n).padStart(2, "0");
    return d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate());
  });
}

/** いま見えている期間の帯を押して、期間を決める（画面ごとに帯が違うので「見えている帯」） */
export async function usePeriod(page, from, to) {
  const lb = page.locator(".period-lb:visible");
  await lb.click();
  await page.locator("#mdFrom").fill(from);
  await page.locator("#mdTo").fill(to);
  await page.locator("#mdOk").click();
}

/** 請求書タブの月を、狙いの月まで ◀▶ で動かす（★何回押すかは 走らせた日で変わる★）
 *  ★画面に出ている字から読む★（中の変数名に頼らない＝名前が変わっても嘘の緑にならない） */
export async function useInvMonth(page, ym) {
  const want = +ym.slice(0, 4) * 12 + +ym.slice(5, 7);
  const read = async () => {
    const t = (await page.locator("#periodInv .period-lb").innerText()).trim();
    const m = t.match(/(\d+)年(\d+)月分/);
    if (!m) throw new Error("月の帯が読めない: " + t);
    return +m[1] * 12 + +m[2];
  };
  for (let i = 0; i < 60; i++) {
    const now = await read();
    if (now === want) return;
    await page.locator(`#periodInv [data-imv="${now > want ? -1 : 1}"]`).click();
  }
  throw new Error("請求書の月を " + ym + " に合わせられなかった");
}
