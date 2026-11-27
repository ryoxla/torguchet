# ТоргУчёт

Локальная учётная система для торговли (Node.js + Express + PostgreSQL, веб-интерфейс в `public/`).

Текущая версия: **1.4.0**.

Установка и обновление у клиента — в файле [ИНСТРУКЦИЯ.txt](ИНСТРУКЦИЯ.txt).

## Фронтенд

Исходники React-приложения лежат в каталоге `frontend/` (Vite 5, React 18). Клиентам отдаётся уже собранный интерфейс из `public/` (`index.html`, `assets/`, `vendor/`). Сборка ноября 2026 в `public/assets` в репозитории — та, что сейчас стоит у клиентов; её не перезаписывают, пока сознательно не выпускают новую версию.

Собрать интерфейс и положить его в `public/`:

```bash
cd frontend
npm ci
npm run build
```

`npm run build` пишет результат в `../public` (`outDir` в `frontend/vite.config.js`). Каталог не очищается целиком (`emptyOutDir: false`), поэтому `public/vendor/` остаётся. Файлы из `frontend/public` (шаблонные favicon и icons) в корень не копируются (`copyPublicDir: false`), чтобы не затирать уже лежащие в `public/` иконки. Обновляются `public/index.html` и файлы в `public/assets/`. Старые файлы с прежним хэшем в `assets/` сборка не удаляет — лишние можно убрать вручную.

Запросы идут на относительный `/api` того же сервера. Режим (`single` / `multi`) и номер версии экран входа берёт из `GET /api/config`.

## Импорт справочников из Excel

Серверная часть — каталог `import/` (подключается в `server.js` одной строкой):

- `import/kinds.js` — колонки шаблонов, проверка строк и запись для контрагентов, сортов и товаров;
- `import/format.js` — чтение .xlsx (`exceljs`) и .csv (UTF-8 / Windows-1251, разделитель `;`, `,` или табуляция), лимиты;
- `import/template.js` — шаблон .xlsx (собирается на лету, списки значений берутся из базы компании) и файл ошибок;
- `import/index.js` — маршруты `/api/import/:kind/template`, `/preview`, `/commit`, `/errors-file`, где `kind` — `counterparties`, `grades` или `products`.

Предпросмотр и загрузка получают сам файл (`application/octet-stream`, имя в заголовке `X-File-Name`). При загрузке файл проверяется заново внутри транзакции, таблицы справочника блокируются на запись (`LOCK TABLE … SHARE ROW EXCLUSIVE`), пишутся только корректные строки. Лимиты: файл до 5 МБ, до 5000 строк, распакованный xlsx до 80 МБ. Миграций нет.

Интерфейс — `frontend/src/components/ImportExcel.jsx`, кнопки — в `DirTable.jsx`.
