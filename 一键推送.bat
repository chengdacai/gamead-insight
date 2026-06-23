@echo off
echo ============================================
echo    GameAd Insight v6.14 Push to GitHub
echo ============================================
echo.
cd /d "C:\Users\86184\WorkBuddy\2026-06-21-00-25-26\hotspot-v3"

set GIT="C:\Users\86184\.workbuddy\vendor\PortableGit\bin\git.exe"

echo [Step 1/2] Commit changes...
%GIT% add -A 2>nul
%GIT% commit -m "v6.14: dockerfile fix" 2>nul

echo.
echo [Step 2/2] Pushing to GitHub...
%GIT% push origin master
if %ERRORLEVEL% EQU 0 (
    echo.
    echo ============================================
    echo    Success! Render will auto-deploy
    echo    Wait 5-10 minutes then refresh website
    echo ============================================
) else (
    echo.
    echo ============================================
    echo    Push failed. Run in terminal:
    echo    cd hotspot-v3 ^&^& git push origin master
    echo ============================================
)
echo.
pause
