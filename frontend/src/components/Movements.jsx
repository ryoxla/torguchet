import { useState, useEffect } from "react";
import { C, fmt, fmtDate, api, Card, Btn } from "../utils/globals";

function Movements() {
  const today = new Date();
  const pad = n => String(n).padStart(2, '0');
  const firstOfMonth = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-01`;
  const todayISO      = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

  const [dateFrom, setDateFrom] = useState(firstOfMonth);
  const [dateTo,   setDateTo]   = useState(todayISO);
  const [filterWarehouse, setFilterWarehouse] = useState("");
  const [filterSupplier,  setFilterSupplier]  = useState("");
  const [filterBatch,     setFilterBatch]     = useState("");
  const [filterGrade,     setFilterGrade]     = useState("");
  const [filterBuyer,     setFilterBuyer]     = useState("");

  const [rows,    setRows]    = useState([]);
  const [loading, setLoading] = useState(false);
  const [applied, setApplied] = useState(false);

  const [warehouses,     setWarehouses] = useState([]);
  const [counterparties, setCps]        = useState([]);
  const [grades,         setGrades]     = useState([]);
  const [batches,        setBatches]    = useState([]);

  useEffect(() => {
    api('/warehouses').then(r => setWarehouses(r)).catch(() => {});
    api('/counterparties').then(r => setCps(r)).catch(() => {});
    api('/grades').then(r => setGrades(r)).catch(() => {});
    api('/stock-movements')
      .then(r => {
        const seen = new Set();
        const bs = [];
        r.forEach(m => { if (m.batch_id && m.batch_number && !seen.has(m.batch_id)) { seen.add(m.batch_id); bs.push({ id: m.batch_id, batch_number: m.batch_number }); } });
        setBatches(bs);
      }).catch(() => {});
  }, []);

  const loadReport = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (dateFrom)        params.set('date_from',    dateFrom);
    if (dateTo)          params.set('date_to',      dateTo);
    if (filterWarehouse) params.set('warehouse_id', filterWarehouse);
    if (filterSupplier)  params.set('supplier_id',  filterSupplier);
    if (filterBatch)     params.set('batch_id',     filterBatch);
    if (filterGrade)     params.set('grade_id',     filterGrade);
    if (filterBuyer)     params.set('buyer_id',     filterBuyer);
    api(`/inventory-report?${params}`)
      .then(data => { setRows(data); setApplied(true); })
      .catch(e => alert('Ошибка: ' + e.message))
      .finally(() => setLoading(false));
  };

  const totals = rows.reduce((t, r) => ({
    opening:  t.opening  + Number(r.opening_qty),
    incoming: t.incoming + Number(r.incoming_qty),
    sale:     t.sale     + Number(r.sale_qty),
    return:   t.return   + Number(r.return_qty),
    transfer: t.transfer + Number(r.transfer_qty),
    writeoff: t.writeoff + Number(r.writeoff_qty),
    current:  t.current  + Number(r.current_qty),
  }), { opening: 0, incoming: 0, sale: 0, return: 0, transfer: 0, writeoff: 0, current: 0 });

  const selStyle = { width: "100%", background: C.bg, border: `1px solid ${C.borderLight}`, color: C.text, borderRadius: 6, padding: "7px 10px", fontSize: 12, outline: "none" };
  const inpStyle = { ...selStyle, colorScheme: "dark" };
  const lbl = t => <div style={{ color: C.textMuted, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{t}</div>;

  return (
    /* центрирующая обёртка — подстраивается под реальную ширину таблицы */
    <div style={{ display: "flex", justifyContent: "center", padding: "28px 24px" }}>
      <div style={{ width: "fit-content", maxWidth: "100%" }}>

        {/* ── Шапка ── */}
        <div style={{ marginBottom: 16 }}>
          <h1 style={{ margin: 0, color: C.text, fontSize: 20, fontWeight: 700, letterSpacing: "-0.3px" }}>Движение товара</h1>
          <div style={{ color: C.textMuted, fontSize: 12, marginTop: 3 }}>Оборотная ведомость по партиям</div>
        </div>

        {/* ── Фильтры ── */}
        <Card style={{ padding: "16px 20px", marginBottom: 16, minWidth: 900 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 10, marginBottom: 10 }}>
            <div>{lbl("С даты")}<input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={inpStyle}/></div>
            <div>{lbl("По дату")}<input type="date" value={dateTo}   onChange={e => setDateTo(e.target.value)}   style={inpStyle}/></div>
            <div>{lbl("Склад")}
              <select value={filterWarehouse} onChange={e => setFilterWarehouse(e.target.value)} style={selStyle}>
                <option value="">Все склады</option>
                {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            <div>{lbl("Поставщик")}
              <select value={filterSupplier} onChange={e => setFilterSupplier(e.target.value)} style={selStyle}>
                <option value="">Все</option>
                {counterparties.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>{lbl("Покупатель")}
              <select value={filterBuyer} onChange={e => setFilterBuyer(e.target.value)} style={selStyle}>
                <option value="">Все</option>
                {counterparties.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>{lbl("Сорт")}
              <select value={filterGrade} onChange={e => setFilterGrade(e.target.value)} style={selStyle}>
                <option value="">Все</option>
                {grades.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
            <div>{lbl("Партия")}
              <select value={filterBatch} onChange={e => setFilterBatch(e.target.value)} style={selStyle}>
                <option value="">Все</option>
                {batches.map(b => <option key={b.id} value={b.id}>{b.batch_number}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Btn primary onClick={loadReport}>Применить</Btn>
          </div>
        </Card>

        {/* ── Таблица ── */}
        {!applied && !loading && (
          <Card style={{ padding: 48, textAlign: "center", color: C.textDim, fontSize: 14 }}>
            Установите фильтры и нажмите «Применить»
          </Card>
        )}
        {loading && <Card style={{ padding: 48, textAlign: "center", color: C.textMuted, fontSize: 14 }}>Загрузка...</Card>}
        {applied && !loading && (
          <Card>
            <div className="ct-wrap">
              <table className="ct">
                <thead><tr>
                  <th>Товар</th>
                  <th>Дата</th>
                  <th>Партия</th>
                  <th>Сорт</th>
                  <th>Страна</th>
                  <th>Склад</th>
                  <th>Поставщик</th>
                  <th className="r">Себест.</th>
                  <th className="r">Цена пр.</th>
                  <th className="r">Ост. нач.</th>
                  <th className="r" style={{ color: C.greenText  }}>Приход</th>
                  <th className="r" style={{ color: C.redText    }}>Расход</th>
                  <th className="r" style={{ color: C.tealText   }}>Перемещ.</th>
                  <th className="r" style={{ color: C.accentText }}>Возврат</th>
                  <th className="r" style={{ color: C.yellowText }}>Списание</th>
                  <th className="r" style={{ color: C.purpleText }}>Наличие</th>
                </tr></thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr><td colSpan={16} style={{ padding: 32, textAlign: "center", color: C.textDim }}>Нет данных по заданным фильтрам</td></tr>
                  )}
                  {rows.map((r, i) => {
                    const opening  = Number(r.opening_qty)  || 0;
                    const incoming = Number(r.incoming_qty) || 0;
                    const sale     = Number(r.sale_qty)     || 0;
                    const ret      = Number(r.return_qty)   || 0;
                    const transfer = Number(r.transfer_qty) || 0;
                    const writeoff = Number(r.writeoff_qty) || 0;
                    const current  = Number(r.current_qty)  || 0;
                    const costPrice    = Number(r.cost_price)     || 0;
                    const avgSalePrice = Number(r.avg_sale_price) || 0;
                    return (
                      <tr key={i}>
                        <td style={{ fontWeight: 500 }}>{r.product_name}</td>
                        <td style={{ fontFamily: "monospace", fontSize: 11, color: C.textMuted, whiteSpace: "nowrap" }}>{r.purchase_date ? fmtDate(r.purchase_date) : "—"}</td>
                        <td><span style={{ color: C.accentText, fontFamily: "monospace", fontSize: 11 }}>{r.batch_number || "—"}</span></td>
                        <td style={{ fontSize: 12 }}>{r.grade_name || "—"}</td>
                        <td style={{ color: C.textMuted, fontSize: 12 }}>{r.country_name || "—"}</td>
                        <td style={{ color: C.textMuted, fontSize: 12 }}>{r.warehouse_name || "—"}</td>
                        <td style={{ color: C.textMuted, fontSize: 12 }}>{r.supplier_name || "—"}</td>
                        <td className="r" style={{ fontFamily: "monospace", fontSize: 12, color: C.textMuted }}>{costPrice > 0 ? fmt(costPrice) + " ₽" : "—"}</td>
                        <td className="r" style={{ fontFamily: "monospace", fontSize: 12, color: C.textMuted }}>{avgSalePrice > 0 ? fmt(avgSalePrice) + " ₽" : "—"}</td>
                        <td className="r" style={{ fontFamily: "monospace", fontSize: 12, fontWeight: opening > 0 ? 600 : 400, color: opening > 0 ? C.text : C.textDim }}>{opening > 0 ? fmt(Math.round(opening)) : "—"}</td>
                        <td className="r" style={{ fontFamily: "monospace", fontSize: 12, color: incoming > 0 ? C.greenText : C.textDim, fontWeight: incoming > 0 ? 600 : 400 }}>{incoming > 0 ? "+" + fmt(Math.round(incoming)) : "—"}</td>
                        <td className="r" style={{ fontFamily: "monospace", fontSize: 12, color: sale > 0 ? C.redText : C.textDim, fontWeight: sale > 0 ? 600 : 400 }}>{sale > 0 ? fmt(Math.round(sale)) : "—"}</td>
                        <td className="r" style={{ fontFamily: "monospace", fontSize: 12, color: transfer !== 0 ? C.tealText : C.textDim }}>{transfer !== 0 ? fmt(Math.round(transfer)) : "—"}</td>
                        <td className="r" style={{ fontFamily: "monospace", fontSize: 12, color: ret > 0 ? C.accentText : C.textDim }}>{ret > 0 ? fmt(Math.round(ret)) : "—"}</td>
                        <td className="r" style={{ fontFamily: "monospace", fontSize: 12, color: writeoff > 0 ? C.yellowText : C.textDim, fontWeight: writeoff > 0 ? 600 : 400 }}>{writeoff > 0 ? fmt(Math.round(writeoff)) : "—"}</td>
                        <td className="r" style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: current > 0 ? C.purpleText : current < 0 ? C.redText : C.textDim }}>{fmt(Math.round(current))}</td>
                      </tr>
                    );
                  })}
                </tbody>
                {rows.length > 1 && (
                  <tfoot><tr style={{ background: C.bg }}>
                    <td colSpan={9} style={{ padding: "8px 10px", color: C.textMuted, fontSize: 12, fontWeight: 600 }}>Итого ({rows.length} партий)</td>
                    <td className="r" style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700 }}>{fmt(Math.round(totals.opening))}</td>
                    <td className="r" style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: C.greenText  }}>{totals.incoming > 0 ? "+" + fmt(Math.round(totals.incoming)) : "—"}</td>
                    <td className="r" style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: C.redText    }}>{totals.sale > 0 ? fmt(Math.round(totals.sale)) : "—"}</td>
                    <td className="r" style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: C.tealText   }}>{totals.transfer !== 0 ? fmt(Math.round(totals.transfer)) : "—"}</td>
                    <td className="r" style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: C.accentText }}>{totals.return > 0 ? fmt(Math.round(totals.return)) : "—"}</td>
                    <td className="r" style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: C.yellowText }}>{totals.writeoff > 0 ? fmt(Math.round(totals.writeoff)) : "—"}</td>
                    <td className="r" style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: C.purpleText }}>{fmt(Math.round(totals.current))}</td>
                  </tr></tfoot>
                )}
              </table>
            </div>
          </Card>
        )}

      </div>
    </div>
  );
}

// ─── ПЕРЕМЕЩЕНИЯ ТОВАРА ───────────────────────────────────────────────────────

export default Movements;
