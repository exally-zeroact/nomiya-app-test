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
 *   ★門の 外（この 門では 止まらない＝紙に 書いて 人が 気を付ける）★
 *     ・--no-verify で 押す／core.hooksPath を 置いていない clone や 別の 機械で 押す
 *     ・GitHub の 画面の merge・squash・編集（作者の 欄は アカウントの 設定で 決まる）
 *     ・注釈付きの tag の tagger の 欄／commit の 本文に 書いた メール（Signed-off-by 等）
 *   新しい 枝の 範囲は ★押す 先の 遠く（$1）に 今 在る 頭★ から（ls-remote）。遠くの 名が 無い・読めない は 赤
 *   （前は --not --remotes＝他の remote の 追跡枝に 在る commit を 見なかった・10-11）。
 *   CI は この 門の 自己確認だけを する（遠くに 出た commit の メールは 数えていない）。
 *
 *   使い方（git が 呼ぶ）: 標準入力に「<手元の ref> <手元の sha> <遠くの ref> <遠くの sha>」の 行
 *   自分で 確かめる:       node .githooks/pre-push-author.mjs --self-test
 */
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ZERO = /^0+$/;
export const OK_MAIL = /^(\d+\+[^@\s]+@users\.noreply\.github\.com|noreply@github\.com)$/i;

const git = (cwd, ...a) => execFileSync("git", ["-C", cwd, ...a], { encoding: "utf8" }).trim();

/* ★押す 先の 遠く（hook の $1）に 今 在る 頭（ls-remote）の うち、手元に 在る 物★＝新しい 枝の 範囲の 下限。
   前の 形（--not --remotes）は 他の remote の 追跡枝・消された 枝の 古い 控えも「遠くに 在る」と 見て、
   新しい 枝の 字が 素通りした（10-11 アマかせ taiketsu 実測・remote 2 つの clone で「0 本」）。
   遠くの 名が 無い・読めない は throw（止める 側）。
   ★読む 先は hook の $2（実際に 押す 道）★：$1 の 名で 読むと fetch 側の 道を 読む＝pushurl・道 2 本の remote で
     押す 先と 取り違えて 偽の 緑（10-11 taiketsu 実測）。
   ★枝と タグだけ 読み、手元に 取っていない 頭が 在れば「fetch してから」で 止める★（全履歴を 赤に して
     作り直しへ 誘わない・10-11 taiketsu 実測＝古い 控えの clone で 128 件の 偽の 赤）。 */
export function remoteKnown(cwd, remote) {
  if (!remote) throw new Error("押す 先の 遠くの 名が 無い（hook の $1）");
  let out;
  try {
    out = execFileSync("git", ["-C", cwd, "ls-remote", "--heads", "--tags", remote], {
      encoding: "utf8",
      maxBuffer: 1 << 28,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    throw new Error("押す 先の 遠くの 頭を 読めない（ls-remote）");
  }
  const shas = [
    ...new Set(
      out
        .split("\n")
        .map((l) => l.split("\t")[0])
        .filter((x) => /^[0-9a-f]{40,64}$/.test(x))
    ),
  ];
  if (!shas.length) return [];
  const have = execFileSync("git", ["-C", cwd, "cat-file", "--batch-check"], {
    input: shas.join("\n") + "\n",
    encoding: "utf8",
    maxBuffer: 1 << 28,
  });
  const missing = have.split("\n").filter((l) => / missing$/.test(l)).length;
  if (missing)
    throw new Error(
      "押す 先の 遠くに、手元に 取っていない 頭が " +
        missing +
        " 本 在る＝git fetch してから 押す（commit は 作り直さない）"
    );
  return have
    .split("\n")
    .filter((l) => / (commit|tag) /.test(l))
    .map((l) => l.split(" ")[0]);
}
/* 自己確認用：別の repo で 作った commit を 遠くの 枝に 置く（手元に 無い 頭） */
function foreignHead(tmp, bare, ref) {
  const x = fs.mkdtempSync(path.join(tmp, "x-"));
  const gx = (...a) => execFileSync("git", ["-C", x, ...a], { stdio: "pipe" });
  gx("init", "-q");
  fs.writeFileSync(path.join(x, "f.txt"), "よそ\n");
  gx("add", "-A");
  gx(
    "-c",
    "user.name=x",
    "-c",
    "user.email=1+x@users.noreply.github.com",
    "commit",
    "-q",
    "-m",
    "f"
  );
  gx("push", "-q", bare, "HEAD:" + ref);
  return () => gx("push", "-q", bare, ":" + ref);
}

/* 押す 行ごとに、まだ 遠くに 無い commit を 並べ、欄が noreply で ない 物を 返す */
export function badCommits(cwd, lines, remote) {
  const bad = [];
  let seen = 0;
  let known = null;
  for (const line of lines) {
    const [, localSha, , remoteSha] = line.trim().split(/\s+/);
    if (!localSha || ZERO.test(localSha)) continue; // 消す push
    let range;
    if (remoteSha && !ZERO.test(remoteSha)) range = [localSha, "^" + remoteSha];
    else range = [localSha, ...(known ??= remoteKnown(cwd, remote)).map((x) => "^" + x)];
    const out = execFileSync("git", ["-C", cwd, "rev-list", "--stdin"], {
      input: range.join("\n") + "\n",
      encoding: "utf8",
      maxBuffer: 1 << 28,
    }).trim();
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
  /* ★呼ぶ側（hook・worktree）が 渡す GIT_*（GIT_INDEX_FILE・GIT_DIR 等）を 外す★＝一時 repo の git が 親の index・config を 書き換えない */
  for (const k of Object.keys(process.env)) if (k.startsWith("GIT_")) delete process.env[k];
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
  T(
    "新しい 枝は 押す 先の 遠くに 無い commit を 見る（他の remote の 追跡枝で 見逃さない）",
    () => {
      const O = path.join(tmp, "O.git");
      const TT = path.join(tmp, "T.git");
      execFileSync("git", ["init", "-q", "--bare", O], { stdio: "pipe" });
      execFileSync("git", ["init", "-q", "--bare", TT], { stdio: "pipe" });
      g("remote", "add", "O", O);
      g("remote", "add", "T", TT);
      g("push", "-q", "O", a + ":refs/heads/main");
      g("push", "-q", "T", c + ":refs/heads/side");
      g("fetch", "-q", "--all");
      const line = ["refs/heads/x " + c + " refs/heads/x " + "0".repeat(40)];
      const r = badCommits(tmp, line, "O");
      must(
        r.seen === 2 && r.bad.length === 2,
        "他の remote の 追跡枝に 在る commit を 見ていない: " + r.seen
      );
      let threw = 0;
      for (const rem of [undefined, path.join(tmp, "無い.git")])
        try {
          badCommits(tmp, line, rem);
        } catch {
          threw++;
        }
      must(threw === 2, "押す 先の 名が 無い・読めない 遠くで 止まらない");
      /* 遠くに 手元に 無い 頭＝「fetch してから」で 止める */
      const undo = foreignHead(tmp, O, "refs/heads/yoso");
      let msg = "";
      try {
        badCommits(tmp, line, "O");
      } catch (e) {
        msg = e.message;
      }
      undo();
      must(msg.includes("fetch してから"), "取っていない 頭で fetch の 止めに ならない: " + msg);
      /* 本物の 門：pushurl の remote は hook の $2（押す 道）を 読む */
      const A = path.join(tmp, "A.git");
      const B = path.join(tmp, "B.git");
      execFileSync("git", ["init", "-q", "--bare", A], { stdio: "pipe" });
      execFileSync("git", ["init", "-q", "--bare", B], { stdio: "pipe" });
      g("push", "-q", A, c + ":refs/heads/main");
      g("remote", "add", "r", A);
      g("remote", "set-url", "--push", "r", B);
      const s = spawnSync(process.execPath, [fileURLToPath(import.meta.url), "r", B], {
        cwd: tmp,
        env: { ...process.env, MAIL_SELFTEST_NESTED: "1" },
        encoding: "utf8",
        input: line[0] + "\n",
      });
      must(
        s.status === 1,
        "押す 先（B）で なく fetch 側（A）を 読んで 緑: " + (s.stdout || "") + (s.stderr || "")
      );
    }
  );
  T("GIT_INDEX_FILE・GIT_DIR を 付けて 走らせても 親の index・config を 1バイトも 変えない", () => {
    if (process.env.MAIL_SELFTEST_NESTED) return; // 入れ子の 中では 回さない
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), "kinshi-parent-"));
    const pg = (...a) => execFileSync("git", ["-C", parent, ...a], { stdio: "ignore" });
    pg("init", "-q");
    fs.writeFileSync(path.join(parent, "p.txt"), "parent");
    pg("add", "-A");
    pg(
      "-c",
      "user.name=x",
      "-c",
      "user.email=1+x@users.noreply.github.com",
      "commit",
      "-q",
      "-m",
      "p"
    );
    const gd = path.join(parent, ".git");
    const before = [
      fs.readFileSync(path.join(gd, "index")),
      fs.readFileSync(path.join(gd, "config")),
    ];
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), "--self-test"], {
      env: {
        ...process.env,
        GIT_INDEX_FILE: path.join(gd, "index"),
        GIT_DIR: gd,
        GIT_WORK_TREE: parent,
        MAIL_SELFTEST_NESTED: "1",
      },
      encoding: "utf8",
    });
    const after = [
      fs.readFileSync(path.join(gd, "index")),
      fs.readFileSync(path.join(gd, "config")),
    ];
    const gd2 = gd;
    /* GIT_DIR だけを 付けた 形（worktree から 押した 時の 型＝親の config に core.bare が 書かれた 前例） */
    const before2 = fs.readFileSync(path.join(gd2, "config"));
    const r2 = spawnSync(process.execPath, [fileURLToPath(import.meta.url), "--self-test"], {
      env: { ...process.env, GIT_DIR: gd2, MAIL_SELFTEST_NESTED: "1" },
      encoding: "utf8",
    });
    must(r2.status === 0, "GIT_DIR だけ 付けると 自己確認が 赤");
    must(
      before2.equals(fs.readFileSync(path.join(gd2, "config"))),
      "GIT_DIR だけ で 親の config を 書き換えた"
    );
    fs.rmSync(parent, { recursive: true, force: true });
    must(
      r.status === 0,
      "GIT_* を 付けると 自己確認が 赤: " +
        String(r.stdout)
          .split(String.fromCharCode(10))
          .filter((l) => l.includes("✗"))
          .join(" / ")
    );
    must(before[0].equals(after[0]), "親の index を 書き換えた");
    must(before[1].equals(after[1]), "親の config を 書き換えた");
  });
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("自己確認: " + pass + "/" + (pass + fail));
  return fail ? 1 : 0;
}

if (process.argv.includes("--self-test")) process.exit(selfTest());
const input = fs.readFileSync(0, "utf8").split(/\r?\n/).filter(Boolean);
let bad;
let seen;
try {
  ({ bad, seen } = badCommits(process.cwd(), input, process.argv[3] || process.argv[2]));
} catch (e) {
  console.error("✗ 押すのを 止めた：" + e.message);
  process.exit(1);
}
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
