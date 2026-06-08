$lnk = 'C:\Users\MYCOM\Desktop\' + $env:LNK_NAME
$wsh = New-Object -ComObject WScript.Shell
$sc = $wsh.CreateShortcut($lnk)
Write-Host ('Target=' + $sc.TargetPath)
Write-Host ('Args='   + $sc.Arguments)
Write-Host ('WorkDir='+ $sc.WorkingDirectory)
Write-Host ('Exists=' + (Test-Path -LiteralPath $sc.TargetPath))
