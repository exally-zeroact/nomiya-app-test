# 作った xlsx の作者・最終更新者を「見本」に書き換える（make-tpl-*.ps1 の最後に呼ぶ）。
# Excel は保存の時に この機械の Office の利用者名を docProps/core.xml に書く＝公開 repo に実名が入る。
# Excel の利用者名を いじると その機械の設定が 変わるので、保存した後の zip を 直接 直す。
param([Parameter(Mandatory=$true)][string]$Path)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression
$zip = [System.IO.Compression.ZipFile]::Open($Path, "Update")
try {
  $e = $zip.GetEntry("docProps/core.xml")
  $r = New-Object System.IO.StreamReader($e.Open(), [System.Text.UTF8Encoding]::new($false))
  $xml = $r.ReadToEnd()
  $r.Close()
  $xml = $xml -replace "<dc:creator>[^<]*</dc:creator>", "<dc:creator>見本</dc:creator>"
  $xml = $xml -replace "<cp:lastModifiedBy>[^<]*</cp:lastModifiedBy>", "<cp:lastModifiedBy>見本</cp:lastModifiedBy>"
  $e.Delete()
  $n = $zip.CreateEntry("docProps/core.xml")
  $w = New-Object System.IO.StreamWriter($n.Open(), [System.Text.UTF8Encoding]::new($false))
  $w.Write($xml)
  $w.Close()
} finally {
  $zip.Dispose()
}
