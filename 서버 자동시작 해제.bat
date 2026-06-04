@echo off
chcp 65001 >nul
title 코존 상세페이지 제작기 - 자동 시작 해제
setlocal enabledelayedexpansion

set "STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "LNK_NEW=%STARTUP_DIR%\코존 상세페이지 서버.lnk"
set "LNK_OLD=%STARTUP_DIR%\KOZON Detail Page Maker.lnk"

echo.
echo ================================================
echo   코존 상세페이지 제작기 - 자동 시작 해제
echo ================================================
echo.

set "FOUND=0"
if exist "%LNK_OLD%" set "FOUND=1"
if exist "%LNK_NEW%" set "FOUND=1"

if "%FOUND%"=="0" (
    echo  [-] 시작 프로그램에 등록돼 있지 않습니다.
    echo.
    pause
    exit /b 0
)

echo  발견된 단축키:
if exist "%LNK_OLD%" echo    %LNK_OLD%
if exist "%LNK_NEW%" echo    %LNK_NEW%
echo.
choice /c YN /n /m "이 단축키를 모두 삭제할까요? (Y/N): "
if errorlevel 2 (
    echo  - 취소.
    pause
    exit /b 0
)

if exist "%LNK_OLD%" del "%LNK_OLD%" 2>nul
if exist "%LNK_NEW%" del "%LNK_NEW%" 2>nul

if exist "%LNK_OLD%" goto :fail
if exist "%LNK_NEW%" goto :fail

echo  [OK] 자동 시작 해제 완료.
echo.
echo  현재 떠 있는 서버는 그대로 동작합니다.
echo  완전히 종료하려면 작업 관리자에서 node.exe 프로세스를 종료하세요.
goto :end

:fail
echo  [X] 일부 단축키 삭제 실패 (권한 문제 가능)
exit /b 1

:end
echo.
pause
exit /b 0
