@echo off
chcp 65001 >nul
title 코존 상세페이지 제작기 - 자동 시작 등록 / 진단
setlocal enabledelayedexpansion

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
set "TARGET_VBS=%ROOT%\code\start_hidden.vbs"
set "STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "LNK_NEW=%STARTUP_DIR%\코존 상세페이지 서버.lnk"
set "LNK_OLD=%STARTUP_DIR%\KOZON Detail Page Maker.lnk"

echo.
echo ================================================
echo   코존 상세페이지 제작기 - 자동 시작 등록 / 진단
echo ================================================
echo.

if not exist "%TARGET_VBS%" (
    echo [X] code\start_hidden.vbs 없음
    echo     %TARGET_VBS%
    echo.
    pause
    exit /b 1
)

REM 1) 이미 등록돼 있나? (구.신 이름 모두 검사)
set "HAS_LNK=0"
if exist "%LNK_OLD%" set "HAS_LNK=1" & set "EXISTING=%LNK_OLD%"
if exist "%LNK_NEW%" set "HAS_LNK=1" & set "EXISTING=%LNK_NEW%"

if "%HAS_LNK%"=="1" (
    echo  [OK] 시작 프로그램에 이미 등록돼 있습니다:
    echo       %EXISTING%
    echo.
    echo  ----------------------------------------
    echo   서버 실제 동작 진단
    echo  ----------------------------------------
    echo.

    REM 2) 7777 살아있나?
    curl -s --max-time 2 -o nul http://127.0.0.1:7777/api/health 2>nul
    if not errorlevel 1 (
        echo  [OK] 7777 포트 서버 정상 동작 중.
        echo       그냥 상세페이지 제작기.html 더블클릭으로 사용하세요.
        echo.
        goto :done
    )

    echo  [!] 등록은 돼 있는데 서버가 안 떠있습니다. 가능한 원인:
    echo       1. 노트북 sleep / wakeup 후 시작 프로그램 미실행 - 지금 수동 부팅 필요
    echo       2. server.js 부팅 중 에러 - 서버 재시작.bat 으로 콘솔 에러 확인
    echo       3. 7777 포트 다른 프로그램 점유 - netstat -ano ^| findstr 7777
    echo       4. node.exe 프로세스가 어떤 이유로 죽음
    echo.
    choice /c YN /n /m "지금 즉시 서버 부팅을 시도할까요? (Y/N): "
    if errorlevel 2 goto :done
    if errorlevel 1 (
        echo  - 서버 부팅 중...
        wscript "%TARGET_VBS%"
        echo  - 5초 대기...
        ping -n 6 127.0.0.1 >nul
        curl -s --max-time 2 -o nul http://127.0.0.1:7777/api/health 2>nul
        if not errorlevel 1 (
            echo  [OK] 서버 부팅 성공. 상세페이지 제작기.html 더블클릭하세요.
        ) else (
            echo  [X] 서버 부팅 실패. 서버 재시작.bat 더블클릭해 콘솔 에러 확인 권장.
        )
    )
    goto :done
)

REM 3) 등록돼 있지 않음 - 신규 등록
echo  현재 시작 프로그램에 등록돼 있지 않습니다.
echo  지금 등록하면 다음부터 PC 시작(로그인) 시마다 서버가 자동으로 떠 있습니다.
echo.
choice /c YN /n /m "시작 프로그램에 등록할까요? (Y/N): "
if errorlevel 2 (
    echo  - 취소.
    pause
    exit /b 0
)

REM PowerShell COM 으로 .lnk 생성
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$s = (New-Object -ComObject WScript.Shell).CreateShortcut('%LNK_NEW%');" ^
  "$s.TargetPath = 'wscript.exe';" ^
  "$s.Arguments = '\"%TARGET_VBS%\"';" ^
  "$s.WorkingDirectory = '%ROOT%\code';" ^
  "$s.WindowStyle = 7;" ^
  "$s.Description = '코존 상세페이지 제작기 로컬 서버 (hidden)';" ^
  "$s.Save();"

if not exist "%LNK_NEW%" (
    echo [X] 단축키 생성 실패. PowerShell 실행 권한 확인.
    echo.
    pause
    exit /b 1
)

echo  [OK] 시작 프로그램에 등록 완료.
echo       %LNK_NEW%
echo.
echo  지금 한 번 서버를 띄울까요?
choice /c YN /n /m "(Y/N): "
if errorlevel 2 goto :done
if errorlevel 1 (
    echo  - 서버 부팅 중...
    wscript "%TARGET_VBS%"
    echo  - 잠시 후 상세페이지 제작기.html 더블클릭으로 사용 가능.
)

:done
echo.
echo  자동 시작을 해제하려면 서버 자동시작 해제.bat 더블클릭.
echo.
pause
exit /b 0
