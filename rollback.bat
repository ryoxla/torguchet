@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
set "APP=%~dp0"
if "%APP:~-1%"=="\" set "APP=%APP:~0,-1%"
echo Откат программы к старой версии (из копии, сделанной update.bat).
echo Доступные копии:
for /d %%d in (backup\*) do if exist "%%d\program\server.js" echo   %%~nxd
echo.
set /p TS=Впишите имя папки копии (например 2026-11-18_10-30):
if not exist "backup\%TS%\program\server.js" ( echo Такой копии нет. & pause & exit /b 1 )
echo Закройте start.bat, если он запущен.
pause
robocopy "backup\%TS%\program" "%APP%" /E /XD node_modules >nul
if errorlevel 8 ( echo Ошибка копирования. & pause & exit /b 1 )
call npm install --omit=dev
echo.
echo Программа возвращена к версии:
node -p "require('./package.json').version"
echo.
echo ВНИМАНИЕ: откат меняет только программу. Если новая версия уже изменила базу
echo и старая с ней не работает - базу нужно восстановить из копии
echo backup\%TS%\*.dump (напишите разработчику, поможем).
pause
