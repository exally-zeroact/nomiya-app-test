/* compare-repos.mjs — テストrepoと本番repoの中身を突き合わせる。
 * ------------------------------------------------------------------------------
 *  使い方:  npm run compare            （相手repoは隣の同じ場所を自動で探す）
 *           npm run compare -- <相手のパス>
 *
 * ★なぜ要るか★
 *   飲み屋は nomiya-app（本番）と nomiya-app-test（テスト）の2つのrepoで動いている。
 *   ★中身は同じで、違ってよいのは下の4本だけ★という決まりだった。
 *   ところが 2026-08-07 に数えたら、この決まりを見張る道具がどこにも無かった。
 *   （README と tests/nomiya-deploy.test.js には「違うのは supa-config の1本だけ」と
 *     書いてあったが、★実際は4本違っていた★＝書いてある決まりと実物がズレていた）
 *   画面のJSを7本に分けて配るファイルが増えたので、
 *   ★片方のrepoにだけ入れ忘れる★事故の面積が広がった。だから機械で数える。
 *
 * ★CIでは走らない★
 *   CIには相手のrepoが無い（別のrepoなので）。これは手元専用＝
 *   ★本番へ出す前に必ず1回打つ★という使い方をする。
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** 違っていてよいファイル（それぞれ理由がある） */
const ALLOWED = {
  "js/supa-config.js": "どの倉庫を見るか（テスト＝DB-test / 本番＝本番倉庫）",
  "package.json": "repoの名前と説明",
  "package-lock.json": "repoの名前",
  "CLAUDE.md": "そのrepo向けの作業の決まり",
};

const other =
  process.argv[2] ||
  path.join(
    path.dirname(ROOT),
    path.basename(ROOT).endsWith("-test")
      ? path.basename(ROOT).replace(/-test$/, "")
      : path.basename(ROOT) + "-test"
  );

if (!fs.existsSync(path.join(other, ".git"))) {
  console.error(`相手のrepoが見つからない: ${other}`);
  console.error("　npm run compare -- <相手のパス>  で場所を渡してください");
  process.exit(1);
}

const tracked = (dir) =>
  execFileSync("git", ["-C", dir, "ls-files"], { encoding: "utf8" })
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

const hash = (dir, rel) => {
  const p = path.join(dir, rel);
  if (!fs.existsSync(p)) return null;
  return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
};

const mine = tracked(ROOT);
const theirs = tracked(other);
const all = [...new Set([...mine, ...theirs])].sort();

const onlyMine = mine.filter((f) => !theirs.includes(f));
const onlyTheirs = theirs.filter((f) => !mine.includes(f));
const differ = [];
for (const f of all) {
  if (!mine.includes(f) || !theirs.includes(f)) continue;
  if (hash(ROOT, f) !== hash(other, f)) differ.push(f);
}

console.log(`こちら : ${ROOT}  (${mine.length}本)`);
console.log(`あちら : ${other}  (${theirs.length}本)`);
console.log("");

const unexpected = differ.filter((f) => !(f in ALLOWED));
const missingAllowed = Object.keys(ALLOWED).filter(
  (f) => mine.includes(f) && theirs.includes(f) && !differ.includes(f)
);

console.log("★違ってよい物★");
for (const f of Object.keys(ALLOWED)) {
  const mark = differ.includes(f) ? "違う" : missingAllowed.includes(f) ? "同じ" : "無い";
  console.log(`  ${mark}  ${f}  … ${ALLOWED[f]}`);
}

let ng = false;
if (onlyMine.length || onlyTheirs.length) {
  ng = true;
  console.log("");
  console.log("★片方にしか無いファイル★（＝入れ忘れ）");
  onlyMine.forEach((f) => console.log(`  こちらだけ: ${f}`));
  onlyTheirs.forEach((f) => console.log(`  あちらだけ: ${f}`));
}
if (unexpected.length) {
  ng = true;
  console.log("");
  console.log("★中身が違う（違ってよい物ではない）★");
  unexpected.forEach((f) => console.log(`  ${f}`));
}

console.log("");
if (ng) {
  console.log("COMPARE RESULT: NG（上の食い違いを直してから本番へ）");
  process.exit(1);
}
console.log(`COMPARE RESULT: OK（違うのは決めた ${differ.length} 本だけ／${mine.length}本を突合）`);
