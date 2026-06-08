$ErrorActionPreference = 'Stop'
$desktop = [Environment]::GetFolderPath('Desktop')
$domain  = 'C:\Users\MYCOM\Documents\조현준편집파일 329부터\클로드코드\코존워크스페이스\domains\상세페이지 제작자'
$vbs     = Join-Path $domain 'code\start_hidden.vbs'
$html    = Join-Path $domain '상세페이지 제작기.html'
$codeDir = Join-Path $domain 'code'

$wsh = New-Object -ComObject WScript.Shell

# 1) 서버 켜기 단축어
$sc1 = $wsh.CreateShortcut((Join-Path $desktop '상세페이지 서버 켜기.lnk'))
$sc1.TargetPath       = 'wscript.exe'
$sc1.Arguments        = '"' + $vbs + '"'
$sc1.WorkingDirectory = $codeDir
$sc1.IconLocation     = 'wscript.exe,0'
$sc1.Description      = '상세페이지 제작기 서버를 백그라운드로 켭니다'
$sc1.Save()
Write-Host ('[OK] ' + (Join-Path $desktop '상세페이지 서버 켜기.lnk'))

# 2) 본 UI 진입 단축어
$sc2 = $wsh.CreateShortcut((Join-Path $desktop '상세페이지 제작기.lnk'))
$sc2.TargetPath  = $html
$sc2.Description = '상세페이지 제작기 진입 페이지 (서버가 떠 있어야 본 UI로 전환됩니다)'
$sc2.Save()
Write-Host ('[OK] ' + (Join-Path $desktop '상세페이지 제작기.lnk'))
