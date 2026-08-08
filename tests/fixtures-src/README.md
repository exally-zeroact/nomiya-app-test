# 見本のExcelの作り方（他のアプリからも使えます）

`tests/e2e/fixtures/*.xlsx` は **本物の Excel で作った見本**です。
自分で書いた XML で試すと、**自分の思い込みごと通ってしまう**ので使いません。

| 見本                 | 何を測るための物か                                              |
| -------------------- | --------------------------------------------------------------- |
| `tpl-invoice.xlsx`   | 罫線・結合・列幅・図形・数式・日付書式のある、素直な請求書      |
| `tpl-real-like.xlsx` | **司さんの実物と同じ罠**を持つ物（下）                          |
| `excel-truth.json`   | **本物のExcelが画面に出している文字**の記録（CIで突き合わせる） |

## `tpl-real-like.xlsx` が持っている罠（2026-08-09・実物で踏んだ物）

1. **ふりがな `<rPh>`** … `<si>` の中の `<t>` を全部つなぐと「請求書セイキュウショ」と出る
2. **ゼロを表示しない** `<sheetView showZeros="0">` … 見ないと空の明細に `0` が並ぶ
3. **テーマ色の塗り** `<fgColor theme="2"/>` … `rgb` しか見ないと縞が出ない
4. **行そのものの書式** `<row s="12" customFormat="1">` … 見ないと中身の無い行だけ縞が抜ける
5. **表示形式** `"¥"#,##0` / `#,##0_ ` / `yyyy/m/d` … 当てないと `30909.0909…` のまま出る
6. **貼った絵**（判子の代わり）… `twoCellAnchor` なので大きさは `<a:ext>` 側にある
7. **値が 0 のマス**（E12 / F12 / C13）… これが無いと「0を出していない」の確認が
   **落ちようがない**（実際にそうなっていた）

## 作り直す（Excel の入った Windows で）

```powershell
pwsh tests/fixtures-src/make-tpl-invoice.ps1   -Out tests/e2e/fixtures/tpl-invoice.xlsx
pwsh tests/fixtures-src/make-tpl-real-like.ps1 -Out tests/e2e/fixtures/tpl-real-like.xlsx -Png <判子の代わりのPNG>
pwsh tests/fixtures-src/record-excel-truth.ps1
npx vitest run tests/nomiya-xlsx-tpl.test.js
```

## 実物（お店のExcel）は repo に入れません

会社の住所・口座・判子が入っているためです。
**実物では 50/50 マス一致まで確認済み**（2026-08-09・飲み屋(ZEROact.xlsx）。

## Excel COM のはまり所（両方 実際に踏みました）

- `NumberFormat = 'General'` は日本語版で**設定できない**（`'#,##0'` は通る）。既定のままにする
- `DisplayZeros` は**「窓」の設定**なので `$xl.Visible = $true` でないと効かない
- `Value2` への代入は**行ごとに型を覚える**ので、文字用と数値用で行を分ける
- 強制終了すると復帰モードに入って開けなくなる → `HKCU:\...\16.0\Excel\Resiliency` を消す
