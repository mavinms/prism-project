@echo off
set /p commit_msg="Enter a short commit message (e.g., 'Finished feature X'): "

echo.
echo ===========================================
echo === 1. Staging all changes for commit... ===
echo ===========================================
git add .

echo.
echo ====================================================
echo === 2. Committing changes with message: "%commit_msg%" ===
echo ====================================================
git commit -m "%commit_msg%"

if errorlevel 1 (
    echo.
    echo WARNING: No new changes found to commit. Skipping push.
    goto :end
)

echo.
echo ======================================================
echo === 3. Pushing committed changes to GitHub for backup... ===
echo ======================================================
git push

echo.
echo === Backup complete! Check GitHub for confirmation. ===

:end
pause