@echo off
:: ============================================================
:: NKQM Attendance Harvester - Auto-Launcher
:: Called by Windows Task Scheduler every 3 hours on weekdays
:: ============================================================

title NKQM Attendance Harvester

:: Full path to Python (hardcoded so Task Scheduler can always find it)
set "PYTHON=C:\Python314\python.exe"

:: Script directory (same folder as this .bat)
set "SCRIPT_DIR=%~dp0"

echo [%DATE% %TIME%] Harvester starting...

:: Verify Python exists
if not exist "%PYTHON%" (
    echo ERROR: Python not found at %PYTHON%
    echo Update the PYTHON variable in this batch file.
    exit /b 1
)

:: Run the harvester
"%PYTHON%" "%SCRIPT_DIR%manual_harvester.py"

if %ERRORLEVEL% EQU 0 (
    echo [%DATE% %TIME%] Harvester completed successfully.
) else (
    echo [%DATE% %TIME%] Harvester exited with error code: %ERRORLEVEL%
)

exit /b %ERRORLEVEL%
