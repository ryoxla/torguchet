import { useState, useEffect } from "react";
import { C, fmt, fmtDate, api, Card, Btn, Lbl, Inp, ConfirmDialog, inDateRange, DateFilter, WO_REASONS, WO_REASON_COLORS } from "../utils/globals";

import AuditLog from "./AuditLog";

function WriteOffs({ onNav, warehouses, products, currentUser }) {
  const [activeTab, setActiveTab] = useState('detail');
  const [view,       setView]      = useState("list");
  const [writeOffs,  setWriteOffs] = useState([]);
  const [editLines,  setEditLines] = useState([]);
  const [selected,   setSelected]  = useState(null);
  const [confirm,    setConfirm]   = useState(null);
  const [loading,    setLoading]   = useState(false);
  const [saving,     setSaving]    = useState(false);
  const todayStr = (() => { const d = new Date(); return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`; })();
  const [dateFrom,   setDateFrom]  = useState(todayStr);
  const [dateTo,     setDateTo]    = useState(todayStr);

  const [stockItems,  setStockItems]  = useState([]);
  const [stockLoading,setStockLoading]= useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addSearch,    setAddSearch]    = useState("");
  const [addQtyMap,    setAddQtyMap]    = useState({});

  const today = new Date();
  const emptyForm = () => ({
    number: `СП-${today.getFullYear()}-${String(writeOffs.length + 1).padStart(4, '0')}`,
    warehouse_id: "", reason: "damage", comment: "", date: today,
  });
  const [form, setForm] = useState(emptyForm);
  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const [qtyMap, setQtyMap] = useState({});
  const setQty = (i, val) => setQtyMap(m => ({ ...m, [i]: val }));

  const loadList = () => {
    setLoading(true);
    api('/write-offs').then(rows => {
      setWriteOffs(rows.map(r => ({ ...r,
        total_amount: Number(r.total_amount) || 0,
        total_qty:    Number(r.total_qty)    || 0,
        lines_count:  Number(r.lines_count)  || 0,
        date:         fmtDate(r.created_at),
        note:         r.note || r.comment || '',
      })));
    }).catch(e => alert('Ошибка загрузки: ' + e.message)).finally(() => setLoading(false));
  };
  useEffect(() => { loadList(); }, []);

  useEffect(() => {
    if (view !== "form" || !form.warehouse_id) { setStockItems([]); setQtyMap({}); return; }
    setStockLoading(true);
    api(`/stock?warehouse_id=${form.warehouse_id}`)
      .then(rows => { setStockItems(rows); setQtyMap({}); })
      .catch(() => setStockItems([]))
      .finally(() => setStockLoading(false));
  }, [form.warehouse_id, view]);

  useEffect(() => {
    if (view !== "detail" || !selected?.warehouse_id) return;
    setStockLoading(true);
    api(`/stock?warehouse_id=${selected.warehouse_id}`)
      .then(rows => setStockItems(rows))
      .catch(() => setStockItems([]))
      .finally(() => setStockLoading(false));
  }, [view, selected?.id]);

  const openDetail = async w => {
    setActiveTab('detail');
    setSelected(w);
    const ls = await api(`/write-offs/${w.id}/lines`).catch(() => []);
    setEditLines(ls.map(l => ({ ...l, qty: Number(l.qty), cost_price: Number(l.cost_price), amount: Number(l.amount) })));
    setView("detail");
  };

  const linesToWrite = stockItems.map((s, i) => ({ s, qty: parseFloat(qtyMap[i]) || 0, i })).filter(x => x.qty > 0);
  const formTotal = linesToWrite.reduce((sum, x) => sum + x.qty * (Number(x.s.cost_price) || 0), 0);

  const handleSave = async () => {
    if (!form.warehouse_id) { alert("Выберите склад"); return; }
    if (!linesToWrite.length) { alert("Укажите количество хотя бы для одного товара"); return; }
    const over = linesToWrite.find(x => x.qty > Number(x.s.qty));
    if (over) { alert(`Недостаточно товара «${over.s.product_name}»: нужно ${over.qty}, есть ${over.s.qty}`); return; }
    setSaving(true);
    try {
      await api('/write-offs', 'POST', {
        number: form.number, date: form.date || today,
        warehouse_id: parseInt(form.warehouse_id),
        reason: form.reason, comment: form.comment || null,
        created_by: currentUser?.id || null,
        lines: linesToWrite.map(x => ({ product_id: x.s.product_id, batch_id: x.s.batch_id || null, qty: x.qty })),
      });
      loadList(); setView("list");
    } catch (e) { alert('Ошибка: ' + e.message); }
    finally { setSaving(false); }
  };

  const updateLineQty = (i, val) => setEditLines(prev => prev.map((l, idx) => idx === i
    ? { ...l, qty: parseFloat(val) || 0, amount: (parseFloat(val) || 0) * l.cost_price } : l));
  const removeEditLine = i => setEditLines(prev => prev.filter((_, idx) => idx !== i));
  const addFromStock = (s, qty) => {
    const useQty = parseFloat(qty) || 0;
    if (editLines.find(l => l.product_id === s.product_id && l.batch_id === s.batch_id)) { alert('Уже добавлено'); return; }
    setEditLines(prev => [...prev, {
      product_id: s.product_id, batch_id: s.batch_id || null, qty: useQty,
      cost_price: Number(s.cost_price) || 0, amount: useQty * (Number(s.cost_price) || 0),
      product_name: s.product_name, batch_number: s.batch_number || '',
      unit_short: s.unit_short || '', available_qty: Number(s.qty),
    }]);
  };
  const addAllFromModal = () => {
    const filtered = stockItems.filter(s => !addSearch || (s.product_name || "").toLowerCase().includes(addSearch.toLowerCase()));
    const toAdd = filtered.map((s, i) => ({ s, i, qty: parseFloat(addQtyMap[stockItems.indexOf(s)]) || 0 })).filter(x => x.qty > 0);
    if (!toAdd.length) { alert("Укажите количество хотя бы для одной позиции"); return; }
    const over = toAdd.find(x => x.qty > Number(x.s.qty));
    if (over) { alert(`Недостаточно товара «${over.s.product_name}»: нужно ${over.qty}, есть ${over.s.qty}`); return; }
    const dup = toAdd.find(x => editLines.find(l => l.product_id === x.s.product_id && l.batch_id === x.s.batch_id));
    if (dup) { alert(`«${dup.s.product_name}» уже добавлен в документ`); return; }
    toAdd.forEach(x => addFromStock(x.s, x.qty));
    setAddQtyMap({});
    setAddModalOpen(false);
  };
  const handleUpdate = async () => {
    const activeLines = editLines.filter(l => l.qty > 0);
    if (!activeLines.length) { alert("Укажите количество хотя бы для одной строки"); return; }
    setSaving(true);
    try {
      await api(`/write-offs/${selected.id}`, 'PUT', {
        number: selected.number, warehouse_id: selected.warehouse_id,
        reason: selected.reason, comment: selected.comment || null,
        lines: activeLines.map(l => ({ product_id: l.product_id, batch_id: l.batch_id || null, qty: l.qty })),
      });
      await loadList(); setView('list');
    } catch (e) { alert('Ошибка: ' + e.message); }
    finally { setSaving(false); }
  };
  const removeDoc = async id => {
    try { await api(`/write-offs/${id}`, 'DELETE'); loadList(); setConfirm(null); setView("list"); }
    catch (e) { alert('Ошибка удаления: ' + e.message); }
  };

  const filteredWO  = writeOffs.filter(w => inDateRange(w.date, dateFrom, dateTo));
  const totalCost   = writeOffs.reduce((s, w) => s + w.total_amount, 0);

  /* ════════════════════════════════
     КАРТОЧКА (редактирование)
     ════════════════════════════════ */
  if (view === "detail" && selected) {
    const wh = warehouses?.find(w => w.id === selected.warehouse_id);
    const editTotal = editLines.reduce((s, l) => s + l.amount, 0);
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "28px 24px" }}>
        <div style={{ width: "fit-content", maxWidth: "100%" }}>

          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, width: "100%" }}>
            <button onClick={() => setView("list")} style={{ background: "transparent", border: `1px solid ${C.borderLight}`, color: C.text, borderRadius: 6, padding: "8px 14px", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>← Списания</button>
            <h1 style={{ margin: 0, color: C.text, fontSize: 20, fontWeight: 700 }}>{selected.number}</h1>
            <span style={{ background: C.greenDim, color: C.greenText, padding: "3px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600 }}>Проведён</span>
            <div style={{ flex: 1 }}/>
            <Btn primary onClick={handleUpdate} disabled={saving || !editLines.filter(l => l.qty > 0).length}>
              {saving ? "Сохранение..." : "Провести изменения"}
            </Btn>
            <button onClick={() => setConfirm({ id: selected.id, name: selected.number })}
              style={{ padding: "6px 14px", background: "transparent", border: `1px solid ${C.red}`, color: C.redText, borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Удалить</button>
          </div>

          <div style={{ display: "flex", gap: 0, marginBottom: 16, borderBottom: `1px solid ${C.border}`, width: "100%" }}>
            {[{ id: "detail", l: "Документ" }, { id: "history", l: "История изменений" }].map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)} style={{ padding: "8px 20px", border: "none", borderBottom: activeTab === t.id ? `2px solid ${C.accent}` : "2px solid transparent", background: "transparent", color: activeTab === t.id ? C.accentText : C.textMuted, cursor: "pointer", fontSize: 13, fontWeight: activeTab === t.id ? 600 : 400 }}>{t.l}</button>
            ))}
          </div>

          {activeTab === "history" ? (
            <Card style={{ padding: 16, width: "100%" }}><AuditLog table="write_offs" recordId={selected.id}/></Card>
          ) : (<>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16, width: "100%" }}>
              <Card style={{ padding: 20 }}>
                <div style={{ color: C.textMuted, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 14 }}>Реквизиты</div>
                {[["Номер", selected.number], ["Дата", selected.date], ["Склад", selected.warehouse_name || wh?.name || "—"], ["Ответственный", selected.created_by_name || "—"]].map(([l, v]) => (
                  <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid ${C.border}` }}>
                    <span style={{ color: C.textMuted, fontSize: 13 }}>{l}</span>
                    <span style={{ color: C.text, fontSize: 13, fontWeight: 500 }}>{v}</span>
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", alignItems: "center" }}>
                  <span style={{ color: C.textMuted, fontSize: 13 }}>Причина</span>
                  <select value={selected.reason} onChange={e => setSelected(s => ({ ...s, reason: e.target.value }))}
                    style={{ background: C.bg, border: `1px solid ${C.borderLight}`, color: C.text, borderRadius: 5, padding: "4px 8px", fontSize: 12, outline: "none" }}>
                    <option value="damage">Порча</option><option value="expiry">Истёк срок</option>
                    <option value="loss">Недостача</option><option value="other">Прочее</option>
                  </select>
                </div>
                <div style={{ marginTop: 8 }}>
                  <input value={selected.comment || ""} onChange={e => setSelected(s => ({ ...s, comment: e.target.value }))}
                    placeholder="Комментарий..."
                    style={{ width: "100%", background: C.bg, border: `1px solid ${C.borderLight}`, color: C.text, borderRadius: 5, padding: "6px 10px", fontSize: 12, outline: "none" }}/>
                </div>
              </Card>
              <Card style={{ padding: 20 }}>
                <div style={{ color: C.textMuted, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 14 }}>Итог</div>
                <div style={{ color: C.redText, fontSize: 28, fontWeight: 700, marginBottom: 4 }}>{fmt(Math.round(editTotal))} ₽</div>
                <div style={{ color: C.textMuted, fontSize: 13, marginBottom: 4 }}>Себестоимость к списанию</div>
                <div style={{ color: C.textDim, fontSize: 12 }}>{editLines.filter(l => l.qty > 0).length} позиций · {fmt(editLines.reduce((s, l) => s + (l.qty || 0), 0))} ед.</div>
                <div style={{ marginTop: 12, padding: "8px 10px", background: C.yellowDim + "22", borderRadius: 6, border: `1px solid ${C.yellowDim}`, color: C.yellowText, fontSize: 11, lineHeight: 1.5 }}>
                  ⚠ После «Провести изменения» старые движения откатятся и создадутся новые.
                </div>
              </Card>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, width: "100%" }}>
              <Card>
                <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: C.text, fontWeight: 600, fontSize: 13 }}>Строки списания</span>
                  <span style={{ color: C.redText, fontWeight: 700 }}>{fmt(Math.round(editTotal))} ₽</span>
                </div>
                {editLines.length === 0
                  ? <div style={{ padding: 20, textAlign: "center", color: C.textDim, fontSize: 13 }}>Добавьте строки из таблицы справа</div>
                  : <div className="ct-wrap"><table className="ct"><thead><tr>
                      <th>Товар</th><th>Партия</th><th className="r">Списать</th><th className="r">Себест.</th><th className="r">Сумма</th><th/>
                    </tr></thead>
                    <tbody>{editLines.map((l, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 500, fontSize: 12 }}>{l.product_name}</td>
                        <td><span style={{ color: C.accentText, fontFamily: "monospace", fontSize: 11 }}>{l.batch_number || "—"}</span></td>
                        <td className="r" style={{ width: 90 }}>
                          <input type="text" inputMode="decimal" value={l.qty || ""}
                            onChange={e => updateLineQty(i, e.target.value)}
                            onKeyDown={e => {
                              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                                e.preventDefault();
                                const next = e.key === "ArrowDown" ? i + 1 : i - 1;
                                const el = document.querySelector(`[data-wo-edit-row="${next}"]`);
                                if (el) { el.focus(); el.select(); }
                              }
                            }}
                            data-wo-edit-row={i}
                            style={{ width: 80, background: C.bg, border: `1px solid ${l.qty > 0 ? C.accent : C.borderLight}`, color: C.text, borderRadius: 4, padding: "3px 6px", fontSize: 12, outline: "none", textAlign: "right", MozAppearance: "textfield", WebkitAppearance: "none" }}/>
                        </td>
                        <td className="r" style={{ color: C.textMuted, fontSize: 11 }}>{fmt(l.cost_price)} ₽</td>
                        <td className="r" style={{ color: l.amount > 0 ? C.redText : C.textDim, fontWeight: 600, fontSize: 12 }}>{fmt(Math.round(l.amount))} ₽</td>
                        <td><button onClick={() => removeEditLine(i)} style={{ background: "none", border: "none", color: C.textDim, cursor: "pointer", fontSize: 16, padding: "0 4px" }}>×</button></td>
                      </tr>
                    ))}</tbody></table></div>
                }
              </Card>
              <Card>
                <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: C.text, fontWeight: 600, fontSize: 13 }}>Остатки склада</span>
                  <Btn small onClick={() => { setAddSearch(""); setAddQtyMap({}); setAddModalOpen(true); }}>+ Добавить из остатков</Btn>
                </div>
                <div style={{ padding: 20, textAlign: "center", color: C.textDim, fontSize: 13 }}>
                  Нажмите «+ Добавить из остатков», чтобы выбрать товар и указать количество для списания.
                </div>
              </Card>
            </div>
            {confirm && <ConfirmDialog text={`Удалить списание «${confirm.name}»? Товар будет возвращён на склад.`} onConfirm={() => removeDoc(confirm.id)} onClose={() => setConfirm(null)}/>}
            {addModalOpen && (
              <div onClick={e => { if (e.target === e.currentTarget) setAddModalOpen(false); }}
                style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ background: C.surface, border: `1px solid ${C.borderLight}`, borderRadius: 10, width: 640, maxHeight: "80vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
                  <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ color: C.text, fontWeight: 700, fontSize: 15 }}>Добавить из остатков</span>
                    <button onClick={() => setAddModalOpen(false)} style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer", fontSize: 20 }}>×</button>
                  </div>
                  <div style={{ padding: "12px 20px", display: "flex", gap: 10 }}>
                    <input value={addSearch} onChange={e => setAddSearch(e.target.value)} placeholder="Поиск по товару..."
                      style={{ flex: 1, background: C.bg, border: `1px solid ${C.borderLight}`, color: C.text, borderRadius: 6, padding: "8px 12px", fontSize: 13, outline: "none" }}/>
                    <Btn primary onClick={addAllFromModal}>Добавить</Btn>
                  </div>
                  {stockLoading ? <div style={{ padding: 32, textAlign: "center", color: C.textMuted, fontSize: 13 }}>Загрузка...</div>
                  : <div className="ct-wrap" style={{ padding: "0 20px 16px" }}><table className="ct"><thead><tr>
                      <th>Товар</th><th>Партия</th><th className="r">Остаток</th><th className="r">Себест.</th>
                      <th className="r" style={{ width: 110 }}>Кол-во</th>
                    </tr></thead>
                    <tbody>{stockItems
                      .filter(s => !addSearch || (s.product_name || "").toLowerCase().includes(addSearch.toLowerCase()))
                      .map((s) => {
                        const i = stockItems.indexOf(s);
                        const already = editLines.find(l => l.product_id === s.product_id && l.batch_id === s.batch_id);
                        const qtyVal = parseFloat(addQtyMap[i]) || 0;
                        const isOver = qtyVal > Number(s.qty);
                        return (
                          <tr key={i} style={{ opacity: already ? 0.4 : 1, background: isOver ? C.redDim + "22" : "transparent" }}>
                            <td style={{ fontWeight: 500, fontSize: 12 }}>{s.product_name}</td>
                            <td><span style={{ color: C.accentText, fontFamily: "monospace", fontSize: 11 }}>{s.batch_number || "—"}</span></td>
                            <td className="r" style={{ fontFamily: "monospace", fontSize: 12 }}>{fmt(Number(s.qty))}</td>
                            <td className="r" style={{ color: C.textMuted, fontSize: 11 }}>{fmt(Number(s.cost_price))} ₽</td>
                            <td className="r" style={{ width: 110 }}>
                              <input type="text" inputMode="decimal" value={addQtyMap[i] || ""}
                                onChange={e => setAddQtyMap(m => ({ ...m, [i]: e.target.value }))}
                                onKeyDown={e => {
                                  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                                    e.preventDefault();
                                    const next = e.key === "ArrowDown" ? i + 1 : i - 1;
                                    const el = document.querySelector(`[data-wo-add-row="${next}"]`);
                                    if (el) { el.focus(); el.select(); }
                                  }
                                }}
                                data-wo-add-row={i}
                                disabled={!!already} placeholder="0"
                                style={{ width: 90, background: C.bg, border: `1px solid ${isOver ? C.red : C.borderLight}`, color: isOver ? C.redText : C.text, borderRadius: 4, padding: "4px 8px", fontSize: 13, outline: "none", textAlign: "right" }}/>
                            </td>
                          </tr>
                        );
                      })}</tbody></table></div>
                  }
                </div>
              </div>
            )}
          </>)}
        </div>
      </div>
    );
  }

  /* ════════════════════════════════
     ФОРМА СОЗДАНИЯ
     ════════════════════════════════ */
  if (view === "form") {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "28px 24px" }}>
        <div style={{ width: "fit-content", maxWidth: "100%", minWidth: 600 }}>

          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24, width: "100%" }}>
            <button onClick={() => setView("list")} style={{ background: "transparent", border: `1px solid ${C.borderLight}`, color: C.text, borderRadius: 6, padding: "8px 14px", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>← Списания</button>
            <h1 style={{ margin: 0, color: C.text, fontSize: 20, fontWeight: 700 }}>Новое списание</h1>
            <div style={{ flex: 1 }}/>
            <Btn primary onClick={handleSave} disabled={saving || !linesToWrite.length || !form.warehouse_id}>
              {saving ? "Сохранение..." : "Провести списание"}
            </Btn>
          </div>

          <Card style={{ padding: 20, marginBottom: 16, width: "100%" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 14 }}>
              <div><Lbl req>Номер</Lbl><Inp value={form.number} onChange={v => setF("number", v)}/></div>
              <div><Lbl req>Дата</Lbl><input type="date" value={form.date || today} onChange={e => setF("date", e.target.value)} style={{ width: "100%", background: C.bg, border: `1px solid ${C.borderLight}`, color: C.text, borderRadius: 6, padding: "8px 12px", fontSize: 13, outline: "none", colorScheme: "dark" }}/></div>
              <div>
                <Lbl req>Склад</Lbl>
                <select value={form.warehouse_id} onChange={e => setF("warehouse_id", e.target.value)}
                  style={{ width: "100%", background: C.bg, border: `1px solid ${C.borderLight}`, color: form.warehouse_id ? C.text : C.textMuted, borderRadius: 6, padding: "8px 12px", fontSize: 13, outline: "none" }}>
                  <option value="">— Выберите склад —</option>
                  {(warehouses || []).filter(w => w.active || w.is_active).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
              <div>
                <Lbl req>Причина</Lbl>
                <select value={form.reason} onChange={e => setF("reason", e.target.value)}
                  style={{ width: "100%", background: C.bg, border: `1px solid ${C.borderLight}`, color: C.text, borderRadius: 6, padding: "8px 12px", fontSize: 13, outline: "none" }}>
                  <option value="damage">Порча</option>
                  <option value="expiry">Истёк срок</option>
                  <option value="loss">Недостача</option>
                  <option value="other">Прочее</option>
                </select>
              </div>
              <div><Lbl>Комментарий</Lbl><Inp value={form.comment} onChange={v => setF("comment", v)} placeholder="Описание..."/></div>
            </div>
          </Card>

          {!form.warehouse_id
            ? <Card style={{ padding: 48, textAlign: "center", color: C.textDim, fontSize: 14, width: "100%" }}>Выберите склад чтобы увидеть доступные товары</Card>
            : stockLoading
            ? <Card style={{ padding: 48, textAlign: "center", color: C.textMuted, fontSize: 14, width: "100%" }}>Загрузка остатков...</Card>
            : stockItems.length === 0
            ? <Card style={{ padding: 48, textAlign: "center", color: C.textDim, fontSize: 14, width: "100%" }}>На складе нет товаров</Card>
            : <Card>
                <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: C.text, fontWeight: 600, fontSize: 13 }}>Остатки на складе — введите количество для списания</span>
                  {linesToWrite.length > 0 && (
                    <span style={{ color: C.redText, fontSize: 13, fontWeight: 700 }}>
                      К списанию: {linesToWrite.length} поз. · {fmt(Math.round(formTotal))} ₽
                    </span>
                  )}
                </div>
                <div className="ct-wrap">
                  <table className="ct"><thead><tr>
                    <th>Товар</th><th>Партия</th><th>Ед.</th>
                    <th className="r">На складе</th>
                    <th className="r" style={{ color: C.accentText }}>Списать</th>
                    <th className="r">Себест.</th>
                    <th className="r">Сумма</th>
                  </tr></thead>
                  <tbody>{stockItems.map((s, i) => {
                    const qty = parseFloat(qtyMap[i]) || 0;
                    const amount = qty * (Number(s.cost_price) || 0);
                    const isOver = qty > Number(s.qty);
                    return (
                      <tr key={i} style={{ background: qty > 0 ? C.redDim + "22" : "transparent" }}>
                        <td style={{ fontWeight: 500 }}>{s.product_name}</td>
                        <td><span style={{ color: C.accentText, fontFamily: "monospace", fontSize: 12 }}>{s.batch_number || "—"}</span></td>
                        <td style={{ color: C.textDim, fontSize: 12 }}>{s.unit_short || "—"}</td>
                        <td className="r" style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 600 }}>{fmt(Number(s.qty))}</td>
                        <td className="r" style={{ width: 110 }}>
                          <input
                            type="text" inputMode="decimal" value={qtyMap[i] || ""}
                            onChange={e => setQty(i, e.target.value)}
                            onKeyDown={e => {
                              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                                e.preventDefault();
                                const next = e.key === "ArrowDown" ? i + 1 : i - 1;
                                const el = document.querySelector(`[data-wo-row="${next}"]`);
                                if (el) { el.focus(); el.select(); }
                              }
                            }}
                            data-wo-row={i}
                            placeholder="0"
                            style={{ width: 90, background: C.bg,
                              border: `1px solid ${isOver ? C.red : qty > 0 ? C.accent : C.borderLight}`,
                              color: isOver ? C.redText : C.text,
                              borderRadius: 4, padding: "4px 8px", fontSize: 13, outline: "none", textAlign: "right",
                              MozAppearance: "textfield", WebkitAppearance: "none" }}/>
                        </td>
                        <td className="r" style={{ color: C.textMuted, fontSize: 12 }}>{fmt(Number(s.cost_price))} ₽</td>
                        <td className="r" style={{ color: amount > 0 ? C.redText : C.textDim, fontWeight: amount > 0 ? 600 : 400, fontSize: 12 }}>
                          {amount > 0 ? fmt(Math.round(amount)) + " ₽" : "—"}
                        </td>
                      </tr>
                    );
                  })}</tbody>
                  <tfoot><tr>
                    <td colSpan={5} style={{ padding: "8px 10px", textAlign: "right", color: C.textMuted, fontSize: 12 }}>
                      Итого к списанию ({linesToWrite.length} поз.):
                    </td>
                    <td className="r" style={{ padding: "8px 10px" }}/>
                    <td className="r" style={{ padding: "8px 10px", color: C.redText, fontWeight: 700, fontSize: 14 }}>
                      {formTotal > 0 ? fmt(Math.round(formTotal)) + " ₽" : "—"}
                    </td>
                  </tr></tfoot>
                  </table>
                </div>
              </Card>
          }
        </div>
      </div>
    );
  }

  /* ════════════════════════════════
     СПИСОК
     ════════════════════════════════ */
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: "28px 24px" }}>
      <div style={{ width: "fit-content", maxWidth: "100%" }}>

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, width: "100%" }}>
          <div>
            <h1 style={{ margin: 0, color: C.text, fontSize: 20, fontWeight: 700 }}>Списания</h1>
            <div style={{ color: C.textMuted, fontSize: 12, marginTop: 3 }}>{filteredWO.length} документов</div>
          </div>
          <div style={{ marginLeft: "auto" }}>
            <Btn primary onClick={() => { setForm(emptyForm()); setQtyMap({}); setStockItems([]); setView("form"); }}>+ Новое списание</Btn>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 16, width: "100%" }}>
          {[
            { l: "Всего документов",  v: writeOffs.length + " шт.",                                c: C.text    },
            { l: "Списано (себест.)", v: fmt(Math.round(totalCost)) + " ₽",                        c: C.redText },
            { l: "Порча",             v: writeOffs.filter(w => w.reason === "damage").length + " шт.", c: WO_REASON_COLORS.damage[0] },
            { l: "Недостача",         v: writeOffs.filter(w => w.reason === "loss").length + " шт.",   c: WO_REASON_COLORS.loss[0]   },
          ].map((s, i) => (
            <Card key={i} style={{ padding: "14px 16px", borderLeft: `3px solid ${s.c}` }}>
              <div style={{ color: C.textMuted, fontSize: 12, marginBottom: 6 }}>{s.l}</div>
              <div style={{ color: s.c, fontSize: 20, fontWeight: 700 }}>{s.v}</div>
            </Card>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, padding: "10px 14px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, width: "100%" }}>
          <span style={{ color: C.textMuted, fontSize: 12, whiteSpace: "nowrap" }}>Период:</span>
          <DateFilter dateFrom={dateFrom} dateTo={dateTo} onFrom={setDateFrom} onTo={setDateTo}/>
        </div>

        <Card>
          {loading ? <div style={{ padding: 32, textAlign: "center", color: C.textMuted }}>Загрузка...</div> :
          <div className="ct-wrap">
            <table className="ct"><thead><tr>
              <th>Номер</th><th>Дата</th><th>Склад</th><th>Причина</th><th>Примечание</th>
              <th className="r">Позиций</th><th className="r">Сумма</th><th style={{ width: 80 }}/>
            </tr></thead>
            <tbody>
              {filteredWO.length === 0 && <tr><td colSpan={8} style={{ padding: 32, textAlign: "center", color: C.textDim }}>Нет данных</td></tr>}
              {filteredWO.map(w => {
                const [rc, rb] = WO_REASON_COLORS[w.reason] || [C.textMuted, C.border];
                return (
                  <tr key={w.id} onDoubleClick={() => openDetail(w)} style={{ cursor: "pointer" }}>
                    <td><span style={{ color: C.purpleText, fontFamily: "monospace", fontSize: 12 }}>{w.number}</span></td>
                    <td style={{ color: C.textMuted, fontSize: 12 }}>{w.date}</td>
                    <td>{w.warehouse_name || "—"}</td>
                    <td><span style={{ color: rc, background: rb, padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 600 }}>{WO_REASONS[w.reason] || w.reason}</span></td>
                    <td style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: C.textMuted, fontSize: 11, fontStyle: "italic" }} title={w.note}>{w.note || ""}</td>
                    <td className="r" style={{ color: C.textMuted, fontSize: 12 }}>{w.lines_count}</td>
                    <td className="r" style={{ color: C.redText, fontWeight: 600 }}>{fmt(Math.round(w.total_amount))} ₽</td>
                    <td>
                      <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                        <button onClick={() => openDetail(w)} style={{ padding: "2px 8px", background: "transparent", border: `1px solid ${C.borderLight}`, color: C.textMuted, borderRadius: 4, cursor: "pointer", fontSize: 11 }}>Открыть</button>
                        <button onClick={() => setConfirm({ id: w.id, name: w.number })} style={{ padding: "2px 6px", background: "transparent", border: `1px solid ${C.redDim}`, color: C.redText, borderRadius: 4, cursor: "pointer", fontSize: 12, fontWeight: 700 }}>✕</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody></table>
          </div>}
        </Card>

        {confirm && <ConfirmDialog text={`Удалить списание «${confirm.name}»? Товар будет возвращён на склад.`} onConfirm={() => removeDoc(confirm.id)} onClose={() => setConfirm(null)}/>}
      </div>
    </div>
  );
}

// ─── ЭКРАН ВОЗВРАТОВ ──────────────────────────────────────────────────────────

export default WriteOffs;
