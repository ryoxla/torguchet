import { useState, useEffect } from "react";
import { C, fmt, fmtDate, api, Card, Btn, Lbl, Inp, ConfirmDialog } from "../utils/globals";

function DebtWriteoffs({ counterparties = [], currencies = [], currentUser }) {
  const [rows,    setRows]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal,   setModal]   = useState(null); // null | "add"
  const [confirm, setConfirm] = useState(null);
  const [form,    setForm]    = useState({});
  const [error,   setError]   = useState("");
  const [saving,  setSaving]  = useState(false);

  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    api('/debt-writeoffs')
      .then(r => setRows(r))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const openAdd = () => {
    setForm({ date: today, counterparty_id: "", amount: "", currency_id: "", note: "" });
    setError("");
    setModal("add");
  };

  const handleCpChange = id => {
    setF("counterparty_id", id);
    const cp = counterparties.find(c => String(c.id) === String(id));
    if (cp?.currency_id) setF("currency_id", cp.currency_id);
    else setF("currency_id", currencies.find(c => c.code === "RUB")?.id || "");
  };

  const handleSave = async () => {
    if (!form.counterparty_id) { setError("Выберите контрагента"); return; }
    if (!form.amount || parseFloat(form.amount) <= 0) { setError("Введите сумму"); return; }
    setSaving(true);
    try {
      const saved = await api('/debt-writeoffs', 'POST', {
        date:            form.date || today,
        counterparty_id: parseInt(form.counterparty_id),
        amount:          parseFloat(form.amount),
        currency_id:     parseInt(form.currency_id) || null,
        note:            form.note || null,
        created_by:      currentUser?.id || null,
      });
      setRows(prev => [saved, ...prev]);
      setModal(null);
    } catch (e) {
      setError(e.message || "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async id => {
    try {
      await api(`/debt-writeoffs/${id}`, 'DELETE');
      setRows(prev => prev.filter(r => r.id !== id));
    } catch (e) { alert(e.message); }
    setConfirm(null);
  };

  const selStyle = { width: "100%", background: C.bg, border: `1px solid ${C.borderLight}`, color: C.text, borderRadius: 6, padding: "8px 12px", fontSize: 13, outline: "none" };

  return (
    /* ── центрирующая обёртка ── */
    <div style={{ display: "flex", justifyContent: "center", padding: "28px 24px" }}>
      <div style={{ width: "100%", maxWidth: 900 }}>

        {/* ── Шапка ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, paddingBottom: 16, borderBottom: `1px solid ${C.border}` }}>
          <div>
            <h1 style={{ color: C.text, fontSize: 20, fontWeight: 700, letterSpacing: "-0.3px", margin: 0 }}>Списание долгов</h1>
            <div style={{ color: C.textMuted, fontSize: 12, marginTop: 3 }}>Документы списания задолженности контрагентов</div>
          </div>
          <div style={{ marginLeft: "auto" }}>
            <Btn primary onClick={openAdd}>+ Новое списание</Btn>
          </div>
        </div>

        {/* ── Таблица ── */}
        <Card>
          {loading
            ? <div style={{ padding: 40, textAlign: "center", color: C.textMuted }}>Загрузка...</div>
            : rows.length === 0
              ? <div style={{ padding: 40, textAlign: "center", color: C.textDim }}>Нет документов списания</div>
              : <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                        {["Номер", "Дата", "Контрагент", "Сумма", "Валюта", "Примечание", ""].map((h, i) => (
                          <th key={i} style={{ padding: "8px 12px", textAlign: i === 3 ? "right" : "left", color: C.textMuted, fontSize: 11, fontWeight: 600, textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(r => (
                        <tr key={r.id} style={{ borderBottom: `1px solid ${C.border}`, transition: "background 0.1s" }}
                          onMouseEnter={e => e.currentTarget.style.background = C.surfaceHover}
                          onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                          <td style={{ padding: "8px 12px", fontFamily: "monospace", fontSize: 12, color: C.accentText, fontWeight: 600 }}>{r.number}</td>
                          <td style={{ padding: "8px 12px", fontSize: 12, color: C.textMuted }}>{fmtDate(r.date)}</td>
                          <td style={{ padding: "8px 12px", fontWeight: 500 }}>{r.counterparty_name}</td>
                          <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: C.redText }}>{fmt(r.amount)}</td>
                          <td style={{ padding: "8px 12px", fontSize: 12, color: C.textMuted }}>{r.currency_code || "RUB"}</td>
                          <td style={{ padding: "8px 12px", fontSize: 12, color: C.textMuted, fontStyle: "italic" }}>{r.note || ""}</td>
                          <td style={{ padding: "8px 12px" }}>
                            <button onClick={() => setConfirm({ id: r.id, name: r.number })}
                              style={{ padding: "2px 8px", background: "transparent", border: `1px solid ${C.redDim}`, color: C.redText, borderRadius: 4, cursor: "pointer", fontSize: 11, fontWeight: 600 }}>✕</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
          }
        </Card>

        {/* ── Модалка: создание ── */}
        {modal === "add" && (
          <div onClick={e => { if (e.target === e.currentTarget) setModal(null); }}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ background: C.surface, border: `1px solid ${C.borderLight}`, borderRadius: 10, width: 480, boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
              <div style={{ padding: "18px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: C.text, fontWeight: 700, fontSize: 15 }}>Новое списание долга</span>
                <button onClick={() => setModal(null)} style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer", fontSize: 20 }}>×</button>
              </div>
              <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <Lbl req>Дата</Lbl>
                  <input type="date" value={form.date || today} onChange={e => setF("date", e.target.value)}
                    style={{ ...selStyle, colorScheme: "dark" }}/>
                </div>
                <div>
                  <Lbl req>Контрагент</Lbl>
                  <select value={form.counterparty_id || ""} onChange={e => handleCpChange(e.target.value)} style={selStyle}>
                    <option value="">— Выберите контрагента —</option>
                    {counterparties.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <Lbl req>Сумма</Lbl>
                    <input type="number" value={form.amount || ""} onChange={e => setF("amount", e.target.value)}
                      placeholder="0.00" min="0" step="0.01" style={selStyle}/>
                  </div>
                  <div>
                    <Lbl>Валюта</Lbl>
                    <select value={form.currency_id || ""} onChange={e => setF("currency_id", e.target.value)} style={selStyle}>
                      <option value="">— Валюта —</option>
                      {currencies.map(c => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <Lbl>Примечание</Lbl>
                  <Inp value={form.note || ""} onChange={v => setF("note", v)} placeholder="Причина списания..."/>
                </div>
                {error && <div style={{ color: C.redText, fontSize: 12 }}>{error}</div>}
              </div>
              <div style={{ padding: "14px 20px", borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <Btn onClick={() => setModal(null)}>Отмена</Btn>
                <Btn primary onClick={handleSave} disabled={saving}>{saving ? "Сохранение..." : "Провести"}</Btn>
              </div>
            </div>
          </div>
        )}

        {confirm && (
          <ConfirmDialog
            text={`Удалить документ «${confirm.name}»? Это действие нельзя отменить.`}
            onConfirm={() => handleDelete(confirm.id)}
            onClose={() => setConfirm(null)}
          />
        )}

      </div>
    </div>
  );
}

export default DebtWriteoffs;
