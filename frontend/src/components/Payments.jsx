import { useState, useRef, useEffect } from "react";
import { C, fmt, fmtDate, api, inDateRange, DateFilter,
  Lbl, Inp, ConfirmDialog, INIT_PAYMENTS } from "../utils/globals";

import PaymentForm from "./PaymentForm";

/* ── SearchSelect ── */
function SearchSelect({ value, onChange, options, placeholder = "— Выберите —", style = {} }) {
  const [query, setQuery] = useState("");
  const [open,  setOpen]  = useState(false);
  const ref = useRef(null);
  const selected = options.find(o => String(o.value) === String(value));
  const filtered = query ? options.filter(o => o.label.toLowerCase().includes(query.toLowerCase())) : options;
  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);
  return (
    <div ref={ref} style={{ position: "relative", ...style }}>
      <div style={{ display: "flex", alignItems: "center", background: C.bg, border: `1px solid ${C.borderLight}`, borderRadius: 6, overflow: "hidden" }}>
        <input value={open ? query : selected?.label || ""} onChange={e => { setQuery(e.target.value); setOpen(true); if (!e.target.value) onChange(""); }} onFocus={() => { setQuery(""); setOpen(true); }} placeholder={placeholder}
          style={{ flex: 1, background: "transparent", border: "none", color: C.text, padding: "8px 12px", fontSize: 13, outline: "none" }}/>
        {value && <button type="button" onClick={() => { onChange(""); setQuery(""); }} style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer", padding: "0 8px", fontSize: 14 }}>×</button>}
        <span style={{ color: C.textMuted, padding: "0 8px", fontSize: 11 }}>{open ? "▲" : "▼"}</span>
      </div>
      {open && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 999, background: C.surface, border: `1px solid ${C.borderLight}`, borderRadius: 6, maxHeight: 220, overflowY: "auto", boxShadow: "0 8px 24px rgba(0,0,0,0.5)", marginTop: 2 }}>
          {filtered.length === 0
            ? <div style={{ padding: "10px 14px", color: C.textMuted, fontSize: 12 }}>Ничего не найдено</div>
            : filtered.map(o => (
              <div key={o.value} onClick={() => { onChange(o.value); setQuery(""); setOpen(false); }}
                style={{ padding: "8px 14px", cursor: "pointer", fontSize: 13, color: String(o.value) === String(value) ? C.accentText : C.text, background: String(o.value) === String(value) ? C.border : "transparent" }}
                onMouseEnter={e => e.currentTarget.style.background = C.border}
                onMouseLeave={e => e.currentTarget.style.background = String(o.value) === String(value) ? C.border : "transparent"}>
                {o.label}
              </div>
            ))
          }
        </div>
      )}
    </div>
  );
}

/* ── Payments ── */
function Payments({ counterparties, accounts, currencies, articles, currentUser, legalEntities = [], refreshKey = 0 }) {
  const [payments,      setPayments]      = useState(INIT_PAYMENTS);
  const [openForm,      setOpenForm]      = useState(null);
  const [openPaymentId, setOpenPaymentId] = useState(null);
  const [openMutual,    setOpenMutual]    = useState(false);
  const [dirFilter,     setDirFilter]     = useState("all");
  const [sort, setSort] = useState({col:"date", dir:1});
  const [statusFilter,  setStatusFilter]  = useState("all");
  const [search,        setSearch]        = useState("");
  const [confirm,       setConfirm]       = useState(null);
  const [accountFilter, setAccountFilter] = useState("");

  const today = new Date().toISOString().slice(0, 10);
  const _td   = new Date();
  const _fmt  = d => `${String(d.getDate()).padStart(2,"0")}.${String(d.getMonth()+1).padStart(2,"0")}.${d.getFullYear()}`;
  const [dateFrom, setDateFrom] = useState(_fmt(_td));
  const [dateTo,   setDateTo]   = useState(_fmt(_td));

  const newMutualNum = () => "ВЗ-" + new Date().getFullYear() + "-" + String(Math.floor(Math.random() * 9000) + 1000);
  const [mutualForm,   setMutualForm]   = useState({ number: newMutualNum(), date: today, payer_id: "", receiver_id: "", amount: "", payer_currency_id: "1", payer_rate: "1", receiver_currency_id: "1", pp_number: "", payer_legal: "", receiver_legal: "", note: "" });
  const [mutualSaving, setMutualSaving] = useState(false);
  const [mutualError,  setMutualError]  = useState("");
  const setMF = (k, v) => setMutualForm(f => ({ ...f, [k]: v }));

  const mapPayment = r => ({
    id: r.id, number: r.number || "—",
    date: fmtDate(r.payment_date),
    datetime: r.payment_date || r.created_at || '',
    counterparty: r.counterparty_name || "—",
    account:   r.account_name  || "—",
    article:   r.article_name  || "—",
    direction: r.direction,
    amount:    Number(r.amount) || 0,
    currency:  r.currency_code || "RUB",
    status:    r.status,
    order_id:  r.order_id  || null,
    return_id: r.return_id || null,
    note:      r.note      || "",
    doc:       r.order_number || r.return_number || "",
    legal_name: r.legal_name || "",
    pp_number:  r.pp_number  || "",
  });

  const reloadPayments = () => api("/payments").then(rows => setPayments(rows.map(mapPayment))).catch(() => {});

  useEffect(() => { reloadPayments(); }, [refreshKey]);

  const handleMutualSave = async () => {
    if (!mutualForm.payer_id)                                           { setMutualError("Укажите плательщика"); return; }
    if (!mutualForm.receiver_id)                                        { setMutualError("Укажите получателя"); return; }
    if (!mutualForm.amount || parseFloat(mutualForm.amount) <= 0)       { setMutualError("Укажите сумму"); return; }
    if (mutualForm.payer_id === mutualForm.receiver_id)                 { setMutualError("Плательщик и получатель не могут совпадать"); return; }
    setMutualSaving(true); setMutualError("");
    try {
      const note = ["Взаимозачёт №" + mutualForm.number, mutualForm.pp_number ? "п/п " + mutualForm.pp_number : "", mutualForm.payer_legal ? "Юрлицо плательщика: " + mutualForm.payer_legal : "", mutualForm.receiver_legal ? "Юрлицо получателя: " + mutualForm.receiver_legal : "", mutualForm.note || ""].filter(Boolean).join(" · ");
      const payerAmt     = parseFloat(mutualForm.amount) || 0;
      const payerRate    = parseFloat(mutualForm.payer_rate) || 1;
      const payerCurId   = parseInt(mutualForm.payer_currency_id) || 1;
      const receiverCurId= parseInt(mutualForm.receiver_currency_id) || 1;
      const amtRub       = payerCurId === 1 ? payerAmt : payerAmt * payerRate;
      const receiverRate = receiverCurId === 1 ? 1 : payerRate;
      const receiverAmt  = receiverCurId === 1 ? amtRub : Math.round((amtRub / payerRate) * 100) / 100;
      const clearingAccountId = (accounts || []).find(a => a.type === "clearing")?.id || 7;
      await api("/payments", "POST", { number: mutualForm.number + "-1", payment_date: mutualForm.date, direction: "incoming", amount: payerAmt, counterparty_id: parseInt(mutualForm.payer_id), currency_id: payerCurId, currency_rate: payerRate, amount_base: amtRub, bank_account_id: clearingAccountId, status: "posted", note: mutualForm.note || null, legal_name: mutualForm.payer_legal || null, pp_number: mutualForm.pp_number || null });
      await api("/payments", "POST", { number: mutualForm.number + "-2", payment_date: mutualForm.date, direction: "outgoing", amount: receiverAmt, counterparty_id: parseInt(mutualForm.receiver_id), currency_id: receiverCurId, currency_rate: receiverRate, amount_base: amtRub, bank_account_id: clearingAccountId, status: "posted", note: mutualForm.note || null, legal_name: mutualForm.receiver_legal || null, pp_number: mutualForm.pp_number || null });
      setOpenMutual(false);
      setMutualForm({ number: newMutualNum(), date: today, payer_id: "", receiver_id: "", amount: "", payer_currency_id: "1", payer_rate: "1", receiver_currency_id: "1", pp_number: "", payer_legal: "", receiver_legal: "", note: "" });
      reloadPayments();
    } catch (e) {
      try { setMutualError(JSON.parse(e.message).error || e.message); } catch { setMutualError(e.message); }
    } finally { setMutualSaving(false); }
  };

  const filtered = payments.filter(p => {
    if (statusFilter !== "all" && p.status !== statusFilter) return false;
    if (dirFilter === "incoming" && p.direction !== "incoming") return false;
    if (dirFilter === "outgoing" && p.direction !== "outgoing") return false;
    if (!inDateRange(p.date, dateFrom, dateTo)) return false;
    if (accountFilter && p.account !== accountFilter) return false;
    if (search && !p.counterparty.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const remove = id => { api(`/payments/${id}`, "DELETE").catch(() => {}); setPayments(prev => prev.filter(p => p.id !== id)); setConfirm(null); };
  const sortedFiltered = [...filtered].sort((a, b) => {
    if (sort.col === "date") {
      const da = new Date(a.datetime || a.date.split('.').reverse().join('-'));
      const db = new Date(b.datetime || b.date.split('.').reverse().join('-'));
      return (da - db) * sort.dir;
    }
    if (sort.col === "number") {
      const na = parseInt((a.number||"").replace(/[^0-9]/g,'')) || 0;
      const nb = parseInt((b.number||"").replace(/[^0-9]/g,'')) || 0;
      return (na - nb) * sort.dir;
    }
    if (sort.col === "counterparty") return (a.counterparty||"").localeCompare(b.counterparty||"") * sort.dir;
    if (sort.col === "amount") return (a.amount - b.amount) * sort.dir;
    return 0;
  });
  const toggleSort = col => setSort(s => s.col === col ? {col, dir: s.dir * -1} : {col, dir: 1});
  const SortIcon = ({col}) => <span style={{fontSize:9,marginLeft:3,color:C.textDim}}>{sort.col===col?(sort.dir===1?"↑":"↓"):"↕"}</span>;

  const totalIn  = filtered.filter(p => p.direction === "incoming" && p.status === "posted").reduce((s, p) => s + p.amount, 0);
  const totalOut = filtered.filter(p => p.direction === "outgoing" && p.status === "posted").reduce((s, p) => s + p.amount, 0);

  const sel = { width: "100%", background: C.bg, border: `1px solid ${C.borderLight}`, color: C.text, borderRadius: 6, padding: "8px 12px", fontSize: 13, outline: "none" };
  const btnStyle = (active, color = C.accent) => ({ padding: "4px 10px", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, background: active ? color : C.surface, color: active ? "#fff" : C.textMuted });

  return (
    /* ── центрирующая обёртка ── */
    <div style={{ display: "flex", justifyContent: "center", padding: "28px 24px" }}>
      <div style={{ width: "100%", maxWidth: 1400 }}>

        {/* ── Шапка ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, paddingBottom: 16, borderBottom: `1px solid ${C.border}` }}>
          <div>
            <h1 style={{ color: C.text, fontSize: 20, fontWeight: 700, letterSpacing: "-0.3px", margin: 0 }}>Платежи</h1>
            <div style={{ color: C.textMuted, fontSize: 12, marginTop: 3 }}>{payments.length} записей</div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button onClick={() => setOpenMutual(true)} style={{ padding: "7px 14px", background: C.surface, border: `1px solid ${C.borderLight}`, color: C.text, borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>⇄ Взаимозачёт</button>
            <button onClick={() => { setOpenPaymentId(null); setOpenForm("outgoing"); }} style={{ padding: "7px 14px", background: C.surface, border: `1px solid ${C.borderLight}`, color: C.text, borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>+ Исходящий</button>
            <button onClick={() => { setOpenPaymentId(null); setOpenForm("incoming"); }} style={{ padding: "7px 14px", background: C.accent, border: "none", color: "#fff", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>+ Входящий</button>
          </div>
        </div>

        {/* ── KPI + фильтры направления ── */}
        <div style={{ display: "grid", gridTemplateColumns: "auto auto auto 1fr", gap: 1, marginBottom: 14, background: C.border, borderRadius: 8, overflow: "hidden" }}>
          {[
            { l: "Входящих",  v: fmt(totalIn)  + " ₽", c: C.greenText },
            { l: "Исходящих", v: fmt(totalOut) + " ₽", c: C.redText   },
            { l: "Сальдо",    v: fmt(totalIn - totalOut) + " ₽", c: (totalIn - totalOut) >= 0 ? C.accentText : C.redText },
          ].map((k, i) => (
            <div key={i} style={{ background: C.surface, padding: "10px 18px" }}>
              <div style={{ color: C.textDim, fontSize: 11, marginBottom: 3 }}>{k.l}</div>
              <div style={{ color: k.c, fontSize: 15, fontWeight: 700 }}>{k.v}</div>
            </div>
          ))}
          <div style={{ background: C.surface, padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
            <div style={{ display: "flex", border: `1px solid ${C.borderLight}`, borderRadius: 5, overflow: "hidden" }}>
              {[{ id: "all", l: "Все" }, { id: "incoming", l: "↓ Вход." }, { id: "outgoing", l: "↑ Исход." }].map(d => (
                <button key={d.id} onClick={() => setDirFilter(d.id)} style={btnStyle(dirFilter === d.id)}>{d.l}</button>
              ))}
            </div>
            <div style={{ display: "flex", border: `1px solid ${C.borderLight}`, borderRadius: 5, overflow: "hidden" }}>
              {[{ id: "all", l: "Все" }, { id: "posted", l: "Проведённые" }, { id: "draft", l: "Черновики" }].map(s => (
                <button key={s.id} onClick={() => setStatusFilter(s.id)} style={{ ...btnStyle(statusFilter === s.id, C.accentDim), color: statusFilter === s.id ? C.accentText : C.textMuted }}>{s.l}</button>
              ))}
            </div>
            <input placeholder="Поиск..." value={search} onChange={e => setSearch(e.target.value)}
              style={{ background: C.bg, border: `1px solid ${C.borderLight}`, color: C.text, borderRadius: 5, padding: "4px 10px", fontSize: 12, outline: "none", width: 160 }}/>
          </div>
        </div>

        {/* ── Фильтр периода и счёта ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, padding: "10px 14px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, flexWrap: "wrap" }}>
          <span style={{ color: C.textMuted, fontSize: 12, whiteSpace: "nowrap" }}>Период:</span>
          <DateFilter dateFrom={dateFrom} dateTo={dateTo} onFrom={setDateFrom} onTo={setDateTo}/>
          <div style={{ width: 1, height: 20, background: C.border, margin: "0 4px" }}/>
          <span style={{ color: C.textMuted, fontSize: 12, whiteSpace: "nowrap" }}>Счёт / Касса:</span>
          <select value={accountFilter} onChange={e => setAccountFilter(e.target.value)}
            style={{ background: C.bg, border: `1px solid ${C.borderLight}`, color: accountFilter ? C.text : C.textMuted, borderRadius: 5, padding: "4px 10px", fontSize: 12, outline: "none" }}>
            <option value="">Все</option>
            {(accounts || []).map(a => <option key={a.id} value={a.name}>{a.name}</option>)}
          </select>
          {accountFilter && <button onClick={() => setAccountFilter("")} style={{ padding: "3px 8px", borderRadius: 5, border: `1px solid ${C.borderLight}`, background: "transparent", color: C.redText, fontSize: 11, cursor: "pointer", fontWeight: 600 }}>× сброс</button>}
        </div>

        {/* ── Таблица ── */}
        <div style={{ background: C.surface, border: `1px solid ${C.borderStrong}`, borderRadius: 8, overflow: "hidden" }}>
          <div className="ct-wrap">
            <table className="ct">
              <thead><tr>
                <th style={{ width: 70, cursor:"pointer", userSelect:"none" }} onClick={()=>toggleSort("number")}>Номер<SortIcon col="number"/></th>
                <th style={{ width: 52, cursor:"pointer", userSelect:"none" }} onClick={()=>toggleSort("date")}>Дата<SortIcon col="date"/></th>
                <th style={{ width: 28 }}></th>
                <th style={{cursor:"pointer", userSelect:"none"}} onClick={()=>toggleSort("counterparty")}>Контрагент<SortIcon col="counterparty"/></th>
                <th>Счёт / Касса</th>
                <th className="r" style={{ width: 140, cursor:"pointer", userSelect:"none" }} onClick={()=>toggleSort("amount")}>Сумма<SortIcon col="amount"/></th>
                <th>п/п</th>
                <th>Юр. лицо</th>
                <th>Примечание</th>
                <th style={{ width: 120 }}></th>
              </tr></thead>
              <tbody>
                {sortedFiltered.length === 0 && <tr><td colSpan={10} style={{ padding: 32, textAlign: "center", color: C.textDim }}>Нет платежей</td></tr>}
                {sortedFiltered.map(p => {
                  const isIn   = p.direction === "incoming";
                  const locked = !!p.order_id || !!p.return_id;
                  return (
                    <tr key={p.id} onDoubleClick={() => { if (locked) return; setOpenPaymentId(p.id); setOpenForm(p.direction); }} style={{ cursor: locked ? "default" : "pointer" }}>
                      <td><span style={{ color: C.accentText, fontFamily: "monospace", fontSize: 12 }}>{p.number}</span></td>
                      <td style={{ color: C.text, fontSize: 12 }}>{p.date}</td>
                      <td style={{ textAlign: "center", paddingLeft: 6, paddingRight: 2 }}><span style={{ fontSize: 14, color: isIn ? C.greenText : C.redText, fontWeight: 700 }}>{isIn ? "↓" : "↑"}</span></td>
                      <td style={{ fontWeight: 500, fontSize: 12 }}>{p.counterparty}</td>
                      <td style={{ color: C.text, fontSize: 12 }}>{p.account}</td>
                      <td className="r"><span style={{ fontWeight: 700, fontSize: 13, color: isIn ? C.greenText : C.redText, fontFamily: "monospace" }}>{isIn ? "+" : "-"}{fmt(p.amount)} ₽</span></td>
                      <td style={{ color: C.text, fontSize: 11, fontFamily: "monospace" }}>{p.pp_number || "—"}</td>
                      <td style={{ color: C.text, fontSize: 11, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={p.legal_name||""}>{p.legal_name || "—"}</td>
                      <td style={{ maxWidth: 50, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: C.text, fontSize: 11, fontStyle: "italic" }} title={p.note}>{p.note || ""}</td>
                      <td><div style={{ display: "flex", gap: 3, justifyContent: "flex-end", alignItems: "center" }}>
                        {locked
                          ? <span title={p.order_id ? "Платёж привязан к накладной" : "Платёж привязан к возврату"} style={{ padding: "2px 8px", fontSize: 12, color: C.textDim, cursor: "default" }}>{p.order_id ? "🔒 Накладная" : "🔒 Возврат"}</span>
                          : <>
                            <button onClick={() => { setOpenPaymentId(p.id); setOpenForm(p.direction); }} style={{ padding: "2px 8px", background: "transparent", border: `1px solid ${C.borderLight}`, color: C.textMuted, borderRadius: 4, cursor: "pointer", fontSize: 11, fontWeight: 600 }}>Открыть</button>
                            <button onClick={() => setConfirm({ id: p.id, name: `от ${p.date}` })} style={{ padding: "2px 6px", background: "transparent", border: `1px solid ${C.redDim}`, color: C.redText, borderRadius: 4, cursor: "pointer", fontSize: 12, fontWeight: 700 }}>✕</button>
                          </>
                        }
                      </div></td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot><tr>
                <td colSpan={8} style={{ color: C.textDim, fontSize: 12 }}>Показано: {filtered.length} из {payments.length}</td>
                <td className="r" colSpan={3}>
                  <span style={{ color: C.greenText,  fontWeight: 600, fontSize: 12, fontFamily: "monospace" }}>+{fmt(totalIn)} ₽</span>
                  <span style={{ color: C.textDim, margin: "0 6px" }}>·</span>
                  <span style={{ color: C.redText,   fontWeight: 600, fontSize: 12, fontFamily: "monospace" }}>-{fmt(totalOut)} ₽</span>
                  <span style={{ color: C.textDim, margin: "0 6px" }}>·</span>
                  <span style={{ color: (totalIn - totalOut) >= 0 ? C.accentText : C.redText, fontWeight: 700, fontSize: 12, fontFamily: "monospace" }}>= {fmt(totalIn - totalOut)} ₽</span>
                </td>
              </tr></tfoot>
            </table>
          </div>
        </div>

        {confirm && <ConfirmDialog text={`Удалить платёж «${confirm.name}»?`} onConfirm={() => remove(confirm.id)} onClose={() => setConfirm(null)}/>}

      </div>

      {/* ── Модалка: форма платежа ── */}
      {openForm && (
        <div onClick={e => { if (e.target === e.currentTarget) { setOpenForm(null); setOpenPaymentId(null); } }}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 200, display: "flex", alignItems: "flex-start", justifyContent: "center", overflowY: "auto", paddingTop: 60, paddingBottom: 40 }}>
          <div style={{ background: C.surface, border: `1px solid ${C.borderLight}`, borderRadius: 10, width: 480, maxHeight: "90vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
            <PaymentForm
              onBack={() => { setOpenForm(null); setOpenPaymentId(null); }}
              onSaved={() => { setOpenForm(null); setOpenPaymentId(null); reloadPayments(); }}
              onDeleted={() => { setOpenForm(null); setOpenPaymentId(null); reloadPayments(); }}
              editId={openPaymentId}
              direction={openForm}
              counterparties={counterparties || []}
              accounts={accounts || []}
              currencies={currencies || []}
              articles={articles || []}
              currentUser={currentUser}
            />
          </div>
        </div>
      )}

      {/* ── Модалка: взаимозачёт ── */}
      {openMutual && (
        <div onClick={e => { if (e.target === e.currentTarget) setOpenMutual(false); }}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: C.surface, border: `1px solid ${C.borderLight}`, borderRadius: 10, width: 560, maxHeight: "90vh", overflow: "auto", padding: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h2 style={{ margin: 0, color: C.text, fontSize: 16, fontWeight: 700 }}>Взаимозачёт</h2>
              <button onClick={() => setOpenMutual(false)} style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer", fontSize: 20 }}>×</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div><Lbl>Номер</Lbl><Inp value={mutualForm.number} onChange={v => setMF("number", v)}/></div>
              <div><Lbl>Дата</Lbl><input type="date" value={mutualForm.date} onChange={e => setMF("date", e.target.value)} style={{ width: "100%", background: C.bg, border: `1px solid ${C.borderLight}`, color: C.text, borderRadius: 6, padding: "8px 12px", fontSize: 13, outline: "none", colorScheme:C.scheme }}/></div>
            </div>
            <div style={{ marginBottom: 12 }}><Lbl req>Плательщик (кто платит за нас)</Lbl><SearchSelect value={mutualForm.payer_id} onChange={v => setMF("payer_id", v)} options={(counterparties || []).filter(c => c.active || c.is_active).map(c => ({ value: c.id, label: c.name }))} placeholder="— Выбрать контрагента —" style={{ width: "100%" }}/></div>
            <div style={{ marginBottom: 12 }}><Lbl>Юр. лицо плательщика</Lbl><SearchSelect value={mutualForm.payer_legal} onChange={v => setMF("payer_legal", v)} options={(legalEntities || []).map(l => ({ value: l.name, label: l.name }))} placeholder="— Выбрать юр. лицо —" style={{ width: "100%" }}/></div>
            <div style={{ marginBottom: 12 }}><Lbl req>Получатель (кому платят)</Lbl><SearchSelect value={mutualForm.receiver_id} onChange={v => setMF("receiver_id", v)} options={(counterparties || []).filter(c => c.active || c.is_active).map(c => ({ value: c.id, label: c.name }))} placeholder="— Выбрать контрагента —" style={{ width: "100%" }}/></div>
            <div style={{ marginBottom: 12 }}><Lbl>Юр. лицо получателя</Lbl><SearchSelect value={mutualForm.receiver_legal} onChange={v => setMF("receiver_legal", v)} options={(legalEntities || []).map(l => ({ value: l.name, label: l.name }))} placeholder="— Выбрать юр. лицо —" style={{ width: "100%" }}/></div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div><Lbl req>Сумма плательщика</Lbl><input type="number" min="0" step="0.01" value={mutualForm.amount} onChange={e => setMF("amount", e.target.value)} placeholder="0.00" style={sel}/></div>
              <div><Lbl req>Валюта плательщика</Lbl><select value={mutualForm.payer_currency_id} onChange={e => setMF("payer_currency_id", e.target.value)} style={sel}>{(currencies || []).map(c => <option key={c.id} value={c.id}>{c.code}</option>)}</select></div>
              <div><Lbl>Курс к RUB</Lbl><input type="number" min="0" step="0.000001" value={mutualForm.payer_rate} onChange={e => setMF("payer_rate", e.target.value)} placeholder="1" style={sel}/></div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div><Lbl>Валюта получателя</Lbl><select value={mutualForm.receiver_currency_id} onChange={e => setMF("receiver_currency_id", e.target.value)} style={sel}>{(currencies || []).map(c => <option key={c.id} value={c.id}>{c.code}</option>)}</select></div>
              <div><Lbl>Номер п/п</Lbl><Inp value={mutualForm.pp_number} onChange={v => setMF("pp_number", v)} placeholder="например 123"/></div>
            </div>
            <div style={{ marginBottom: 16 }}><Lbl>Примечание</Lbl><Inp value={mutualForm.note} onChange={v => setMF("note", v)} placeholder="Дополнительная информация"/></div>
            {mutualForm.payer_id && mutualForm.receiver_id && mutualForm.amount && (() => {
              const payerAmt  = parseFloat(mutualForm.amount) || 0;
              const payerRate = parseFloat(mutualForm.payer_rate) || 1;
              const payerCurId    = parseInt(mutualForm.payer_currency_id) || 1;
              const receiverCurId = parseInt(mutualForm.receiver_currency_id) || 1;
              const amtRub     = payerCurId === 1 ? payerAmt : payerAmt * payerRate;
              const payerCur   = (currencies || []).find(c => c.id === payerCurId)?.code    || "RUB";
              const receiverCur= (currencies || []).find(c => c.id === receiverCurId)?.code || "RUB";
              const receiverAmt= receiverCurId === 1 ? amtRub : Math.round((amtRub / payerRate) * 100) / 100;
              return (
                <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: 12, marginBottom: 16 }}>
                  <div style={{ color: C.textMuted, fontSize: 11, marginBottom: 8, fontWeight: 600 }}>Будет создано автоматически:</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{ color: C.greenText, fontWeight: 700, fontSize: 13 }}>▲</span>
                    <span style={{ fontSize: 12, color: C.text }}>Входящий от {(counterparties || []).find(c => c.id === parseInt(mutualForm.payer_id))?.name}</span>
                    <span style={{ marginLeft: "auto", color: C.greenText, fontWeight: 700, fontFamily: "monospace", fontSize: 12 }}>+{fmt(payerAmt)} {payerCur}{payerCurId !== 1 ? ` (${fmt(Math.round(amtRub))} ₽)` : ""}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ color: C.redText, fontWeight: 700, fontSize: 13 }}>▼</span>
                    <span style={{ fontSize: 12, color: C.text }}>Исходящий {(counterparties || []).find(c => c.id === parseInt(mutualForm.receiver_id))?.name}</span>
                    <span style={{ marginLeft: "auto", color: C.redText, fontWeight: 700, fontFamily: "monospace", fontSize: 12 }}>−{fmt(Math.round(receiverAmt))} {receiverCur}</span>
                  </div>
                </div>
              );
            })()}
            {mutualError && <div style={{ color: C.redText, fontSize: 12, marginBottom: 8 }}>{mutualError}</div>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={() => setOpenMutual(false)} style={{ padding: "7px 16px", background: "transparent", border: `1px solid ${C.borderLight}`, color: C.text, borderRadius: 6, cursor: "pointer", fontSize: 13 }}>Отмена</button>
              <button onClick={handleMutualSave} disabled={mutualSaving} style={{ padding: "7px 20px", background: mutualSaving ? C.accentDim : C.accent, border: "none", color: mutualSaving ? C.onAccentDim : "#fff", borderRadius: 6, cursor: mutualSaving ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600 }}>{mutualSaving ? "Сохранение..." : "Провести взаимозачёт"}</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// ─── ДВИЖЕНИЕ ТОВАРА ──────────────────────────────────────────────────────────

export default Payments;
