@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Не найден Node.js. Скачайте LTS-версию с https://nodejs.org и установите, затем запустите install.bat снова.
  pause & exit /b 1
)
if exist ".env" (
  echo Программа уже установлена ^(есть файл .env^). Для обновления используйте update.bat.
  pause & exit /b 1
)
echo Устанавливаю библиотеки...
call npm install --omit=dev
if errorlevel 1 ( echo Не удалось установить библиотеки. Проверьте интернет. & pause & exit /b 1 )
echo.
node install.js
if errorlevel 1 ( echo. & echo Установка не завершена. & pause & exit /b 1 )
echo.
set /p RUN=Запустить программу сейчас? (д/н): 
if /i "%RUN%"=="д" call start.bat
if /i "%RUN%"=="y" call start.bat
