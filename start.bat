:: SPDX-License-Identifier: MIT
@echo off
setlocal
chcp 65001 >nul
title LuaPilot Bridge
cd /d "%~dp0"
if not exist logs mkdir logs >nul 2>nul

echo.
echo   === LuaPilot Bridge ===
echo.
if not exist "%~dp0bridge.py" (
    echo   ERROR: bridge.py not found next to start.bat.
    echo   If you opened start.bat from inside a ZIP, EXTRACT the whole ZIP first.
    pause
    exit /b 1
)

echo   [1/3] Looking for Python 3.9+...
set "PY="
for %%C in ("py -3" "python") do if not defined PY (
    %%~C -c "import sys; sys.exit(0 if sys.version_info>=(3,9) else 1)" >nul 2>nul && %%~C -m pip --version >nul 2>nul && set "PY=%%~C"
)
if not defined PY (
    where winget >nul 2>nul && winget install --id Python.Python.3.12 --source winget --accept-package-agreements --accept-source-agreements
    for %%C in ("py -3" "python") do if not defined PY (
        %%~C -c "import sys; sys.exit(0 if sys.version_info>=(3,9) else 1)" >nul 2>nul && set "PY=%%~C"
    )
)
if not defined PY (
    echo   ERROR: Python 3.9+ was not found. Install it from https://www.python.org/downloads/
    echo   and tick "Add python.exe to PATH", then run this file again.
    pause
    exit /b 1
)
echo         OK: %PY%

echo   [2/3] Checking the websockets library...
%PY% -c "import websockets" >nul 2>nul || %PY% -m pip install --user websockets || (echo   ERROR: pip could not install websockets. & pause & exit /b 1)

echo   [3/3] Starting the bridge...
echo.
echo   Keep this window open (you can minimise it). LuaPilot stops when it is closed.
echo.
%PY% "%~dp0bridge.py"
echo.
echo   Bridge stopped (exit code %errorlevel%). Log files: logs\
pause >nul
