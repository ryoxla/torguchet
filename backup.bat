@echo off
chcp 65001 >nul
cd /d "%~dp0"
node backup.js
set RC=%ERRORLEVEL%
if "%1"=="nopause" exit /b %RC%
pause
exit /b %RC%
