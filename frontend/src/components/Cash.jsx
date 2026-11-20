import { useState, useEffect } from "react";
import { C, fmt, fmtDate, api, ConfirmDialog, isDateRestricted } from "../utils/globals";

import PaymentForm from "./PaymentForm";

function Cash({ counterparties, accounts, currencies, articles, currentUser }) {
  const [ops,          setOps]          = useState([]);
  const [cashAccounts, setCashAccounts] = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [openForm,     setOpenForm]     = useState(null);
  const [openPaymentId,setOpenPaymentId]= useState(null);
  const [confirm,      setConfirm]      = useState(null);
  const [dirFilter,    setDirFilter]    = useState("all");
  const [sort, setSort] = useState({col:"date", dir:1}); // dir:1=asc, -1=desc
  const [search,       setSearch]       = useState("");
  const [filterAccount,setFilterAccount]= useState("");

  const today = new Date().toISOString().slice(0, 10);
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo,   setDateTo]   = useState(today);

  const loadData = () => {
    setLoading(true);
    const p = new URLSearchParams();
    if (dateFrom)      p.set("date_from",  dateFrom);
    if (dateTo)        p.set("date_to",    dateTo);
    if (filterAccount) p.set("account_id", filterAccount);
    Promise.all([
      api(`/cash/operations?${p}`),
      api("/cash/balance"),
    ]).then(([opsData, balData]) => {
      setOps(opsData.map(r => ({
        id:          r.id,
        number:      r.number      || "—",
        date:        fmtDate(r.payment_date),
        datetime:    r.payment_date || r.created_at || '',
        account:     r.account_name || "—",
        counterparty:r.counterparty_name || (r.order_id ? "Частное лицо" : "—"),
        article:     r.article_name || "—",
        direction:   r.direction,
        amount:      Number(r.amount) || 0,
        currency:    r.currency_code || "RUB",
        status:      r.status,
        order_id:    r.order_id  || null,
        return_id:   r.return_id || null,
        note:        r.note      || "",
        doc:         r.order_number || r.return_number || "",
      })));
      setCashAccounts(balData);
      if (!filterAccount) {
        const def = balData.find(a => a.is_default) || balData[0];
        if (def) setFilterAccount(String(def.id));
      }
    }).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, []);
  useEffect(() => { if (dateFrom || dateTo) loadData(); }, [dateFrom, dateTo, filterAccount]);

  const deleteOp = id => {
    api(`/payments/${id}`, "DELETE").then(() => loadData()).catch(e => alert("Ошибка: " + e.message));
    setConfirm(null);
  };

  const totalIn  = ops.filter(o => o.direction === "incoming").reduce((s, o) => s + o.amount, 0);
  const totalOut = ops.filter(o => o.direction === "outgoing").reduce((s, o) => s + o.amount, 0);
  const filtered = ops.filter(o => {
    if (dirFilter === "incoming" && o.direction !== "incoming") return false;
    if (dirFilter === "outgoing" && o.direction !== "outgoing") return false;
    if (search && !o.counterparty.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const sortedFiltered = [...filtered].sort((a, b) => {
    if (sort.col === "date") {
      const da = new Date(a.datetime || a.date.split('.').reverse().join('-'));
      const db = new Date(b.datetime || b.date.split('.').reverse().join('-'));
      return (da - db) * sort.dir;
    }
    if (sort.col === "counterparty") return a.counterparty.localeCompare(b.counterparty) * sort.dir;
    if (sort.col === "amount") return (a.amount - b.amount) * sort.dir;
    return 0;
  });
  const toggleSort = col => setSort(s => s.col === col ? {col, dir: s.dir * -1} : {col, dir: 1});
  const SortIcon = ({col}) => <span style={{fontSize:9,marginLeft:3,color:C.textDim}}>{sort.col===col?(sort.dir===1?"↑":"↓"):"↕"}</span>;

  const defaultAccount = cashAccounts.find(a => a.is_default) || cashAccounts[0];
  const cashOnly = (accounts || []).filter(a => a.type === "cash" && (a.active || a.is_active));

  const selStyle = { background: C.bg, border: `1px solid ${C.borderLight}`, color: C.text, borderRadius: 6, padding: "6px 10px", fontSize: 12, outline: "none" };
  const inpStyle = { ...selStyle, colorScheme:C.scheme };
  const btnDir   = active => ({ padding: "4px 10px", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, background: active ? C.accent : C.surface, color: active ? "#fff" : C.textMuted });

  return (
    /* ── центрирующая обёртка ── */
    <div style={{ display: "flex", justifyContent: "center", padding: "28px 24px" }}>
      <div style={{ width: "100%", maxWidth: 1060 }}>

        {/* ── Шапка ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, paddingBottom: 16, borderBottom: `1px solid ${C.border}` }}>
          <div>
            <h1 style={{ color: C.text, fontSize: 20, fontWeight: 700, letterSpacing: "-0.3px", margin: 0 }}>Касса</h1>
            <div style={{ color: C.textMuted, fontSize: 12, marginTop: 3 }}>Кассовые операции</div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button onClick={() => { setOpenPaymentId(null); setOpenForm("incoming"); }}
              style={{ padding: "7px 16px", background: "transparent", border: `2px solid ${C.greenText}`, color: C.greenText, borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}>
              + Приход
            </button>
            <button onClick={() => { setOpenPaymentId(null); setOpenForm("outgoing"); }}
              style={{ padding: "7px 16px", background: "transparent", border: `2px solid ${C.redText}`, color: C.redText, borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}>
              − Расход
            </button>
          </div>
        </div>

        {/* ── KPI + фильтр направления ── */}
        <div style={{ display: "grid", gridTemplateColumns: "auto auto auto 1fr", gap: 1, marginBottom: 14, background: C.border, borderRadius: 8, overflow: "hidden" }}>
          {[
            { l: "Входящих",  v: "+" + fmt(Math.round(totalIn))  + " ₽", c: C.greenText },
            { l: "Исходящих", v: "−" + fmt(Math.round(totalOut)) + " ₽", c: C.redText   },
            { l: "Сальдо",    v: fmt(Math.round(totalIn - totalOut)) + " ₽", c: (totalIn - totalOut) >= 0 ? C.accentText : C.redText },
          ].map((k, i) => (
            <div key={i} style={{ background: C.surface, padding: "10px 18px" }}>
              <div style={{ color: C.textDim, fontSize: 11, marginBottom: 3 }}>{k.l}</div>
              <div style={{ color: k.c, fontSize: 15, fontWeight: 700 }}>{k.v}</div>
            </div>
          ))}
          <div style={{ background: C.surface, padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
            <div style={{ display: "flex", border: `1px solid ${C.borderLight}`, borderRadius: 5, overflow: "hidden" }}>
              {[{ id: "all", l: "Все" }, { id: "incoming", l: "↓ Вход." }, { id: "outgoing", l: "↑ Исход." }].map(d => (
                <button key={d.id} onClick={() => setDirFilter(d.id)} style={btnDir(dirFilter === d.id)}>{d.l}</button>
              ))}
            </div>
            <input placeholder="Поиск..." value={search} onChange={e => setSearch(e.target.value)}
              style={{ background: C.bg, border: `1px solid ${C.borderLight}`, color: C.text, borderRadius: 5, padding: "4px 10px", fontSize: 12, outline: "none", width: 160 }}/>
          </div>
        </div>

        {/* ── Период + касса ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, padding: "10px 14px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, flexWrap: "wrap" }}>
          <span style={{ color: C.textMuted, fontSize: 12, whiteSpace: "nowrap" }}>Период:</span>
          {[
            { l: "Сегодня", f: () => { setDateFrom(today); setDateTo(today); } },
            { l: "Неделя",  f: () => { const d = new Date(); const from = new Date(d); from.setDate(d.getDate() - 7); setDateFrom(from.toISOString().slice(0, 10)); setDateTo(today); } },
            { l: "Месяц",   f: () => { const d = new Date(); const from = new Date(d); from.setMonth(d.getMonth() - 1); setDateFrom(from.toISOString().slice(0, 10)); setDateTo(today); } },
          ].map(b => (
            <button key={b.l} onClick={b.f} style={{ padding: "4px 10px", background: C.surface, border: `1px solid ${C.borderLight}`, color: C.textMuted, borderRadius: 5, cursor: "pointer", fontSize: 11, fontWeight: 600 }}>{b.l}</button>
          ))}
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={inpStyle}/>
          <span style={{ color: C.textMuted }}>—</span>
          <input type="date" value={dateTo}   onChange={e => setDateTo(e.target.value)}   style={inpStyle}/>
          <div style={{ marginLeft: 4 }}>
            <select value={filterAccount} onChange={e => setFilterAccount(e.target.value)} style={selStyle}>
              <option value="">Все кассы</option>
              {cashAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        </div>

        {/* ── Таблица ── */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
          <div className="ct-wrap">
            <table className="ct">
              <thead><tr>
                <th style={{ width: 52, cursor:"pointer", userSelect:"none" }} onClick={()=>toggleSort("date")}>Дата<SortIcon col="date"/></th>
                <th style={{ width: 28 }}></th>
                <th style={{cursor:"pointer", userSelect:"none"}} onClick={()=>toggleSort("counterparty")}>Контрагент<SortIcon col="counterparty"/></th>
                <th>Касса</th>
                <th>Статья</th>
                <th>Документ</th>
                <th>Примечание</th>
                <th className="r" style={{ width: 140, cursor:"pointer", userSelect:"none" }} onClick={()=>toggleSort("amount")}>Сумма<SortIcon col="amount"/></th>
                <th style={{ width: 100 }}></th>
              </tr></thead>
              <tbody>
                {loading && <tr><td colSpan={9} style={{ padding: 32, textAlign: "center", color: C.textDim }}>Загрузка...</td></tr>}
                {!loading && filtered.length === 0 && <tr><td colSpan={9} style={{ padding: 32, textAlign: "center", color: C.textDim }}>Нет операций за период</td></tr>}
                {sortedFiltered.map(p => {
                  const isIn   = p.direction === "incoming";
                  const locked = !!p.order_id || !!p.return_id;
                  return (
                    <tr key={p.id} onDoubleClick={() => { if (locked) return; setOpenPaymentId(p.id); setOpenForm(p.direction); }} style={{ cursor: locked ? "default" : "pointer" }}>
                      <td style={{ color: C.textDim, fontSize: 12, whiteSpace: "nowrap" }}>{p.date}</td>
                      <td><span style={{ color: isIn ? C.greenText : C.redText, fontSize: 14, fontWeight: 700 }}>{isIn ? "↓" : "↑"}</span></td>
                      <td style={{ fontSize: 13 }}>{p.counterparty}</td>
                      <td style={{ color: C.textMuted, fontSize: 12 }}>{p.account}</td>
                      <td style={{ color: C.textMuted, fontSize: 12 }}>{p.article || "—"}</td>
                      <td><span style={{ color: C.accentText, fontFamily: "monospace", fontSize: 11 }}>{p.doc || "—"}</span></td>
                      <td style={{ maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: C.textMuted, fontSize: 11, fontStyle: "italic" }} title={p.note}>{p.note || ""}</td>
                      <td className="r"><span style={{ fontWeight: 700, fontSize: 13, color: isIn ? C.greenText : C.redText, fontFamily: "monospace" }}>{isIn ? "+" : "−"}{fmt(p.amount)} ₽</span></td>
                      <td>
                        <div style={{ display: "flex", gap: 3, justifyContent: "flex-end", alignItems: "center" }}>
                          {locked
                            ? <span title={p.order_id ? "Привязан к накладной" : "Привязан к возврату"} style={{ padding: "2px 8px", fontSize: 12, color: C.textDim }}>🔒</span>
                            : <>
                              <button onClick={() => { setOpenPaymentId(p.id); setOpenForm(p.direction); }}
                                style={{ padding: "2px 8px", background: "transparent", border: `1px solid ${C.borderLight}`, color: C.textMuted, borderRadius: 4, cursor: "pointer", fontSize: 11, fontWeight: 600 }}>Открыть</button>
                              <button
                                onClick={() => { if(isDateRestricted(currentUser, p.date)){alert("Нет доступа: можно удалять только документы сегодняшней датой");return;} setConfirm({ id: p.id, name: `от ${p.date}` }); }}
                                style={{ padding: "2px 6px", background: "transparent", border: `1px solid ${C.redDim}`, color: C.redText, borderRadius: 4, cursor: "pointer", fontSize: 12, fontWeight: 700 }}
                              >✕</button>
                            </>
                          }
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot><tr>
                <td colSpan={7} style={{ padding: "8px 10px", color: C.textDim, fontSize: 12 }}>Итого за период:</td>
                <td className="r" style={{ padding: "8px 10px" }}>
                  <div style={{ color: C.greenText, fontFamily: "monospace", fontSize: 12, fontWeight: 600 }}>+{fmt(Math.round(totalIn))} ₽</div>
                  <div style={{ color: C.redText,   fontFamily: "monospace", fontSize: 12, fontWeight: 600 }}>−{fmt(Math.round(totalOut))} ₽</div>
                </td>
                <td/>
              </tr></tfoot>
            </table>
          </div>
        </div>

        {confirm && <ConfirmDialog text={`Удалить операцию ${confirm.name}?`} onConfirm={() => deleteOp(confirm.id)} onClose={() => setConfirm(null)}/>}

      </div>

      {/* ── Модалка: форма платежа ── */}
      {(openForm || openPaymentId) && (
        <div onClick={e => { if (e.target === e.currentTarget) { setOpenForm(null); setOpenPaymentId(null); } }}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 200, display: "flex", alignItems: "flex-start", justifyContent: "center", overflowY: "auto", paddingTop: 60, paddingBottom: 40 }}>
          <div style={{ background: C.surface, border: `1px solid ${C.borderLight}`, borderRadius: 10, width: 480, maxHeight: "90vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
            <PaymentForm
              editId={openPaymentId}
              direction={openForm}
              counterparties={counterparties}
              accounts={cashOnly}
              currencies={currencies}
              articles={articles}
              currentUser={currentUser}
              forceCashOnly={true}
              defaultAccountId={defaultAccount?.id}
              onBack={()    => { setOpenForm(null); setOpenPaymentId(null); }}
              onSaved={()   => { setOpenForm(null); setOpenPaymentId(null); loadData(); }}
              onDeleted={()  => { setOpenForm(null); setOpenPaymentId(null); loadData(); }}
            />
          </div>
        </div>
      )}

    </div>
  );
}

export default Cash;
