// iPhoneのSafariに一番近いブラウザ(WebKit)で、同じ試験を全部通すための設定。
//   npx playwright install webkit          ← 最初の1回だけ
//   npx playwright test --config=pw.webkit.config.js
//
// ★CI（毎回のpush）には足さない。WindowsのWebKitはA4の紙を組むのがPCのChromeの2〜3倍遅く、
//   30秒では間に合わずに「落ちた」ように見えるだけだから（実測：34秒かかって中身は正しい）。
//   だから待ち時間を90秒にしてある。iPhoneで困ったときに、こちらで確かめる道具。
import base from "./playwright.config.js";
import { devices } from "@playwright/test";
export default {
  ...base,
  timeout: 90000,
  projects: [{ name: "webkit", use: { ...devices["iPhone 13"] } }],
};
