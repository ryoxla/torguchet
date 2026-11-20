import { useState, useMemo } from "react";
import { C, fmt, api, Card, Btn } from "../utils/globals";

function SalesReport({ warehouses, counterparties, products, grades }) {
  const today = new Date();
  const pad = n => String(n).padStart(2, '0');
  const firstOfMonth = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-01`;
  const todayISO      = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

  const [dateFrom, setDateFrom] = useState(firstOfMonth);
  const [dateTo,   setDateTo]   = useState(todayISO);
  const [filterWarehouse,    setFilterWarehouse]    = useState("");
  const [filterCounterparty, setFilterCounterparty] = useState("");
  const [filterProduct,      setFilterProduct]      = useState("");
  const [filterGrade,        setFilterGrade]        = useState("");
  const [filterPayment,      setFilterPayment]      = useState("");
  const [filterSupplier,     setFilterSupplier]     = useState("");
  const [filterCpCategory,   setFilterCpCategory]   = useState("");
  const [rows,    setRows]    = useState([]);
  const [loading, setLoading] = useState(false);
  const [applied, setApplied] = useState(false);
  const [groupBy, setGroupBy] = useState("line");
  const [excludeZeroCost, setExcludeZeroCost] = useState(true);
  const [sort, setSort] = useState({ col: "", dir: 1 });

  // Базовые данные после фильтра по нулевой себестоимости — используются и для таблицы, и для KPI/итогов/Excel
  const baseRows = useMemo(() => {
    if (!excludeZeroCost) return rows;
    return rows.filter(r => Number(r.cost_price) > 0 || Number(r.cost_total) > 0);
  }, [rows, excludeZeroCost]);

  const loadReport = () => {
    setLoading(true);
    const p = new URLSearchParams();
    if (dateFrom)           p.set('date_from', dateFrom);
    if (dateTo)             p.set('date_to', dateTo);
    if (filterWarehouse)    p.set('warehouse_id', filterWarehouse);
    if (filterCounterparty) p.set('counterparty_id', filterCounterparty);
    if (filterProduct)      p.set('product_id', filterProduct);
    if (filterGrade)        p.set('grade_id', filterGrade);
    if (filterPayment)      p.set('payment_type', filterPayment);
    if (filterSupplier)     p.set('supplier_id', filterSupplier);
    if (filterCpCategory)   p.set('cp_category_id', filterCpCategory);
    api(`/sales-report?${p}`)
      .then(data => { setRows(data); setApplied(true); })
      .catch(e => alert('Ошибка: ' + e.message))
      .finally(() => setLoading(false));
  };

  const grouped = useMemo(() => {
    let arr;
    if (groupBy === 'line') {
      arr = [...baseRows];
    } else {
      const map = {};
      baseRows.forEach(r => {
        const key = groupBy === 'product'      ? r.product_name
                  : groupBy === 'counterparty' ? (r.counterparty_name || 'Частное лицо')
                  : groupBy === 'date'         ? String(r.sale_date).slice(0, 10)
                  : r.product_name;
        if (!map[key]) map[key] = { key, product_name: r.product_name, counterparty_name: r.counterparty_name, sale_date: r.sale_date, qty: 0, revenue: 0, cost_total: 0, profit: 0, _rows: 0 };
        map[key].qty        += Number(r.qty)        || 0;
        map[key].revenue    += Number(r.revenue)     || 0;
        map[key].cost_total += Number(r.cost_total)  || 0;
        map[key].profit     += Number(r.profit)      || 0;
        map[key]._rows++;
      });
      arr = Object.values(map).map(r => ({
        ...r,
        margin_pct: r.revenue > 0 ? Math.round((r.profit / r.revenue) * 1000) / 10 : 0,
        label: r.key,
      })).sort((a, b) => b.revenue - a.revenue);
    }

    // Применяем сортировку по колонке если выбрана
    if (sort.col) {
      const val = (r, col) => {
        if (col === "sale_date")    return r.sale_date ? new Date(r.sale_date).getTime() : 0;
        if (col === "order_number") return r.order_number || "";
        if (col === "supplier")     return r.supplier_name || "";
        if (col === "counterparty") return r.counterparty_name || "";
        if (col === "warehouse")    return r.warehouse_name || "";
        if (col === "product")      return r.product_name || r.label || "";
        if (col === "batch")        return r.batch_number || "";
        if (col === "grade")        return r.grade_name || "";
        if (col === "qty")          return Number(r.qty)        || 0;
        if (col === "price")        return Number(r.price)      || 0;
        if (col === "revenue")      return Number(r.revenue)    || 0;
        if (col === "cost")         return Number(r.cost_price) || Number(r.cost_total) || 0;
        if (col === "profit")       return Number(r.profit)     || 0;
        if (col === "margin")       return Number(r.margin_pct) || 0;
        return 0;
      };
      arr = [...arr].sort((a, b) => {
        const va = val(a, sort.col), vb = val(b, sort.col);
        return typeof va === "string" ? va.localeCompare(vb, "ru") * sort.dir : (va - vb) * sort.dir;
      });
    }

    return arr;
  }, [baseRows, groupBy, sort]);

  const totals = baseRows.reduce((t, r) => ({
    qty:     t.qty     + Number(r.qty),
    revenue: t.revenue + Number(r.revenue),
    cost:    t.cost    + Number(r.cost_total),
    profit:  t.profit  + Number(r.profit),
  }), { qty: 0, revenue: 0, cost: 0, profit: 0 });
  const totalMargin = totals.revenue > 0 ? Math.round((totals.profit / totals.revenue) * 1000) / 10 : 0;

  const selStyle = { background: C.bg, border: `1px solid ${C.borderLight}`, color: C.text, borderRadius: 6, padding: "7px 10px", fontSize: 12, outline: "none", width: "100%" };
  const inpStyle = { ...selStyle, colorScheme:C.scheme };
  const lbl = t => <div style={{ color: C.textMuted, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{t}</div>;
  const marginColor = p => p >= 20 ? C.greenText : p >= 10 ? C.yellowText : C.redText;

  const toggleSort = col => setSort(s => s.col === col ? { col, dir: s.dir * -1 } : { col, dir: 1 });
  const SortTh = ({ col, className, children, style }) => {
    const active = sort.col === col;
    const arrow  = active ? (sort.dir === 1 ? " ↑" : " ↓") : " ↕";
    return <th className={className} onClick={() => toggleSort(col)} style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap", ...(style || {}) }}>{children}{arrow}</th>;
  };

  const handleExcel = () => {
    if (!window.XLSX) { alert("Библиотека Excel не загружена"); return; }
    if (!grouped.length) { alert("Нет данных для экспорта"); return; }

    // Формируем массив объектов в зависимости от текущего режима группировки.
    // Все числовые поля — настоящие числа, чтобы Excel их корректно агрегировал.
    const data = grouped.map(r => {
      const qty     = Number(r.qty)        || 0;
      const revenue = Number(r.revenue)    || 0;
      const cost    = Number(r.cost_total) || 0;
      const profit  = Number(r.profit)     || 0;
      const margin  = Number(r.margin_pct) || 0;
      const signedQty     = r.row_type === 'return' ? -Math.abs(qty)     : qty;
      const signedRevenue = r.row_type === 'return' ? -Math.abs(revenue) : revenue;
      const signedProfit  = r.row_type === 'return' ? -Math.abs(profit)  : profit;
      if (groupBy === "line") {
        return {
          "Дата":            String(r.sale_date).slice(0, 10),
          "Накладная":       r.order_number + (r.row_type === 'return' ? ' (возврат)' : ''),
          "Поставщик":       r.supplier_name || '',
          "Покупатель":      r.counterparty_name || 'Частное лицо',
          "Склад":           r.warehouse_name || '',
          "Товар":           r.product_name || '',
          "Партия":          r.batch_number || '',
          "Сорт":            r.grade_name || '',
          "Кол-во":          signedQty,
          "Цена":            Number(r.price) || 0,
          "Выручка":         Math.round(signedRevenue * 100) / 100,
          "Себест./ед.":     Number(r.cost_price) || 0,
          "Прибыль":         Math.round(signedProfit * 100) / 100,
          "Маржа, %":        r.row_type === 'return' ? null : margin,
        };
      }
      const groupLabel = groupBy === "product"      ? "Товар"
                       : groupBy === "counterparty" ? "Покупатель"
                       : groupBy === "date"         ? "Дата"
                       : "Группа";
      return {
        [groupLabel]:  r.label || r.key,
        "Кол-во":      signedQty,
        "Выручка":     Math.round(signedRevenue * 100) / 100,
        "Себест.":     Math.round(Math.abs(cost) * 100) / 100,
        "Прибыль":     Math.round(signedProfit * 100) / 100,
        "Маржа, %":    margin,
      };
    });

    // Строка с итогами
    const totalsRow = groupBy === "line"
      ? {
          "Дата": "", "Накладная": "ИТОГО", "Поставщик": "", "Покупатель": "", "Склад": "",
          "Товар": "", "Партия": "", "Сорт": "",
          "Кол-во":      Math.round(totals.qty * 100) / 100,
          "Цена":        "",
          "Выручка":     Math.round(totals.revenue * 100) / 100,
          "Себест./ед.": "",
          "Прибыль":     Math.round(totals.profit * 100) / 100,
          "Маржа, %":    totalMargin,
        }
      : {
          [groupBy === "product" ? "Товар" : groupBy === "counterparty" ? "Покупатель" : "Дата"]: "ИТОГО",
          "Кол-во":   Math.round(totals.qty * 100) / 100,
          "Выручка":  Math.round(totals.revenue * 100) / 100,
          "Себест.":  Math.round(totals.cost * 100) / 100,
          "Прибыль":  Math.round(totals.profit * 100) / 100,
          "Маржа, %": totalMargin,
        };
    data.push(totalsRow);

    const ws = window.XLSX.utils.json_to_sheet(data);
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, "Отчёт");
    const fileName = `sales_${dateFrom}_${dateTo}.xlsx`;
    window.XLSX.writeFile(wb, fileName);
  };

  return (
    /* центрирующая обёртка — подстраивается под реальную ширину таблицы */
    <div style={{ display: "flex", justifyContent: "center", padding: "28px 24px" }}>
      <div style={{ width: "fit-content", maxWidth: "100%" }}>

        {/* ── Шапка ── */}
        <div style={{ marginBottom: 16 }}>
          <h1 style={{ margin: 0, color: C.text, fontSize: 20, fontWeight: 700, letterSpacing: "-0.3px" }}>Отчёт по продажам</h1>
          <div style={{ color: C.textMuted, fontSize: 12, marginTop: 3 }}>Выручка, себестоимость, прибыль</div>
        </div>

        {/* ── Фильтры ── */}
        <Card style={{ padding: "16px 20px", marginBottom: 16, width: "100%" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 10, marginBottom: 10 }}>
            <div>{lbl("С даты")}<input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={inpStyle}/></div>
            <div>{lbl("По дату")}<input type="date" value={dateTo}   onChange={e => setDateTo(e.target.value)}   style={inpStyle}/></div>
            <div>{lbl("Склад")}
              <select value={filterWarehouse} onChange={e => setFilterWarehouse(e.target.value)} style={selStyle}>
                <option value="">Все склады</option>
                {(warehouses || []).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            <div>{lbl("Покупатель")}
              <select value={filterCounterparty} onChange={e => setFilterCounterparty(e.target.value)} style={selStyle}>
                <option value="">Все</option>
                {(counterparties || []).filter(c => c.active || c.is_active).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>{lbl("Поставщик")}
              <select value={filterSupplier} onChange={e => setFilterSupplier(e.target.value)} style={selStyle}>
                <option value="">Все</option>
                {(counterparties || []).filter(c => c.active || c.is_active).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 10 }}>
            <div>{lbl("Кат. контрагента")}
              <select value={filterCpCategory} onChange={e => setFilterCpCategory(e.target.value)} style={selStyle}>
                <option value="">Все</option>
                {(counterparties || []).reduce((cats, c) => { if (c.category_id && c.category_name && !cats.find(x => x.id === c.category_id)) cats.push({ id: c.category_id, name: c.category_name }); return cats; }, []).map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
              </select>
            </div>
            <div>{lbl("Товар")}
              <select value={filterProduct} onChange={e => setFilterProduct(e.target.value)} style={selStyle}>
                <option value="">Все</option>
                {(products || []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>{lbl("Сорт")}
              <select value={filterGrade} onChange={e => setFilterGrade(e.target.value)} style={selStyle}>
                <option value="">Все</option>
                {(grades || []).map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
            <div>{lbl("Оплата")}
              <select value={filterPayment} onChange={e => setFilterPayment(e.target.value)} style={selStyle}>
                <option value="">Все</option>
                <option value="cash">Наличные</option>
                <option value="credit">Кредит</option>
              </select>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              {lbl("Группировка:")}
              {[{ id: "line", l: "Строки" }, { id: "product", l: "По товару" }, { id: "counterparty", l: "По покупателю" }, { id: "date", l: "По дате" }].map(g => (
                <button key={g.id} onClick={() => setGroupBy(g.id)} style={{ padding: "4px 12px", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, borderRadius: 4, background: groupBy === g.id ? C.accent : C.surface, color: groupBy === g.id ? "#fff" : C.textMuted }}>{g.l}</button>
              ))}
              <label style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 12, cursor: "pointer", color: C.textMuted, fontSize: 12, userSelect: "none" }}>
                <input type="checkbox" checked={excludeZeroCost} onChange={e => setExcludeZeroCost(e.target.checked)} style={{ cursor: "pointer" }}/>
                Исключить с себест. 0
              </label>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Btn primary onClick={loadReport}>Применить</Btn>
              {applied && grouped.length > 0 && <Btn onClick={handleExcel}>📊 Excel</Btn>}
            </div>
          </div>
        </Card>

        {!applied && !loading && (
          <Card style={{ padding: 48, textAlign: "center", color: C.textDim, fontSize: 14, width: "100%" }}>Установите фильтры и нажмите «Применить»</Card>
        )}
        {loading && <Card style={{ padding: 48, textAlign: "center", color: C.textMuted, width: "100%" }}>Загрузка...</Card>}

        {applied && !loading && (<>
          {/* ── KPI ── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 16 }}>
            {[
              { l: "Выручка",        v: fmt(Math.round(totals.revenue)) + " ₽", c: C.accentText },
              { l: "Себестоимость",  v: fmt(Math.round(totals.cost))    + " ₽", c: C.redText     },
              { l: "Валовая прибыль",v: fmt(Math.round(totals.profit))  + " ₽", c: totals.profit >= 0 ? C.greenText : C.redText },
              { l: "Маржа",          v: totalMargin + "%",                       c: marginColor(totalMargin) },
            ].map((k, i) => (
              <Card key={i} style={{ padding: "16px 20px", borderLeft: `3px solid ${k.c}` }}>
                <div style={{ color: C.textMuted, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>{k.l}</div>
                <div style={{ color: k.c, fontSize: 22, fontWeight: 700, fontFamily: "monospace" }}>{k.v}</div>
              </Card>
            ))}
          </div>

          {/* ── Таблица ── */}
          <Card>
            <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: C.text, fontWeight: 600, fontSize: 14 }}>{grouped.length} {groupBy === "line" ? "строк" : "групп"}</span>
              <span style={{ color: C.textDim, fontSize: 12 }}>Итого: {fmt(Math.round(totals.revenue))} ₽ · прибыль {fmt(Math.round(totals.profit))} ₽ · маржа {totalMargin}%</span>
            </div>
            <div className="ct-wrap">
              <table className="ct">
                <thead><tr>
                  {groupBy === "line" && <>
                    <SortTh col="sale_date">Дата</SortTh>
                    <SortTh col="order_number">Накладная</SortTh>
                    <SortTh col="supplier">Поставщик</SortTh>
                    <SortTh col="counterparty">Покупатель</SortTh>
                    <SortTh col="warehouse">Склад</SortTh>
                    <SortTh col="product">Товар</SortTh>
                    <SortTh col="batch">Партия</SortTh>
                    <SortTh col="grade">Сорт</SortTh>
                  </>}
                  {groupBy === "product"      && <SortTh col="product">Товар</SortTh>}
                  {groupBy === "counterparty" && <SortTh col="product">Покупатель</SortTh>}
                  {groupBy === "date"         && <SortTh col="product">Дата</SortTh>}
                  <SortTh col="qty" className="r">Кол-во</SortTh>
                  {groupBy === "line" && <SortTh col="price" className="r">Цена</SortTh>}
                  <SortTh col="revenue" className="r">Выручка</SortTh>
                  <SortTh col="cost" className="r">{groupBy === "line" ? "Себест./ед." : "Себест."}</SortTh>
                  <SortTh col="profit" className="r" style={{ color: C.greenText }}>Прибыль</SortTh>
                  <SortTh col="margin" className="r" style={{ color: C.accentText }}>Маржа</SortTh>
                </tr></thead>
                <tbody>
                  {grouped.length === 0 && <tr><td colSpan={12} style={{ padding: 32, textAlign: "center", color: C.textDim }}>Нет данных</td></tr>}
                  {grouped.map((r, i) => {
                    const revenue = Number(r.revenue)    || 0;
                    const cost    = Number(r.cost_total) || 0;
                    const profit  = Number(r.profit)     || 0;
                    const margin  = Number(r.margin_pct) || 0;
                    return (
                      <tr key={i} style={{ background: r.row_type === 'return' ? C.redDim + "33" : "transparent" }}>
                        {groupBy === "line" && <>
                          <td style={{ color: C.textDim, fontSize: 12, whiteSpace: "nowrap" }}>{String(r.sale_date).slice(0, 10)}</td>
                          <td>
                            <span style={{ color: r.row_type === 'return' ? C.redText : C.accentText, fontFamily: "monospace", fontSize: 11 }}>{r.order_number}</span>
                            {r.row_type === 'return' && <span style={{ marginLeft: 4, fontSize: 10, color: C.redText, fontWeight: 700, background: C.redDim, padding: "1px 5px", borderRadius: 3 }}>возврат</span>}
                          </td>
                          <td style={{ color: C.textMuted, fontSize: 12 }}>{r.supplier_name || '—'}</td>
                          <td style={{ fontSize: 12 }}>{r.counterparty_name || 'Частное лицо'}</td>
                          <td style={{ color: C.textMuted, fontSize: 12 }}>{r.warehouse_name || '—'}</td>
                          <td style={{ fontWeight: 500 }}>{r.product_name}</td>
                          <td><span style={{ color: C.accentText, fontFamily: "monospace", fontSize: 11 }}>{r.batch_number || '—'}</span></td>
                          <td style={{ color: C.textMuted, fontSize: 12 }}>{r.grade_name || '—'}</td>
                        </>}
                        {groupBy !== "line" && <td style={{ fontWeight: 500 }}>{r.label || r.key}</td>}
                        <td className="r" style={{ fontFamily: "monospace", fontSize: 12, color: r.row_type === 'return' ? C.redText : C.text }}>{r.row_type === 'return' ? "−" : ""}{fmt(Math.abs(Number(r.qty) || 0))}</td>
                        {groupBy === "line" && <td className="r" style={{ fontFamily: "monospace", fontSize: 12, color: C.textMuted }}>{fmt(Number(r.price) || 0)} ₽</td>}
                        <td className="r" style={{ fontFamily: "monospace", fontWeight: 600, color: r.row_type === 'return' ? C.redText : C.text }}>{r.row_type === 'return' ? "−" : ""}{fmt(Math.abs(Math.round(revenue)))} ₽</td>
                        <td className="r" style={{ fontFamily: "monospace", fontSize: 12, color: C.textMuted }}>{groupBy === "line" ? fmt(Number(r.cost_price) || 0) + " ₽" : fmt(Math.round(Math.abs(cost))) + " ₽"}</td>
                        <td className="r" style={{ fontFamily: "monospace", fontWeight: 700, color: profit >= 0 ? C.greenText : C.redText }}>{fmt(Math.round(profit))} ₽</td>
                        <td className="r"><span style={{ color: marginColor(margin), fontWeight: 700, fontFamily: "monospace" }}>{r.row_type === 'return' ? "—" : margin + "%"}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot><tr>
                  <td colSpan={groupBy === "line" ? 8 : 1} style={{ padding: "8px 10px", color: C.textDim, fontSize: 12 }}>Итого:</td>
                  <td className="r" style={{ fontFamily: "monospace", fontWeight: 600 }}>{fmt(Math.round(totals.qty))}</td>
                  {groupBy === "line" && <td/>}
                  <td className="r" style={{ fontFamily: "monospace", fontWeight: 700, color: C.accentText }}>{fmt(Math.round(totals.revenue))} ₽</td>
                  <td className="r" style={{ fontFamily: "monospace", color: C.textMuted }}>{fmt(Math.round(totals.cost))} ₽</td>
                  <td className="r" style={{ fontFamily: "monospace", fontWeight: 700, color: totals.profit >= 0 ? C.greenText : C.redText }}>{fmt(Math.round(totals.profit))} ₽</td>
                  <td className="r"><span style={{ color: marginColor(totalMargin), fontWeight: 700, fontFamily: "monospace" }}>{totalMargin}%</span></td>
                </tr></tfoot>
              </table>
            </div>
          </Card>
        </>)}

      </div>
    </div>
  );
}

export default SalesReport;
