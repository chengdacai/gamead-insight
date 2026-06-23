@echo off
echo ============================================
echo    GameAd Insight v6.14 Push to GitHub  
echo ============================================
echo.
cd /d "C:\Users\86184\WorkBuddy\2026-06-21-00-25-26\hotspot-v3"

set GIT="C:\Users\86184\.workbuddy\vendor\PortableGit\bin\git.exe"

echo [1/3] Commit changes...
%GIT% add -A 2>nul
%GIT% commit -m "v6.14: fix ad sources + simplify monitor UI + 1h interval" 2>nul

echo [2/3] Trying HTTPS push...
%GIT% push origin master 2>nul
if %ERRORLEVEL% EQU 0 goto SUCCESS

echo HTTPS timeout, trying SSH...
set GIT_SSH_COMMAND=ssh -i "%USERPROFILE%\.ssh\id_ed25519_gamead" -o StrictHostKeyChecking=no
%GIT% remote set-url origin git@github.com:chengdacai/gamead-insight.git
%GIT% push origin master
if %ERRORLEVEL% EQU 0 goto SSH_SUCCESS

echo.
echo ============================================
echo    SSH key needs GitHub authorization
echo ============================================
echo.
echo Copy the key below and paste at this URL:
echo https://github.com/settings/ssh/new
echo.
echo ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAICuwesA6PHweECMeSYRR6i+4lw/vkDMMQlMXQJVLZyKb
echo.
echo After adding the key, run this script again.
echo.
%GIT% remote set-url origin https://github.com/chengdacai/gamead-insight.git
pause
exit

:SSH_SUCCESS
%GIT% remote set-url origin https://github.com/chengdacai/gamead-insight.git
:SUCCESS
echo.
echo ============================================
echo    SUCCESS! Render will auto-deploy
echo    Wait 5-10 minutes, refresh website
echo ============================================
echo.
pause
