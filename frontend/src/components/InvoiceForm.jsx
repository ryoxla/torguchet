import { useState, useEffect } from "react";
import { C, fmt, fmtDate, api,
  Card, Lbl, Inp, ConfirmDialog, SearchSelect, isDateRestricted } from "../utils/globals";

import AuditLog from "./AuditLog";
import SaleLinesTable from "./SaleLinesTable";
import { printSaleInvoice } from "../utils/printInvoice";

function InvoiceForm({ onBack, onSaved, onDeleted, editId, warehouses, counterparties, currencies, accounts, products, currentUser }) {
  const today = new Date().toISOString().slice(0, 10);
  const defaultWarehouse = (warehouses||[]).find(w=>w.is_default)||null;
  const [form, setForm] = useState({
    number: "...", date: today, payment_type: "credit",
    counterparty_id: "", warehouse_id: defaultWarehouse?.id||"", currency_id: "",
    currency_rate: "1.000000", delivery_date: "", note: "",
  });

  useEffect(() => {
    if (!editId) {
      api('/orders-sale/next-number').then(r => { if (r?.number) setF("number", r.number); }).catch(() => {});
    }
  }, [editId]);

  useEffect(() => {
    if (currencies.length && !form.currency_id) {
      const def = currencies.find(c => c.is_base || c.code === "RUB") || currencies[0];
      if (def) setF("currency_id", def.id);
    }
  }, [currencies]);

  useEffect(() => {
    if (form.payment_type === "cash" && !form.cash_account_id) {
      const cashAccs = accounts.filter(a => a.type === "cash" && (a.active || a.is_active));
      if (cashAccs.length === 1) setF("cash_account_id", cashAccs[0].id);
    }
  }, [form.payment_type, accounts]);

  const [lines,        setLines]        = useState([]);
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState("");
  const [hasMovements, setHasMovements] = useState(false);
  const [hasReturns,   setHasReturns]   = useState(false);
  const [returnsInfo,  setReturnsInfo]  = useState([]);
  const [loading,      setLoading]      = useState(!!editId);
  const [confirmDel,   setConfirmDel]   = useState(false);
  const [stockList,    setStockList]    = useState([]);
  const [activeTab,    setActiveTab]    = useState("form");

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!form.warehouse_id) return;
    api(`/stock?warehouse_id=${form.warehouse_id}`)
      .then(rows => setStockList(rows.filter(r => Number(r.qty) > 0)))
      .catch(() => {});
  }, [form.warehouse_id]);

  useEffect(() => {
    if (!editId) return;
    api(`/orders-sale/${editId}`).then(data => {
      setForm({
        number: data.number || "", date: data.created_at ? String(data.created_at).slice(0, 10) : "",
        payment_type: data.payment_type || "credit", counterparty_id: data.counterparty_id || "",
        cash_account_id: data.cash_account_id || "", warehouse_id: data.warehouse_id || "",
        currency_id: data.currency_id || "", currency_rate: data.currency_rate || "1",
        delivery_date: "", note: data.note || "",
      });
      api(`/stock?warehouse_id=${data.warehouse_id}`).then(stockRows => {
        const stockByBatch = {}, stockByProduct = {};
        stockRows.forEach(s => {
          if (s.batch_id) stockByBatch[s.batch_id] = Number(s.qty);
          stockByProduct[s.product_id] = (stockByProduct[s.product_id] || 0) + Number(s.qty);
        });
        setLines((data.lines || []).map((l, i) => {
          const inStock   = l.batch_id ? (stockByBatch[l.batch_id] || 0) : (stockByProduct[l.product_id] || 0);
          const available = inStock + Number(l.qty);
          const stockInfo = l.batch_id
            ? stockRows.find(s => s.batch_id   === l.batch_id)
            : stockRows.find(s => s.product_id === l.product_id);
          return {
            _key: Date.now() + i,
            product_id:    l.product_id   || "",
            product_name:  l.product_name || "",
            batch_id:      l.batch_id     || stockInfo?.batch_id  || null,
            batch_number:  l.batch_number || stockInfo?.batch_number || "—",
            note:          l.note || "",
            grade_name:    l.grade_name   || stockInfo?.grade_name   || "—",
            country_name:  l.country_name || stockInfo?.country_name || "—",
            supplier_name: l.supplier_name || stockInfo?.supplier_name || "—",
            unit_short:    l.unit_short   || stockInfo?.unit_short   || "",
            purchase_date: l.purchase_date || stockInfo?.purchase_date || null,
            max_qty:       available,
            qty:   l.qty   ? parseFloat(parseFloat(l.qty).toFixed(2)).toString()   : "",
            price: l.price ? parseFloat(parseFloat(l.price).toFixed(2)).toString() : "",
            cost_price: Number(stockInfo?.cost_price) || 0,
          };
        }));
      }).catch(() => {
        setLines((data.lines || []).map((l, i) => ({
          _key: Date.now() + i,
          product_id: l.product_id || "", product_name: l.product_name || "",
          batch_id: l.batch_id || null, batch_number: l.batch_number || "—",
          note: l.note || "",
          grade_name: l.grade_name || "—", country_name: l.country_name || "—",
          supplier_name: l.supplier_name || "—",
          unit_short: l.unit_short || "", max_qty: null,
          purchase_date: l.purchase_date || null,
          qty:   l.qty   ? parseFloat(parseFloat(l.qty).toFixed(2)).toString()   : "",
          price: l.price ? parseFloat(parseFloat(l.price).toFixed(2)).toString() : "",
        })));
      });
    }).catch(e => setError("Ошибка загрузки: " + e.message)).finally(() => setLoading(false));
  }, [editId]);

  useEffect(() => {
    if (!editId) return;
    api(`/orders-sale/${editId}/has-movements`).then(r => setHasMovements(!!r?.has_movements)).catch(() => {});
  }, [editId]);

  useEffect(() => {
    if (!editId) return;
    api(`/returns?order_id=${editId}`).then(rows => {
      setHasReturns(rows.length > 0);
      setReturnsInfo(rows.map(r => r.number));
    }).catch(() => {});
  }, [editId]);

  const addLine = (dupRow) => {
    if (dupRow && dupRow._key !== undefined) {
      setLines(p => [...p, { ...dupRow, _key: Date.now() + Math.random(), qty: "" }]);
      return;
    }
    if (!form.warehouse_id) { setError("Сначала выберите склад"); return; }
    const existing = new Set(lines.map(l => String(l.batch_id || l.product_id)));
    const toAdd = stockList.filter(s => !existing.has(String(s.batch_id || s.product_id)));
    if (!toAdd.length) { setError("Все доступные партии уже добавлены"); return; }
    setLines(p => [...p, ...toAdd.map(s => ({
      _key: Date.now() + Math.random(),
      product_id: s.product_id, product_name: s.product_name,
      batch_id: s.batch_id || null, batch_number: s.batch_number || "—", note: "",
      grade_name: s.grade_name || "—", country_name: s.country_name || "—",
      supplier_name: s.supplier_name || "—", unit_short: s.unit_short || "",
      purchase_date: s.purchase_date || null,
      max_qty: Number(s.qty), qty: "", price: "", cost_price: Number(s.cost_price) || 0,
    }))]);
    setError("");
  };

  const updLine = (key, k, v) => setLines(p => p.map(l => l._key === key ? { ...l, [k]: v } : l));
  const delLine = key => setLines(p => p.filter(l => l._key !== key));
  const total   = lines.reduce((s, l) => s + (parseFloat(l.qty) || 0) * (parseFloat(l.price) || 0), 0);

  const handlePrint = async () => {
    const companyName      = (warehouses || []).find(w => w.id == form.warehouse_id)?.company_name || currentUser?.company_name || '—';
    const counterpartyName = form.payment_type === 'cash' ? 'Частное лицо' : (counterparties || []).find(c => c.id == form.counterparty_id)?.name || '—';
    const dateStr          = form.date ? new Date(form.date).toLocaleDateString('ru-RU') : new Date().toLocaleDateString('ru-RU');
    await printSaleInvoice({
      number:          form.number,
      dateStr,
      payment_type:    form.payment_type,
      companyName,
      counterpartyName,
      counterparty_id: form.counterparty_id,
      lines,
    });
  };

  const handleSave = async () => {
    if (isDateRestricted(currentUser, form.date)) { setError("Нет доступа: можно редактировать только документы сегодняшней датой"); return; }
    if (!form.warehouse_id)                                          { setError("Укажите склад"); return; }
    if (form.payment_type === "credit" && !form.counterparty_id)    { setError("Укажите контрагента"); return; }
    if (form.payment_type === "cash"   && !form.cash_account_id)    { setError("Укажите кассу для наличного расчёта"); return; }
    if (!lines.length)                                              { setError("Добавьте хотя бы одну позицию"); return; }
    setSaving(true); setError("");
    try {
      const payload = {
        ...form,
        counterparty_id: parseInt(form.counterparty_id) || null,
        warehouse_id:    parseInt(form.warehouse_id),
        company_id:      1,
        currency_id:     parseInt(form.currency_id) || 1,
        currency_rate:   parseFloat(form.currency_rate) || 1,
        created_by:      currentUser?.id || null,
        lines: lines
          .filter(l => l.qty && parseFloat(l.qty) > 0 && l.price && parseFloat(l.price) >= 0)
          .map(l => ({
            product_id:   parseInt(l.product_id),
            batch_id:     l.batch_id || null,
            qty:          parseFloat(l.qty),
            price:        parseFloat(l.price),
            discount_pct: 0,
            vat_pct:      20,
          })),
      };
      if (editId) await api(`/orders-sale/${editId}`, "PUT", payload);
      else        await api("/orders-sale", "POST", payload);
      if (onSaved) onSaved();
    } catch (e) { setError("Ошибка: " + e.message); }
    finally { setSaving(false); }
  };

  const sel = {
    width: "100%", background: C.bg, border: `1px solid ${C.borderLight}`,
    color: C.text, borderRadius: 6, padding: "4px 7px", fontSize: 10, outline: "none",
  };
  const inp = {
    width: "80px", background: C.bg, border: `1px solid ${C.borderLight}`,
    color: C.text, borderRadius: 4, padding: "4px 8px",
    fontSize: 13, outline: "none", textAlign: "right",
  };

  if (loading) return (
    <div style={{ display:"flex", justifyContent:"center", padding:"60px 24px" }}>
      <div style={{ textAlign:"center", color:C.textMuted }}>Загрузка накладной...</div>
    </div>
  );

  return (
    /* центрирующая обёртка */
    <div style={{ display:"flex", justifyContent:"center", padding:"28px 24px 48px" }}>
      <div style={{ width:"100%", maxWidth:960 }}>

        {/* ── Шапка ── */}
        <div style={{
          display:"flex", alignItems:"center", gap:10, marginBottom:20,
          paddingBottom:16, borderBottom:`1px solid ${C.border}`,
        }}>
          <div>
            <h1 style={{ margin:0, color:C.text, fontSize:20, fontWeight:700 }}>
              {editId ? "Расходная накладная" : "Новая расходная накладная"}
            </h1>
            <span style={{ color:C.textMuted, fontFamily:"monospace", fontSize:13 }}>{form.number}</span>
          </div>
          <div style={{ marginLeft:"auto", display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
            <button onClick={onBack} style={{
              background:"transparent", border:`1px solid ${C.borderLight}`,
              color:C.text, borderRadius:6, padding:"7px 14px",
              cursor:"pointer", fontSize:13, fontWeight:600,
            }}>← Продажи</button>
            {editId && (
              <button onClick={() => { if(isDateRestricted(currentUser, form.date)){alert("Нет доступа: можно удалять только документы сегодняшней датой");return;} setConfirmDel(true); }} style={{
                padding:"7px 14px", background:"transparent",
                border:`1px solid ${C.red}`, color:C.redText,
                borderRadius:6, cursor:"pointer", fontSize:13, fontWeight:600,
              }}>Удалить</button>
            )}
            {editId && lines.length > 0 && (
              <button onClick={handlePrint} style={{
                padding:"7px 14px", background:"transparent",
                border:`1px solid ${C.borderLight}`, color:C.textMuted,
                borderRadius:6, cursor:"pointer", fontSize:13, fontWeight:600,
              }}>🖨 Печать</button>
            )}
            <button onClick={handleSave} disabled={saving || hasReturns} style={{
              padding:"7px 22px",
              background: (saving || hasReturns) ? C.accentDim : C.accent,
              border:"none", color:"#fff", borderRadius:6,
              cursor: (saving || hasReturns) ? "not-allowed" : "pointer",
              fontSize:14, fontWeight:700,
            }}>{saving ? "Сохранение..." : "Сохранить"}</button>
          </div>
        </div>

        {confirmDel && (
          <ConfirmDialog
            text={`Удалить накладную ${form.number}?`}
            onConfirm={() => { api(`/orders-sale/${editId}`, "DELETE").then(() => { if (onDeleted) onDeleted(); }).catch(e => alert(e.message)); setConfirmDel(false); }}
            onClose={() => setConfirmDel(false)}
          />
        )}

        {/* ── Табы ── */}
        {editId && (
          <div style={{ display:"flex", gap:0, marginBottom:16, borderBottom:`1px solid ${C.border}` }}>
            {[{id:"form",l:"Документ"},{id:"history",l:"История изменений"}].map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
                padding:"8px 20px", border:"none",
                borderBottom: activeTab === t.id ? `2px solid ${C.accent}` : "2px solid transparent",
                background:"transparent",
                color: activeTab === t.id ? C.accentText : C.textMuted,
                cursor:"pointer", fontSize:13, fontWeight: activeTab === t.id ? 600 : 400,
              }}>{t.l}</button>
            ))}
          </div>
        )}

        {/* ── История ── */}
        {activeTab === "history" && editId && (
          <Card style={{ padding:16 }}><AuditLog table="orders_sale" recordId={editId}/></Card>
        )}

        {/* ── Форма ── */}
        {activeTab === "form" && <>

          {hasReturns && (
            <div style={{ color:C.yellowText, background:C.yellowDim, border:`1px solid ${C.yellow}`,
              borderRadius:6, padding:"10px 14px", marginBottom:14, fontSize:13, fontWeight:600 }}>
              ⚠ Редактирование заблокировано: по накладной оформлен возврат {returnsInfo.join(', ')}. Сначала удалите возврат.
            </div>
          )}
          {error && (
            <div style={{ color:C.redText, background:C.redDim, border:`1px solid ${C.red}`,
              borderRadius:6, padding:"10px 14px", marginBottom:14, fontSize:13 }}>{error}</div>
          )}

          {/* ── Карточка полей ── */}
          <Card style={{ padding:"12px 16px", marginBottom:16 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>

              {/* Номер */}
              <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
                <Lbl>Номер</Lbl>
                <input value={form.number} onChange={e => setF("number", e.target.value)}
                  style={{ width:68, background:C.bg, border:`1px solid ${C.borderLight}`, color:C.text, borderRadius:6, padding:"4px 7px", fontSize:10, outline:"none", fontFamily:"monospace" }}/>
              </div>

              {/* Дата */}
              <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
                <Lbl>Дата</Lbl>
                <input type="date" value={form.date} onChange={e => setF("date", e.target.value)}
                  style={{ width:118, background:C.bg, border:`1px solid ${C.borderLight}`, color:C.text, borderRadius:6, padding:"4px 7px", fontSize:10, outline:"none", colorScheme:C.scheme }}/>
              </div>

              {/* Склад */}
              <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
                <Lbl req>Склад</Lbl>
                <select value={form.warehouse_id} onChange={e => setF("warehouse_id", e.target.value)}
                  disabled={!!editId && hasMovements}
                  style={{ width:138, background:C.bg, border:`1px solid ${C.borderLight}`, color:C.text, borderRadius:6, padding:"4px 7px", fontSize:10, outline:"none", opacity:(editId && hasMovements)?0.5:1 }}>
                  <option value="">Выберите склад</option>
                  {warehouses.filter(w => w.active || w.is_active).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>

              {/* Тип оплаты */}
              <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
                <Lbl>Тип оплаты</Lbl>
                <div style={{ display:"flex", border:`1px solid ${C.borderLight}`, borderRadius:6, overflow:"hidden" }}>
                  {[{id:"credit",l:"Кредит"},{id:"cash",l:"Наличные"}].map(t => (
                    <button key={t.id} onClick={() => setF("payment_type", t.id)} style={{
                      padding:"4px 10px", border:"none", cursor:"pointer", fontSize:10, fontWeight:600,
                      background: form.payment_type === t.id ? C.accent : C.surface,
                      color: form.payment_type === t.id ? "#fff" : C.textMuted,
                    }}>{t.l}</button>
                  ))}
                </div>
              </div>

              {/* Контрагент / Касса */}
              <div style={{ display:"flex", flexDirection:"column", gap:3, flex:1, minWidth:160, maxWidth:240 }}>
                {form.payment_type === "credit"
                  ? <>
                    <Lbl req>Контрагент</Lbl>
                    <SearchSelect
                      value={form.counterparty_id}
                      onChange={v => setF("counterparty_id", v)}
                      options={(counterparties||[]).filter(c=>!c.is_anonymous&&(c.active||c.is_active)).map(c=>({value:String(c.id),label:c.name}))}
                      placeholder="Поиск контрагента..."
                    />
                  </>
                  : <>
                    <Lbl>Касса</Lbl>
                    <select value={form.cash_account_id || ""} onChange={e => setF("cash_account_id", e.target.value)}
                      style={{ width:"100%", background:C.bg, border:`1px solid ${C.borderLight}`, color:C.text, borderRadius:6, padding:"4px 7px", fontSize:10, outline:"none" }}>
                      <option value="">Выберите кассу</option>
                      {accounts.filter(a => a.type === "cash" && (a.active || a.is_active)).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </>
                }
              </div>

              {/* Валюта + Курс */}
              <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
                <Lbl>Валюта / Курс</Lbl>
                <div style={{ display:"flex", gap:4, alignItems:"center" }}>
                  <select value={form.currency_id} onChange={e => setF("currency_id", e.target.value)}
                    style={{ width:72, background:C.bg, border:`1px solid ${C.borderLight}`, color:C.text, borderRadius:6, padding:"4px 7px", fontSize:10, outline:"none" }}>
                    {currencies.map(c => <option key={c.id} value={c.id}>{c.code}</option>)}
                  </select>
                  <input value={form.currency_rate} onChange={e => setF("currency_rate", e.target.value)}
                    style={{ width:72, background:C.bg, border:`1px solid ${C.borderLight}`, color:C.textMuted, borderRadius:6, padding:"4px 7px", fontSize:10, outline:"none", fontFamily:"monospace" }}/>
                </div>
              </div>

              {/* Примечание */}
              <div style={{ display:"flex", flexDirection:"column", gap:3, flex:1, minWidth:160 }}>
                <label style={{ color:"transparent", fontSize:10, userSelect:"none" }}>_</label>
                <input value={form.note || ""} onChange={e => setF("note", e.target.value)}
                  placeholder="Комментарий к накладной..."
                  style={{ flex:1, background:C.bg, border:`1px solid ${C.borderLight}`, color:C.text, borderRadius:6, padding:"4px 7px", fontSize:10, outline:"none" }}/>
              </div>

            </div>
          </Card>

          <div style={{
            position: "relative",
            left: "50%",
            transform: "translateX(-50%)",
            width: "fit-content",
            maxWidth: "100vw",
          }}>
            <SaleLinesTable lines={lines} addLine={addLine} updLine={updLine} delLine={delLine} inp={inp} onSave={handleSave} saving={saving}/>
          </div>

        </>}

      </div>
    </div>
  );
}

// ─── СПИСОК ЗАКУПОК ───────────────────────────────────────────────────────────

export default InvoiceForm;
