$ErrorActionPreference = 'Stop'
$desktop = [Environment]::GetFolderPath('Desktop')
$domain = [System.IO.Path]::Combine($env:USERPROFILE, 'Documents')
$domain = Get-Item -LiteralPath $domain
# 한글 경로를 환경변수로 받기
$base   = $env:KOZON_DOMAIN
$vbs    = [IO.Path]::Combine($base, 'code', 'start_hidden.vbs')
$html   = [IO.Path]::Combine($base, $env:KOZON_HTML)
$codeDir= [IO.Path]::Combine($base, 'code')

$wsh = New-Object -ComObject WScript.Shell

$lnk1 = [IO.Path]::Combine($desktop, $env:KOZON_LNK1)
$sc1 = $wsh.CreateShortcut($lnk1)
$sc1.TargetPath       = 'wscript.exe'
$sc1.Arguments        = '"' + $vbs + '"'
$sc1.WorkingDirectory = $codeDir
$sc1.IconLocation     = 'wscript.exe,0'
$sc1.Description      = 'KOZON detail page server starter'
$sc1.Save()
Write-Host ('[OK1] ' + $lnk1)

$lnk2 = [IO.Path]::Combine($desktop, $env:KOZON_LNK2)
$sc2 = $wsh.CreateShortcut($lnk2)
$sc2.TargetPath  = $html
$sc2.Description = 'KOZON detail page entry'
$sc2.Save()
Write-Host ('[OK2] ' + $lnk2)
