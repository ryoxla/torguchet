import { useState, useEffect } from "react";
import { C, fmt, fmtDate, api, Card, Btn, Lbl, Inp, ConfirmDialog, inDateRange, DateFilter } from "../utils/globals";

import AuditLog from "./AuditLog";

function Transfers({ warehouses, currentUser }) {
  const [activeTab, setActiveTab] = useState('detail');
  const [view,      setView]      = useState("list");
  const [transfers, setTransfers] = useState([]);
  const [lines,     setLines]     = useState([]);
  const [selected,  setSelected]  = useState(null);
  const [confirm,   setConfirm]   = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [saving,    setSaving]    = useState(false);
  const todayStr = (() => { const d = new Date(); return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`; })();
  const [dateFrom,  setDateFrom]  = useState(todayStr);
  const [dateTo,    setDateTo]    = useState(todayStr);

  const today = new Date();
  const emptyForm = () => ({
    number: `ПЕР-${today.getFullYear()}-${String(transfers.length + 1).padStart(4, '0')}`,
    from_warehouse_id: "", to_warehouse_id: "", comment: "",
  });
  const [form, setForm] = useState(emptyForm);
  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const [stockItems,  setStockItems]  = useState([]);
  const [stockLoading,setStockLoading]= useState(false);
  const [qtyMap,      setQtyMap]      = useState({});
  const setQty = (i, val) => setQtyMap(m => ({ ...m, [i]: val }));

  const loadList = () => {
    setLoading(true);
    api('/transfers').then(rows => {
      setTransfers(rows.map(r => ({ ...r,
        total_amount: Number(r.total_amount) || 0,
        lines_count:  Number(r.lines_count)  || 0,
        date:         fmtDate(r.created_at),
      })));
    }).catch(e => alert('Ошибка: ' + e.message)).finally(() => setLoading(false));
  };
  useEffect(() => { loadList(); }, []);

  useEffect(() => {
    if (view !== "form" || !form.from_warehouse_id) { setStockItems([]); setQtyMap({}); return; }
    setStockLoading(true);
    api(`/stock?warehouse_id=${form.from_warehouse_id}`)
      .then(rows => { setStockItems(rows); setQtyMap({}); })
      .catch(() => setStockItems([]))
      .finally(() => setStockLoading(false));
  }, [form.from_warehouse_id, view]);

  const linesToMove = stockItems.map((s, i) => ({ s, qty: parseFloat(qtyMap[i]) || 0, i })).filter(x => x.qty > 0);
  const formTotal = linesToMove.reduce((s, x) => s + x.qty * (Number(x.s.cost_price) || 0), 0);

  const handleSave = async () => {
    if (!form.from_warehouse_id) { alert("Выберите склад-источник"); return; }
    if (!form.to_warehouse_id)   { alert("Выберите склад-назначение"); return; }
    if (form.from_warehouse_id === form.to_warehouse_id) { alert("Склады должны быть разными"); return; }
    if (!linesToMove.length) { alert("Укажите количество хотя бы для одного товара"); return; }
    const over = linesToMove.find(x => x.qty > Number(x.s.qty));
    if (over) { alert(`Недостаточно «${over.s.product_name}»: нужно ${over.qty}, есть ${over.s.qty}`); return; }
    setSaving(true);
    try {
      await api('/transfers', 'POST', {
        number: form.number,
        from_warehouse_id: parseInt(form.from_warehouse_id),
        to_warehouse_id:   parseInt(form.to_warehouse_id),
        comment: form.comment || null,
        created_by: currentUser?.id || null,
        lines: linesToMove.map(x => ({ product_id: x.s.product_id, batch_id: x.s.batch_id || null, qty: x.qty })),
      });
      loadList(); setView("list");
    } catch (e) { alert('Ошибка: ' + e.message); }
    finally { setSaving(false); }
  };

  const openDetail = async t => {
    setActiveTab('detail');
    setSelected(t);
    const ls = await api(`/transfers/${t.id}/lines`).catch(() => []);
    setLines(ls.map(l => ({ ...l, qty: Number(l.qty), cost_price: Number(l.cost_price) })));
    setView("detail");
  };

  const removeDoc = async id => {
    try { await api(`/transfers/${id}`, 'DELETE'); loadList(); setConfirm(null); setView("list"); }
    catch (e) { alert('Ошибка удаления: ' + e.message); }
  };

  const filteredT = transfers.filter(t => inDateRange(t.date, dateFrom, dateTo));
  const totalAmt  = transfers.reduce((s, t) => s + t.total_amount, 0);

  /* ════════════════════════════════
     КАРТОЧКА
     ════════════════════════════════ */
  if (view === "detail" && selected) {
    const lineTotal = lines.reduce((s, l) => s + l.qty * (l.cost_price || 0), 0);
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "28px 24px" }}>
        <div style={{ width: "fit-content", maxWidth: "100%" }}>

          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, width: "100%" }}>
            <button onClick={() => setView("list")} style={{ background: "transparent", border: `1px solid ${C.borderLight}`, color: C.text, borderRadius: 6, padding: "8px 14px", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>← Перемещения</button>
            <h1 style={{ margin: 0, color: C.text, fontSize: 20, fontWeight: 700 }}>{selected.number}</h1>
            <span style={{ background: C.greenDim, color: C.greenText, padding: "3px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600 }}>Проведён</span>
            <div style={{ flex: 1 }}/>
            <button onClick={() => setConfirm({ id: selected.id, name: selected.number })}
              style={{ padding: "6px 14px", background: "transparent", border: `1px solid ${C.red}`, color: C.redText, borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Удалить</button>
          </div>

          <div style={{ display: "flex", gap: 0, marginBottom: 16, borderBottom: `1px solid ${C.border}`, width: "100%" }}>
            {[{ id: "detail", l: "Документ" }, { id: "history", l: "История изменений" }].map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)} style={{ padding: "8px 20px", border: "none", borderBottom: activeTab === t.id ? `2px solid ${C.accent}` : "2px solid transparent", background: "transparent", color: activeTab === t.id ? C.accentText : C.textMuted, cursor: "pointer", fontSize: 13, fontWeight: activeTab === t.id ? 600 : 400 }}>{t.l}</button>
            ))}
          </div>

          {activeTab === "history" ? (
            <Card style={{ padding: 16, width: "100%" }}><AuditLog table="transfers" recordId={selected.id}/></Card>
          ) : (<>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16, width: "100%" }}>
              <Card style={{ padding: 20 }}>
                <div style={{ color: C.textMuted, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 14 }}>Реквизиты</div>
                {[
                  ["Номер", selected.number],
                  ["Дата", selected.date],
                  ["Со склада", selected.from_warehouse_name || "—"],
                  ["На склад", selected.to_warehouse_name || "—"],
                  ["Ответственный", selected.created_by_name || "—"],
                  ["Комментарий", selected.comment || "—"],
                ].map(([l, v]) => (
                  <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid ${C.border}` }}>
                    <span style={{ color: C.textMuted, fontSize: 13 }}>{l}</span>
                    <span style={{ color: C.text, fontSize: 13, fontWeight: 500 }}>{v}</span>
                  </div>
                ))}
              </Card>
              <Card style={{ padding: 20 }}>
                <div style={{ color: C.textMuted, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 14 }}>Итог</div>
                <div style={{ color: C.tealText, fontSize: 28, fontWeight: 700, marginBottom: 4 }}>{fmt(Math.round(lineTotal))} ₽</div>
                <div style={{ color: C.textMuted, fontSize: 13, marginBottom: 4 }}>Себестоимость перемещённого товара</div>
                <div style={{ color: C.textDim, fontSize: 12 }}>{lines.length} позиций · {fmt(lines.reduce((s, l) => s + l.qty, 0))} ед.</div>
              </Card>
            </div>
            <Card>
              <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: C.text, fontWeight: 600, fontSize: 14 }}>Строки перемещения</span>
                <span style={{ color: C.tealText, fontWeight: 700 }}>{fmt(Math.round(lineTotal))} ₽</span>
              </div>
              <div className="ct-wrap">
                <table className="ct"><thead><tr>
                  <th>Товар</th><th>Партия</th><th>Сорт</th><th>Ед.</th>
                  <th className="r">Кол-во</th><th className="r">Себест.</th><th className="r">Сумма</th>
                </tr></thead>
                <tbody>{lines.map((l, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 500 }}>{l.product_name}</td>
                    <td><span style={{ color: C.accentText, fontFamily: "monospace", fontSize: 11 }}>{l.batch_number || "—"}</span></td>
                    <td style={{ fontSize: 12 }}>{l.grade_name || "—"}</td>
                    <td style={{ color: C.textDim, fontSize: 12 }}>{l.unit_short || "—"}</td>
                    <td className="r" style={{ fontWeight: 600 }}>{fmt(l.qty)}</td>
                    <td className="r" style={{ color: C.textMuted, fontSize: 12 }}>{fmt(l.cost_price)} ₽</td>
                    <td className="r" style={{ color: C.tealText, fontWeight: 600 }}>{fmt(Math.round(l.qty * l.cost_price))} ₽</td>
                  </tr>
                ))}</tbody>
                <tfoot><tr>
                  <td colSpan={6} style={{ padding: "8px 10px", textAlign: "right", color: C.textMuted, fontSize: 12 }}>Итого:</td>
                  <td className="r" style={{ padding: "8px 10px", color: C.tealText, fontWeight: 700 }}>{fmt(Math.round(lineTotal))} ₽</td>
                </tr></tfoot>
                </table>
              </div>
            </Card>
            <div style={{ marginTop: 16, padding: "12px 16px", background: C.greenDim, borderRadius: 8, border: `1px solid ${C.green}`, width: "100%" }}>
              <span style={{ color: C.greenText, fontSize: 13, fontWeight: 600 }}>
                Документ проведён — товар перемещён с «{selected.from_warehouse_name}» на «{selected.to_warehouse_name}».
              </span>
            </div>
          </>)}

          {confirm && <ConfirmDialog text={`Удалить перемещение «${confirm.name}»? Остатки будут восстановлены.`} onConfirm={() => removeDoc(confirm.id)} onClose={() => setConfirm(null)}/>}
        </div>
      </div>
    );
  }

  /* ════════════════════════════════
     ФОРМА СОЗДАНИЯ
     ════════════════════════════════ */
  if (view === "form") {
    const selStyle = { width: "100%", background: C.bg, border: `1px solid ${C.borderLight}`, color: C.text, borderRadius: 6, padding: "8px 12px", fontSize: 13, outline: "none" };
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "28px 24px" }}>
        <div style={{ width: "fit-content", maxWidth: "100%", minWidth: 600 }}>

          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24, width: "100%" }}>
            <button onClick={() => setView("list")} style={{ background: "transparent", border: `1px solid ${C.borderLight}`, color: C.text, borderRadius: 6, padding: "8px 14px", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>← Перемещения</button>
            <h1 style={{ margin: 0, color: C.text, fontSize: 20, fontWeight: 700 }}>Новое перемещение</h1>
            <div style={{ flex: 1 }}/>
            <Btn primary onClick={handleSave} disabled={saving || !linesToMove.length || !form.from_warehouse_id || !form.to_warehouse_id}>
              {saving ? "Сохранение..." : "Провести перемещение"}
            </Btn>
          </div>

          <Card style={{ padding: 20, marginBottom: 16, width: "100%" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 14 }}>
              <div><Lbl req>Номер</Lbl><Inp value={form.number} onChange={v => setF("number", v)}/></div>
              <div><Lbl req>Дата</Lbl><input type="date" value={form.date || today} onChange={e => setF("date", e.target.value)}
                style={{ width: "100%", background: C.bg, border: `1px solid ${C.borderLight}`, color: C.text, borderRadius: 6, padding: "8px 12px", fontSize: 13, outline: "none", colorScheme: "dark" }}/></div>
              <div>
                <Lbl req>Со склада</Lbl>
                <select value={form.from_warehouse_id} onChange={e => setF("from_warehouse_id", e.target.value)} style={selStyle}>
                  <option value="">— Источник —</option>
                  {(warehouses || []).filter(w => w.active || w.is_active).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
              <div>
                <Lbl req>На склад</Lbl>
                <select value={form.to_warehouse_id} onChange={e => setF("to_warehouse_id", e.target.value)} style={selStyle}>
                  <option value="">— Назначение —</option>
                  {(warehouses || []).filter(w => (w.active || w.is_active) && w.id != form.from_warehouse_id).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
              <div><Lbl>Комментарий</Lbl><Inp value={form.comment} onChange={v => setF("comment", v)} placeholder="Причина перемещения..."/></div>
            </div>
          </Card>

          {!form.from_warehouse_id
            ? <Card style={{ padding: 48, textAlign: "center", color: C.textDim, fontSize: 14, width: "100%" }}>Выберите склад-источник чтобы увидеть остатки</Card>
            : stockLoading
            ? <Card style={{ padding: 48, textAlign: "center", color: C.textMuted, fontSize: 14, width: "100%" }}>Загрузка остатков...</Card>
            : stockItems.length === 0
            ? <Card style={{ padding: 48, textAlign: "center", color: C.textDim, fontSize: 14, width: "100%" }}>На складе нет товаров</Card>
            : <Card>
                <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: C.text, fontWeight: 600, fontSize: 13 }}>Остатки на складе — введите количество для перемещения</span>
                  {linesToMove.length > 0 && (
                    <span style={{ color: C.tealText, fontSize: 13, fontWeight: 700 }}>
                      К перемещению: {linesToMove.length} поз. · {fmt(Math.round(formTotal))} ₽
                    </span>
                  )}
                </div>
                <div className="ct-wrap">
                  <table className="ct"><thead><tr>
                    <th>Товар</th><th>Партия</th><th>Сорт</th><th>Ед.</th>
                    <th className="r">На складе</th>
                    <th className="r" style={{ color: C.tealText }}>Переместить</th>
                    <th className="r">Себест.</th>
                    <th className="r">Сумма</th>
                  </tr></thead>
                  <tbody>{stockItems.map((s, i) => {
                    const qty = parseFloat(qtyMap[i]) || 0;
                    const amount = qty * (Number(s.cost_price) || 0);
                    const isOver = qty > Number(s.qty);
                    return (
                      <tr key={i} style={{ background: qty > 0 ? C.tealDim + "22" : "transparent" }}>
                        <td style={{ fontWeight: 500 }}>{s.product_name}</td>
                        <td><span style={{ color: C.accentText, fontFamily: "monospace", fontSize: 12 }}>{s.batch_number || "—"}</span></td>
                        <td style={{ fontSize: 12 }}>{s.grade_name || "—"}</td>
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
                                const el = document.querySelector(`[data-tr-row="${next}"]`);
                                if (el) { el.focus(); el.select(); }
                              }
                            }}
                            data-tr-row={i}
                            placeholder="0"
                            style={{ width: 90, background: C.bg,
                              border: `1px solid ${isOver ? C.red : qty > 0 ? C.teal || "#2dd4bf" : C.borderLight}`,
                              color: isOver ? C.redText : C.text,
                              borderRadius: 4, padding: "4px 8px", fontSize: 13, outline: "none", textAlign: "right",
                              MozAppearance: "textfield", WebkitAppearance: "none" }}/>
                        </td>
                        <td className="r" style={{ color: C.textMuted, fontSize: 12 }}>{fmt(Number(s.cost_price))} ₽</td>
                        <td className="r" style={{ color: amount > 0 ? C.tealText : C.textDim, fontWeight: amount > 0 ? 600 : 400, fontSize: 12 }}>
                          {amount > 0 ? fmt(Math.round(amount)) + " ₽" : "—"}
                        </td>
                      </tr>
                    );
                  })}</tbody>
                  <tfoot><tr>
                    <td colSpan={5} style={{ padding: "8px 10px", textAlign: "right", color: C.textMuted, fontSize: 12 }}>
                      Итого к перемещению ({linesToMove.length} поз.):
                    </td>
                    <td/><td/>
                    <td className="r" style={{ padding: "8px 10px", color: C.tealText, fontWeight: 700, fontSize: 14 }}>
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
            <h1 style={{ margin: 0, color: C.text, fontSize: 20, fontWeight: 700 }}>Перемещения товара</h1>
            <div style={{ color: C.textMuted, fontSize: 12, marginTop: 3 }}>{filteredT.length} документов</div>
          </div>
          <div style={{ marginLeft: "auto" }}>
            <Btn primary onClick={() => { setForm(emptyForm()); setStockItems([]); setQtyMap({}); setView("form"); }}>+ Новое перемещение</Btn>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 16, width: "100%" }}>
          {[
            { l: "Всего документов",   v: transfers.length + " шт.",         c: C.tealText  },
            { l: "Сумма перемещений",  v: fmt(Math.round(totalAmt)) + " ₽",  c: C.accentText },
            { l: "Позиций перемещено", v: transfers.reduce((s, t) => s + t.lines_count, 0) + " шт.", c: C.text },
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
              <th>Номер</th><th>Дата</th><th>Со склада</th><th>На склад</th>
              <th className="r">Позиций</th><th className="r">Сумма</th><th style={{ width: 80 }}/>
            </tr></thead>
            <tbody>
              {filteredT.length === 0 && <tr><td colSpan={7} style={{ padding: 32, textAlign: "center", color: C.textDim }}>Нет данных</td></tr>}
              {filteredT.map(t => (
                <tr key={t.id} onDoubleClick={() => openDetail(t)} style={{ cursor: "pointer" }}>
                  <td><span style={{ color: C.tealText, fontFamily: "monospace", fontSize: 12 }}>{t.number}</span></td>
                  <td style={{ color: C.textMuted, fontSize: 12 }}>{t.date}</td>
                  <td style={{ color: C.textMuted }}>{t.from_warehouse_name || "—"}</td>
                  <td style={{ fontWeight: 500 }}>{t.to_warehouse_name || "—"}</td>
                  <td className="r" style={{ color: C.textMuted, fontSize: 12 }}>{t.lines_count}</td>
                  <td className="r" style={{ color: C.tealText, fontWeight: 600 }}>{fmt(Math.round(t.total_amount))} ₽</td>
                  <td>
                    <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                      <button onClick={() => openDetail(t)} style={{ padding: "2px 8px", background: "transparent", border: `1px solid ${C.borderLight}`, color: C.textMuted, borderRadius: 4, cursor: "pointer", fontSize: 11 }}>Открыть</button>
                      <button onClick={() => setConfirm({ id: t.id, name: t.number })} style={{ padding: "2px 6px", background: "transparent", border: `1px solid ${C.redDim}`, color: C.redText, borderRadius: 4, cursor: "pointer", fontSize: 12, fontWeight: 700 }}>✕</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody></table>
          </div>}
        </Card>

        {confirm && <ConfirmDialog text={`Удалить перемещение «${confirm.name}»? Остатки будут восстановлены.`} onConfirm={() => removeDoc(confirm.id)} onClose={() => setConfirm(null)}/>}
      </div>
    </div>
  );
}

// ─── ДАННЫЕ: СПИСАНИЯ ─────────────────────────────────────────────────────────

// ─── ДАННЫЕ: ВОЗВРАТЫ ─────────────────────────────────────────────────────────

// ─── ЭКРАН СПИСАНИЙ ───────────────────────────────────────────────────────────

export default Transfers;
