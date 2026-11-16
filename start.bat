@echo off
setlocal
cd /d "%~dp0"

set PORT=8000
set URL=http://localhost:%PORT%/html/index.html

rem --- Python finden -------------------------------------------------------
where py >nul 2>nul
if %errorlevel%==0 (
  set PYTHON=py -3
) else (
  where python >nul 2>nul
  if errorlevel 1 (
    echo Python wurde nicht gefunden. Bitte Python 3 von https://www.python.org installieren
    echo und beim Installieren "Add python.exe to PATH" anhaken.
    pause
    exit /b 1
  )
  set PYTHON=python
)

rem --- Virtuelle Umgebung beim ersten Start einrichten ---------------------
if not exist ".venv\Scripts\python.exe" (
  echo Richte Python-Umgebung ein, das dauert beim ersten Mal etwas...
  %PYTHON% -m venv .venv
  if errorlevel 1 goto :fehler
  ".venv\Scripts\python.exe" -m pip install -r requirements.txt
  if errorlevel 1 goto :fehler
)

rem --- Optional: Datensammelpaesse neu auswerten ---------------------------
echo.
choice /C JN /M "Datensammelpaesse (Fotos in assets\images) jetzt neu auswerten"
if %errorlevel%==1 (
  ".venv\Scripts\python.exe" generate_freigaben.py
  if errorlevel 1 (
    echo.
    echo Die Auswertung ist fehlgeschlagen. Die bisherige freigaben.json bleibt erhalten.
    pause
  )
)

rem --- Webserver starten und Browser oeffnen -------------------------------
echo.
echo Cookiemaster laeuft unter %URL%
echo Zum Beenden dieses Fenster schliessen oder Strg+C druecken.
start "" /min cmd /c "timeout /t 2 /nobreak >nul & start %URL%"
".venv\Scripts\python.exe" -m http.server %PORT%
exit /b 0

:fehler
echo.
echo Einrichtung fehlgeschlagen. Bitte Internetverbindung pruefen und erneut starten.
pause
exit /b 1
