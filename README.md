# 飲み屋 売上管理（nomiya-app / nomiya-app-test）

夜のお店の「売上・締め・請求書・給料」を、スマホ1台で回すためのアプリ。

## ★このrepoは2本立て（テストはテスト、本番は本番）

| repo              | 役割   | 見る倉庫（Supabase）              | 配信      |
| ----------------- | ------ | --------------------------------- | --------- |
| `nomiya-app`      | 本番   | 本番倉庫 `tnfwipbgfgjaymlszeid`   | 本番URL   |
| `nomiya-app-test` | テスト | テスト用DB `khawdrnvssdenumbiwfg` | テストURL |

**2つのrepoで中身が違うのは、たった2ファイル。**

- `js/supa-config.js` … どの倉庫に繋ぐか。**ここだけが向き先を決める**
- `package.json` の `name` … このrepoがどっちなのか（`nomiya-app` / `nomiya-app-test`）

それ以外（画面・計算・テスト）は1文字も違わない。だからテストで通った物が、そのまま本番で動く。

### 取り違えたら赤くなる

`tests/nomiya-deploy.test.js` が、`package.json` の名前と `js/supa-config.js` の向き先が
合っているかを毎回確かめる。ズレたら CI が落ちる。

さらに **実機検証（live）は本番倉庫では走らない**。
`tests/supa-from-config.mjs` が向き先を読み、本番倉庫だったらその場で止める＝
テストが本番に1バイトも書かない。

## ファイル

```
nomiya-uriage.html   画面の骨組み（読み込む順番が正）。2026-08-07 に 8,926行 → 857行
nomiya-uriage.css    画面の見た目。★色は :root の変数だけ★
nomiya-ui-base.js    土台・保存/読み込み・クラウド(ログインと同期)・期間・モーダル
nomiya-ui-uriage.js  入力画面・一覧(売上帳)・集計
nomiya-ui-kaishu.js  未回収と入金
nomiya-ui-kami.js    税理士用の紙・請求書・A4のフィット表示/印刷
nomiya-ui-settei.js  設定・データ・締め
nomiya-ui-kyuryo.js  給料
nomiya-ui-boot.js    画面切り替え・全体描画・起動（★必ず最後に読む★）
nomiya-core.js       計算の唯一の正（売上・締め・給料・請求書）。画面から独立
exally-login.js      ログイン画面の共通部品
hanko.js             判子の写真から白地を抜く
js/supa-config.js    ★向き先（テストrepo＝DB-test / 本番repo＝本番倉庫）
supabase/schema-nomiya.sql  棚（テーブル）の定義。冪等・RLS込み
```

★画面のJSは ふつうの `<script>`（module ではない）★
7本は同じ場所（グローバル）を共有している。`type="module"` にすると各ファイルが
別の部屋になり、今の呼び合いが全部切れる。★module にしてはいけない★。
読み込む順番は `nomiya-uriage.html` の並びが正。
`tests/app-source.mjs` が「HTMLが読んでいる物」と「実際に置いてある物」の
食い違いを赤くする。中身を直したら `npm run stamp`（`?v=` を押し直す）。

★2つのrepoで違ってよいのは4本だけ★（`npm run compare` で数える・手元専用）

```
js/supa-config.js  package.json  package-lock.json  CLAUDE.md
```

## 走らせ方

```bash
npm install
npm test            # 計算の芯（vitest）
npm run test:e2e    # 実ブラウザで全ボタン（playwright）
npm run probe       # このrepoが見る倉庫に棚があるか（読むだけ・書かない）
npm run live        # 本物のDBに往復（テストrepoだけ・本番倉庫では止まる）
npm run live:ui     # 本物のURLで実UI往復（同上）
```

`live` を走らせるには、テスト用アカウントの合言葉が
`%TEMP%\nomiya-test-cred.json` に要る。

```json
{ "email": "exally.supoort+nomiya@gmail.com", "password": "…" }
```

決めたこのメール以外では走らない（お店のデータに触らないため）。

## 棚を変えるとき

`supabase/schema-nomiya.sql` に `alter table ... add column if not exists` で足す。
何度流しても安全な形にしておくこと。当てたあとは `npm run probe` で機械的に確かめる
（目視の「できました」は使わない）。
