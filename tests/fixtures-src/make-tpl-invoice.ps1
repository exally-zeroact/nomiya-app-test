# お店が持っている「請求書のExcelひな形」を、★本物のExcel★で1枚作る。
# 罫線・結合・列幅・太字・塗り・図形(判子の代わり)を入れて、往復で残るかを測れるようにする。
param([Parameter(Mandatory=$true)][string]$Out)

$ErrorActionPreference = "Stop"
# 強制killの後遺症(復帰モード)を消す
$res = "HKCU:\Software\Microsoft\Office\16.0\Excel\Resiliency"
if (Test-Path $res) { Remove-Item $res -Recurse -Force -ErrorAction SilentlyContinue }

$xl = New-Object -ComObject Excel.Application
$null = $xl.Version; $null = $xl.Ready
$xl.Visible = $false
$xl.DisplayAlerts = $false
$wb = $xl.Workbooks.Add()
while ($wb.Worksheets.Count -gt 1) { $wb.Worksheets.Item($wb.Worksheets.Count).Delete() }
$ws = $wb.Worksheets.Item(1)
$ws.Name = "請求書"

# 列幅（★往復で消えていないかを見る印★）
$ws.Columns.Item(1).ColumnWidth = 10.5
$ws.Columns.Item(2).ColumnWidth = 4.5
$ws.Columns.Item(3).ColumnWidth = 22.0
$ws.Columns.Item(4).ColumnWidth = 7.0
$ws.Columns.Item(5).ColumnWidth = 14.0
$ws.Columns.Item(6).ColumnWidth = 16.0

# 表題（結合＋太字）
$t = $ws.Range("A1:F1")
$t.Merge()
$ws.Range("A1").Value2 = "御 請 求 書"
$ws.Range("A1").Font.Size = 20
$ws.Range("A1").Font.Bold = $true
$ws.Range("A1").HorizontalAlignment = -4108

$ws.Range("D3").Value2 = "請求日"
$ws.Range("D4").Value2 = "請求番号"
$ws.Range("A4").Value2 = "宛名"
$ws.Range("B5").Value2 = "御中"

$ws.Range("A7").Value2 = "ご請求金額（税込）"
$ws.Range("A7").Font.Bold = $true

# 明細の見出し（塗り＋罫線）
$hdr = @("日付","曜","内容","人数","金額（税込）","備考")
for ($i = 0; $i -lt 6; $i++) { $ws.Cells.Item(9, $i + 1).Value2 = $hdr[$i] }
$h = $ws.Range("A9:F9")
$h.Font.Bold = $true
$h.Interior.Color = 15790320
$h.HorizontalAlignment = -4108

# 明細の枠（20行ぶんの罫線）
$grid = $ws.Range("A9:F29")
for ($e = 7; $e -le 12; $e++) {
  $b = $grid.Borders.Item($e)
  $b.LineStyle = 1
  $b.Weight = 2
}

# 合計まわり
$ws.Range("D31").Value2 = "小計（税抜）"
$ws.Range("D32").Value2 = "消費税"
$ws.Range("D33").Value2 = "合計"
$ws.Range("D33").Font.Bold = $true
$ws.Range("E33").Font.Bold = $true
$ws.Range("E31:E33").NumberFormat = '#,##0'
$ws.Range("E3").NumberFormat = 'yyyy/m/d'

# 数式（★ここには書き込ませない★ことを試験で確かめるための1つ）
$ws.Range("E34").Formula = "=E33"

$ws.Range("A36").Value2 = "お振込先"
$ws.Range("A36").Font.Bold = $true
$ws.Range("A37").Value2 = "○○銀行 △△支店 普通 1234567"
$ws.Range("D36").Value2 = "店名"

# 判子の代わりの図形（往復で消えないかを見る）
$shp = $ws.Shapes.AddShape(9, 330.0, 500.0, 46.0, 46.0)
$shp.Line.ForeColor.RGB = 2237106
$shp.Fill.Visible = 0

$ws.PageSetup.PaperSize = 9
$ws.Range("A1").Select()

$full = [System.IO.Path]::GetFullPath($Out)
if (Test-Path $full) { Remove-Item $full -Force }
$wb.SaveAs($full, 51)   # 51 = xlsx
$wb.Close($false)
$xl.Quit()
[void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($ws)
[void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($wb)
[void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($xl)
[GC]::Collect()
Write-Output ("作った: {0} ({1} バイト)" -f $full, (Get-Item $full).Length)
