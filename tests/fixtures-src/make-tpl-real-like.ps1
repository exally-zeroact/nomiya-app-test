# ★司さんの実物と「同じ罠」を持つ見本を、本物のExcelで作る★
#   ・ふりがな(rPh) ・ゼロを表示しない ・テーマ色の塗り ・行そのものの書式
#   ・表示形式（¥/#,##0_ /yyyy/m/d） ・貼った絵 ・結合 ・行の高さ ・列幅
# 実物そのもの（会社の住所・口座・判子）はrepoに入れない。同じ形の作り物で測る。
param([Parameter(Mandatory=$true)][string]$Out, [Parameter(Mandatory=$true)][string]$Png)
$ErrorActionPreference = "Stop"
$res = "HKCU:\Software\Microsoft\Office\16.0\Excel\Resiliency"
if (Test-Path $res) { Remove-Item $res -Recurse -Force -ErrorAction SilentlyContinue }

$xl = New-Object -ComObject Excel.Application
$null = $xl.Version; $null = $xl.Ready; $null = $xl.Workbooks.Count
$xl.Visible = $true          # DisplayZeros は「窓」の設定なので、見えている必要がある
$xl.DisplayAlerts = $false
$wb = $xl.Workbooks.Add()
while ($wb.Worksheets.Count -gt 1) { $wb.Worksheets.Item($wb.Worksheets.Count).Delete() }
$ws = $wb.Worksheets.Item(1)
$ws.Name = "請求書"

$ws.Columns.Item(1).ColumnWidth = 11.94
$ws.Columns.Item(2).ColumnWidth = 11.94
$ws.Columns.Item(3).ColumnWidth = 3.5
$ws.Columns.Item(4).ColumnWidth = 3.5
$ws.Columns.Item(5).ColumnWidth = 8
$ws.Columns.Item(6).ColumnWidth = 6.81
$ws.Columns.Item(7).ColumnWidth = 9.25
$ws.Columns.Item(8).ColumnWidth = 9.25
$ws.Columns.Item(9).ColumnWidth = 9.25

$ws.Rows.Item(1).RowHeight = 27
$ws.Range("A1:I1").Merge()
$ws.Range("A1").Value2 = "請求書"
$ws.Range("A1").HorizontalAlignment = -4108
$ws.Range("A1").Font.Size = 18
$ws.Range("A1").SetPhonetic()          # ★ふりがなを付ける（これが本文に混ざる罠）★

$ws.Range("A3:D4").Merge()
$ws.Range("A3").Value2 = "エスプリ　アマン　御中"
$ws.Range("A3").SetPhonetic()
$ws.Range("A3").Font.Size = 14

$ws.Range("I2").Value2 = [double]46235
$ws.Range("I2").NumberFormat = 'yyyy/m/d'
# ★右寄せで、マスに収まらない長い文字★（Excelでは左へはみ出して全部見える）
#   これが無いと「はみ出す向き」の確認が、何も見ていない緑になる。
$ws.Range("I3").Value2 = "合同会社サンプル"
$ws.Range("I3").SetPhonetic()
$ws.Range("I4").Value2 = "〒000-0000"
$ws.Range("I5").Value2 = "○○県○○市中央7-3-40　00コーポ1号"
$ws.Range("I6").Value2 = "TEL000-0000-0000"
$ws.Range("I7").Value2 = "登録番号：T0000000000000"
$ws.Range("I3:I7").HorizontalAlignment = -4152   # 右寄せ

$ws.Range("A6").Value2 = "消費税は10%となっております。"
$ws.Range("A6").SetPhonetic()
$ws.Range("A7").Value2 = "下記の通り御請求申し上げます。"
$ws.Range("A7").SetPhonetic()

$ws.Rows.Item(8).RowHeight = 20.1
$ws.Range("A8:B8").Merge()
$ws.Range("A8").Value2 = "ご請求金額(税込)"
$ws.Range("A8").SetPhonetic()
$ws.Range("A8").Font.Bold = $true
$ws.Range("C8:E8").Merge()
$ws.Range("C8").Value2 = [double]34000
$ws.Range("C8").NumberFormat = '"¥"#,##0'
$ws.Range("C8").Font.Bold = $true

# 見出し（行そのものに書式を付ける）
$ws.Rows.Item(10).RowHeight = 18
$hdr = @("項目","","数量","単位","金額","消費税","備考")
$cols = @(1,2,3,4,5,6,7)
for ($i = 0; $i -lt $hdr.Count; $i++) { if ($hdr[$i] -ne "") { $ws.Cells.Item(10, $cols[$i]).Value2 = $hdr[$i] } }
$ws.Range("A10:I10").SetPhonetic()
$ws.Range("A10:I10").Font.Bold = $true
$ws.Range("A10:I10").Interior.ThemeColor = 2      # ★テーマ色の塗り★
$ws.Range("A10:I10").Interior.TintAndShade = 0

# 明細（1行おきにテーマ色。空の行にも「行そのものの書式」で色が付く形）
for ($r = 11; $r -le 26; $r++) {
  $ws.Rows.Item($r).RowHeight = 18
  if ($r % 2 -eq 0) {
    $ws.Rows.Item($r).Interior.ThemeColor = 2
    $ws.Rows.Item($r).Interior.TintAndShade = 0
  }
}
$ws.Range("A11").Value2 = "エアコン洗浄"
$ws.Range("A11").SetPhonetic()
$ws.Range("C11").Value2 = [double]4
$ws.Range("D11").Value2 = "台"
$ws.Range("E11").Value2 = [double]30909.090909090908
$ws.Range("F11").Value2 = [double]3090.909090909091
$ws.Range("E11:F26").NumberFormat = '#,##0_ '
# ★値が 0 のマスを入れておく★（「ゼロを表示しない」が効いているかを測るため。
#   これが無いと「0を出していない」という確認が、何も見ていない緑になる）
# ★E12 は「空のマス」にしておく★
#   司さんの紙がこの形だった：<c r="E12" s="21"/> が 共有の式の親 <c r="F12" ...> の直前にある。
#   タグの切り出しが欲張りだと、E12がF12の中身を飲み込んで ★親の番地を取り違える★。
#   （その結果 F14 の式が =D15*0.1 にズレた。金額が静かに狂う一番危ない形）
$ws.Range("C13").Formula = "=C11-C11"
$ws.Range("C14").Value2 = [double]0
$ws.Range("C15").Value2 = [double]0
# ★共有の式（1つの式を何行にも使い回す形）を作る★
#   親を消すと子が迷子になって Excel が「壊れています」と言う罠を、見本に持たせる。
$ws.Range("F11").Formula = "=E11*0.1"
$ws.Range("F11").Copy()
$ws.Range("F12:F26").PasteSpecial(-4123)   # 数式だけ貼る＝共有の式になる
$xl.CutCopyMode = 0

$ws.Range("A27").Value2 = "お振込先"
$ws.Range("A27").SetPhonetic()
$ws.Range("A28").Value2 = "○○銀行 △△支店 普通 1234567"
$ws.Range("H27").Value2 = "小計"
$ws.Range("H28").Value2 = "消費税"
$ws.Range("H29").Value2 = "合計"
$ws.Range("H27:H29").SetPhonetic()
$ws.Range("H27:H29").Font.Bold = $true
$ws.Range("I27").Formula = "=E11"
$ws.Range("I28").Formula = "=F11"
$ws.Range("I29").Formula = "=I27+I28"
$ws.Range("I27:I29").NumberFormat = '#,##0_ '

# ★ゼロを表示しない（空の明細に 0 が並ばない）★
$xl.ActiveWindow.DisplayZeros = $false

# 貼った絵（判子の代わり。実物の判子は入れない）
$null = $ws.Shapes.AddPicture([System.IO.Path]::GetFullPath($Png), $false, $true, 375.0, 36.4, 45.4, 43.6)

$ws.PageSetup.PaperSize = 9
$ws.Range("A1").Select()

$full = [System.IO.Path]::GetFullPath($Out)
if (Test-Path $full) { Remove-Item $full -Force }
$wb.SaveAs($full, 51)
$wb.Close($false)
$xl.Quit()
[GC]::Collect()
Write-Output ("作った: {0} ({1} バイト)" -f $full, (Get-Item $full).Length)
