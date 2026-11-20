@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist ".env" (
  echo Нет файла .env. Скопируйте .env.example в .env и впишите пароль PostgreSQL.
  pause
  exit /b 1
)
if not exist "node_modules" (
  echo Первый запуск: устанавливаю зависимости...
  call npm install --omit=dev
)
start "" cmd /c "timeout /t 4 >nul & start http://localhost:3000"
node server.js
pause
