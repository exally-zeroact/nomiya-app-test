/* ==========================================================================
   hanko.js  —  電子判子の画像処理（再利用モジュール）

   役割: 判子画像の「背景の白抜き（透過化）」と「透過済み判定」を行う純粋ユーティリティ。
   - Exally本体 / 代行請求 のどちらからでも <script src="hanko.js"> で使える
   - canvas を使うのでブラウザ専用（DOMに依存）。それ以外の外部依存なし

   公開API（window.HankoTool）:
     .hasAlpha(dataURL) -> Promise<boolean>          … 既に透過を持っているか
     .whiteToTransparent(dataURL, threshold) -> Promise<dataURL(PNG)>  … 白〜薄い背景を透過
     .trim(dataURL) -> Promise<dataURL(PNG)>        … まわりの透明な余白を切る
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

  /* まわりの透明な余白を切る。
     判子の写真は、白を抜いたあとも「まわりが全部透明」の帯が残る。
     そのまま紙に載せると、決めた大きさの箱の中で判子が小さく浮いて、
     社名に重ならない（司さんの実機で発覚）。実際の朱肉のところだけに切りそろえる。 */
  function trim(dataURL) {
    return loadImage(dataURL).then(function (img) {
      var o = toCanvas(img);
      var w = o.c.width;
      var h = o.c.height;
      if (!w || !h) return dataURL;
      var d = o.ctx.getImageData(0, 0, w, h).data;
      var x1 = w;
      var y1 = h;
      var x2 = -1;
      var y2 = -1;
      for (var y = 0; y < h; y++) {
        for (var x = 0; x < w; x++) {
          // うっすら残った点は余白とみなす（alpha 24 以下は切る）
          if (d[(y * w + x) * 4 + 3] > 24) {
            if (x < x1) x1 = x;
            if (x > x2) x2 = x;
            if (y < y1) y1 = y;
            if (y > y2) y2 = y;
          }
        }
      }
      if (x2 < 0) return dataURL; // 全部透明＝切りようがない
      var cw = x2 - x1 + 1;
      var ch = y2 - y1 + 1;
      if (cw >= w - 2 && ch >= h - 2) return dataURL; // 余白がほぼ無い＝作り直さない
      var out = document.createElement("canvas");
      out.width = cw;
      out.height = ch;
      out.getContext("2d").drawImage(o.c, x1, y1, cw, ch, 0, 0, cw, ch);
      return out.toDataURL("image/png");
    });
  }

  function process(dataURL, opts) {
    opts = opts || {};
    var mode = opts.mode || "auto";
    if (mode === "off") return Promise.resolve({ dataURL: dataURL, transparent: false });
    // ★白を抜いたあとは必ず余白を切る（切らないと紙の上で小さく浮く）
    if (mode === "on")
      return whiteToTransparent(dataURL, opts.threshold)
        .then(trim)
        .then(function (u) {
          return { dataURL: u, transparent: true };
        });
    // auto: 既に透過があればそのまま（余白だけ切る）、無ければ白抜き
    return hasAlpha(dataURL).then(function (has) {
      if (has)
        return trim(dataURL).then(function (u) {
          return { dataURL: u, transparent: true, kept: true };
        });
      return whiteToTransparent(dataURL, opts.threshold)
        .then(trim)
        .then(function (u) {
          return { dataURL: u, transparent: true };
        });
    });
  }

  root.HankoTool = {
    hasAlpha: hasAlpha,
    whiteToTransparent: whiteToTransparent,
    trim: trim,
    process: process,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = root.HankoTool;
})(typeof window !== "undefined" ? window : this);
