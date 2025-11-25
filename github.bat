@echo off
setlocal enabledelayedexpansion
set "REPO_URL=https://github.com/mavinms/prism-project.git"
set "RESTORE_FOLDER_NAME=Prism_RESTORE_COPY"

:menu
cls
echo.
echo ==========================================================
echo === PRISM PROJECT GIT UTILITY ===
echo ==========================================================
echo.
echo 1. BACKUP (Save and upload local changes to GitHub)
echo 2. RESTORE (List versions & clone a fresh copy)
echo 3. EXIT
echo.
set /p choice="Enter your choice (1, 2, or 3): "

if /i "%choice%"=="1" goto backup
if /i "%choice%"=="2" goto restore
if /i "%choice%"=="3" goto exit_script

echo Invalid choice. Please try again.
pause
goto menu

:backup
    cls
    echo ==========================================================
    echo === RUNNING BACKUP OPERATION (COMMIT AND PUSH) ===
    echo ==========================================================
    echo.
    
    git status >nul 2>&1
    if errorlevel 1 (
        echo ERROR: You must run the Backup option INSIDE the Prism folder.
        pause
        goto menu
    )
    
    set /p commit_msg="Enter a short commit message: "

    echo.
    echo 1. Staging all changes...
    git add .

    echo.
    echo 2. Committing changes...
    git commit -m "%commit_msg%"

    if errorlevel 1 (
        echo.
        echo WARNING: No new changes found to commit. Skipping push.
        goto :push
    )

    :push
    echo.
    echo 3. Pushing committed changes to GitHub for backup...
    git push

    if errorlevel 1 (
        echo.
        echo ERROR: Push failed. Check your internet connection or GitHub authentication.
    ) else (
        echo.
        echo === Backup successful! Your work is now safely saved on GitHub. ===
    )
    
    pause
    goto menu

:restore
    cls
    echo ==========================================================
    echo === AVAILABLE BACKUP VERSIONS ===
    echo ==========================================================
    
    REM Check if inside Git repo to run git log
    git status >nul 2>&1
    if errorlevel 1 (
        echo ERROR: Restore function must be run INSIDE the Prism folder to list history.
        pause
        goto menu
    )

    echo NOTE: The timestamp is based on your system's local time (close to IST/Asia Kolkata).
    echo.
    echo [ID] | [Date/Time] [TZ] | [Commit Message]
    echo ----------------------------------------------------------------------------------
    
    REM Use custom git log format: Short SHA | Date/Time | Subject/Message
    REM The format uses the system's local time with IST (which is 5:30 ahead of UTC)
    git log --pretty=format:"%%h | %%ad | %%s" --date=format:"%%Y-%%m-%%d %%H:%%M:%%S IST" --all --max-count=20
    
    echo.
    echo ==========================================================
    
    set /p selected_sha="Enter the **SHORT COMMIT ID** (e.g., a83e523) to restore: "

    if "%selected_sha%"=="" (
        echo ERROR: Commit ID cannot be empty.
        pause
        goto menu
    )

    cls
    echo ===================================================================
    echo === RESTORE COMMAND READY FOR VERSION %selected_sha% ===
    echo ===================================================================
    echo.
    echo To safely create a clean copy of this specific version:
    echo 1. Exit this script by typing '3' at the menu.
    echo 2. Navigate to the parent directory (Desktop):
    echo    cd ..
    echo 3. Run the clone command below (Copy/Paste it):
    echo.
    echo    git clone %REPO_URL% --branch %selected_sha% %RESTORE_FOLDER_NAME%
    echo.
    echo This will create a new folder named '%RESTORE_FOLDER_NAME%' containing ONLY the files from commit %selected_sha%. 
    echo.
    pause
    goto menu

:exit_script
    echo Exiting Git Utility.
    exit /b