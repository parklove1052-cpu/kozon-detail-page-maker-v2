# KOZON Detail Page Maker - 서버 헬스체크 워치독
# 작업 스케줄러가 1분마다 호출. 7777 다운이면 start_hidden.vbs로 자동 부활.
# 사장님 로그인 세션에서만 동작 (사용자 작업). 콘솔 절대 안 띄움.

$ErrorActionPreference = 'Stop'

# 도메인 루트 — 이 스크립트(.../scripts/server_watchdog.ps1)의 부모
$root = Split-Path -Parent $PSScriptRoot
$vbs  = Join-Path $root 'code\start_hidden.vbs'
$log  = Join-Path $root 'server_diag.log'
$url  = 'http://127.0.0.1:7777/api/health'

function Write-Log([string]$msg) {
    $line = ('[{0}] [watchdog] {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg)
    try {
        Add-Content -Path $log -Value $line -Encoding UTF8
    } catch { }
}

# 1. 헬스체크
$alive = $false
try {
    $resp = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 4 -ErrorAction Stop
    if ($resp.StatusCode -eq 200) { $alive = $true }
} catch {
    $alive = $false
}

if ($alive) { exit 0 }

# 2. 다운 — 부활
Write-Log "down (no 200 on /api/health). reviving via $vbs"

if (-not (Test-Path $vbs)) {
    Write-Log "ERROR: start_hidden.vbs not found at $vbs"
    exit 1
}

# 3. wscript 호출 — start_hidden.vbs가 자체적으로 우리 server.js만 정리/재기동
try {
    Start-Process -FilePath 'wscript.exe' -ArgumentList ('"{0}"' -f $vbs) -WindowStyle Hidden -WorkingDirectory (Join-Path $root 'code')
    Write-Log "wscript launched"
} catch {
    Write-Log ("ERROR: wscript launch failed: {0}" -f $_.Exception.Message)
    exit 1
}

# 4. 5초 후 재확인
Start-Sleep -Seconds 5
try {
    $resp2 = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 4 -ErrorAction Stop
    if ($resp2.StatusCode -eq 200) {
        Write-Log "revived OK"
        exit 0
    }
} catch {
    Write-Log ("ERROR: still down after revival attempt: {0}" -f $_.Exception.Message)
    exit 1
}

exit 0
