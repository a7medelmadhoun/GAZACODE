@echo off
echo.
echo   GAZACODE - GitHub Setup
echo   =======================
echo.

:: Check git
git --version >nul 2>&1
if %errorlevel% neq 0 (
    echo   ERROR: Git is not installed!
    echo.
    echo   Install Git from: https://git-scm.com/download/win
    echo   Then run this script again.
    echo.
    pause
    exit /b 1
)

echo   Git found.
echo.

:: Init git if needed
if not exist ".git" (
    echo   Initializing git repo...
    git init
    git branch -M main
) else (
    echo   Git repo already exists.
)

:: Configure git if needed
for /f "tokens=*" %%i in ('git config user.name 2^>nul') do set GITNAME=%%i
if "%GITNAME%"=="" (
    echo.
    set /p GITNAME="  Enter your name: "
    set /p GITEMAIL="  Enter your email: "
    git config --global user.name "%GITNAME%"
    git config --global user.email "%GITEMAIL%"
)

:: Add remote
echo.
echo   Adding remote...
git remote -v | findstr "origin" >nul 2>&1
if %errorlevel% neq 0 (
    git remote add origin https://github.com/a7medelmadhoun/GAZACODE.git
    echo   Remote added.
) else (
    echo   Remote already exists.
)

:: Build
echo.
echo   Building project...
call npm run build
if %errorlevel% neq 0 (
    echo   Build failed!
    pause
    exit /b 1
)
echo   Build successful!

:: Stage and commit
echo.
echo   Staging and committing...
git add .
git commit -m "feat: GAZACODE v2.0 - multi-provider AI CLI with task planning"

:: Push
echo.
echo   Pushing to GitHub...
git push -u origin main

if %errorlevel% equ 0 (
    echo.
    echo   SUCCESS! Code pushed to GitHub.
    echo   https://github.com/a7medelmadhoun/GAZACODE
    echo.
) else (
    echo.
    echo   Push failed. Try: git push -u origin main
    echo.
)

pause
