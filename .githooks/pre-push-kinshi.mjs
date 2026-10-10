/* pre-push-kinshi.mjs — ★押す commit ごとに、変わった 物の 中身（git が 持つ 字）に 実在の 字が 無いかを 見る★（2026-10-11）
 *
 *   公開 repo では、字が 外に 出る 瞬間は push（CI は push の 後に 走る・main 以外の 枝では CI が 走らない）。
 *   ＝押す 前の 最後の 門を ここに 置く。見張りの 本体（tests/kinshi-ji.test.mjs の scan）を そのまま 使い、
 *     読む 物だけを「手元の 字」から「押す commit の 中身（blob）」に 替える。
 *
 *   見る 物：まだ 遠くに 無い commit の 1本ずつで、親（1番目）から 変わった・増えた 物（消した 物は 見ない）。
 *     途中の commit で 入れて 後で 消した 字も、その commit の 所で 赤に なる（履歴に 残って 押されるので）。
 *     白名簿は その commit の tests/kinshi-ji-shiro.txt・印は その commit の blob の id。
 *   一覧：KINSHI_JI か ~/.tsukurimono/kinshi-ji.txt。★指紋を .githooks/kinshi-finger と 照らす★（縮んだ・差し替えた 一覧で 緑に しない）。
 *     一覧が 無い・指紋が 違う・指紋の 紙が 無い は 赤。
 *   見張りの 本体が 押す 範囲で 変わった 時は、自己確認も 回す（手元の 版で）。
 *   ★字は 出さない★（commit の SHA・道・行・一覧の 何番目か だけ）。
 *
 *   門の 外：--no-verify・core.hooksPath を 置いていない clone・GitHub の 画面での 編集。最後の 門は CI（main と PR）。
 *
 *   使い方（git が 呼ぶ）: 標準入力に「<手元の ref> <手元の sha> <遠くの ref> <遠くの sha>」
 *   自分で 確かめる:       node .githooks/pre-push-kinshi.mjs --self-test
 */
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SELF = fileURLToPath(import.meta.url);
const ZERO = /^0+$/;
const K = await import(
  pathToFileURL(path.join(path.dirname(SELF), "..", "tests", "kinshi-ji.test.mjs")).href
);

const gitText = (cwd, ...a) =>
  execFileSync("git", ["-C", cwd, ...a], {
    encoding: "utf8",
    maxBuffer: 1 << 28,
    stdio: ["ignore", "pipe", "pipe"],
  });
const gitBuf = (cwd, ...a) => execFileSync("git", ["-C", cwd, ...a], { maxBuffer: 1 << 28 });

/* 押す 行ごとに、まだ 遠くに 無い commit（古い 順） */
export function pushedCommits(cwd, lines) {
  const out = [];
  for (const line of lines) {
    const [, localSha, , remoteSha] = line.trim().split(/\s+/);
    if (!localSha || ZERO.test(localSha)) continue;
    const range =
      remoteSha && !ZERO.test(remoteSha)
        ? [localSha, "^" + remoteSha]
        : [localSha, "--not", "--remotes"];
    const list = gitText(cwd, "rev-list", "--reverse", ...range).trim();
    for (const c of list ? list.split("\n") : []) if (!out.includes(c)) out.push(c);
  }
  return out;
}

/* 1本の commit の「親から 変わった・増えた 物」を、見張りの 読み口に して 返す */
export function commitSource(cwd, commit) {
  const parents = gitText(cwd, "rev-list", "--parents", "-n", "1", commit)
    .trim()
    .split(" ")
    .slice(1);
  const meta = new Map();
  if (parents.length) {
    const raw = gitText(
      cwd,
      "diff-tree",
      "-r",
      "-z",
      "--no-renames",
      "--diff-filter=ACMT",
      parents[0],
      commit
    );
    const parts = raw.split("\0");
    for (let i = 0; i + 1 < parts.length; i += 2) {
      const head = parts[i].replace(/^:/, "").split(" ");
      if (head.length < 5) continue;
      meta.set(parts[i + 1], { mode: head[1], sha: head[3] });
    }
  } else {
    for (const row of gitText(cwd, "ls-tree", "-r", "-z", commit).split("\0").filter(Boolean)) {
      const [info, p] = row.split("\t");
      const [mode, , sha] = info.split(" ");
      meta.set(p, { mode, sha });
    }
  }
  let shiro;
  try {
    shiro = gitText(cwd, "show", commit + ":" + K.SHIRO_PATH);
  } catch {
    shiro = null;
  }
  return {
    files: [...meta.keys()],
    src: {
      kind: (rel) => {
        const m = meta.get(rel);
        return !m ? "none" : /^100(644|755)$/.test(m.mode) ? "file" : "other";
      },
      read: (rel) => gitBuf(cwd, "cat-file", "blob", meta.get(rel).sha),
      id: (rel) => (meta.get(rel) ? meta.get(rel).sha.slice(0, 16) : ""),
      shiroText: () => shiro,
      partial: true,
    },
  };
}

/* 門の 本体：赤なら 1 */
export function check({ cwd, lines, env = process.env, file, fingerFile }) {
  const out = [];
  const { words, finger } = K.loadWords({
    env,
    file: file ?? env.KINSHI_JI_FILE ?? path.join(os.homedir(), ".tsukurimono", "kinshi-ji.txt"),
  });
  if (!words.length)
    return { code: 1, out: ["✗ 押すのを 止めた：禁止の 字の 一覧が 無い（未測定）"] };
  let want = "";
  try {
    want = fs.readFileSync(fingerFile, "utf8").trim();
  } catch {
    return { code: 1, out: ["✗ 押すのを 止めた：指紋の 紙（.githooks/kinshi-finger）が 無い"] };
  }
  if (want !== finger)
    return {
      code: 1,
      out: ["✗ 押すのを 止めた：一覧の 指紋が 違う（期待 " + want + "・今 " + finger + "）"],
    };
  const commits = pushedCommits(cwd, lines);
  let files = 0;
  let red = 0;
  let selfNeeded = false;
  for (const c of commits) {
    const { files: fl, src } = commitSource(cwd, c);
    if (fl.includes("tests/kinshi-ji.test.mjs")) selfNeeded = true;
    files += fl.length;
    if (!fl.length) continue;
    const r = K.scan({ root: cwd, files: fl, words, src });
    const all = [...r.hits, ...r.reds, ...r.notes.map((n) => n + "（未測定＝赤）")];
    for (const x of all) out.push("  " + c.slice(0, 7) + ": " + x);
    red += all.length;
  }
  if (red) {
    out.unshift(
      "✗ 押すのを 止めた：実在の 字・未測定 " +
        red +
        " 件（commit " +
        commits.length +
        " 本・変わった 物 " +
        files +
        " 本・字は 出さない）"
    );
    return { code: 1, out, selfNeeded };
  }
  out.push(
    "✓ 押す commit " +
      commits.length +
      " 本の 変わった 物 " +
      files +
      " 本に 実在の 字 0 件（一覧 " +
      words.length +
      " 語・指紋 " +
      finger +
      "）"
  );
  return { code: 0, out, selfNeeded };
}

function selfTest() {
  /* 呼ぶ 側（hook・worktree）が 渡す GIT_* を 外す＝一時 repo の git が 親を 書き換えない */
  for (const k of Object.keys(process.env)) if (k.startsWith("GIT_")) delete process.env[k];
  let pass = 0;
  let fail = 0;
  let checks = 0;
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
    checks++;
    if (!v) throw new Error(m);
  };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ppk-"));
  const repo = path.join(tmp, "r");
  fs.mkdirSync(repo);
  const g = (...a) => execFileSync("git", ["-C", repo, ...a], { stdio: "pipe" });
  g("init", "-q");
  const WORD = ["見本台", "ぷっしゅ語"].join("");
  const list = path.join(tmp, "list.txt");
  fs.writeFileSync(list, WORD + "\n");
  const { finger } = K.loadWords({ env: {}, file: list });
  const ff = path.join(tmp, "finger");
  fs.writeFileSync(ff, finger + "\n");
  const commit = (files, msg) => {
    for (const [p, body] of Object.entries(files)) {
      const abs = path.join(repo, p);
      if (body === null) fs.rmSync(abs, { force: true });
      else {
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, body);
      }
    }
    g("add", "-A");
    g(
      "-c",
      "user.name=x",
      "-c",
      "user.email=1+x@users.noreply.github.com",
      "commit",
      "-q",
      "-m",
      msg
    );
    return gitText(repo, "rev-parse", "HEAD").trim();
  };
  const run = (from, to, extra = {}) =>
    check({
      cwd: repo,
      lines: ["refs/heads/main " + to + " refs/heads/main " + from],
      env: {},
      file: list,
      fingerFile: ff,
      ...extra,
    });
  const c1 = commit({ "a.txt": "ふつう\n" }, "c1");
  const c2 = commit({ "b.txt": "x\n" + WORD + "\n" }, "c2");
  const c3 = commit({ "b.txt": null }, "c3");
  const c4 = commit({ "c.txt": "ふつう\n" }, "c4");
  T("途中で 入れて 後で 消した 字も、その commit で 赤・字は 出さない", () => {
    const r = run(c1, c3);
    must(r.code === 1 && r.out.some((l) => l.includes(c2.slice(0, 7))), "入れて 消した 字が 緑");
    must(
      !r.out.join("\n").includes(WORD) && !r.out.join("\n").includes("ぷっしゅ"),
      "出しに 字が 出た"
    );
  });
  T("きれいな 範囲は 緑・分母が 出る", () => {
    const r = run(c3, c4);
    must(
      r.code === 0 &&
        r.out.some((l) => l.includes("commit 1 本") && l.includes("変わった 物 1 本")),
      "きれいで 赤 か 分母が 違う: " + r.out.join(" / ")
    );
  });
  T("一覧が 無い・指紋が 違う・指紋の 紙が 無い は 赤", () => {
    must(run(c3, c4, { file: path.join(tmp, "nai.txt") }).code === 1, "一覧なしで 緑");
    fs.writeFileSync(path.join(tmp, "bad"), "00000000\n");
    must(run(c3, c4, { fingerFile: path.join(tmp, "bad") }).code === 1, "指紋違いで 緑");
    must(run(c3, c4, { fingerFile: path.join(tmp, "nai") }).code === 1, "指紋の 紙なしで 緑");
  });
  T("初めての 枝（遠くの sha が 無い）は 遠くに 無い commit を 全部 見る", () => {
    const r = check({
      cwd: repo,
      lines: ["refs/heads/x " + c4 + " refs/heads/x " + "0".repeat(40)],
      env: {},
      file: list,
      fingerFile: ff,
    });
    must(r.code === 1, "初めての 枝で 字の 入った commit を 見ていない");
  });
  T("白名簿は その commit の 物と blob の id で 通す", () => {
    const pic = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x80, 0x81, 0x00]);
    const c5 = commit({ "w.jpg": pic }, "c5");
    must(run(c4, c5).code === 1, "絵の 未測定が 緑");
    const id = gitText(repo, "rev-parse", c5 + ":w.jpg")
      .trim()
      .slice(0, 16);
    const c6 = commit(
      { "w.jpg": pic, "tests/kinshi-ji-shiro.txt": "w.jpg\t未測定1\t" + id + "\t絵\n" },
      "c6"
    );
    fs.writeFileSync(
      path.join(repo, "w.jpg"),
      Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x80, 0x81, 0x01])
    );
    g("add", "-A");
    g(
      "-c",
      "user.name=x",
      "-c",
      "user.email=1+x@users.noreply.github.com",
      "commit",
      "-q",
      "-m",
      "c7"
    );
    const c7 = gitText(repo, "rev-parse", "HEAD").trim();
    must(run(c5, c6).code === 0, "白名簿で 名指しした 絵が 赤: " + run(c5, c6).out.join(" / "));
    must(run(c6, c7).code === 1, "中身を 替えた 絵が 緑");
  });
  T("消す push は 見ない", () => {
    must(
      check({
        cwd: repo,
        lines: ["(delete) " + "0".repeat(40) + " refs/heads/x " + c4],
        env: {},
        file: list,
        fingerFile: ff,
      }).code === 0,
      "消す push で 赤"
    );
  });
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("自己確認: " + pass + "/" + (pass + fail));
  console.log("確かめた 回数: " + checks);
  return fail ? 1 : 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === SELF;
if (isMain) {
  if (process.argv.includes("--self-test")) process.exit(selfTest());
  const root = gitText(process.cwd(), "rev-parse", "--show-toplevel").trim();
  const lines = fs.readFileSync(0, "utf8").split(/\r?\n/).filter(Boolean);
  const r = check({ cwd: root, lines, fingerFile: path.join(root, ".githooks", "kinshi-finger") });
  for (const l of r.out) (r.code ? console.error : console.log)(l);
  if (r.code) process.exit(1);
  if (r.selfNeeded) {
    const s = spawnSync(
      process.execPath,
      [path.join(root, "tests", "kinshi-ji.test.mjs"), "--self-test"],
      { encoding: "utf8" }
    );
    const ok = s.status === 0 && /^自己確認: (\d+)\/\1$/m.test(s.stdout || "");
    console.log(
      ok
        ? "✓ 見張りの 本体が 変わったので 自己確認も 回した（通った）"
        : "✗ 見張りの 自己確認が 通らない"
    );
    if (!ok) process.exit(1);
  }
}
