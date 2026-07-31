/* ==========================================================================
   hanko.js  —  電子判子の画像処理（再利用モジュール）

   役割: 判子画像の「背景の白抜き（透過化）」と「透過済み判定」を行う純粋ユーティリティ。
   - Exally本体 / 代行請求 のどちらからでも <script src="hanko.js"> で使える
   - canvas を使うのでブラウザ専用（DOMに依存）。それ以外の外部依存なし

   公開API（window.HankoTool）:
     .hasAlpha(dataURL) -> Promise<boolean>          … 既に透過を持っているか
     .whiteToTransparent(dataURL, threshold) -> Promise<dataURL(PNG)>  … 白〜薄い背景を透過
     .process(dataURL, {mode, threshold}) -> Promise<{dataURL, transparent, kept}>
         mode: "auto"(既定/透過済みはそのまま・無ければ白抜き) | "on"(必ず白抜き) | "off"(何もしない)
   ========================================================================== */
(function (root) {
  "use strict";

  function loadImage(src) {
    return new Promise(function (res, rej) {
      var img = new Image();
      img.onload = function () {
        res(img);
      };
      img.onerror = function () {
        rej(new Error("image load failed"));
      };
      img.src = src;
    });
  }
  function toCanvas(img) {
    var c = document.createElement("canvas");
    c.width = img.naturalWidth || img.width;
    c.height = img.naturalHeight || img.height;
    var ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);
    return { c: c, ctx: ctx };
  }

  // 既に透過ピクセルを持っているか（alpha<250 のピクセルが一定数あれば「透過済み」）
  function hasAlpha(dataURL) {
    return loadImage(dataURL).then(function (img) {
      var o = toCanvas(img);
      var d = o.ctx.getImageData(0, 0, o.c.width, o.c.height).data;
      var n = 0;
      for (var i = 3; i < d.length; i += 4) {
        if (d[i] < 250) {
          n++;
          if (n > 50) return true;
        }
      }
      return false;
    });
  }

  // 白〜薄い背景を透過（min(R,G,B) > threshold を透明に。境界はなだらかに減衰）
  function whiteToTransparent(dataURL, threshold) {
    threshold = threshold || 230;
    return loadImage(dataURL).then(function (img) {
      var o = toCanvas(img);
      var im = o.ctx.getImageData(0, 0, o.c.width, o.c.height);
      var d = im.data;
      var soft = 30; // 境界の減衰幅
      for (var i = 0; i < d.length; i += 4) {
        var m = Math.min(d[i], d[i + 1], d[i + 2]);
        if (m > threshold) {
          d[i + 3] = 0;
        } else if (m > threshold - soft) {
          d[i + 3] = Math.round((d[i + 3] * (threshold - m)) / soft);
        }
      }
      o.ctx.putImageData(im, 0, 0);
      return o.c.toDataURL("image/png");
    });
  }

  function process(dataURL, opts) {
    opts = opts || {};
    var mode = opts.mode || "auto";
    if (mode === "off") return Promise.resolve({ dataURL: dataURL, transparent: false });
    if (mode === "on")
      return whiteToTransparent(dataURL, opts.threshold).then(function (u) {
        return { dataURL: u, transparent: true };
      });
    // auto: 既に透過があればそのまま、無ければ白抜き
    return hasAlpha(dataURL).then(function (has) {
      if (has) return { dataURL: dataURL, transparent: true, kept: true };
      return whiteToTransparent(dataURL, opts.threshold).then(function (u) {
        return { dataURL: u, transparent: true };
      });
    });
  }

  root.HankoTool = {
    hasAlpha: hasAlpha,
    whiteToTransparent: whiteToTransparent,
    process: process,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = root.HankoTool;
})(typeof window !== "undefined" ? window : this);
