# 作った xlsx の作者・最終更新者を「見本」に、保存した場所の道（absPath）を空に書き換える（make-tpl-*.ps1 の最後に呼ぶ）。
# Excel は保存の時に この機械の Office の利用者名を docProps/core.xml に、保存した場所を xl/workbook.xml に書く
# ＝公開 repo に 実名や 利用者フォルダの 名前が 入る（tests/kinshi-ji.test.mjs が 赤にする）。
# Excel の利用者名を いじると その機械の設定が 変わるので、保存した後の zip を 直接 直す。
# ★pwsh（PowerShell 7）で 走らせる★（Windows PowerShell 5.1 には ZipFile の 型が 無い）
param([Parameter(Mandatory=$true)][string]$Path)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
if (-not (Test-Path $Path)) { throw "xlsx が 無い: $Path" }

function Edit-Part($zip, [string]$name, [scriptblock]$fix) {
  $e = $zip.GetEntry($name)
  if ($null -eq $e) { return }
  $r = New-Object System.IO.StreamReader($e.Open(), [System.Text.UTF8Encoding]::new($false))
  $xml = $r.ReadToEnd()
  $r.Close()
  $xml = & $fix $xml
  $e.Delete()
  $n = $zip.CreateEntry($name)
  $w = New-Object System.IO.StreamWriter($n.Open(), [System.Text.UTF8Encoding]::new($false))
  $w.Write($xml)
  $w.Close()
}

$zip = [System.IO.Compression.ZipFile]::Open($Path, "Update")
try {
  Edit-Part $zip "docProps/core.xml" {
    param($x)
    $x = $x -replace "<dc:creator>[^<]*</dc:creator>", "<dc:creator>見本</dc:creator>"
    $x -replace "<cp:lastModifiedBy>[^<]*</cp:lastModifiedBy>", "<cp:lastModifiedBy>見本</cp:lastModifiedBy>"
  }
  Edit-Part $zip "xl/workbook.xml" {
    param($x)
    $x -replace '(<x15ac:absPath\b[^>]*?\surl=")[^"]*(")', '$1$2'
  }
} finally {
  $zip.Dispose()
}
