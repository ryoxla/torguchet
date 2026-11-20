import { api } from "./globals";

// Единый шаблон печати расходной накладной.
// Используется и в открытом документе (InvoiceForm), и в списке (InvoiceList),
// чтобы печатная форма всегда была одинаковой.
//
// Параметры:
//   number          — номер накладной
//   dateStr         — уже отформатированная дата (напр. '31.12.2025')
//   payment_type    — 'cash' | 'credit'
//   companyName     — отправитель
//   counterpartyName— покупатель (для cash обычно 'Частное лицо')
//   counterparty_id — id контрагента (для загрузки сальдо по кредиту)
//   lines           — позиции: product_name, grade_name, country_name,
//                     unit_short, qty, price, cost_price, batch_number
export async function printSaleInvoice({
  number,
  dateStr,
  payment_type,
  companyName = "—",
  counterpartyName = "—",
  counterparty_id = null,
  lines = [],
}) {
  const fmt2 = (n) => {
    const v = parseFloat(n) || 0;
    return v.toLocaleString("ru-RU", {
      minimumFractionDigits: v % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    });
  };

  const date = dateStr || new Date().toLocaleDateString("ru-RU");
  const totalAmt = lines.reduce(
    (s, l) => s + (parseFloat(l.qty) || 0) * (parseFloat(l.price) || 0),
    0
  );

  // Сальдо контрагента (только для кредита)
  let debtStr = "";
  if (payment_type === "credit" && counterparty_id) {
    try {
      const bal = await api(`/counterparties/balance`);
      const cp = (bal || []).find((r) => String(r.id) === String(counterparty_id));
      if (cp) {
        const saldo = parseFloat(cp.saldo) || 0;
        if (saldo > 0) debtStr = fmt2(saldo);
      }
    } catch (e) {}
  }

  const makeRows = (withMargin) =>
    lines
      .map((l, i) => {
        const extras = [
          l.grade_name && l.grade_name !== "—" ? l.grade_name : null,
          l.country_name && l.country_name !== "—" ? l.country_name : null,
        ]
          .filter(Boolean)
          .join(", ");
        const productCell = extras
          ? `${l.product_name || "—"}, ${extras}`
          : l.product_name || "—";
        const price = parseFloat(l.price) || 0,
          cost = parseFloat(l.cost_price) || 0;
        const markerCell = withMargin
          ? `<td style="text-align:center;width:20px;font-weight:bold;">${
              price < cost ? "!" : price === cost ? "=" : ""
            }</td>`
          : "";
        const batchCell = withMargin
          ? `<td style="width:60px;font-size:11px">${l.batch_number || "—"}</td>`
          : "";
        return `<tr>${markerCell}<td>${i + 1}</td><td>${productCell}</td>${batchCell}<td>${
          l.unit_short || "шт"
        }</td><td style="text-align:right">${
          parseFloat(l.qty) || 0
        }</td><td style="text-align:right">${fmt2(
          price
        )}</td><td style="text-align:right"><b>${fmt2(
          (parseFloat(l.qty) || 0) * price
        )}</b></td></tr>`;
      })
      .join("");

  const makeTable = (withMargin) =>
    `<table><thead><tr>${
      withMargin ? '<th style="width:20px"></th>' : ""
    }<th style="width:22px">№</th><th>Товар</th>${
      withMargin ? '<th style="width:60px">Партия</th>' : ""
    }<th style="width:36px">Ед.</th><th style="text-align:right;width:50px">Кол-во</th><th style="text-align:right;width:65px">Цена</th><th style="text-align:right;width:75px">Сумма</th></tr></thead><tbody>${
      withMargin ? makeRows(true) : makeRows(false)
    }</tbody><tfoot><tr><td colspan="${
      withMargin ? 7 : 5
    }" style="text-align:right">ИТОГО:</td><td style="text-align:right">${fmt2(
      totalAmt
    )}</td></tr></tfoot></table>`;

  const makeBody = (withMargin) =>
    `<h2>РАСХОДНАЯ НАКЛАДНАЯ № ${number}</h2><div class="subtitle">от ${date}</div><div class="meta"><div><div class="meta-row"><span class="meta-label">Отправитель:</span><b>${companyName}</b></div><div class="meta-row"><span class="meta-label">Покупатель:</span><b>${counterpartyName}</b></div></div><div><div class="meta-row"><span class="meta-label">Тип оплаты:</span><b>${
      payment_type === "cash" ? "Наличные" : "Кредит"
    }</b></div>${
      debtStr
        ? `<div class="meta-row"><span class="meta-label">Долг:</span><b>${debtStr}</b></div>`
        : ""
    }</div></div>${makeTable(
      withMargin
    )}<div class="signatures"><div><div class="sig-line">Отпустил: _________________________ / _______________ /</div></div><div><div class="sig-line">Получил: __________________________ / _______________ /</div></div></div>`;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Накладная ${number}</title><style>*{margin:0;padding:0;box-sizing:border-box;}@page{size:A4 landscape;margin:8mm;}body{font-family:Arial,sans-serif;font-size:13px;color:#000;background:transparent;}h2{font-size:15px;text-align:center;margin-bottom:4px;}.subtitle{text-align:center;font-size:13px;color:#000;margin-bottom:8px;}.meta{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px;border:1px solid #000;padding:7px;background:transparent;}.meta-row{display:flex;gap:6px;margin-bottom:3px;}.meta-label{color:#000;min-width:90px;}table{width:100%;border-collapse:collapse;margin-bottom:10px;table-layout:fixed;background:transparent;}th{background:transparent;border:1px solid #000;padding:4px 5px;text-align:left;font-size:12px;}td{border:1px solid #000;padding:3px 5px;font-size:12px;overflow:hidden;background:transparent;}tfoot td{background:transparent;font-weight:bold;}.signatures{display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-top:16px;}.sig-line{border-top:1px solid #000;margin-top:20px;padding-top:4px;font-size:12px;color:#000;}.copy-label{font-size:12px;color:#000;text-align:right;margin-bottom:3px;}.wrapper{display:flex;gap:0;width:100%;}.vdivider{width:0;border-left:2px dashed #000;margin:0 8px;flex-shrink:0;}.col{flex:1;min-width:0;}@media print{@page{size:A4 landscape;margin:8mm;}html,body{margin:0;padding:0;}}</style></head><body><div class="wrapper"><div class="col">${makeBody(
    false
  )}</div><div class="vdivider"></div><div class="col">${makeBody(
    true
  )}</div></div><script>window.onload=()=>{window.print();}<\/script></body></html>`;

  const w = window.open("", "_blank", "width=900,height=700");
  w.document.write(html);
  w.document.close();
}
