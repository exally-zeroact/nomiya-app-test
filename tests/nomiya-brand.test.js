/* 見た目の決まりを機械で見張る（Castally）
 * ------------------------------------------------------------------
 * 目で見て決めた色を、あとから誰かが1か所だけ直して崩す——を止めるための物。
 * ここが正。画面のCSSはこの決まりに従う。
 *
 *  color-tokens   … 部品のCSSに生の色コードを書かない（色は変数1か所）
 *  contrast       … 決めた読みやすさ（明るさの差）を下回ったら赤
 *  button-outline … ボタンとチップの枠が在って、細すぎ・薄すぎない
 *  chip-selected  … 選んだチップを「面の色だけ」で区別していない
 *  identity       … repo名・URL・棚の名前・端末の控えの鍵が変わっていない
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HTML = fs.readFileSync(path.join(ROOT, "nomiya-uriage.html"), "utf8");

/* 画面用のCSS＝最初の <style>〜</style>。A4の紙のCSS(SHEET_CSS)は別物で、
   紙は白地に黒のままにするので、この見張りの対象に入れない。 */
const SCREEN_CSS = (() => {
  const i = HTML.indexOf("<style>");
  const j = HTML.indexOf("</style>", i);
  if (i < 0 || j < 0) throw new Error("画面用の<style>が見つからない");
  return HTML.slice(i + 7, j);
})();

/* 色の決まりを書く場所＝:root{...}。ここだけは生の色コードを書いてよい。 */
const ROOT_BLOCK = (() => {
  const m = SCREEN_CSS.match(/:root\s*\{([\s\S]*?)\}/);
  return m ? m[1] : "";
})();

function tokens() {
  const out = {};
  ROOT_BLOCK.replace(/(--[\w-]+)\s*:\s*([^;]+);/g, (_, k, v) => {
    out[k] = v.trim();
    return "";
  });
  return out;
}

/* ── 明るさの差（WCAG のコントラスト比）。数字は「◯:1」の◯ ── */
function lum(hex) {
  const h = String(hex).trim().replace("#", "");
  const n =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  const v = [0, 2, 4].map((i) => {
    const c = parseInt(n.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
}
function ratio(a, b) {
  const x = lum(a);
  const y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
const r2 = (n) => Math.round(n * 100) / 100;

/* ある宣言（例 .btn の border）を読む。無ければ null。 */
function ruleOf(sel) {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp("(^|[},])\\s*" + esc + "\\s*\\{([^}]*)\\}", "m");
  const m = SCREEN_CSS.match(re);
  return m ? m[2] : null;
}
function decl(body, prop) {
  if (!body) return null;
  const m = body.match(new RegExp("(?:^|;)\\s*" + prop + "\\s*:\\s*([^;]+)", "i"));
  return m ? m[1].trim() : null;
}

describe("color-tokens: 部品のCSSに生の色コードを書かない", () => {
  it("色を書いてよいのは :root の中だけ（変数が1か所にあれば、あとから崩れない）", () => {
    // :root の中身と、印刷のときだけ効く塊は外す。
    // 印刷は「白地に黒」で固定したい所なので、変数に寄せない（紙の色は変えない決まり）。
    let body = SCREEN_CSS.replace(/:root\s*\{[\s\S]*?\}/g, "");
    body = body.replace(/@media\s+print\s*\{[\s\S]*$/g, "");
    const raw = body.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
    expect(raw, "生の色コードが残っている: " + raw.slice(0, 12).join(" ")).toEqual([]);
  });
  it("使う色は :root に名前を付けて置いてある", () => {
    const t = tokens();
    const want = [
      "--c-bg",
      "--c-card",
      "--c-line",
      "--c-line2",
      "--c-sum",
      "--c-text",
      "--c-flabel",
      "--c-label",
      "--c-ph",
      "--c-minus",
      "--c-btn",
      "--c-btn-t",
      "--c-btn-line",
      "--c-btn2-line",
      "--c-btn-act",
      "--c-chip",
      "--c-chip-t",
      "--c-chip-line",
      "--c-chip-on",
      "--c-chip-on-t",
      "--c-chip-on-line",
      "--c-hd",
      "--c-hd-logo",
      "--c-hd-t",
      "--c-hd-line",
      "--c-nav",
      "--c-nav-on",
      "--c-nav-off",
    ];
    const miss = want.filter((k) => !t[k]);
    expect(miss, "決めていない色がある").toEqual([]);
  });
});

describe("contrast: 決めた読みやすさを下回ったら赤", () => {
  // 司さんに見せた表の実測値。ここを下回る色に変えたら止める。
  const WANT = [
    ["頭の帯のロゴ", "--c-hd-logo", "--c-hd", 11.93],
    ["頭の帯の小さい字", "--c-hd-t", "--c-hd", 7.18],
    ["本文", "--c-text", "--c-card", 17.9],
    ["項目名", "--c-flabel", "--c-card", 8.97],
    ["説明", "--c-label", "--c-card", 5.88],
    ["プレースホルダ", "--c-ph", "--c-card", 4.5],
    ["マイナス", "--c-minus", "--c-card", 6.88],
    ["ボタンの字", "--c-btn-t", "--c-btn", 12.56],
    ["主役のボタンの枠", "--c-btn-line", "--c-btn", 3.0],
    // ★ここが甘いと「枠が見えないボタン」に戻る（元の #B9C2D4 は 1.79 しかなかった）
    ["ボタンの枠", "--c-btn2-line", "--c-btn2", 3.0],
    ["チップの枠", "--c-chip-line", "--c-chip", 3.0],
    ["下バーの未選択", "--c-nav-off", "--c-nav", 4.31],
    ["下バーの選択中", "--c-nav-on", "--c-nav", 4.5],
    ["チップの字（未選択）", "--c-chip-t", "--c-chip", 8.0],
    ["チップの字（選択中）", "--c-chip-on-t", "--c-chip-on", 12.0],
    ["合計行の本文", "--c-text", "--c-sum", 15.0],
    ["地の上の本文", "--c-text", "--c-bg", 15.0],
  ];
  const t = tokens();
  WANT.forEach(([name, fg, bg, min]) => {
    it(name + " は " + min + " 以上", () => {
      expect(t[fg], fg + " が :root に無い").toBeTruthy();
      expect(t[bg], bg + " が :root に無い").toBeTruthy();
      const got = r2(ratio(t[fg], t[bg]));
      expect(got, name + " が薄い（" + got + " < " + min + "）").toBeGreaterThanOrEqual(min);
    });
  });
});

describe("button-outline: 面が薄いぶん、枠が唯一の手がかり", () => {
  const t = tokens();
  const px = (v) => {
    const m = String(v || "").match(/([\d.]+)px/);
    return m ? Number(m[1]) : 0;
  };
  [".btn", ".chip"].forEach((sel) => {
    it(sel + " に枠があって 1.5px 以上", () => {
      const body = ruleOf(sel);
      expect(body, sel + " のCSSが見つからない").toBeTruthy();
      const b = decl(body, "border");
      expect(b, sel + " に border が無い＝押せると分からない").toBeTruthy();
      expect(px(b), sel + " の枠が細い: " + b).toBeGreaterThanOrEqual(1.5);
    });
  });
  it("枠の色は #7A88A5 と同じか、それより濃い", () => {
    const floor = lum("#7A88A5");
    ["--c-btn-line", "--c-btn2-line", "--c-chip-line"].forEach((k) => {
      expect(t[k], k + " が無い").toBeTruthy();
      expect(lum(t[k]), k + " が薄い: " + t[k]).toBeLessThanOrEqual(floor + 0.001);
    });
  });
});

describe("chip-selected: 面の色だけで区別しない", () => {
  it("選んだチップは、枠の色か太さで見分けられる", () => {
    const off = ruleOf(".chip");
    const on = ruleOf(".chip.on");
    expect(off, ".chip のCSSが見つからない").toBeTruthy();
    expect(on, ".chip.on のCSSが見つからない").toBeTruthy();
    const all = (off + ";" + on).toLowerCase();
    // 選択中に border か border-color か border-width の指定がある
    const hasBorder = /border(-color|-width)?\s*:/.test(on.toLowerCase());
    expect(hasBorder, "選択中に枠の指定が無い＝面の色だけで区別している").toBe(true);
    expect(all.indexOf("--c-chip-on-line") >= 0, "選択中の枠の色を決めていない").toBe(true);
  });
  it("選択中と未選択の面の色だけでは、差が小さくて見分けられない（だから枠が要る）", () => {
    const t = tokens();
    // ここは「差が小さいこと」を確かめる試験ではなく、
    // 小さいときに枠で救っているか、を上の試験と対で見るための記録。
    const d = r2(ratio(t["--c-chip"], t["--c-chip-on"]));
    expect(d, "面の色の差（記録用）").toBeGreaterThan(0);
  });
});

describe("紙（A4）は白地に黒。緑を残さない", () => {
  /* 紙のCSS（SHEET_CSS）は画面の変数に寄せていない（紙は色を変えない決まり）。
     ただし Castally にしたので、緑がかった罫や見出しが残っていると
     見出しの帯（濃紺）とちぐはぐになる。緑が1つでも残っていたら赤にする。 */
  const PAPER = (() => {
    const i = HTML.indexOf("var SHEET_CSS = [");
    const j = HTML.indexOf("].join(", i);
    if (i < 0 || j < 0) throw new Error("紙のCSSが見つからない");
    return HTML.slice(i, j);
  })();
  // 緑がかった色（緑が一番強い色）を1つでも見つけたら赤。
  const greens = (PAPER.match(/#[0-9a-fA-F]{6}/g) || []).filter(function (h) {
    const r = parseInt(h.slice(1, 3), 16);
    const g = parseInt(h.slice(3, 5), 16);
    const b = parseInt(h.slice(5, 7), 16);
    return g > r && g > b;
  });
  it("紙のCSSに緑がかった色が無い", () => {
    expect(greens, "紙に緑が残っている: " + greens.join(" ")).toEqual([]);
  });
  it("見出しの帯は濃紺（#0A1128）", () => {
    expect(PAPER.indexOf("#0A1128") >= 0, "紙の帯が濃紺でない").toBe(true);
    expect(PAPER.indexOf("#2E7D54") < 0, "紙に前の緑の帯が残っている").toBe(true);
  });
});

describe("identity: 名前を変えるのは表に出る所だけ", () => {
  const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
  it("repo名（package.json）は変えない", () => {
    const name = JSON.parse(read("package.json")).name;
    expect(["nomiya-app", "nomiya-app-test"]).toContain(name);
  });
  it("見る倉庫（supa-config.js）は変えない", () => {
    const c = read("js/supa-config.js");
    expect(/https:\/\/(khawdrnvssdenumbiwfg|tnfwipbgfgjaymlszeid)\.supabase\.co/.test(c)).toBe(
      true
    );
  });
  it("クラウドの棚の名前は nomiya_ のまま", () => {
    const sql = read("supabase/schema-nomiya.sql");
    const tables = [...sql.matchAll(/create table if not exists (\w+)/g)].map((m) => m[1]);
    expect(tables.length).toBeGreaterThan(0);
    expect(tables.filter((x) => !x.startsWith("nomiya_"))).toEqual([]);
    [
      "nomiya_sales",
      "nomiya_settings",
      "nomiya_partners",
      "nomiya_invoices",
      "nomiya_closes",
      "nomiya_staff",
      "nomiya_work",
      "nomiya_payments",
    ].forEach((t) => expect(tables).toContain(t));
  });
  it("端末の控えの鍵は nomiya_*_v1 のまま（変えたら、みんなのデータが消える）", () => {
    const keys = [...HTML.matchAll(/var (K_\w+) = "([^"]+)"/g)].map((m) => m[2]);
    expect(keys.length).toBeGreaterThanOrEqual(10);
    expect(keys.filter((k) => !/^nomiya_[a-z_]+_v1$/.test(k))).toEqual([]);
  });
  it("配るページの名前（nomiya-uriage.html）は変えない", () => {
    expect(fs.existsSync(path.join(ROOT, "nomiya-uriage.html"))).toBe(true);
    expect(fs.existsSync(path.join(ROOT, "nomiya-core.js"))).toBe(true);
  });
  it("表に出る名前は Castally", () => {
    expect(/<title>Castally — 売上管理<\/title>/.test(HTML)).toBe(true);
    expect(/class="app-logo">Castally</.test(HTML)).toBe(true);
    // 画面に「Exally／エクサリー」は残さない（ログイン部品の名前は別）
    const body = HTML.slice(HTML.indexOf("<body>"));
    const shown = body.replace(/ExallyLogin/g, "").match(/Exally|エクサリー/g) || [];
    expect(shown, "画面に Exally が残っている").toEqual([]);
  });
});
