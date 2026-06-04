@echo off
chcp 65001 > nul
setlocal enabledelayedexpansion

echo ================================================
echo   코존 상세페이지 제작자 - 새 PC 자동 셋업
echo ================================================
echo.

REM ── 1. 도메인 루트 확인 ──────────────────────────────
set "DOMAIN_ROOT=%~dp0"
REM 끝 백슬래시 제거
if "%DOMAIN_ROOT:~-1%"=="\" set "DOMAIN_ROOT=%DOMAIN_ROOT:~0,-1%"

echo [1/4] 현재 도메인 루트:
echo       %DOMAIN_ROOT%
echo.

REM ── 2. Node.js 확인 ──────────────────────────────────
echo [2/4] Node.js 확인 중...
where node >nul 2>nul
if errorlevel 1 (
  echo   X Node.js가 설치되어 있지 않습니다. https://nodejs.org/ 에서 LTS 설치 후 다시 실행하세요.
  pause
  exit /b 1
)
for /f "tokens=*" %%v in ('node --version') do echo   OK Node.js %%v
echo.

REM ── 3. config.json 경로 치환 (PowerShell) ────────────
echo [3/4] code\config.json 절대경로를 현재 PC 경로로 치환합니다...
if not exist "%DOMAIN_ROOT%\code\config.json" (
  echo   X code\config.json 이 없습니다. repo 손상 가능. 중단.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$root='%DOMAIN_ROOT%'.Replace('\','\\');" ^
  "$path='%DOMAIN_ROOT%\code\config.json';" ^
  "$content=Get-Content -Raw -Path $path -Encoding UTF8;" ^
  "$pattern='C:\\\\Users\\\\MYCOM\\\\Documents\\\\조현준편집파일 329부터\\\\클로드코드\\\\코존워크스페이스\\\\domains\\\\상세페이지 제작자';" ^
  "$new=$content -replace [regex]::Escape($pattern), $root;" ^
  "if ($new -ne $content) { Set-Content -Path $path -Value $new -Encoding UTF8 -NoNewline; Write-Host '  OK config.json 경로 치환 완료' } else { Write-Host '  -- 치환할 절대경로가 없거나 이미 현재 PC 경로입니다.' }"
echo.

REM ── 4. npm install ───────────────────────────────────
echo [4/4] code\ 에서 npm install 실행 중... (1-3분 소요)
pushd "%DOMAIN_ROOT%\code"
call npm install
if errorlevel 1 (
  echo   X npm install 실패. 위 오류 확인 후 수동으로 npm install 재시도하세요.
  popd
  pause
  exit /b 1
)

REM ── 5. Playwright 브라우저 (선택, 실패해도 계속) ─────
echo.
echo [추가] Playwright Chromium 다운로드 (이미 있으면 skip)...
call npx playwright install chromium 2>nul
popd

echo.
echo ================================================
echo   셋업 완료!
echo ================================================
echo.
echo 다음 명령으로 서버를 시작하세요:
echo   cd code
echo   node server.js
echo.
echo 또는 도메인 루트에서 "상세페이지 제작기.html" 을 더블클릭하세요.
echo.
pause
