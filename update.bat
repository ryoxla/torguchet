@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
set "APP=%~dp0"
if "%APP:~-1%"=="\" set "APP=%APP:~0,-1%"

echo ============================================
echo   Обновление ТоргУчёт
echo ============================================
echo Текущая версия:
node -p "require('./package.json').version"
echo.

if not exist ".env" ( echo Нет файла .env - это не рабочая установка. & pause & exit /b 1 )

set "ZIP=%~1"
if "%ZIP%"=="" set /p ZIP=Путь к файлу обновления (zip). Можно перетащить файл в это окно:
set "ZIP=%ZIP:"=%"
if not exist "%ZIP%" ( echo Файл не найден: %ZIP% & pause & exit /b 1 )

echo.
echo ВАЖНО: закройте окно с запущенной программой (start.bat) и попросите
echo всех сотрудников закрыть браузер с программой.
pause

echo.
echo [1/5] Резервная копия баз...
call backup.bat nopause
if errorlevel 1 (
  echo.
  echo Резервная копия не создана. Обновление ОТМЕНЕНО, ничего не изменено.
  pause & exit /b 1
)
for /f "delims=" %%d in ('dir /b /ad /o-n backup') do ( set "LAST=%%d" & goto :got )
:got

echo.
echo [2/5] Сохраняю текущие файлы программы (для отката)...
robocopy "%APP%" "%APP%\backup\%LAST%\program" /E /XD node_modules backup /XF .env .auth_secret schema_company.sql >nul
if errorlevel 8 ( echo Не удалось сохранить файлы программы. Обновление отменено. & pause & exit /b 1 )

echo [3/5] Распаковываю обновление...
set "TMPD=%TEMP%\torguchet_update"
if exist "%TMPD%" rmdir /s /q "%TMPD%"
powershell -NoProfile -Command "Expand-Archive -LiteralPath '%ZIP%' -DestinationPath '%TMPD%' -Force"
if errorlevel 1 ( echo Не удалось распаковать архив. Обновление отменено. & pause & exit /b 1 )
set "SRC=%TMPD%"
if exist "%TMPD%\TorgUchet\server.js" set "SRC=%TMPD%\TorgUchet"
if not exist "%SRC%\server.js" ( echo В архиве нет server.js - это не обновление ТоргУчёт. & pause & exit /b 1 )

echo [4/5] Заменяю файлы программы (настройки .env и данные не трогаю)...
robocopy "%SRC%" "%APP%" /E /XD node_modules backup public /XF .env .auth_secret schema_company.sql >nul
if errorlevel 8 ( echo Ошибка копирования файлов. Выполните rollback.bat & pause & exit /b 1 )
if exist "%SRC%\public" robocopy "%SRC%\public" "%APP%\public" /MIR >nul
if errorlevel 8 ( echo Ошибка копирования интерфейса. Выполните rollback.bat & pause & exit /b 1 )
rmdir /s /q "%TMPD%"

echo [5/5] Обновляю библиотеки...
call npm install --omit=dev
if errorlevel 1 ( echo Не удалось установить библиотеки. Проверьте интернет и повторите update.bat & pause & exit /b 1 )

echo.
echo ============================================
echo   Готово. Новая версия:
node -p "require('./package.json').version"
echo   Теперь запустите start.bat. База обновится сама при первом запуске.
echo   Копия баз и старых файлов: backup\%LAST%
echo   Если что-то пошло не так: rollback.bat
echo ============================================
pause
