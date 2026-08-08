# ★本物のExcelが「画面に出している文字」を記録する★
# ------------------------------------------------------------------------------
# 見本のExcelを ★本物のExcelで開いて★、表示されている文字・列幅(px)・貼った絵の大きさ・
# 「値が0のマス」を tests/e2e/fixtures/excel-truth.json に書き出す。
# CIにはExcelが無いので、ここで記録した物と突き合わせる（tests/nomiya-xlsx-tpl.test.js）。
#
# ★なぜ要るか★
#   2026-08-09、司さんの実物を読ませたら画面が別物だった
#   （ふりがな混入・小数のまま・0が20個・日付が別形式・判子が59px左へ）。
#   ★目で見比べるのをやめ、機械で1マスずつ突き合わせる★ための記録。
#
# 使い方（Excelの入ったWindowsで）:
#   pwsh tests/fixtures-src/record-excel-truth.ps1
# ★場所は「このファイルの隣」から決める★
#   呼び出した人がどこに居るかは分からない（実際、別の場所から呼んで見つからなかった）。
param([string]$FixDir = "")

$ErrorActionPreference = "Stop"
if (-not $FixDir) { $FixDir = Join-Path $PSScriptRoot "..\e2e\fixtures" }
$res = "HKCU:\Software\Microsoft\Office\16.0\Excel\Resiliency"
if (Test-Path $res) { Remove-Item $res -Recurse -Force -ErrorAction SilentlyContinue }

$FIX = [System.IO.Path]::GetFullPath($FixDir)
$xl = New-Object -ComObject Excel.Application
$null = $xl.Version; $null = $xl.Ready; $null = $xl.Workbooks.Count
$xl.Visible = $false
$xl.DisplayAlerts = $false

$out = [ordered]@{}
foreach ($n in @("tpl-invoice.xlsx", "tpl-real-like.xlsx")) {
  $wb = $xl.Workbooks.Open("$FIX\$n", 0, $true)
  $ws = $wb.Worksheets.Item(1)
  $ur = $ws.UsedRange
  $r1 = $ur.Row; $c1 = $ur.Column; $rn = $ur.Rows.Count; $cn = $ur.Columns.Count
  $cells = [ordered]@{}
  for ($r = $r1; $r -lt $r1 + $rn; $r++) {
    for ($c = $c1; $c -lt $c1 + $cn; $c++) {
      $t = $ws.Cells.Item($r, $c).Text
      if ("$t" -ne "") { $cells[$ws.Cells.Item($r, $c).Address(0, 0)] = "$t" }
    }
  }
  # 列幅は pt で返るので px に直す（1pt = 1/72インチ・画面は96dpi）
  $wcol = [ordered]@{}
  for ($c = 1; $c -le 9; $c++) { $wcol[[string][char](64 + $c)] = [math]::Round($ws.Columns.Item($c).Width * 96 / 72) }
  # ★並び順を固定する（[ordered]）★
  #   ふつうの @{} は順番を持たないので、★中身が同じでも書き出すたびに並びが変わる★＝
  #   作り直すたびに差分が出て「何か変わった」と誤解する（実際に出た）。
  $sh = $null
  if ($ws.Shapes.Count -gt 0) {
    $s1 = $ws.Shapes.Item(1)
    $sh = [ordered]@{
      left = [math]::Round($s1.Left * 96 / 72)
      top  = [math]::Round($s1.Top * 96 / 72)
      w    = [math]::Round($s1.Width * 96 / 72)
      h    = [math]::Round($s1.Height * 96 / 72)
    }
  }
  # ★値が0のマス★（「ゼロを表示しない」の確認が生きている証拠。無いと落ちようがない）
  $zeros = @()
  foreach ($ref in @("F12", "C13", "C14", "C15")) {
    $v = $ws.Range($ref).Value2
    if ($null -ne $v -and "$v" -eq "0") {
      $zeros += [ordered]@{ ref = $ref; text = "$($ws.Range($ref).Text)" }
    }
  }
  $out[$n] = [ordered]@{ cells = $cells; colPx = $wcol; shape = $sh; zeroCells = $zeros }
  $wb.Close($false)
}
$xl.Quit()
[GC]::Collect()

$out | ConvertTo-Json -Depth 6 | Set-Content "$FIX\excel-truth.json" -Encoding UTF8
foreach ($k in $out.Keys) {
  "{0,-22} {1,3} マス / 値が0のマス {2}" -f $k, $out[$k].cells.Count, $out[$k].zeroCells.Count
}
