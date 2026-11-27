// exceljs подключается при первом обращении: если библиотека не установлена
// (распаковали архив поверх без npm install), сервер всё равно запускается,
// а импорт отвечает понятной ошибкой.
'use strict';
let mod = null;
class ExcelMissingError extends Error {}
function loadExcel() {
  if (mod) return mod;
  try { mod = require('exceljs'); }
  catch (e) {
    throw new ExcelMissingError('Не установлена библиотека для Excel (exceljs). Запустите update.bat ещё раз или выполните в папке программы: npm install --omit=dev');
  }
  return mod;
}
module.exports = { loadExcel, ExcelMissingError };
