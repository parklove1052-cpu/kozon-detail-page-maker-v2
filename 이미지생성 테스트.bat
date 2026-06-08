@echo off
REM KOZON Detail Page Maker - ChatGPT image generation test
REM First run: Chrome window opens, you must log in to ChatGPT manually.
REM After that, the session is saved in chatgpt-profile/ and reused.

setlocal

set "DOMAIN_DIR=%~dp0"
if "%DOMAIN_DIR:~-1%"=="\" set "DOMAIN_DIR=%DOMAIN_DIR:~0,-1%"
set "CODE_DIR=%DOMAIN_DIR%\code"

echo === KOZON ChatGPT Image Generation Test ===
echo.
echo Domain: %DOMAIN_DIR%
echo.
echo First run: a Chrome window will open. Log in to ChatGPT once.
echo From the second run on, login is automatic.
echo.
echo Result images will be saved to: %CODE_DIR%\generated\
echo.
echo Press any key to start...
pause > nul

cd /d "%CODE_DIR%"
node scripts/test_chatgpt_image.mjs

echo.
echo === Done ===
echo Open this folder to see the result:
echo   %CODE_DIR%\generated\
echo.
pause
