// Androidの実機が手元に無いとき用。AndroidのChromeは、PCのChromeと★同じ中身(Blink)★なので、
// 画面の大きさ・指で触る前提・端末の名乗りをAndroidにして通せば、ほぼ実機と同じことが確かめられる。
//   npx playwright test --config=pw.android.config.js
//
// ★iPhoneだけは別（中身がWebKitで作りが違う）→ pw.webkit.config.js の方で通す。
//   実機でしか分からないのは「Androidのキーボードの出方」「ホーム画面に追加したときの見え方」くらい。
import base from "./playwright.config.js";
import { devices } from "@playwright/test";
export default {
  ...base,
  timeout: 60000,
  projects: [{ name: "android", use: { ...devices["Pixel 7"] } }],
};
