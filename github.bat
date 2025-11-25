@echo off
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
echo 2. RESTORE (Clone a fresh copy from GitHub)
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
    
    REM Check if we are inside a Git repository
    git status >nul 2>&1
    if errorlevel 1 (
        echo ERROR: You must run the Backup option INSIDE the Prism folder.
        pause
        goto menu
    )
    
    set /p commit_msg="Enter a short commit message (e.g., 'Finished feature X'): "

    echo.
    echo 1. Staging all changes...
    git add .

    echo.
    echo 2. Committing changes...
    git commit -m "%commit_msg%"

    if errorlevel 1 (
        echo.
        echo WARNING: No new changes found to commit.
        goto push
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
    echo === RUNNING RESTORE (CLONE) OPERATION ===
    echo ==========================================================
    echo.
    echo To safely create a clean copy of your project:
    echo 1. Exit this script by typing '3' at the menu.
    echo 2. Navigate to the parent directory (Desktop):
    echo    cd ..
    echo 3. Run the clone command below:
    echo.
    echo    git clone %REPO_URL% %RESTORE_FOLDER_NAME%
    echo.
    echo (Example: git clone %REPO_URL% Prism_RESTORE_COPY)
    echo.
    echo This will create a new folder named 'Prism_RESTORE_COPY' with all files.
    echo.
    pause
    goto menu

:exit_script
    echo Exiting Git Utility.
    exit /b