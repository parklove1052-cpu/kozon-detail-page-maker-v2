@echo off
REM KOZON Detail Page Maker - one-click launcher
REM Uses %~dp0 to avoid Korean path hardcoding (encoding-safe)

setlocal

set "DOMAIN_DIR=%~dp0"
if "%DOMAIN_DIR:~-1%"=="\" set "DOMAIN_DIR=%DOMAIN_DIR:~0,-1%"

set "VBS_FILE=%DOMAIN_DIR%\code\start_hidden.vbs"
set "ERR_LOG=%DOMAIN_DIR%\server_launcher_error.log"
set "STDERR_LOG=%DOMAIN_DIR%\server_stderr.log"
set "HEALTH_URL=http://127.0.0.1:7777/api/health"

REM Find HTML entry file inside domain dir (single .html at root)
set "HTML_FILE="
for %%F in ("%DOMAIN_DIR%\*.html") do if not defined HTML_FILE set "HTML_FILE=%%F"
if not defined HTML_FILE (
    echo [ERROR] No .html entry file found in domain folder.
    pause
    exit /b 1
)

echo [KOZON] Checking server on port 7777 ...

curl --silent --max-time 2 --output nul --write-out "%%{http_code}" "%HEALTH_URL%" > "%TEMP%\kozon_health.tmp" 2>nul
set /p HTTP_CODE=<"%TEMP%\kozon_health.tmp"
del /q "%TEMP%\kozon_health.tmp" 2>nul

if "%HTTP_CODE%"=="200" goto :open_html

echo [KOZON] Server is OFF. Starting hidden launcher ...
wscript "%VBS_FILE%"

echo [KOZON] Waiting for server (max 15s) ...
set TRIES=0

:wait_loop
if %TRIES% geq 15 goto :timeout
ping -n 2 127.0.0.1 > nul

curl --silent --max-time 2 --output nul --write-out "%%{http_code}" "%HEALTH_URL%" > "%TEMP%\kozon_health2.tmp" 2>nul
set /p HTTP_CODE=<"%TEMP%\kozon_health2.tmp"
del /q "%TEMP%\kozon_health2.tmp" 2>nul

if "%HTTP_CODE%"=="200" goto :open_html
set /a TRIES=%TRIES%+1
goto :wait_loop

:timeout
echo.
echo [ERROR] Server did not start within 15 seconds.
echo.
if exist "%ERR_LOG%" (
    echo === Last 20 lines of server_launcher_error.log ===
    powershell -NoProfile -Command "Get-Content -LiteralPath '%ERR_LOG%' -Tail 20"
)
if exist "%STDERR_LOG%" (
    echo.
    echo === Last 20 lines of server_stderr.log ===
    powershell -NoProfile -Command "Get-Content -LiteralPath '%STDERR_LOG%' -Tail 20"
)
echo.
pause
goto :eof

:open_html
echo [KOZON] Server is UP. Opening UI ...
start "" "%HTML_FILE%"
goto :eof
