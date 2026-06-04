@echo off
chcp 65001 >nul
title 코존 상세페이지 제작기 — 서버 재시작
echo.
echo ================================================
echo   코존 상세페이지 제작기 — 서버 재시작
echo ================================================
echo.

REM 1) 7777 포트 점유 PID 찾기 + 우리 server.js 인지 검증 후 종료 (Codex 진단 4-1)
echo [1/3] 옛 서버 검증·종료 중...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr "LISTENING" ^| findstr ":7777"') do (
    REM PID %%a의 CommandLine 확인 — 우리 server.js 경로 포함 시에만 종료
    for /f "delims=" %%b in ('wmic process where ProcessId^=%%a get CommandLine /value 2^>nul ^| findstr /i "상세페이지 제작자"') do (
        echo   - 우리 서버 확인 PID: %%a → 종료
        taskkill /F /T /PID %%a >nul 2>nul
        goto :killed
    )
    echo   ⚠ PID %%a는 우리 서버가 아닙니다 (다른 도메인일 수 있음). 종료 스킵.
)
:killed

REM 2) 잠시 대기
echo [2/3] 포트 해제 대기 (2초)...
timeout /t 2 /nobreak >nul

REM 3) 새 서버 부팅
echo [3/3] 새 서버 부팅...
cd /d "%~dp0code"
start /b "" node server.js

REM 잠시 후 health 체크
timeout /t 3 /nobreak >nul
echo.
echo ────────────────────────────────────────────────
echo   health 체크:
curl -s http://127.0.0.1:7777/api/health
echo.
echo ────────────────────────────────────────────────
echo.
echo  ✓ 서버 재시작 완료. 이 창은 닫아도 OK.
echo  ✓ 브라우저에서 Ctrl+F5 한 번 눌러주세요.
echo.
pause
