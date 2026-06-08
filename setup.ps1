# GAZACODE GitHub Setup Script
# Run this script from PowerShell in the GAZACODE folder
# Usage: .\setup.ps1

Write-Host ""
Write-Host "  GAZACODE - GitHub Setup" -ForegroundColor Green
Write-Host "  =======================" -ForegroundColor Green
Write-Host ""

# Check if git is installed
try {
    $gitVersion = git --version 2>&1
    if ($LASTEXITCODE -ne 0) { throw "Git not found" }
    Write-Host "  Git found: $gitVersion" -ForegroundColor Gray
} catch {
    Write-Host "  ERROR: Git is not installed!" -ForegroundColor Red
    Write-Host ""
    Write-Host "  Install Git from: https://git-scm.com/download/win" -ForegroundColor Yellow
    Write-Host "  Then run this script again." -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

Write-Host ""

# Check if .git exists
if (Test-Path ".git") {
    Write-Host "  Git repo already exists. Skipping init." -ForegroundColor Gray
} else {
    Write-Host "  Initializing git repo..." -ForegroundColor Cyan
    git init
    git branch -M main
}

# Configure git if not set
$name = git config user.name 2>&1
$email = git config user.email 2>&1
if (-not $name -or -not $email) {
    Write-Host ""
    Write-Host "  Git is not configured. Setting up..." -ForegroundColor Cyan
    $userName = Read-Host "  Enter your name"
    $userEmail = Read-Host "  Enter your email"
    git config --global user.name $userName
    git config --global user.email $userEmail
}

# Add remote
Write-Host ""
Write-Host "  Adding remote..." -ForegroundColor Cyan
$remoteExists = git remote -v 2>&1 | Select-String "origin"
if (-not $remoteExists) {
    git remote add origin https://github.com/a7medelmadhoun/GAZACODE.git
    Write-Host "  Remote added: https://github.com/a7medelmadhoun/GAZACODE.git" -ForegroundColor Green
} else {
    Write-Host "  Remote 'origin' already exists." -ForegroundColor Gray
}

# Build project
Write-Host ""
Write-Host "  Building project..." -ForegroundColor Cyan
npm run build 2>&1 | Out-Null
if ($LASTEXITCODE -eq 0) {
    Write-Host "  Build successful!" -ForegroundColor Green
} else {
    Write-Host "  Build failed. Check errors above." -ForegroundColor Red
    exit 1
}

# Stage files
Write-Host ""
Write-Host "  Staging files..." -ForegroundColor Cyan
git add .

# Check status
Write-Host ""
Write-Host "  Git status:" -ForegroundColor Cyan
git status

# Commit
Write-Host ""
Write-Host "  Committing..." -ForegroundColor Cyan
$commitMsg = "feat: GAZACODE v2.0 - multi-provider AI CLI

- 5 AI providers (OpenAI, Anthropic, Gemini, OpenRouter, OpenCode Zen)
- Smart task planning with visual checklist (⬜/✅)
- Settings page for provider/model/API key
- File operations and browser control
- Green theme and Arabic/RTL support
- Auto-saved sessions"

git commit -m $commitMsg

# Push
Write-Host ""
Write-Host "  Pushing to GitHub..." -ForegroundColor Cyan
git push -u origin main 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "  SUCCESS! Code pushed to GitHub." -ForegroundColor Green
    Write-Host "  https://github.com/a7medelmadhoun/GAZACODE" -ForegroundColor Cyan
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "  Push failed. Try running:" -ForegroundColor Yellow
    Write-Host "    git push -u origin main" -ForegroundColor White
    Write-Host ""
}
