@echo off
setlocal
cd /d "%~dp0"

set PORT=8000
set URL=http://localhost:%PORT%/html/index.html

rem --- Python finden (wird nur als kleiner Webserver gebraucht) ------------
where py >nul 2>nul
if %errorlevel%==0 (
  set PYTHON=py -3
) else (
  where python >nul 2>nul
  if errorlevel 1 (
    echo Python wurde nicht gefunden. Bitte Python 3 von https://www.python.org installieren
    echo und beim Installieren "Add python.exe to PATH" anhaken.
    echo.
    echo Ohne Installation geht es auch online: https://margeonie.github.io/cookiemaster/
    pause
    exit /b 1
  )
  set PYTHON=python
)

rem --- Webserver starten und Browser oeffnen -------------------------------
echo Cookiemaster laeuft unter %URL%
echo Zum Beenden dieses Fenster schliessen oder Strg+C druecken.
start "" /min cmd /c "timeout /t 2 /nobreak >nul & start %URL%"
%PYTHON% -m http.server %PORT%
