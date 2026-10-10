/* pre-push-author.mjs — ★commit の 作者・commit した人の メールを 公開 repo に 出さない★（2026-10-11 司さん「アドレスが分からんようにしろや」）
 *
 *   まだ 遠くに 無い commit の 作者（%ae）と commit した人（%ce）が、
 *   GitHub の noreply（数字+名前@users.noreply.github.com）か GitHub 自身（noreply@github.com）で なければ 止める。
 *   ★メールの 字は 出さない★（SHA と どの 欄か だけ）。
 *
 *   置き方（repo ごとに 1回）: git config --local core.hooksPath .githooks
 *                              git config --local user.email 271668854+exally-zeroact@users.noreply.github.com
 *   過去の commit は 書き換えない（決め7）＝見るのは これから 押す 物だけ。
 *
 *   使い方（git が 呼ぶ）: 標準入力に「<手元の ref> <手元の sha> <遠くの ref> <遠くの sha>」の 行
 *   自分で 確かめる:       node .githooks/pre-push-author.mjs --self-test
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ZERO = /^0+$/;
export const OK_MAIL = /^(\d+\+[^@\s]+@users\.noreply\.github\.com|noreply@github\.com)$/i;

const git = (cwd, ...a) => execFileSync("git", ["-C", cwd, ...a], { encoding: "utf8" }).trim();

/* 押す 行ごとに、まだ 遠くに 無い commit を 並べ、欄が noreply で ない 物を 返す */
export function badCommits(cwd, lines) {
  const bad = [];
  let seen = 0;
  for (const line of lines) {
    const [, localSha, , remoteSha] = line.trim().split(/\s+/);
    if (!localSha || ZERO.test(localSha)) continue; // 消す push
    const range =
      remoteSha && !ZERO.test(remoteSha)
        ? [localSha, "^" + remoteSha]
        : [localSha, "--not", "--remotes"];
    const out = git(cwd, "rev-list", ...range);
    for (const sha of out ? out.split("\n") : []) {
      seen++;
      const [ae, ce] = git(cwd, "log", "-1", "--format=%ae%n%ce", sha).split("\n");
      if (!OK_MAIL.test(ae || "")) bad.push(sha + " の 作者の 欄");
      if (!OK_MAIL.test(ce || "")) bad.push(sha + " の commit した人の 欄");
    }
  }
  return { bad, seen };
}

function selfTest() {
  let pass = 0;
  let fail = 0;
  const T = (n, fn) => {
    try {
      fn();
      pass++;
      console.log("  ✓ " + n);
    } catch (e) {
      fail++;
      console.log("  ✗ " + n + " … " + e.message);
    }
  };
  const must = (v, m) => {
    if (!v) throw new Error(m);
  };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ppa-"));
  const g = (...a) => execFileSync("git", ["-C", tmp, ...a], { stdio: "pipe" });
  const commit = (mail, msg) => {
    fs.writeFileSync(path.join(tmp, msg + ".txt"), msg);
    g("add", "-A");
    g("-c", "user.name=x", "-c", "user.email=" + mail, "commit", "-q", "-m", msg);
    return git(tmp, "rev-parse", "HEAD");
  };
  g("init", "-q");
  const NR = "1+ok@users.noreply.github.com";
  const a = commit(NR, "a");
  const b = commit("someone@example.com", "b");
  const c = commit(NR, "c");
  T("noreply の 欄は 通す・GitHub 自身も 通す・ふつうの メールは 止める", () => {
    must(OK_MAIL.test(NR) && OK_MAIL.test("noreply@github.com"), "noreply を 止めた");
    must(OK_MAIL.test("41898282+github-actions[bot]@users.noreply.github.com"), "bot を 止めた");
    must(
      !OK_MAIL.test("someone@example.com") && !OK_MAIL.test("x@users.noreply.github.com.evil"),
      "ふつうの メールを 通した"
    );
  });
  T("遠くに 無い commit だけ 見る（遠くの sha より 後ろ）", () => {
    const r = badCommits(tmp, ["refs/heads/main " + c + " refs/heads/main " + b]);
    must(r.seen === 1 && r.bad.length === 0, "後ろの 1本だけで ない: " + r.seen);
    const r2 = badCommits(tmp, ["refs/heads/main " + c + " refs/heads/main " + a]);
    must(r2.seen === 2 && r2.bad.length === 2, "間の ふつうの メールを 見逃した");
  });
  T("出しに メールの 字が 出ない（SHA と 欄だけ）", () => {
    const r = badCommits(tmp, ["refs/heads/main " + c + " refs/heads/main " + a]);
    must(
      !r.bad.join("\n").includes("example.com") && r.bad.every((x) => x.includes(b)),
      "字が 出た か SHA が 無い"
    );
  });
  T("消す push は 見ない", () => {
    must(
      badCommits(tmp, ["(delete) " + "0".repeat(40) + " refs/heads/x " + c]).seen === 0,
      "消す push を 見た"
    );
  });
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("自己確認: " + pass + "/" + (pass + fail));
  return fail ? 1 : 0;
}

if (process.argv.includes("--self-test")) process.exit(selfTest());
const input = fs.readFileSync(0, "utf8").split(/\r?\n/).filter(Boolean);
const { bad, seen } = badCommits(process.cwd(), input);
if (bad.length) {
  console.error(
    "✗ 押すのを 止めた：commit の メールが noreply で ない（" + bad.length + " 件・字は 出さない）"
  );
  for (const x of bad) console.error("  " + x);
  console.error(
    "  直し方：git config --local user.email 271668854+exally-zeroact@users.noreply.github.com の 後に 作り直す"
  );
  process.exit(1);
}
console.log("✓ commit の メールは 全部 noreply（" + seen + " 本を 見た）");
