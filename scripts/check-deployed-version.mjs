/* check-deployed-version.mjs — ★配信されている物が、今のコードと同じ版か★
 *
 * なぜ要るか（2026-08-18 に exally で実際に起きた／指示役から全アプリへ）:
 *   直しを push し、CI(GitHub Actions)も緑になった。★それでも配信は前の版のままだった。★
 *   GitHub → Vercel の合図(webhook)が届かず、★ビルドが失敗したのではなく 始まってすらいなかった★。
 *   その間、客の画面は 81% が #ERROR のままだった。
 *   ★「push した」「CIが緑」「repoに入っている」は、どれも「客に届いた」ではない。★
 *
 * ★正本は exally の scripts/check-deployed-version.mjs（考え方の出どころ）★
 *   ただし ★1バイトの借り物には出来ない★。刻印の作り方が2つのアプリで違う（実測）:
 *     exally  … 全JS/CSSから ★1個★ の版を作り、画面に1回だけ押す（buildHash）
 *     飲み屋  … ★1本ずつ★ 中身のハッシュ8桁を押す（scripts/stamp-assets.mjs の versionOf）
 *   そのまま持ってくると「押してある版」と「比べる版」が別物になり、
 *   ★何も見ていないのに緑★ になる。だから ★飲み屋の刻印で同じ事を測る★。
 *   ＝版の作り方は stamp-assets.mjs だけが知っている（ここでハッシュを作り直さない）。
 *
 * 何を見るか
 *   ① 配信されている nomiya-uriage.html の ?v=… が、★手元の中身から作った版★と同じか
 *   ② ★呼ばれる側まで配信に実在するか★（200か・中身のハッシュも合うか）
 *      ＝ HTMLだけ新しくて部品が404だと、★押した時に初めて死ぬ★
 *
 * どこで回すか: ★通常CI(ci.yml)には入れない★。外の都合（Vercelの混雑・配信の途中）で
 *   赤くなると、自分のせいでない赤で push が止まり、赤そのものが信用されなくなる。
 *   → .github/workflows/hosts.yml で 週1＋手動。
 *   ★push の直後は「まだ配信されていない」で赤になるのが正しい★（それが見たい物）。
 *
 * 使い方: node scripts/check-deployed-version.mjs
 *         node scripts/check-deployed-version.mjs --host https://nomiya-app.vercel.app
 *         node scripts/check-deployed-version.mjs --json
 *         node scripts/check-deployed-version.mjs --self-test   ★判定が空振りしていないか（外へ出ない）
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { assetRefs, versionOf } from "./stamp-assets.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "nomiya-uriage.html";

/** このrepoが養っている配信はどれか（★フォルダ名ではなく package.json の名前で決める★） */
export function defaultHost(root = ROOT) {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  return pkg.name === "nomiya-app"
    ? "https://nomiya-app.vercel.app"
    : "https://nomiya-app-test.vercel.app";
}

const sha8 = (buf) => crypto.createHash("sha256").update(buf).digest("hex").slice(0, 8);

/** 配信されたHTMLと、手元の中身を突き合わせる（通信はしない＝ここが判定の全部） */
export function judgePage(deployedHtml, root = ROOT) {
  const refs = assetRefs(deployedHtml);
  const rows = refs.map((r) => {
    const here = fs.existsSync(path.join(root, r.file)) ? versionOf(root, r.file) : null;
    const there = (r.raw.split("?v=")[1] || "").trim();
    return { file: r.file, 手元: here, 配信: there, ok: !!here && here === there };
  });
  return rows;
}

/** 呼ばれる側（js/css）が配信に実在して、中身まで同じか */
export async function judgeAssets(host, rows, get) {
  const out = [];
  for (const r of rows) {
    const url = host + "/" + r.file + (r.配信 ? "?v=" + r.配信 : "");
    const res = await get(url);
    out.push({
      file: r.file,
      status: res.status,
      中身: res.body == null ? null : sha8(res.body),
      ok: res.status === 200 && res.body != null && sha8(res.body) === r.手元,
    });
  }
  return out;
}

/** 通信する側（差し替えられる＝試験は偽の網で回す） */
async function httpGet(url) {
  const res = await fetch(url, { redirect: "follow" });
  const buf = Buffer.from(await res.arrayBuffer());
  return { status: res.status, body: buf };
}

export async function check({ host, root = ROOT, get = httpGet } = {}) {
  const h = (host || defaultHost(root)).replace(/\/$/, "");
  const page = await get(h + "/" + PAGE);
  if (page.status !== 200) {
    return { host: h, 届いた: false, 理由: PAGE + " が " + page.status, 版: [], 部品: [] };
  }
  const rows = judgePage(page.body.toString("utf8"), root);
  const assets = await judgeAssets(h, rows, get);
  const ng版 = rows.filter((r) => !r.ok);
  const ng部品 = assets.filter((a) => !a.ok);
  return {
    host: h,
    届いた: rows.length > 0 && !ng版.length && !ng部品.length,
    理由: !rows.length
      ? "版が1本も押されていない（stamp を忘れている）"
      : ng版.length
        ? "配信の版が古い " + ng版.length + " 本"
        : ng部品.length
          ? "呼ばれる側が届いていない " + ng部品.length + " 本"
          : "",
    版: rows,
    部品: assets,
    叩いた回数: rows.length + 1,
  };
}

/* ★この見張りが「何も見ていない」まま緑にならないか、その場で確かめる★
   （壊した入力を渡して、必ず赤になる事を数える。外へは1回も出ない） */
export function selfTest(root = ROOT) {
  const html = fs.readFileSync(path.join(root, PAGE), "utf8");
  const good = judgePage(html, root);
  if (!good.length) throw new Error("自己確認: 版が1本も見つからない＝何も見ていない");
  if (good.some((r) => !r.ok)) throw new Error("自己確認: 手元の版が揃っていない（npm run stamp）");
  const broken = html.replace(/\?v=[0-9a-f]{8}/, "?v=deadbeef");
  const bad = judgePage(broken, root);
  if (bad.filter((r) => !r.ok).length !== 1) throw new Error("自己確認: 1本 古くしても赤くならない");
  return { 見ている本数: good.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const at = (k) => (argv.indexOf(k) >= 0 ? argv[argv.indexOf(k) + 1] : null);
  if (argv.includes("--self-test")) {
    const r = selfTest();
    console.log("自己確認 OK（" + r.見ている本数 + " 本を見ている／1本 古くすれば赤くなる）");
  } else {
    const r = await check({ host: at("--host") });
    if (argv.includes("--json")) console.log(JSON.stringify(r, null, 2));
    else {
      console.log("配信: " + r.host);
      for (const v of r.版) console.log((v.ok ? "  合う  " : "★古い★") + v.file + " 配信=" + v.配信 + " 手元=" + v.手元);
      for (const a of r.部品) if (!a.ok) console.log("★届いていない★" + a.file + " status=" + a.status);
      console.log(r.届いた ? "★客に届いている★" : "★届いていない★ " + r.理由);
      console.log("叩いた回数: " + (r.叩いた回数 || 1));
    }
    if (!r.届いた) process.exit(1);
  }
}
