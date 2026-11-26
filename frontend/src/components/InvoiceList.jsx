import { useState, useEffect } from "react";
import { C, fmt, fmtDate, api, inDateRange, DateFilter,
  INVOICES, ConfirmDialog } from "../utils/globals";
import { printSaleInvoice } from "../utils/printInvoice";

function InvoiceList({ onNav, onOpen, refreshKey = 0 }) {
  const [invoices, setInvoices] = useState(INVOICES);
  const [confirm,  setConfirm]  = useState(null);
  const [expanded,    setExpanded]    = useState({});
  const [details,     setDetails]     = useState({});
  const [loadingId,   setLoadingId]   = useState(null);
  const [allExpanded, setAllExpanded] = useState(false);

  useEffect(() => {
    api('/orders-sale').then(rows => {
      setInvoices(rows.map(r => ({
        id:                r.id,
        number:            r.number,
        date:              fmtDate(r.created_at),
        payment_type:      r.payment_type,
        counterparty:      r.payment_type === 'cash' ? 'Частное лицо' : (r.counterparty_name || '—'),
        counterparty_id:   r.counterparty_id,
        counterparty_name: r.counterparty_name || '—',
        company_name:      r.warehouse_name || '—',
        warehouse:         r.warehouse_name || '—',
        amount:            Number(r.total_amount) || 0,
        paid:              Number(r.paid_amount)  || 0,
        qty:               Number(r.total_qty)    || 0,
        status:            r.status,
        note:              r.note || '',
      })));
    }).catch(() => {});
  }, [refreshKey]);

  const _td  = new Date();
  const _fmt = d => `${String(d.getDate()).padStart(2,"0")}.${String(d.getMonth()+1).padStart(2,"0")}.${d.getFullYear()}`;
  const _today = _fmt(_td);
  const _ss = k => sessionStorage.getItem('invoiceList_'+k);
  const [dateFrom, setDateFrom] = useState(_ss('dateFrom') || _today);
  const [dateTo,   setDateTo]   = useState(_ss('dateTo')   || _today);
  const [cpSearch, setCpSearch] = useState(_ss('cpSearch') || "");
  const [sortCol,  setSortCol]  = useState(_ss('sortCol')  || "number");
  const [sortDir,  setSortDir]  = useState(_ss('sortDir')  || "desc");

  useEffect(()=>{ sessionStorage.setItem('invoiceList_dateFrom', dateFrom); }, [dateFrom]);
  useEffect(()=>{ sessionStorage.setItem('invoiceList_dateTo',   dateTo);   }, [dateTo]);
  useEffect(()=>{ sessionStorage.setItem('invoiceList_cpSearch', cpSearch); }, [cpSearch]);
  useEffect(()=>{ sessionStorage.setItem('invoiceList_sortCol',  sortCol);  }, [sortCol]);
  useEffect(()=>{ sessionStorage.setItem('invoiceList_sortDir',  sortDir);  }, [sortDir]);

  const toggleSort = col => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  };
  const sortIcon = col => sortCol === col ? (sortDir === "asc" ? " ▲" : " ▼") : " ↕";

  const filtered = invoices
    .filter(i => inDateRange(i.date, dateFrom, dateTo))
    .filter(i => !cpSearch || i.counterparty.toLowerCase().includes(cpSearch.toLowerCase()))
    .sort((a, b) => {
      let av = a[sortCol], bv = b[sortCol];
      if (sortCol === "amount" || sortCol === "qty") {
        av = Number(av); bv = Number(bv);
      } else if (sortCol === "date") {
        const toISO = s => { const [d,m,y] = (s||"").split("."); return `${y}-${m}-${d}`; };
        av = toISO(av); bv = toISO(bv);
      } else {
        av = String(av || "").toLowerCase(); bv = String(bv || "").toLowerCase();
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ?  1 : -1;
      return 0;
    });

  const loadDetails = async id => {
    if (details[id]) return;
    setLoadingId(id);
    try {
      const data = await api(`/orders-sale/${id}`);
      setDetails(prev => ({ ...prev, [id]: data.lines || [] }));
    } catch(e) {}
    setLoadingId(null);
  };

  const handleRowClick = async id => {
    const isOpen = expanded[id];
    setExpanded(prev => ({ ...prev, [id]: !isOpen }));
    if (!isOpen) await loadDetails(id);
  };

  const handleToggleAll = async () => {
    const next = !allExpanded;
    setAllExpanded(next);
    if (next) {
      const newExp = {};
      for (const inv of filtered) newExp[inv.id] = true;
      setExpanded(newExp);
      for (const inv of filtered) {
        if (!details[inv.id]) await loadDetails(inv.id);
      }
    } else {
      setExpanded({});
    }
  };

  const handleQuickPrint = async (inv) => {
    try {
      const data = await api(`/orders-sale/${inv.id}`);
      const counterpartyName = inv.payment_type === 'cash' ? 'Частное лицо' : (inv.counterparty_name || '—');
      await printSaleInvoice({
        number:          inv.number,
        dateStr:         inv.date || '',
        payment_type:    inv.payment_type,
        companyName:     data.company_name || inv.company_name || '—',
        counterpartyName,
        counterparty_id: inv.counterparty_id,
        lines:           data.lines || [],
      });
    } catch(e) { alert('Ошибка печати: ' + e.message); }
  };

  const remove = id => {
    api(`/orders-sale/${id}`, 'DELETE')
      .then(() => setInvoices(prev => prev.filter(i => i.id !== id)))
      .catch(e => alert('Ошибка удаления: ' + e.message));
    setConfirm(null);
  };

  const total = filtered.reduce((s, i) => s + i.amount, 0);

  const inp = {
    background: C.bg, border: `1px solid ${C.borderLight}`, color: C.text,
    borderRadius: 5, padding: "4px 10px", fontSize: 12, outline: "none",
  };

  return (
    <div style={{ display:"flex", justifyContent:"center", padding:"28px 24px" }}>
      <div style={{ width:"100%", maxWidth:960 }}>

        {/* ── Шапка ── */}
        <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16 }}>
          <div>
            <h1 style={{ color:C.text, fontSize:20, fontWeight:700, letterSpacing:"-0.3px", margin:0 }}>
              Расходные накладные
            </h1>
            <div style={{ color:C.textMuted, fontSize:12, marginTop:3 }}>{filtered.length} документов</div>
          </div>
          <div style={{ marginLeft:"auto", display:"flex", gap:8 }}>
            <button onClick={handleToggleAll} style={{
              padding:"7px 16px", background:"transparent",
              border:`1px solid ${C.borderLight}`, borderRadius:6,
              color:C.textMuted, fontFamily:"inherit", fontSize:13, fontWeight:600, cursor:"pointer"
            }}>{allExpanded ? "Свернуть всё" : "Детально"}</button>
            <button onClick={() => onNav("invoice_form")} style={{
              padding:"7px 16px", background:C.accent, border:"none", borderRadius:6,
              color:"#fff", fontFamily:"inherit", fontSize:13, fontWeight:600, cursor:"pointer"
            }}>+ Новая накладная</button>
          </div>
        </div>

        {/* ── Статы ── */}
        <div style={{ display:"flex", gap:10, marginBottom:14, flexWrap:"wrap" }}>
          {[
            { l:"Всего документов", v:filtered.length+" шт.", c:C.text },
            { l:"Итого сумма",      v:fmt(total)+" ₽",        c:C.accentText },
          ].map((k, i) => (
            <div key={i} style={{
              background:C.surface, border:`1px solid ${C.border}`,
              borderLeft:`3px solid ${k.c}`, borderRadius:8,
              padding:"8px 14px", minWidth:0,
            }}>
              <div style={{ color:C.textDim, fontSize:11, marginBottom:2, whiteSpace:"nowrap" }}>{k.l}</div>
              <div style={{ color:k.c, fontSize:15, fontWeight:700, whiteSpace:"nowrap" }}>{k.v}</div>
            </div>
          ))}
        </div>

        {/* ── Фильтры ── */}
        <div style={{
          display:"flex", alignItems:"center", gap:8, marginBottom:12,
          padding:"10px 14px", background:C.surface,
          border:`1px solid ${C.border}`, borderRadius:8, flexWrap:"wrap",
        }}>
          <span style={{ color:C.textMuted, fontSize:12, whiteSpace:"nowrap" }}>Период:</span>
          <DateFilter dateFrom={dateFrom} dateTo={dateTo} onFrom={setDateFrom} onTo={setDateTo}/>
          <div style={{ width:1, height:20, background:C.border, margin:"0 4px" }}/>
          <input value={cpSearch} onChange={e => setCpSearch(e.target.value)}
            placeholder="Поиск по контрагенту..." style={{ ...inp, width:200 }}/>
          {cpSearch && (
            <button type="button" onClick={() => setCpSearch("")}
              style={{ background:"none", border:"none", color:C.redText, cursor:"pointer", fontSize:12, fontWeight:600 }}>
              × сброс
            </button>
          )}
        </div>

        {/* ── Таблица ── */}
        <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, overflow:"hidden" }}>
          <div className="ct-wrap">
            <table className="ct">
              <thead>
                <tr>
                  <th style={{ width:20 }}></th>
                  {[{k:"number",l:"Номер"},{k:"date",l:"Дата"},{k:"counterparty",l:"Контрагент"},{k:"warehouse",l:"Склад"}].map(col => (
                    <th key={col.k} onClick={() => toggleSort(col.k)}
                      style={{ cursor:"pointer", userSelect:"none", whiteSpace:"nowrap" }}>
                      {col.l}<span style={{ color:C.textDim, fontSize:10 }}>{sortIcon(col.k)}</span>
                    </th>
                  ))}
                  {[{k:"qty",l:"Кол-во"},{k:"amount",l:"Сумма"}].map(col => (
                    <th key={col.k} className="r" onClick={() => toggleSort(col.k)}
                      style={{ cursor:"pointer", userSelect:"none", whiteSpace:"nowrap" }}>
                      {col.l}<span style={{ color:C.textDim, fontSize:10 }}>{sortIcon(col.k)}</span>
                    </th>
                  ))}
                  <th>Примечание</th>
                  <th style={{ width:100 }}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={9} style={{ padding:32, textAlign:"center", color:C.textDim }}>Нет документов</td></tr>
                )}
                {filtered.map(inv => {
                  const isOpen = !!expanded[inv.id];
                  const lines  = details[inv.id] || [];
                  return <>
                    <tr key={inv.id}
                      onClick={() => handleRowClick(inv.id)}
                      onDoubleClick={e => { e.stopPropagation(); onOpen && onOpen(inv.id); }}
                      style={{ cursor:"pointer", background: isOpen ? C.surface+"88" : "transparent" }}>
                      <td style={{ textAlign:"center", color:C.textMuted, fontSize:10, padding:"4px 6px" }}>
                        {loadingId === inv.id ? "…" : isOpen ? "▼" : "▶"}
                      </td>
                      <td><span style={{ color:C.accentText, fontFamily:"monospace", fontSize:12 }}>{inv.number}</span></td>
                      <td style={{ color:C.text, fontSize:12 }}>{inv.date}</td>
                      <td style={{ fontWeight:500, fontSize:12 }}>{inv.counterparty}</td>
                      <td style={{ color:C.text, fontSize:12 }}>{inv.warehouse}</td>
                      <td className="r"><span style={{ fontFamily:"monospace", color:C.text }}>{fmt(inv.qty)}</span></td>
                      <td className="r"><span style={{ fontWeight:700, fontFamily:"monospace", color:C.greenBright }}>{fmt(inv.amount)} ₽</span></td>
                      <td style={{ maxWidth:160, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
                        color:C.text, fontSize:11, fontStyle:"italic" }} title={inv.note}>{inv.note || ""}</td>
                      <td>
                        <div style={{ display:"flex", gap:3, justifyContent:"flex-end" }}>
                          <button type="button" onClick={e => { e.stopPropagation(); onOpen && onOpen(inv.id); }} style={{
                            padding:"2px 8px", background:"transparent",
                            border:`1px solid ${C.borderLight}`, color:C.textMuted,
                            borderRadius:4, cursor:"pointer", fontSize:11, fontWeight:600,
                          }}>Открыть</button>
                          <button type="button" onClick={e => { e.stopPropagation(); handleQuickPrint(inv); }} title="Печать" style={{
                            padding:"2px 7px", background:"transparent",
                            border:`1px solid ${C.borderLight}`, color:C.textMuted,
                            borderRadius:4, cursor:"pointer", fontSize:13,
                          }}>🖨</button>
                        </div>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr key={inv.id+"_detail"}>
                        <td colSpan={9} style={{ padding:0, background:C.bg }}>
                          <div style={{ padding:"8px 16px 12px 32px" }}>
                            {lines.length === 0
                              ? <div style={{ color:C.textDim, fontSize:12, padding:"8px 0" }}>Нет товарных позиций</div>
                              : <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
                                  <thead>
                                    <tr style={{ borderBottom:`1px solid ${C.border}` }}>
                                      {["Товар","Партия","Сорт","Страна","Поставщик","Ед.","Кол-во","Цена","Сумма"].map((h,i) => (
                                        <th key={i} style={{ padding:"4px 8px", textAlign:i>=6?"right":"left", color:C.textMuted, fontWeight:600, fontSize:10, textTransform:"uppercase" }}>{h}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {lines.map((l, i) => (
                                      <tr key={i} style={{ borderBottom:`1px solid ${C.border}22`, background:i%2===0?"transparent":C.surface+"33" }}>
                                        <td style={{ padding:"4px 8px", color:C.text, fontWeight:500 }}>{l.product_name||"—"}</td>
                                        <td style={{ padding:"4px 8px", fontFamily:"monospace", color:C.accentText, fontSize:10 }}>{l.batch_number||"—"}</td>
                                        <td style={{ padding:"4px 8px", color:C.textMuted }}>{l.grade_name||"—"}</td>
                                        <td style={{ padding:"4px 8px", color:C.textMuted }}>{l.country_name||"—"}</td>
                                        <td style={{ padding:"4px 8px", color:C.textMuted }}>{l.supplier_name||"—"}</td>
                                        <td style={{ padding:"4px 8px", color:C.textMuted }}>{l.unit_short||"—"}</td>
                                        <td style={{ padding:"4px 8px", textAlign:"right", fontFamily:"monospace", color:C.text }}>{fmt(Number(l.qty))}</td>
                                        <td style={{ padding:"4px 8px", textAlign:"right", fontFamily:"monospace", color:C.textMuted }}>{fmt(Number(l.price))} ₽</td>
                                        <td style={{ padding:"4px 8px", textAlign:"right", fontFamily:"monospace", fontWeight:600, color:C.accentText }}>{fmt(Math.round(Number(l.qty)*Number(l.price)))} ₽</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                            }
                          </div>
                        </td>
                      </tr>
                    )}
                  </>;
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={5} style={{ color:C.textDim, fontSize:12 }}>
                    Показано: {filtered.length} из {invoices.length}
                  </td>
                  <td className="r" colSpan={4}>
                    <span style={{ color:C.accentText, fontWeight:600, fontFamily:"monospace" }}>
                      {fmt(total)} ₽ итого
                    </span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

      </div>

      {confirm && (
        <ConfirmDialog
          text={`Удалить накладную «${confirm.name}»?`}
          onConfirm={() => remove(confirm.id)}
          onClose={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

export default InvoiceList;
