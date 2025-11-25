@echo off
echo ========================================
echo PRISM - Quick Build (No Migration)
echo ========================================
echo.
echo Migration was already completed successfully!
echo This script will just rebuild the EXE.
echo.

REM Copy web files
echo Step 1: Copying web files...
if not exist "web" mkdir web
copy /Y index.html web\ >nul
copy /Y style.css web\ >nul
copy /Y script.js web\ >nul
echo Done!

REM Build EXE
echo.
echo Step 2: Building EXE...
echo Please wait...
echo.

python -m PyInstaller --onefile --noconsole --clean --name "Prism" --icon="prism_icon.ico" --add-data "web;web" app.py

REM Check and copy
echo.
if exist "dist\Prism.exe" (
    copy /Y prism.sqlite dist\ >nul
    echo.
    echo ========================================
    echo SUCCESS!
    echo ========================================
    echo.
    echo Location: dist\Prism.exe
    echo Database: dist\prism.sqlite
    echo.
    echo Run Prism.exe from the dist folder!
    echo.
) else (
    echo.
    echo BUILD FAILED - Check errors above
    echo.
)

pause
