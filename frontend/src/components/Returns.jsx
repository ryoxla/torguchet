import { useState, useEffect } from "react";
import { C, fmt, fmtDate, api, Card, Btn, Lbl, Inp, ConfirmDialog, inDateRange, DateFilter } from "../utils/globals";

import AuditLog from "./AuditLog";

function Returns({ onNav, warehouses, counterparties, currentUser }) {
  const [activeTab, setActiveTab] = useState('detail');
  const [view,      setView]      = useState("list");
  const [returns,   setReturns]   = useState([]);
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
    number: `ВОЗ-${today.getFullYear()}-${String(returns.length + 1).padStart(4, '0')}`,
    date: today,
    order_id: "", counterparty_id: "", warehouse_id: "", reason: "",
  });
  const [form, setForm] = useState(emptyForm);
  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const [saleLines, setSaleLines] = useState([]);
  const [qtyMap,    setQtyMap]    = useState({});
  const setQty = (i, val) => setQtyMap(m => ({ ...m, [i]: val }));

  const [invoices, setInvoices] = useState([]);

  const loadList = () => {
    setLoading(true);
    api('/returns').then(rows => {
      setReturns(rows.map(r => ({ ...r,
        total_amount: Number(r.total_amount) || 0,
        lines_count:  Number(r.lines_count)  || 0,
        date:         fmtDate(r.created_at),
      })));
    }).catch(e => alert('Ошибка: ' + e.message)).finally(() => setLoading(false));
  };
  useEffect(() => {
    loadList();
    api('/orders-sale').then(rows => setInvoices(rows.filter(r => r.status === 'posted'))).catch(() => {});
  }, []);

  useEffect(() => {
    if (!form.order_id) { setSaleLines([]); setQtyMap({}); return; }
    api(`/orders-sale/${form.order_id}/lines`).then(rows => {
      setSaleLines(rows.map(r => ({ ...r, qty: Number(r.qty), price: Number(r.price) })));
      setQtyMap({});
      const inv = invoices.find(i => i.id == form.order_id);
      if (inv) {
        setF('warehouse_id', inv.warehouse_id || "");
        setF('counterparty_id', inv.counterparty_id || "");
      }
    }).catch(() => {});
  }, [form.order_id]);

  const linesToReturn = saleLines.map((l, i) => ({ ...l, returnQty: parseFloat(qtyMap[i]) || 0, i })).filter(x => x.returnQty > 0);
  const formTotal = linesToReturn.reduce((s, x) => s + x.returnQty * x.price, 0);

  const handleSave = async () => {
    if (!form.order_id) { alert("Выберите расходную накладную"); return; }
    if (!linesToReturn.length) { alert("Укажите количество хотя бы для одного товара"); return; }
    const over = linesToReturn.find(x => x.returnQty > x.qty);
    if (over) { alert(`Нельзя вернуть больше чем продано: «${over.product_name}» (продано ${over.qty})`); return; }
    setSaving(true);
    try {
      await api('/returns', 'POST', {
        number: form.number, date: form.date || today,
        order_id: parseInt(form.order_id),
        counterparty_id: parseInt(form.counterparty_id) || null,
        warehouse_id: parseInt(form.warehouse_id) || null,
        reason: form.reason || null,
        created_by: currentUser?.id || null,
        lines: linesToReturn.map(x => ({ product_id: x.product_id, batch_id: x.batch_id || null, qty: x.returnQty, price: x.price })),
      });
      loadList(); setView("list");
    } catch (e) { alert('Ошибка: ' + e.message); }
    finally { setSaving(false); }
  };

  const openDetail = async r => {
    setActiveTab('detail');
    setSelected(r);
    const ls = await api(`/returns/${r.id}/lines`).catch(() => []);
    setLines(ls.map(l => ({ ...l, qty: Number(l.qty), price: Number(l.price), amount: Number(l.amount) })));
    setView("detail");
  };

  const removeDoc = async id => {
    try { await api(`/returns/${id}`, 'DELETE'); loadList(); setConfirm(null); setView("list"); }
    catch (e) { alert('Ошибка удаления: ' + e.message); }
  };

  const filteredR = returns.filter(r => inDateRange(r.date, dateFrom, dateTo));
  const totalAmt  = returns.reduce((s, r) => s + r.total_amount, 0);

  /* ════════════════════════════════
     КАРТОЧКА
     ════════════════════════════════ */
  if (view === "detail" && selected) {
    const inv = invoices.find(i => i.id === selected.order_id);
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "28px 24px" }}>
        <div style={{ width: "fit-content", maxWidth: "100%" }}>

          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, width: "100%" }}>
            <button onClick={() => setView("list")} style={{ background: "transparent", border: `1px solid ${C.borderLight}`, color: C.text, borderRadius: 6, padding: "8px 14px", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>← Возвраты</button>
            <h1 style={{ margin: 0, color: C.text, fontSize: 20, fontWeight: 700 }}>{selected.number}</h1>
            <span style={{ background: C.yellowDim, color: C.yellowText, padding: "3px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600 }}>От покупателя</span>
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
            <Card style={{ padding: 16, width: "100%" }}><AuditLog table="returns" recordId={selected.id}/></Card>
          ) : (<>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20, width: "100%" }}>
              <Card style={{ padding: 20 }}>
                <div style={{ color: C.textMuted, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 14 }}>Реквизиты</div>
                {[
                  ["Номер", selected.number],
                  ["Дата", selected.date],
                  ["Покупатель", selected.counterparty_name || "—"],
                  ["Склад", selected.warehouse_name || "—"],
                  ["Исходная накл.", selected.sale_number || "—"],
                  ["Причина", selected.reason || "—"],
                ].map(([l, v]) => (
                  <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid ${C.border}` }}>
                    <span style={{ color: C.textMuted, fontSize: 13 }}>{l}</span>
                    <span style={{ color: C.text, fontSize: 13, fontWeight: 500 }}>{v}</span>
                  </div>
                ))}
              </Card>
              <Card style={{ padding: 20 }}>
                <div style={{ color: C.textMuted, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 14 }}>Итог возврата</div>
                <div style={{ color: C.yellowText, fontSize: 28, fontWeight: 700, marginBottom: 6 }}>{fmt(Math.round(selected.total_amount))} ₽</div>
                <div style={{ color: C.textMuted, fontSize: 13, marginBottom: 4 }}>Сумма возврата покупателю</div>
                <div style={{ color: C.textDim, fontSize: 12 }}>{selected.lines_count} позиций</div>
              </Card>
            </div>
            <Card>
              <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border}`, color: C.text, fontWeight: 600, fontSize: 14 }}>Строки возврата</div>
              <div className="ct-wrap">
                <table className="ct"><thead><tr>
                  <th>Товар</th><th>Партия</th><th>Сорт</th><th>Ед.</th>
                  <th className="r">Кол-во</th><th className="r">Цена</th><th className="r">Сумма</th>
                </tr></thead>
                <tbody>{lines.map((l, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 500 }}>{l.product_name}</td>
                    <td><span style={{ color: C.accentText, fontFamily: "monospace", fontSize: 12 }}>{l.batch_number || "—"}</span></td>
                    <td style={{ fontSize: 12 }}>{l.grade_name || "—"}</td>
                    <td style={{ color: C.textDim, fontSize: 12 }}>{l.unit_short || "—"}</td>
                    <td className="r" style={{ fontWeight: 600 }}>{fmt(l.qty)}</td>
                    <td className="r" style={{ color: C.textMuted, fontSize: 12 }}>{fmt(l.price)} ₽</td>
                    <td className="r" style={{ color: C.yellowText, fontWeight: 600 }}>{fmt(Math.round(l.amount))} ₽</td>
                  </tr>
                ))}</tbody>
                <tfoot><tr>
                  <td colSpan={6} style={{ padding: "8px 10px", textAlign: "right", color: C.textMuted, fontSize: 12 }}>Итого:</td>
                  <td className="r" style={{ padding: "8px 10px", color: C.yellowText, fontWeight: 700 }}>{fmt(Math.round(selected.total_amount))} ₽</td>
                </tr></tfoot>
                </table>
              </div>
            </Card>
            <div style={{ marginTop: 16, padding: "12px 16px", background: C.greenDim, borderRadius: 8, border: `1px solid ${C.green}`, width: "100%" }}>
              <span style={{ color: C.greenText, fontSize: 13, fontWeight: 600 }}>Документ проведён — товар возвращён на склад.</span>
            </div>
          </>)}

          {confirm && <ConfirmDialog text={`Удалить возврат «${confirm.name}»? Товар будет снят со склада.`} onConfirm={() => removeDoc(confirm.id)} onClose={() => setConfirm(null)}/>}
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

          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, width: "100%" }}>
            <button onClick={() => setView("list")} style={{ background: "transparent", border: `1px solid ${C.borderLight}`, color: C.text, borderRadius: 6, padding: "8px 14px", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>← Возвраты</button>
            <h1 style={{ margin: 0, color: C.text, fontSize: 20, fontWeight: 700 }}>Новый возврат от покупателя</h1>
            <div style={{ flex: 1 }}/>
            <Btn primary onClick={handleSave} disabled={saving || !linesToReturn.length || !form.order_id}>
              {saving ? "Сохранение..." : "Провести возврат"}
            </Btn>
          </div>

          <Card style={{ padding: 20, marginBottom: 16, width: "100%" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 12 }}>
              <div><Lbl req>Номер</Lbl><Inp value={form.number} onChange={v => setF("number", v)}/></div>
              <div><Lbl req>Дата</Lbl><input type="date" value={form.date || today} onChange={e => setF("date", e.target.value)} style={{ width: "100%", background: C.bg, border: `1px solid ${C.borderLight}`, color: C.text, borderRadius: 6, padding: "8px 12px", fontSize: 13, outline: "none", colorScheme: "dark" }}/></div>
              <div>
                <Lbl req>Расходная накладная</Lbl>
                <select value={form.order_id} onChange={e => setF("order_id", e.target.value)} style={selStyle}>
                  <option value="">— Выберите накладную —</option>
                  {invoices.map(i => <option key={i.id} value={i.id}>{i.number} — {i.counterparty_name || "—"}</option>)}
                </select>
              </div>
            </div>
            {form.order_id && (() => {
              const inv = invoices.find(i => i.id == form.order_id);
              return inv ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 12, padding: "12px 14px", background: C.bg, borderRadius: 6, border: `1px solid ${C.border}` }}>
                  <div>
                    <div style={{ color: C.textMuted, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Покупатель</div>
                    <div style={{ color: C.text, fontSize: 13, fontWeight: 600 }}>{inv.counterparty_name || "—"}</div>
                  </div>
                  <div>
                    <div style={{ color: C.textMuted, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Склад</div>
                    <div style={{ color: C.text, fontSize: 13, fontWeight: 600 }}>{inv.warehouse_name || "—"}</div>
                  </div>
                </div>
              ) : null;
            })()}
            <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 12, marginTop: 4 }}>
              <div>
                <Lbl>Дата возврата</Lbl>
                <input type="date" value={form.date || today} onChange={e => setF("date", e.target.value)} style={{ width: "100%", background: C.bg, border: `1px solid ${C.borderLight}`, color: C.text, borderRadius: 6, padding: "8px 12px", fontSize: 13, outline: "none", colorScheme: "dark" }}/>
              </div>
              <div>
                <Lbl>Причина возврата</Lbl>
                <Inp value={form.reason} onChange={v => setF("reason", v)} placeholder="Ненадлежащее качество, пересорт..."/>
              </div>
            </div>
          </Card>

          {!form.order_id
            ? <Card style={{ padding: 48, textAlign: "center", color: C.textDim, fontSize: 14, width: "100%" }}>Выберите расходную накладную</Card>
            : saleLines.length === 0
            ? <Card style={{ padding: 48, textAlign: "center", color: C.textMuted, fontSize: 14, width: "100%" }}>Загрузка строк накладной...</Card>
            : <Card>
                <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: C.text, fontWeight: 600, fontSize: 13 }}>Товары из накладной — введите количество к возврату</span>
                  {linesToReturn.length > 0 && (
                    <span style={{ color: C.yellowText, fontSize: 13, fontWeight: 700 }}>
                      К возврату: {linesToReturn.length} поз. · {fmt(Math.round(formTotal))} ₽
                    </span>
                  )}
                </div>
                <div className="ct-wrap">
                  <table className="ct"><thead><tr>
                    <th>Товар</th><th>Партия</th><th>Сорт</th><th>Ед.</th>
                    <th className="r">Продано</th>
                    <th className="r" style={{ color: C.accentText }}>Вернуть</th>
                    <th className="r">Цена</th>
                    <th className="r">Сумма</th>
                  </tr></thead>
                  <tbody>{saleLines.map((l, i) => {
                    const retQty = parseFloat(qtyMap[i]) || 0;
                    const amount = retQty * l.price;
                    const isOver = retQty > l.qty;
                    return (
                      <tr key={i} style={{ background: retQty > 0 ? C.yellowDim + "22" : "transparent" }}>
                        <td style={{ fontWeight: 500 }}>{l.product_name}</td>
                        <td><span style={{ color: C.accentText, fontFamily: "monospace", fontSize: 12 }}>{l.batch_number || "—"}</span></td>
                        <td style={{ fontSize: 12 }}>{l.grade_name || "—"}</td>
                        <td style={{ color: C.textDim, fontSize: 12 }}>{l.unit_short || "—"}</td>
                        <td className="r" style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 600 }}>{fmt(l.qty)}</td>
                        <td className="r" style={{ width: 110 }}>
                          <input
                            type="text" inputMode="decimal" value={qtyMap[i] || ""}
                            onChange={e => setQty(i, e.target.value)}
                            onKeyDown={e => {
                              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                                e.preventDefault();
                                const next = e.key === "ArrowDown" ? i + 1 : i - 1;
                                const el = document.querySelector(`[data-ret-row="${next}"]`);
                                if (el) { el.focus(); el.select(); }
                              }
                            }}
                            data-ret-row={i}
                            placeholder="0"
                            style={{ width: 90, background: C.bg,
                              border: `1px solid ${isOver ? C.red : retQty > 0 ? C.yellow : C.borderLight}`,
                              color: isOver ? C.redText : C.text,
                              borderRadius: 4, padding: "4px 8px", fontSize: 13, outline: "none", textAlign: "right",
                              MozAppearance: "textfield", WebkitAppearance: "none" }}/>
                        </td>
                        <td className="r" style={{ color: C.textMuted, fontSize: 12 }}>{fmt(l.price)} ₽</td>
                        <td className="r" style={{ color: amount > 0 ? C.yellowText : C.textDim, fontWeight: amount > 0 ? 600 : 400, fontSize: 12 }}>
                          {amount > 0 ? fmt(Math.round(amount)) + " ₽" : "—"}
                        </td>
                      </tr>
                    );
                  })}</tbody>
                  <tfoot><tr>
                    <td colSpan={6} style={{ padding: "8px 10px", textAlign: "right", color: C.textMuted, fontSize: 12 }}>
                      Итого к возврату ({linesToReturn.length} поз.):
                    </td>
                    <td/>
                    <td className="r" style={{ padding: "8px 10px", color: C.yellowText, fontWeight: 700, fontSize: 14 }}>
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
            <h1 style={{ margin: 0, color: C.text, fontSize: 20, fontWeight: 700 }}>Возвраты от покупателей</h1>
            <div style={{ color: C.textMuted, fontSize: 12, marginTop: 3 }}>{filteredR.length} документов</div>
          </div>
          <div style={{ marginLeft: "auto" }}>
            <Btn primary onClick={() => { setForm(emptyForm()); setSaleLines([]); setQtyMap({}); setView("form"); }}>+ Новый возврат</Btn>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 16, width: "100%" }}>
          {[
            { l: "Всего документов", v: returns.length + " шт.",          c: C.text       },
            { l: "Сумма возвратов",  v: fmt(Math.round(totalAmt)) + " ₽", c: C.yellowText },
            { l: "Позиций",         v: returns.reduce((s, r) => s + r.lines_count, 0) + " шт.", c: C.accentText },
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
              <th>Номер</th><th>Дата</th><th>Покупатель</th><th>Накладная</th>
              <th>Склад</th><th className="r">Позиций</th><th className="r">Сумма</th><th style={{ width: 80 }}/>
            </tr></thead>
            <tbody>
              {filteredR.length === 0 && <tr><td colSpan={8} style={{ padding: 32, textAlign: "center", color: C.textDim }}>Нет данных</td></tr>}
              {filteredR.map(r => (
                <tr key={r.id} onDoubleClick={() => openDetail(r)} style={{ cursor: "pointer" }}>
                  <td><span style={{ color: C.tealText, fontFamily: "monospace", fontSize: 12 }}>{r.number}</span></td>
                  <td style={{ color: C.textMuted, fontSize: 12 }}>{r.date}</td>
                  <td style={{ fontWeight: 500 }}>{r.counterparty_name || "—"}</td>
                  <td><span style={{ color: C.accentText, fontFamily: "monospace", fontSize: 12 }}>{r.sale_number || "—"}</span></td>
                  <td style={{ color: C.textMuted, fontSize: 12 }}>{r.warehouse_name || "—"}</td>
                  <td className="r" style={{ color: C.textMuted, fontSize: 12 }}>{r.lines_count}</td>
                  <td className="r" style={{ color: C.yellowText, fontWeight: 600 }}>{fmt(Math.round(r.total_amount))} ₽</td>
                  <td>
                    <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                      <button onClick={() => openDetail(r)} style={{ padding: "2px 8px", background: "transparent", border: `1px solid ${C.borderLight}`, color: C.textMuted, borderRadius: 4, cursor: "pointer", fontSize: 11 }}>Открыть</button>
                      <button onClick={() => setConfirm({ id: r.id, name: r.number })} style={{ padding: "2px 6px", background: "transparent", border: `1px solid ${C.redDim}`, color: C.redText, borderRadius: 4, cursor: "pointer", fontSize: 12, fontWeight: 700 }}>✕</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody></table>
          </div>}
        </Card>

        {confirm && <ConfirmDialog text={`Удалить возврат «${confirm.name}»? Товар будет снят со склада.`} onConfirm={() => removeDoc(confirm.id)} onClose={() => setConfirm(null)}/>}
      </div>
    </div>
  );
}

// ─── КАРТОЧКА ТОВАРА ──────────────────────────────────────────────────────────

export default Returns;
