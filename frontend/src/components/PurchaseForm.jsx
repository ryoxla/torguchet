import { useState, useEffect, useRef } from "react";
import { C, fmt, api, Card, Lbl, Inp, ConfirmDialog, SearchSelect, isDateRestricted, useIsMobile } from "../utils/globals";

// Навигация по ячейкам таблицы позиций «как в Excel».
function purGridNav(e){
  const cells = Array.from(document.querySelectorAll(".pur-cell"));
  const idx = cells.indexOf(e.currentTarget);
  if (idx === -1) return;
  const COLS = 7;
  let ni;
  if (e.key === "ArrowRight" || e.key === "Enter") ni = idx + 1;
  else if (e.key === "ArrowLeft") ni = idx - 1;
  else if (e.key === "ArrowDown") ni = idx + COLS;
  else if (e.key === "ArrowUp") ni = idx - COLS;
  else return;
  e.preventDefault();
  const t = cells[ni];
  if (t) { t.focus(); if (typeof t.select === "function") t.select(); }
}

// Ячейка «Товар» с поиском по вводу.
function LineProductCell({ value, options, onSelect, onKeyNav, locked, inpStyle }){
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hi, setHi] = useState(0);
  const ref = useRef(null);
  const selected = options.find(o => String(o.value) === String(value));
  const filtered = query ? options.filter(o => o.label.toLowerCase().includes(query.toLowerCase())) : options;
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const pick = o => { onSelect(o.value); setQuery(""); setOpen(false); };
  const onKey = e => {
    if (open) {
      if (e.key === "ArrowDown") { e.preventDefault(); setHi(h => Math.min(h + 1, filtered.length - 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setHi(h => Math.max(h - 1, 0)); }
      else if (e.key === "Enter") { e.preventDefault(); if (filtered[hi]) pick(filtered[hi]); }
      else if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
      else if (e.key === "ArrowLeft" || e.key === "ArrowRight") { setOpen(false); onKeyNav(e); }
    } else if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Enter"].includes(e.key)) {
      onKeyNav(e);
    }
  };
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <input className="pur-cell" disabled={locked}
        value={open ? query : (selected ? selected.label : "")}
        onChange={e => { setQuery(e.target.value); setOpen(true); setHi(0); }}
        onClick={() => { if (!locked) setOpen(true); }}
        onKeyDown={onKey}
        onFocus={e => e.target.select()}
        placeholder="Товар..."
        style={{ ...inpStyle, width: "100%", padding: "3px 6px", textAlign: "left" }} />
      {open && filtered.length > 0 && (
        <div style={{ position: "absolute", top: "100%", left: 0, minWidth: 210, zIndex: 60, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, maxHeight: 240, overflowY: "auto", boxShadow: "0 6px 20px rgba(0,0,0,0.35)", marginTop: 2 }}>
          {filtered.map((o, i) => (
            <div key={o.value} onMouseDown={() => pick(o)} onMouseEnter={() => setHi(i)}
              style={{ padding: "6px 10px", fontSize: 12, cursor: "pointer", whiteSpace: "nowrap", color: i === hi ? C.accentText : C.text, background: i === hi ? C.accentDim : "transparent" }}>
              {o.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

import AuditLog from "./AuditLog";

function PurchaseForm({ onBack, onSaved, onDeleted, editId, warehouses, counterparties, currencies, products, units, countries, grades, articles = [], currentUser }) {
  const [activeTab,    setActiveTab]    = useState("form");
  const today = new Date().toISOString().slice(0, 10);
  const defaultWarehouse = (warehouses||[]).find(w=>w.is_default)||null;
  const [form,         setForm]         = useState({ number: "ПН-...", date: today, counterparty_id: "", warehouse_id: defaultWarehouse?.id||"", currency_id: "", currency_rate: "1.000000", note: "", batch_number: "" });

  // Загружаем следующий номер с сервера (только для новой накладной)
  useEffect(() => {
    if (!editId) {
      api('/orders-purchase/next-number').then(r => {
        setForm(f => ({ ...f, number: r.number }));
      }).catch(() => {});
    }
  }, [editId]);
  const [lines,        setLines]        = useState([]);
  const [overheads,    setOverheads]    = useState([]);
  const [loading,      setLoading]      = useState(!!editId);
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState("");
  const [hasMovements, setHasMovements] = useState(false);
  const [confirmDel,   setConfirmDel]   = useState(false);
  const [corrModal,    setCorrModal]    = useState(null);
  const [corrSupplierId, setCorrSupplierId] = useState("");
  const [corrSaving,   setCorrSaving]   = useState(false);
  const [corrError,    setCorrError]    = useState("");
  const [gradesByProduct, setGradesByProduct] = useState({});
  const [batchSales,   setBatchSales]   = useState(null);
  const [batchSalesLoading, setBatchSalesLoading] = useState(false);

  const isMobile = useIsMobile();
  const [expandedLines, setExpandedLines] = useState({});
  const [expandedOh,    setExpandedOh]    = useState({});
  const toggleLineExp = key => setExpandedLines(e => ({ ...e, [key]: !e[key] }));
  const toggleOhExp    = key => setExpandedOh(e => ({ ...e, [key]: !e[key] }));

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const addOverhead = () => setOverheads(p => [...p, { _key: Date.now(), article_id: "", counterparty_id: "", amount: "", currency_id: "", currency_rate: "1" }]);
  const updOh = (key, k, v) => { if (k === "amount" || k === "currency_rate") v = String(v).replace(",", "."); return setOverheads(p => p.map(o => o._key === key ? { ...o, [k]: v } : o)); };
  const delOh = key => setOverheads(p => p.filter(o => o._key !== key));

  const getCurCode = curId => { const c = currencies.find(c => c.id === parseInt(curId)); return c?.code || ""; };
  const isRub = curId => getCurCode(curId) === "RUB" || parseInt(curId) === 1;

  const fetchRate = async (currencyId, date) => {
    if (!currencyId || isRub(currencyId)) return "1";
    try { const r = await api(`/currency-rate/${currencyId}/${date}`); return r.rate ? String(parseFloat(r.rate).toFixed(6)) : "1"; }
    catch (e) { return "1"; }
  };

  const handleCounterpartyChange = async cpId => {
    setF("counterparty_id", cpId);
    if (!cpId) return;
    const cp = counterparties.find(c => c.id === parseInt(cpId));
    if (cp?.currency_id && cp.currency_id !== parseInt(form.currency_id)) {
      setF("currency_id", cp.currency_id);
      const rate = await fetchRate(cp.currency_id, form.date || today);
      setF("currency_rate", rate);
    }
  };

  const handleCurrencyChange = async curId => {
    setF("currency_id", curId);
    const rate = await fetchRate(curId, form.date || today);
    setF("currency_rate", rate);
  };

  const handleDateChange = async date => {
    setF("date", date);
    if (!isRub(form.currency_id)) {
      const rate = await fetchRate(form.currency_id, date);
      setF("currency_rate", rate);
    }
  };

  const handleOhCounterpartyChange = async (key, cpId) => {
    updOh(key, "counterparty_id", cpId);
    if (!cpId) return;
    const cp = counterparties.find(c => c.id === parseInt(cpId));
    if (cp?.currency_id) {
      updOh(key, "currency_id", cp.currency_id);
      const rate = await fetchRate(cp.currency_id, form.date || today);
      updOh(key, "currency_rate", rate);
    }
  };

  useEffect(() => {
    if (!editId) return;
    api(`/orders-purchase/${editId}`).then(data => {
      setForm({ number: data.number || "", date: data.created_at ? String(data.created_at).slice(0, 10) : "", counterparty_id: data.counterparty_id || "", warehouse_id: data.warehouse_id || "", currency_id: data.currency_id || "", currency_rate: data.currency_rate || "1", note: data.note || "", batch_number: (data.lines && data.lines[0]?.batch_number) || "" });
      setLines((data.lines || []).map((l, i) => ({ _key: Date.now() + i, id: l.id || null, product_id: l.product_id || "", unit_id: l.unit_id || "", country_id: l.country_id || "", grade_id: l.grade_id || "", qty: l.qty ? String(parseFloat(l.qty)) : "", price: l.price ? String(parseFloat(parseFloat(l.price).toFixed(2))) : "", price_exact: l.price ? String(parseFloat(l.price)) : "", amount: l.qty && l.price ? String(parseFloat((parseFloat(l.qty)*parseFloat(l.price)).toFixed(2))) : "", batch_id: l.batch_id || null, moved_qty: Number(l.moved_qty) || 0, supplier_name: l.supplier_name || "—", grade_name: l.grade_name || "—", country_name: l.country_name || "—", batch_number: l.batch_number || "—", unit_short: l.unit_short || "" })));
      api(`/overhead-costs/${editId}`).then(rows => {
        setOverheads(rows.map(r => { const rate = parseFloat(r.currency_rate) || 1; const amtRub = parseFloat(r.amount) || 0; const amtOrig = rate > 1 ? Math.round((amtRub / rate) * 100) / 100 : amtRub; return { _key: Date.now() + r.id, id: r.id, article_id: r.article_id || "", counterparty_id: r.counterparty_id || "", amount: amtOrig ? String(amtOrig) : "", currency_id: r.currency_id || "", currency_rate: r.currency_rate || "1", note: r.note || "" }; }));
      }).catch(() => {});
      api(`/orders-purchase/${editId}/has-movements`).then(r => setHasMovements(!!r.has_movements)).catch(() => {});
    }).catch(e => setError("Ошибка загрузки: " + e.message)).finally(() => setLoading(false));
  }, [editId]);

  useEffect(() => {
    if (currencies.length && !form.currency_id) {
      const def = currencies.find(c => c.is_base || c.code === "RUB") || currencies[0];
      if (def) setF("currency_id", def.id);
    }
  }, [currencies]);

  const loadGradesForProduct = async productId => {
    if (!productId || gradesByProduct[productId]) return;
    try { const rows = await api(`/products/${productId}/available-grades`); setGradesByProduct(prev => ({ ...prev, [productId]: rows })); } catch (e) {}
  };

  const addLine = () => setLines(p => [...p, { _key: Date.now(), product_id: "", unit_id: "", country_id: "", grade_id: "", qty: "", price: "", price_exact: "", amount: "" }]);
  const updLine = (key, k, v) => setLines(p => p.map(l => {
    if (l._key !== key) return l;
    if (k === "qty" || k === "price" || k === "amount") v = String(v).replace(",", ".");
    const updated = { ...l, [k]: v };
    if (k === "qty") {
      const q = parseFloat(v) || 0;
      if (updated.amount !== "" && q > 0) {
        // Если заполнена сумма — пересчитываем цену с полной точностью
        const exactPrice = parseFloat(updated.amount) / q;
        updated.price_exact = parseFloat(exactPrice.toFixed(6)).toString();
        updated.price = parseFloat(exactPrice.toFixed(2)).toString();
        // amount не трогаем — он остаётся тем, что ввёл пользователь
      } else if (updated.price !== "") {
        // Иначе пересчитываем сумму (используем округлённую до 2 знаков цену)
        const pr = parseFloat(updated.price) || 0;
        updated.amount = parseFloat((q * pr).toFixed(2)).toString();
      }
    } else if (k === "price") {
      // price хранит «сырое» значение как печатает пользователь;
      // price_exact синхронизируется с ним сразу (с точностью до 6 знаков),
      // а визуальное округление до 2 знаков происходит при onBlur (см. blurPrice).
      const q = parseFloat(updated.qty) || 0;
      const rawPrice = parseFloat(v);
      updated.price_exact = isNaN(rawPrice) ? "" : parseFloat(rawPrice.toFixed(6)).toString();
      const prRounded = parseFloat((parseFloat(v) || 0).toFixed(2));
      if (q > 0) updated.amount = parseFloat((q * prRounded).toFixed(2)).toString();
    } else if (k === "amount") {
      const q = parseFloat(updated.qty) || 0;
      const amt = parseFloat(v) || 0;
      if (q > 0) {
        const exactPrice = amt / q; // полная точность, без округления
        updated.price_exact = parseFloat(exactPrice.toFixed(6)).toString();
        updated.price = parseFloat(exactPrice.toFixed(2)).toString(); // только для отображения
        // amount остаётся РОВНО тем, что ввёл пользователь — не пересчитывается обратно через округлённую цену
      }
    }
    return updated;
  }));
  // Фиксируем цену с точностью до 6 знаков при потере фокуса поля "Цена",
  // отображаем округлённой до 2 — но НЕ трогаем amount, если оно уже было задано пользователем
  // напрямую (через поле «Сумма») и точно соответствует price_exact × qty.
  const blurPrice = (key) => setLines(p => p.map(l => {
    if (l._key !== key) return l;
    const raw = parseFloat(l.price);
    if (isNaN(raw)) return l;
    const exact = parseFloat(raw.toFixed(6));
    const displayed = parseFloat(raw.toFixed(2));
    const q = parseFloat(l.qty) || 0;
    return {
      ...l,
      price: displayed.toString(),
      price_exact: exact.toString(),
    };
  }));
  const delLine = key => setLines(p => p.filter(l => l._key !== key));

  const handleCorrect = async () => {
    if (!corrSupplierId) { setCorrError("Выберите нового поставщика"); return; }
    if (String(corrSupplierId) === String(form.counterparty_id)) { setCorrError("Новый поставщик совпадает с текущим"); return; }
    setCorrSaving(true); setCorrError("");
    try {
      const res = await api(`/orders-purchase/${editId}/correct-supplier`, "POST", { line_id: corrModal.line_id, new_supplier_id: parseInt(corrSupplierId), created_by: currentUser?.id || null });
      setCorrModal(null); setCorrSupplierId("");
      alert(`Корректировка выполнена. Создана накладная ${res.new_number}`);
      if (onSaved) onSaved();
    } catch (e) { setCorrError("Ошибка: " + e.message); }
    finally { setCorrSaving(false); }
  };

  const openBatchSales = async l => {
    if (!l.batch_id) return;
    setBatchSalesLoading(true);
    setBatchSales({ batchId: l.batch_id, productName: l.product_name || "", rows: [] });
    try { const rows = await api(`/batches/${l.batch_id}/sales`); setBatchSales({ batchId: l.batch_id, productName: l.product_name || "", rows }); }
    catch (e) { alert("Ошибка: " + e.message); }
    finally { setBatchSalesLoading(false); }
  };

  const total = lines.reduce((s, l) => s + (parseFloat(l.amount) || ((parseFloat(l.qty) || 0) * (parseFloat(l.price) || 0))), 0);

  const handleSave = async () => {
    if (isDateRestricted(currentUser, form.date)) { setError("Нет доступа: можно редактировать только документы сегодняшней датой"); return; }
    if (!form.counterparty_id) { setError("Укажите поставщика"); return; }
    if (!form.warehouse_id)    { setError("Укажите склад"); return; }
    if (!lines.length)         { setError("Добавьте хотя бы одну позицию"); return; }
    setSaving(true); setError("");
    try {
      const payload = { ...form, batch_number: form.batch_number || "", counterparty_id: parseInt(form.counterparty_id), warehouse_id: parseInt(form.warehouse_id), company_id: 1, currency_id: parseInt(form.currency_id) || 1, currency_rate: parseFloat(form.currency_rate) || 1, created_by: currentUser?.id || null, lines: lines.map(l => ({ product_id: parseInt(l.product_id), unit_id: parseInt(l.unit_id) || null, country_id: parseInt(l.country_id) || null, grade_id: parseInt(l.grade_id) || null, qty: parseFloat(l.qty), price: parseFloat((l.price_exact !== undefined && l.price_exact !== "" ? l.price_exact : l.price)), vat_pct: 20 })), overheads: overheads.filter(o => o.amount).map(o => ({ id: o.id || null, article_id: parseInt(o.article_id) || null, counterparty_id: parseInt(o.counterparty_id) || null, amount: parseFloat(o.amount), currency_id: parseInt(o.currency_id) || parseInt(form.currency_id) || 1, currency_rate: parseFloat(o.currency_rate) || parseFloat(form.currency_rate) || 1, note: o.note || null })) };
      if (editId) await api(`/orders-purchase/${editId}`, "PUT", payload);
      else        await api("/orders-purchase", "POST", payload);
      if (onSaved) onSaved();
    } catch (e) { setError("Ошибка: " + e.message); }
    finally { setSaving(false); }
  };

  const sel    = { width: "100%", background: C.bg, border: `1px solid ${C.borderLight}`, color: C.text, borderRadius: 6, padding: "4px 7px", fontSize: 10, outline: "none" };
  const fldStyle = { width: "100%", background: C.bg, border: `1px solid ${C.borderLight}`, color: C.text, borderRadius: 6, padding: "4px 7px", fontSize: 10, outline: "none", colorScheme: "dark" };
  const smSel  = { background: C.bg, border: `1px solid ${C.borderLight}`, color: C.text, borderRadius: 4, padding: "4px 6px", fontSize: 12, outline: "none", minWidth: 90 };
  const inp    = { width: "76px", background: C.bg, border: `1px solid ${C.borderLight}`, color: C.text, borderRadius: 4, padding: "4px 8px", fontSize: 13, outline: "none", textAlign: "right" };


  /* ════════════════════════════════════════════
     МОБИЛЬНАЯ КАРТОЧКА строки товара
     ════════════════════════════════════════════ */
  function LineCardMobile({ l, rowIdx }) {
    const locked = editId && Number(l.moved_qty) > 0;
    const exp = !!expandedLines[l._key];
    const productName = products.find(p => p.id == l.product_id)?.name || "";
    const unitShort = units.find(u => u.id == l.unit_id)?.short || units.find(u => u.id == l.unit_id)?.short_name || "";

    const mInp = { width: "100%", background: C.bg, border: `1px solid ${C.borderLight}`, color: C.text, borderRadius: 7, padding: "8px 10px", fontSize: 14, outline: "none", textAlign: "right", fontFamily: "monospace" };
    const mSel = { width: "100%", background: C.bg, border: `1px solid ${C.borderLight}`, color: C.text, borderRadius: 7, padding: "8px 10px", fontSize: 13, outline: "none" };

    return (
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, marginBottom: 8, overflow: "hidden" }}>
        <div style={{ padding: "10px 12px" }}>
          {/* Товар + удалить/корректировка */}
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 8 }}>
            <select value={l.product_id} disabled={locked}
              onChange={e => { updLine(l._key, "product_id", e.target.value); updLine(l._key, "grade_id", ""); loadGradesForProduct(e.target.value); }}
              style={{ ...mSel, flex: 1, opacity: locked ? 0.6 : 1 }}>
              <option value="">— Товар —</option>
              {products.filter(p => p.active || p.is_active).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {locked
              ? <button onClick={() => { setCorrModal({ ...l, line_id: l.id }); setCorrSupplierId(""); setCorrError(""); }}
                  style={{ background: "transparent", border: `1px solid ${C.yellowText}`, color: C.yellowText, borderRadius: 7, width: 36, height: 36, flexShrink: 0, cursor: "pointer", fontSize: 14 }}>✎</button>
              : <button onClick={() => delLine(l._key)}
                  style={{ background: "transparent", border: `1px solid ${C.redText}`, color: C.redText, borderRadius: 7, width: 36, height: 36, flexShrink: 0, cursor: "pointer", fontSize: 16 }}>×</button>
            }
          </div>

          {/* Кол-во / Цена / Сумма — на виду */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
            <div>
              <div style={{ fontSize: 10, color: C.textDim, marginBottom: 3, textTransform: "uppercase" }}>Кол-во</div>
              <input className="pur-line-input" type="text" inputMode="decimal" value={l.qty} disabled={locked}
                onChange={e => updLine(l._key, "qty", e.target.value)}
                onFocus={e => e.target.select()} placeholder="0" style={mInp}/>
            </div>
            <div>
              <div style={{ fontSize: 10, color: C.textDim, marginBottom: 3, textTransform: "uppercase" }}>Цена</div>
              <input className="pur-line-input" type="text" inputMode="decimal" value={l.price} disabled={locked}
                onChange={e => updLine(l._key, "price", e.target.value)}
                onBlur={() => blurPrice(l._key)}
                onFocus={e => e.target.select()} placeholder="0.00" style={mInp}/>
            </div>
            <div>
              <div style={{ fontSize: 10, color: C.textDim, marginBottom: 3, textTransform: "uppercase" }}>Сумма</div>
              <input className="pur-line-input" type="text" inputMode="decimal" value={l.amount} disabled={locked}
                onChange={e => updLine(l._key, "amount", e.target.value)}
                onBlur={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) updLine(l._key, "amount", parseFloat(v.toFixed(2)).toString()); }}
                onFocus={e => e.target.select()} placeholder="0.00" style={{ ...mInp, color: C.tealText }}/>
            </div>
          </div>

          {!isRub(form.currency_id) && (
            <div style={{ fontSize: 11, color: C.textMuted, textAlign: "right", marginTop: 4 }}>
              ≈ {fmt(Math.round((parseFloat(l.amount) || 0) * (parseFloat(form.currency_rate) || 1)))} ₽
            </div>
          )}

          {/* Кнопка раскрытия доп.полей */}
          <button onClick={() => toggleLineExp(l._key)}
            style={{ width: "100%", marginTop: 8, padding: "6px", background: "transparent", border: `1px solid ${C.borderLight}`, color: C.textMuted, borderRadius: 7, cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "inherit" }}>
            {exp ? "▲ Скрыть детали" : "▼ Ед / Сорт / Страна / Себест."}
          </button>
        </div>

        {/* Доп.поля */}
        {exp && (
          <div style={{ padding: "10px 12px", borderTop: `1px solid ${C.border}`, background: C.bg }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 10, color: C.textDim, marginBottom: 3, textTransform: "uppercase" }}>Ед. изм.</div>
                <select value={l.unit_id} disabled={locked} onChange={e => updLine(l._key, "unit_id", e.target.value)} style={mSel}>
                  <option value="">—</option>
                  {units.filter(u => u.active || u.is_active).map(u => <option key={u.id} value={u.id}>{u.short || u.short_name}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 10, color: C.textDim, marginBottom: 3, textTransform: "uppercase" }}>Сорт</div>
                <select value={l.grade_id} disabled={locked} onChange={e => updLine(l._key, "grade_id", e.target.value)} style={mSel}>
                  <option value="">—</option>
                  {(gradesByProduct[l.product_id] || grades.filter(g => g.active || g.is_active)).map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
            </div>
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10, color: C.textDim, marginBottom: 3, textTransform: "uppercase" }}>Страна</div>
              <select value={l.country_id} disabled={locked} onChange={e => updLine(l._key, "country_id", e.target.value)} style={mSel}>
                <option value="">—</option>
                {countries.filter(c => c.active || c.is_active).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 11, color: C.textMuted }}>Себестоимость, ₽</span>
              <span style={{ fontFamily: "monospace", fontSize: 13, color: C.textMuted }}>
                {((parseFloat(l.price) || 0) * (parseFloat(form.currency_rate) || 1)).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽
              </span>
            </div>
            {locked && (
              <button onClick={() => openBatchSales(l)} style={{ width: "100%", marginTop: 8, padding: "7px", background: "transparent", border: `1px solid ${C.accentText}`, color: C.accentText, borderRadius: 7, cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "inherit" }}>
                📊 Продажи по партии
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  /* ════════════════════════════════════════════
     МОБИЛЬНАЯ КАРТОЧКА накладного расхода
     ════════════════════════════════════════════ */
  function OverheadCardMobile({ o }) {
    const exp = !!expandedOh[o._key];
    const ohCurId = o.currency_id || form.currency_id || 1;
    const ohRate  = parseFloat(o.currency_rate) || parseFloat(form.currency_rate) || 1;
    const ohAmt   = parseFloat(o.amount) || 0;
    const ohRub   = isRub(ohCurId) ? ohAmt : ohAmt * ohRate;
    const mInp = { width: "100%", background: C.bg, border: `1px solid ${C.borderLight}`, color: C.text, borderRadius: 7, padding: "8px 10px", fontSize: 14, outline: "none", textAlign: "right", fontFamily: "monospace" };
    const mSel = { width: "100%", background: C.bg, border: `1px solid ${C.borderLight}`, color: C.text, borderRadius: 7, padding: "8px 10px", fontSize: 13, outline: "none" };

    return (
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, marginBottom: 8, overflow: "hidden" }}>
        <div style={{ padding: "10px 12px" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 8 }}>
            <select value={o.article_id} onChange={e => updOh(o._key, "article_id", e.target.value)} style={{ ...mSel, flex: 1 }}>
              <option value="">— Статья —</option>
              {articles && articles.filter(a => a.active || a.is_active).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <button onClick={() => delOh(o._key)} style={{ background: "transparent", border: `1px solid ${C.redText}`, color: C.redText, borderRadius: 7, width: 36, height: 36, flexShrink: 0, cursor: "pointer", fontSize: 16 }}>×</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div>
              <div style={{ fontSize: 10, color: C.textDim, marginBottom: 3, textTransform: "uppercase" }}>Сумма</div>
              <input type="text" inputMode="decimal" value={o.amount} onChange={e => updOh(o._key, "amount", e.target.value)} placeholder="0.00" style={mInp}/>
            </div>
            <div>
              <div style={{ fontSize: 10, color: C.textDim, marginBottom: 3, textTransform: "uppercase" }}>В рублях</div>
              <div style={{ ...mInp, color: C.accentText, fontWeight: 700, border: "none", background: "transparent", padding: "8px 0" }}>{fmt(Math.round(ohRub))} ₽</div>
            </div>
          </div>
          <button onClick={() => toggleOhExp(o._key)} style={{ width: "100%", marginTop: 8, padding: "6px", background: "transparent", border: `1px solid ${C.borderLight}`, color: C.textMuted, borderRadius: 7, cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "inherit" }}>
            {exp ? "▲ Скрыть детали" : "▼ Контрагент / Валюта / Курс"}
          </button>
        </div>
        {exp && (
          <div style={{ padding: "10px 12px", borderTop: `1px solid ${C.border}`, background: C.bg }}>
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10, color: C.textDim, marginBottom: 3, textTransform: "uppercase" }}>Контрагент</div>
              <select value={o.counterparty_id} onChange={e => handleOhCounterpartyChange(o._key, e.target.value)} style={mSel}>
                <option value="">— Контрагент —</option>
                {counterparties.filter(c => c.active || c.is_active).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <div style={{ fontSize: 10, color: C.textDim, marginBottom: 3, textTransform: "uppercase" }}>Валюта</div>
                <select value={ohCurId} onChange={e => { updOh(o._key, "currency_id", e.target.value); fetchRate(e.target.value, form.date || today).then(r => updOh(o._key, "currency_rate", r)); }} style={mSel}>
                  {currencies.map(c => <option key={c.id} value={c.id}>{c.code}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 10, color: C.textDim, marginBottom: 3, textTransform: "uppercase" }}>Курс</div>
                <input type="text" inputMode="decimal" value={o.currency_rate || "1"} onChange={e => updOh(o._key, "currency_rate", e.target.value)} disabled={isRub(ohCurId)} style={{ ...mInp, opacity: isRub(ohCurId) ? 0.5 : 1 }}/>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ════════════════════════════════════════════
     МОБИЛЬНЫЙ РЕНДЕР ФОРМЫ
     ════════════════════════════════════════════ */
  if (isMobile) return (
    <div style={{ padding: "12px 12px 48px" }}>

      {/* ── Шапка ── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 14 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: C.text, fontSize: 16, fontWeight: 700 }}>
            {editId ? "Приходная накладная" : "Новая накладная"}
          </div>
          <span style={{ color: C.textMuted, fontFamily: "monospace", fontSize: 12 }}>{form.number}</span>
        </div>
        <button onClick={onBack} style={{ background: "transparent", border: `1px solid ${C.borderLight}`, color: C.text, borderRadius: 7, padding: "7px 12px", cursor: "pointer", fontSize: 12, fontWeight: 600, flexShrink: 0, fontFamily: "inherit" }}>←</button>
      </div>

      {error && <div style={{ color: C.redText, background: C.redDim, border: `1px solid ${C.red}`, borderRadius: 7, padding: "9px 12px", marginBottom: 12, fontSize: 13 }}>{error}</div>}

      {/* ── Табы ── */}
      {editId && (
        <div style={{ display: "flex", gap: 0, marginBottom: 12, borderBottom: `1px solid ${C.border}` }}>
          {[{ id: "form", l: "Документ" }, { id: "history", l: "История" }].map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              style={{ padding: "8px 16px", border: "none", borderBottom: activeTab === t.id ? `2px solid ${C.accent}` : "2px solid transparent", background: "transparent", color: activeTab === t.id ? C.accentText : C.textMuted, cursor: "pointer", fontSize: 13, fontWeight: activeTab === t.id ? 600 : 400, fontFamily: "inherit" }}>
              {t.l}
            </button>
          ))}
        </div>
      )}

      {activeTab === "history" && editId && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 14 }}>
          <AuditLog table="orders_purchase" recordId={editId}/>
        </div>
      )}

      {activeTab === "form" && <>

        {/* ── Поставщик / Склад ── */}
        <div style={{ marginBottom: 8 }}>
          <Lbl req>Поставщик</Lbl>
          <SearchSelect
            value={form.counterparty_id}
            onChange={v => handleCounterpartyChange(v)}
            options={(counterparties||[]).filter(c=>c.active||c.is_active).map(c=>({value:String(c.id),label:c.name}))}
            placeholder="Поиск поставщика..."
          />
        </div>
        <div style={{ marginBottom: 12 }}>
          <Lbl req>Склад</Lbl>
          <select value={form.warehouse_id} onChange={e => setF("warehouse_id", e.target.value)}
            style={{ width: "100%", background: C.bg, border: `1px solid ${C.borderLight}`, color: C.text, borderRadius: 7, padding: "9px 11px", fontSize: 14, outline: "none" }}>
            <option value="">Выберите склад</option>
            {warehouses.filter(w => w.active || w.is_active).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>

        {/* ── Номер / Дата ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
          <div>
            <Lbl>Номер</Lbl>
            <input value={form.number} onChange={e => setF("number", e.target.value)}
              style={{ width: "100%", background: C.bg, border: `1px solid ${C.borderLight}`, color: C.text, borderRadius: 7, padding: "9px 11px", fontSize: 13, outline: "none", fontFamily: "monospace" }}/>
          </div>
          <div>
            <Lbl>Дата</Lbl>
            <input type="date" value={form.date} onChange={e => handleDateChange(e.target.value)}
              style={{ width: "100%", background: C.bg, border: `1px solid ${C.borderLight}`, color: C.text, borderRadius: 7, padding: "9px 11px", fontSize: 13, outline: "none", colorScheme: "dark" }}/>
          </div>
        </div>

        {/* ── Партия / Валюта+Курс ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
          <div>
            <Lbl>Партия</Lbl>
            <input value={form.batch_number || ""} onChange={e => setF("batch_number", e.target.value)} placeholder="авто"
              style={{ width: "100%", background: C.bg, border: `1px solid ${C.borderLight}`, color: C.text, borderRadius: 7, padding: "9px 11px", fontSize: 13, outline: "none", fontFamily: "monospace" }}/>
          </div>
          <div>
            <Lbl>Валюта / Курс</Lbl>
            <div style={{ display: "flex", gap: 6 }}>
              <select value={form.currency_id} onChange={e => handleCurrencyChange(e.target.value)}
                style={{ flex: 1, background: C.bg, border: `1px solid ${C.borderLight}`, color: C.text, borderRadius: 7, padding: "9px 8px", fontSize: 13, outline: "none" }}>
                {currencies.map(c => <option key={c.id} value={c.id}>{c.code}</option>)}
              </select>
              <input value={form.currency_rate} onChange={e => setF("currency_rate", e.target.value)} disabled={isRub(form.currency_id)}
                style={{ flex: 1, background: C.bg, border: `1px solid ${C.borderLight}`, color: isRub(form.currency_id) ? C.textMuted : C.text, borderRadius: 7, padding: "9px 8px", fontSize: 13, outline: "none", fontFamily: "monospace" }}/>
            </div>
          </div>
        </div>

        {/* ── Примечание ── */}
        <div style={{ marginBottom: 14 }}>
          <Lbl>Примечание</Lbl>
          <input value={form.note || ""} onChange={e => setF("note", e.target.value)} placeholder="Комментарий к накладной..."
            style={{ width: "100%", background: C.bg, border: `1px solid ${C.borderLight}`, color: C.text, borderRadius: 7, padding: "9px 11px", fontSize: 13, outline: "none" }}/>
        </div>

        {/* ── Товарные позиции ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ color: C.text, fontWeight: 700, fontSize: 14 }}>Товары <span style={{ color: C.textDim, fontWeight: 400, fontSize: 12 }}>({lines.length})</span></span>
          <button onClick={addLine} style={{ padding: "6px 12px", background: C.accentDim, border: `1px solid ${C.accent}`, color: C.accentText, borderRadius: 7, cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit" }}>+ Добавить</button>
        </div>

        {lines.length === 0
          ? <div style={{ padding: 24, textAlign: "center", color: C.textDim, fontSize: 13, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, marginBottom: 14 }}>Нажмите «+ Добавить»</div>
          : <>
              {lines.map((l, idx) => <LineCardMobile key={l._key} l={l} rowIdx={idx}/>)}
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px", marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: C.textMuted, fontSize: 12 }}>Итого</span>
                <div style={{ textAlign: "right" }}>
                  <div style={{ color: C.tealText, fontWeight: 700, fontSize: 17, fontFamily: "monospace" }}>{fmt(Math.round(total))} {getCurCode(form.currency_id) || "RUB"}</div>
                  {!isRub(form.currency_id) && <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>≈ {fmt(Math.round(total * (parseFloat(form.currency_rate) || 1)))} ₽</div>}
                </div>
              </div>
            </>
        }

        {/* ── Накладные расходы ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ color: C.text, fontWeight: 700, fontSize: 14 }}>Накладные расходы</span>
          <button onClick={addOverhead} style={{ padding: "6px 12px", background: C.accentDim, border: `1px solid ${C.accent}`, color: C.accentText, borderRadius: 7, cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit" }}>+ Добавить</button>
        </div>

        {overheads.length === 0
          ? <div style={{ color: C.textDim, fontSize: 13, padding: "16px", textAlign: "center", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, marginBottom: 14 }}>Нет накладных расходов</div>
          : <>
              {overheads.map(o => <OverheadCardMobile key={o._key} o={o}/>)}
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px", marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: C.textMuted, fontSize: 12 }}>Итого расходов</span>
                <span style={{ color: C.accentText, fontWeight: 700, fontSize: 16, fontFamily: "monospace" }}>
                  {fmt(Math.round(overheads.reduce((s, o) => {
                    const r = parseFloat(o.currency_rate) || parseFloat(form.currency_rate) || 1;
                    const a = parseFloat(o.amount) || 0;
                    const cid = o.currency_id || form.currency_id || 1;
                    return s + (isRub(cid) ? a : a * r);
                  }, 0)))} ₽
                </span>
              </div>
            </>
        }

        {/* ── Кнопки действий ── */}
        <div style={{ display: "grid", gridTemplateColumns: editId ? "1fr 1fr" : "1fr", gap: 8, marginTop: 4 }}>
          {editId && (
            <button onClick={() => { if(isDateRestricted(currentUser, form.date)){alert("Нет доступа: можно удалять только документы сегодняшней датой");return;} setConfirmDel(true); }}
              style={{ padding: "11px", background: "transparent", border: `1px solid ${C.red}`, color: C.redText, borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 600, fontFamily: "inherit" }}>
              Удалить
            </button>
          )}
          <button onClick={handleSave} disabled={saving}
            style={{ padding: "11px", background: saving ? C.tealDim : C.teal, border: "none", color: "#fff", borderRadius: 8, cursor: saving ? "not-allowed" : "pointer", fontSize: 14, fontWeight: 700, fontFamily: "inherit" }}>
            {saving ? "Сохранение..." : "Сохранить"}
          </button>
        </div>
      </>}

      {confirmDel && (
        <ConfirmDialog
          text={`Удалить накладную ${form.number}?`}
          onConfirm={() => { api(`/orders-purchase/${editId}`, "DELETE").then(() => { if (onDeleted) onDeleted(); }).catch(e => alert(e.message)); setConfirmDel(false); }}
          onClose={() => setConfirmDel(false)}
        />
      )}

      {/* ── Модалка: продажи по партии (мобильная) ── */}
      {batchSales && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={() => setBatchSales(null)}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: "14px 14px 0 0", width: "100%", maxHeight: "75vh", display: "flex", flexDirection: "column" }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: "14px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div><div style={{ color: C.text, fontWeight: 700, fontSize: 14 }}>Продажи по партии</div><div style={{ color: C.textMuted, fontSize: 11, marginTop: 2 }}>{batchSales.productName}</div></div>
              <button onClick={() => setBatchSales(null)} style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer", fontSize: 20, padding: "2px 8px" }}>×</button>
            </div>
            <div style={{ overflowY: "auto", flex: 1, padding: "8px 12px" }}>
              {batchSalesLoading
                ? <div style={{ padding: 32, textAlign: "center", color: C.textMuted }}>Загрузка...</div>
                : batchSales.rows.length === 0
                  ? <div style={{ padding: 32, textAlign: "center", color: C.textDim }}>Продаж по этой партии нет</div>
                  : batchSales.rows.map((r, i) => {
                      const profit = Number(r.profit) || 0;
                      return (
                        <div key={i} style={{ padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                            <span style={{ color: C.accentText, fontFamily: "monospace", fontSize: 12 }}>{r.order_number}</span>
                            <span style={{ color: C.textDim, fontSize: 11 }}>{String(r.sale_date).slice(0, 10)}</span>
                          </div>
                          <div style={{ fontSize: 12, color: C.text, marginBottom: 4 }}>{r.counterparty_name || "Частное лицо"}</div>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                            <span style={{ color: C.textMuted }}>{fmt(Number(r.qty))} × {fmt(Number(r.price))} ₽</span>
                            <span style={{ color: profit >= 0 ? C.greenText : C.redText, fontWeight: 700 }}>{fmt(Math.round(profit))} ₽</span>
                          </div>
                        </div>
                      );
                    })
              }
            </div>
          </div>
        </div>
      )}

      {/* ── Модалка: выбор строки для корректировки (мобильная) ── */}
      {corrModal === "pick" && (
        <div onClick={e => { if (e.target === e.currentTarget) setCorrModal(null); }} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 300, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div style={{ background: C.surface, border: `1px solid ${C.borderLight}`, borderRadius: "14px 14px 0 0", width: "100%", padding: 18, maxHeight: "75vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <span style={{ color: C.text, fontWeight: 700, fontSize: 14 }}>Выберите строку</span>
              <button onClick={() => setCorrModal(null)} style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer", fontSize: 20 }}>×</button>
            </div>
            {lines.map(l => (
              <div key={l._key} onClick={() => { setCorrModal({ ...l, line_id: l.id }); setCorrSupplierId(""); setCorrError(""); }}
                style={{ padding: "10px 14px", borderRadius: 8, border: `1px solid ${C.borderLight}`, marginBottom: 8 }}>
                <div style={{ color: C.text, fontSize: 13, fontWeight: 500 }}>{products.find(p => p.id == l.product_id)?.name || "—"}</div>
                <div style={{ color: C.textMuted, fontSize: 11, marginTop: 2 }}>Поставщик: {l.supplier_name || "—"} · {l.qty} {l.unit_short}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Модалка: выбор нового поставщика (мобильная) ── */}
      {corrModal && corrModal !== "pick" && (
        <div onClick={e => { if (e.target === e.currentTarget) { setCorrModal(null); setCorrError(""); } }} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 300, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div style={{ background: C.surface, border: `1px solid ${C.borderLight}`, borderRadius: "14px 14px 0 0", width: "100%", padding: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <span style={{ color: C.text, fontWeight: 700, fontSize: 14 }}>Новый поставщик</span>
              <button onClick={() => { setCorrModal(null); setCorrError(""); }} style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer", fontSize: 20 }}>×</button>
            </div>
            <div style={{ color: C.textMuted, fontSize: 12, marginBottom: 12 }}>
              Товар: <b style={{ color: C.text }}>{products.find(p => p.id == corrModal.product_id)?.name || "—"}</b><br/>
              Текущий: <b style={{ color: C.tealText }}>{corrModal.supplier_name || "—"}</b>
            </div>
            <select value={corrSupplierId} onChange={e => setCorrSupplierId(e.target.value)}
              style={{ width: "100%", background: C.bg, border: `1px solid ${C.borderLight}`, color: C.text, borderRadius: 7, padding: "10px 12px", fontSize: 13, outline: "none", marginBottom: 12 }}>
              <option value="">— Выберите контрагента —</option>
              {(counterparties || []).filter(c => (c.active || c.is_active) && String(c.id) !== String(form.counterparty_id)).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {corrError && <div style={{ color: C.redText, fontSize: 12, marginBottom: 10 }}>{corrError}</div>}
            <button onClick={handleCorrect} disabled={corrSaving}
              style={{ width: "100%", padding: "11px", background: corrSaving ? C.tealDim : C.teal, border: "none", color: "#fff", borderRadius: 8, cursor: corrSaving ? "not-allowed" : "pointer", fontSize: 14, fontWeight: 700, fontFamily: "inherit" }}>
              {corrSaving ? "Выполняется..." : "Применить"}
            </button>
          </div>
        </div>
      )}

    </div>
  );

  if (loading) return (
    <div style={{ display: "flex", justifyContent: "center", padding: "60px 24px" }}>
      <div style={{ textAlign: "center", color: C.textMuted }}>Загрузка...</div>
    </div>
  );

  return (
    /* ── центрирующая обёртка ── */
    <div style={{ display: "flex", justifyContent: "center", padding: "28px 24px 48px" }}>
      <div style={{ width: "100%", maxWidth: 1060 }}>

        {/* ── Шапка ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, paddingBottom: 16, borderBottom: `1px solid ${C.border}` }}>
          <div>
            <h1 style={{ margin: 0, color: C.text, fontSize: 20, fontWeight: 700 }}>
              {editId ? "Приходная накладная" : "Новая приходная накладная"}
            </h1>
            <span style={{ color: C.textMuted, fontFamily: "monospace", fontSize: 13 }}>{form.number}</span>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={onBack} style={{ background: "transparent", border: `1px solid ${C.borderLight}`, color: C.text, borderRadius: 6, padding: "7px 14px", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>← Закупки</button>
            {editId && hasMovements && (
              <button onClick={() => setCorrModal("pick")} style={{ padding: "7px 14px", background: "transparent", border: `1px solid ${C.yellowText}`, color: C.yellowText, borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>✎ Корректировка</button>
            )}
            {editId && (
              <button onClick={() => { if(isDateRestricted(currentUser, form.date)){alert("Нет доступа: можно удалять только документы сегодняшней датой");return;} setConfirmDel(true); }} style={{ padding: "7px 14px", background: "transparent", border: `1px solid ${C.red}`, color: C.redText, borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Удалить</button>
            )}
            <button onClick={handleSave} disabled={saving} style={{ padding: "7px 22px", background: saving ? C.tealDim : C.teal, border: "none", color: "#fff", borderRadius: 6, cursor: saving ? "not-allowed" : "pointer", fontSize: 14, fontWeight: 700 }}>
              {saving ? "Сохранение..." : "Сохранить"}
            </button>
          </div>
        </div>

        {confirmDel && (
          <ConfirmDialog
            text={`Удалить накладную ${form.number}?`}
            onConfirm={() => { api(`/orders-purchase/${editId}`, "DELETE").then(() => { if (onDeleted) onDeleted(); }).catch(e => alert(e.message)); setConfirmDel(false); }}
            onClose={() => setConfirmDel(false)}
          />
        )}

        {/* ── Табы ── */}
        {editId && (
          <div style={{ display: "flex", gap: 0, marginBottom: 16, borderBottom: `1px solid ${C.border}` }}>
            {[{ id: "form", l: "Документ" }, { id: "history", l: "История изменений" }].map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)} style={{ padding: "8px 20px", border: "none", borderBottom: activeTab === t.id ? `2px solid ${C.accent}` : "2px solid transparent", background: "transparent", color: activeTab === t.id ? C.accentText : C.textMuted, cursor: "pointer", fontSize: 13, fontWeight: activeTab === t.id ? 600 : 400 }}>{t.l}</button>
            ))}
          </div>
        )}

        {activeTab === "history" && editId && <Card style={{ padding: 16 }}><AuditLog table="orders_purchase" recordId={editId}/></Card>}

        {activeTab === "form" && <>
          {error && <div style={{ color: C.redText, background: C.redDim, border: `1px solid ${C.red}`, borderRadius: 6, padding: "10px 14px", marginBottom: 14, fontSize: 13 }}>{error}</div>}

          {/* ── Карточка полей ── */}
          <Card style={{ padding: "12px 16px", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {/* Номер */}
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <Lbl>Номер</Lbl>
                <input value={form.number} onChange={e => setF("number", e.target.value)}
                  style={{ width: 68, background: C.bg, border: `1px solid ${C.borderLight}`, color: C.text, borderRadius: 6, padding: "4px 7px", fontSize: 10, outline: "none", fontFamily: "monospace" }}/>
              </div>
              {/* Дата */}
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <Lbl>Дата</Lbl>
                <input type="date" value={form.date} onChange={e => handleDateChange(e.target.value)}
                  style={{ width: 118, background: C.bg, border: `1px solid ${C.borderLight}`, color: C.text, borderRadius: 6, padding: "4px 7px", fontSize: 10, outline: "none", colorScheme: "dark" }}/>
              </div>
              {/* Склад */}
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <Lbl req>Склад</Lbl>
                <select value={form.warehouse_id} onChange={e => setF("warehouse_id", e.target.value)}
                  style={{ width: 138, background: C.bg, border: `1px solid ${C.borderLight}`, color: C.text, borderRadius: 6, padding: "4px 7px", fontSize: 10, outline: "none" }}>
                  <option value="">Выберите склад</option>
                  {warehouses.filter(w => w.active || w.is_active).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
              {/* Поставщик */}
              <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1, minWidth: 160, maxWidth: 240 }}>
                <Lbl req>Поставщик</Lbl>
                <SearchSelect
                  value={form.counterparty_id}
                  onChange={v => handleCounterpartyChange(v)}
                  options={(counterparties||[]).filter(c=>c.active||c.is_active).map(c=>({value:String(c.id),label:c.name}))}
                  placeholder="Поиск поставщика..."
                />
              </div>
              {/* Партия */}
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <Lbl>Партия</Lbl>
                <input value={form.batch_number || ""} onChange={e => setF("batch_number", e.target.value)}
                  placeholder="авто"
                  style={{ width: 90, background: C.bg, border: `1px solid ${C.borderLight}`, color: C.text, borderRadius: 6, padding: "4px 7px", fontSize: 10, outline: "none", fontFamily: "monospace" }}/>
              </div>
              {/* Валюта + Курс */}
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <Lbl>Валюта / Курс</Lbl>
                <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  <select value={form.currency_id} onChange={e => handleCurrencyChange(e.target.value)}
                    style={{ width: 72, background: C.bg, border: `1px solid ${C.borderLight}`, color: C.text, borderRadius: 6, padding: "4px 7px", fontSize: 10, outline: "none" }}>
                    {currencies.map(c => <option key={c.id} value={c.id}>{c.code}</option>)}
                  </select>
                  <input value={form.currency_rate} onChange={e => setF("currency_rate", e.target.value)} disabled={isRub(form.currency_id)}
                    style={{ width: 72, background: C.bg, border: `1px solid ${C.borderLight}`, color: isRub(form.currency_id) ? C.textMuted : C.text, borderRadius: 6, padding: "4px 7px", fontSize: 10, outline: "none", fontFamily: "monospace" }}/>
                </div>
              </div>
              {/* Примечание */}
              <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1, minWidth: 160 }}>
                <label style={{ color: "transparent", fontSize: 10, userSelect: "none" }}>_</label>
                <input value={form.note || ""} onChange={e => setF("note", e.target.value)}
                  placeholder="Комментарий к накладной..."
                  style={{ flex: 1, background: C.bg, border: `1px solid ${C.borderLight}`, color: C.text, borderRadius: 6, padding: "4px 7px", fontSize: 10, outline: "none" }}/>
              </div>
            </div>
          </Card>

          {/* ── Товарные позиции ── */}
          <Card style={{ marginBottom: 16 }}>
            <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <button onClick={addLine} style={{ padding: "5px 14px", background: C.accentDim, border: `1px solid ${C.accent}`, color: C.accentText, borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>+ Добавить строку</button>
              <span style={{ color: C.text, fontWeight: 600, fontSize: 14 }}>Товарные позиции <span style={{ color: C.textDim, fontWeight: 400, fontSize: 12 }}>({lines.length})</span></span>
            </div>
            {lines.length === 0
              ? <div style={{ padding: 32, textAlign: "center", color: C.textDim, fontSize: 13 }}>Нажмите «+ Добавить строку»</div>
              : <div className="ct-wrap"><table className="ct"><thead><tr>
                  <th style={{ width: 34, textAlign: "center" }}>№</th>
                  <th style={{ width: 180 }}>Товар</th>
                  <th style={{ width: 70 }}>Ед.</th>
                  <th style={{ width: 90 }}>Сорт</th>
                  <th style={{ width: 90 }}>Страна</th>
                  <th className="r" style={{ width: 90 }}>Кол-во</th>
                  <th className="r" style={{ width: 90 }}>Цена {getCurCode(form.currency_id) && !isRub(form.currency_id) ? getCurCode(form.currency_id) : ""}</th>
                  <th className="r" style={{ width: 90 }}>Сумма</th>
                  <th className="r" style={{ width: 90 }}>Себест. ₽</th>
                  <th style={{ width: 32 }}></th>
                </tr></thead>
                <tbody>{lines.map((l, rowIdx) => {
                  const q = parseFloat(l.qty) || 0, p = parseFloat(l.price) || 0, amt = q * p;
                  const smSel2 = { ...smSel, padding: "3px 5px", fontSize: 11 };
                  const locked = editId && Number(l.moved_qty) > 0;
                  const lockedSel = { ...smSel2, opacity: 0.6, cursor: "not-allowed", background: C.surface };
                  return (
                    <tr key={l._key} onDoubleClick={() => locked && openBatchSales(l)} style={{ background: rowIdx % 2 === 0 ? "transparent" : C.surface + "44", cursor: locked ? "pointer" : "default" }}>
                      <td style={{ padding: "4px 6px", textAlign: "center", color: C.textMuted, fontSize: 11 }}>{rowIdx + 1}</td>
                      <td style={{ padding: "3px 4px" }}>
                        <LineProductCell value={l.product_id} options={products.filter(p => p.active || p.is_active).map(p => ({ value: p.id, label: p.name }))} onSelect={v => { updLine(l._key, "product_id", v); updLine(l._key, "grade_id", ""); loadGradesForProduct(v); }} onKeyNav={purGridNav} locked={locked} inpStyle={inp} />
                      </td>
                      <td style={{ padding: "3px 4px" }}><select className="pur-cell" onKeyDown={purGridNav} value={l.unit_id} onChange={e => updLine(l._key, "unit_id", e.target.value)} style={smSel2}><option value="">—</option>{units.filter(u => u.active || u.is_active).map(u => <option key={u.id} value={u.id}>{u.short || u.short_name}</option>)}</select></td>
                      <td style={{ padding: "3px 4px" }}><select className="pur-cell" onKeyDown={purGridNav} value={l.grade_id} onChange={e => updLine(l._key, "grade_id", e.target.value)} style={smSel2}><option value="">—</option>{(gradesByProduct[l.product_id] || grades.filter(g => g.active || g.is_active)).map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></td>
                      <td style={{ padding: "3px 4px" }}><select className="pur-cell" onKeyDown={purGridNav} value={l.country_id} onChange={e => updLine(l._key, "country_id", e.target.value)} style={smSel2}><option value="">—</option>{countries.filter(c => c.active || c.is_active).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></td>
                      <td style={{ padding: "3px 4px", textAlign: "right" }}>
                        <input className="pur-cell" type="text" inputMode="decimal" draggable={false} onDragStart={e=>e.preventDefault()} onDrop={e=>e.preventDefault()} value={l.qty} onChange={e => updLine(l._key, "qty", e.target.value)} onKeyDown={purGridNav} onFocus={e => e.target.select()} placeholder="0"
                          style={{ ...inp, width: "100%", padding: "3px 6px", borderColor: locked && parseFloat(l.qty) < l.moved_qty ? C.red : C.borderLight }}/>
                        {locked && <div style={{ fontSize: 9, color: C.textDim, textAlign: "right", marginTop: 1 }}>мин. {l.moved_qty}</div>}
                      </td>
                      <td style={{ padding: "3px 4px", textAlign: "right" }}><input className="pur-cell" type="text" inputMode="decimal" draggable={false} onDragStart={e=>e.preventDefault()} onDrop={e=>e.preventDefault()} value={l.price} onChange={e => updLine(l._key, "price", e.target.value)} onBlur={() => blurPrice(l._key)} onKeyDown={purGridNav} onFocus={e => e.target.select()} placeholder="0.00" style={{ ...inp, width: "100%", padding: "3px 6px" }}/></td>
                      <td style={{ padding: "3px 4px", textAlign: "right" }}>
                        <input className="pur-cell" type="text" inputMode="decimal" draggable={false} onDragStart={e=>e.preventDefault()} onDrop={e=>e.preventDefault()} value={l.amount}
                          onChange={e => updLine(l._key, "amount", e.target.value)}
                          onBlur={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) updLine(l._key, "amount", parseFloat(v.toFixed(2)).toString()); }}
                          onKeyDown={purGridNav} onFocus={e => e.target.select()} placeholder="0.00"
                          disabled={locked}
                          style={{ ...inp, width: "100%", padding: "3px 6px", textAlign: "right", color: C.tealText }}/>
                        {!isRub(form.currency_id) && <div style={{ fontSize: 10, color: C.textMuted, textAlign: "right" }}>{fmt(Math.round((parseFloat(l.amount) || 0) * (parseFloat(form.currency_rate) || 1)))} ₽</div>}
                      </td>
                      <td style={{ padding: "4px 6px", textAlign: "right" }}>
                        <span style={{ fontFamily: "monospace", fontSize: 12, color: C.textMuted }}>{((parseFloat(l.price) || 0) * (parseFloat(form.currency_rate) || 1)).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽</span>
                      </td>
                      <td style={{ padding: "3px 2px", textAlign: "center" }}>
                        {locked
                          ? <span onClick={() => { setCorrModal({ ...l, line_id: l.id }); setCorrSupplierId(""); setCorrError(""); }} style={{ color: C.yellowText, fontSize: 12, padding: "1px 4px", cursor: "pointer" }} title="Корректировка поставщика">✎</span>
                          : <button onClick={() => delLine(l._key)} style={{ background: "none", border: "none", color: C.redText, cursor: "pointer", fontSize: 14, padding: "1px 3px" }}>×</button>
                        }
                      </td>
                    </tr>
                  );
                })}</tbody>
                <tfoot><tr>
                  <td colSpan={8} style={{ textAlign: "right", color: C.textMuted, fontSize: 12, padding: "10px 12px" }}>Итого:</td>
                  <td className="r" style={{ padding: "10px 12px" }}>
                    <span style={{ color: C.tealText, fontWeight: 700, fontSize: 16, fontFamily: "monospace" }}>{fmt(Math.round(total))} {getCurCode(form.currency_id) || "RUB"}</span>
                    {!isRub(form.currency_id) && <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>{fmt(Math.round(total * (parseFloat(form.currency_rate) || 1)))} ₽</div>}
                  </td>
                  <td style={{ padding: "10px 6px", textAlign: "center" }}>
                    <button onClick={handleSave} disabled={saving} style={{ padding: "5px 12px", background: saving ? C.tealDim : C.teal, border: "none", color: "#fff", borderRadius: 6, cursor: saving ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>
                      {saving ? "..." : "Сохранить"}
                    </button>
                  </td>
                </tr></tfoot>
              </table></div>
            }
          </Card>

          {/* ── Накладные расходы ── */}
          <Card style={{ padding: 20, marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <button onClick={addOverhead} style={{ padding: "5px 14px", background: C.accentDim, border: `1px solid ${C.accent}`, color: C.accentText, borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>+ Добавить</button>
              <span style={{ color: C.text, fontWeight: 600, fontSize: 14 }}>Накладные расходы</span>
            </div>
            {overheads.length === 0 && <div style={{ color: C.textDim, fontSize: 13, padding: "8px 0" }}>Нет накладных расходов</div>}
            {overheads.length > 0 && <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  {["Статья", "Контрагент", "Сумма", "Валюта", "Курс", "Сумма RUB", ""].map((h, i) => (
                    <th key={i} style={{ padding: "8px 10px", textAlign: i >= 2 ? "right" : "left", color: C.textMuted, fontSize: 11, fontWeight: 600, textTransform: "uppercase" }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>{overheads.map(o => {
                  const ohCurId = o.currency_id || form.currency_id || 1;
                  const ohRate  = parseFloat(o.currency_rate) || parseFloat(form.currency_rate) || 1;
                  const ohAmt   = parseFloat(o.amount) || 0;
                  const ohRub   = isRub(ohCurId) ? ohAmt : ohAmt * ohRate;
                  return (
                    <tr key={o._key} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td style={{ padding: "8px 10px", minWidth: 140 }}><select value={o.article_id} onChange={e => updOh(o._key, "article_id", e.target.value)} style={{ ...sel, width: 140 }}><option value="">— Статья —</option>{articles && articles.filter(a => a.active || a.is_active).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></td>
                      <td style={{ padding: "8px 10px", minWidth: 140 }}><select value={o.counterparty_id} onChange={e => handleOhCounterpartyChange(o._key, e.target.value)} style={{ ...sel, width: 140 }}><option value="">— Контрагент —</option>{counterparties.filter(c => c.active || c.is_active).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></td>
                      <td style={{ padding: "8px 10px", width: 90, textAlign: "right" }}><input type="text" inputMode="decimal" value={o.amount} onChange={e => updOh(o._key, "amount", e.target.value)} placeholder="0.00" style={{ ...inp, width: 80, textAlign: "right" }}/></td>
                      <td style={{ padding: "8px 10px", width: 80, textAlign: "right" }}><select value={ohCurId} onChange={e => { updOh(o._key, "currency_id", e.target.value); fetchRate(e.target.value, form.date || today).then(r => updOh(o._key, "currency_rate", r)); }} style={{ ...inp, width: 70, textAlign: "left", fontFamily: "monospace" }}>{currencies.map(c => <option key={c.id} value={c.id}>{c.code}</option>)}</select></td>
                      <td style={{ padding: "8px 10px", width: 80, textAlign: "right" }}><input type="text" inputMode="decimal" value={o.currency_rate || "1"} onChange={e => updOh(o._key, "currency_rate", e.target.value)} disabled={isRub(ohCurId)} style={{ ...inp, width: 70, textAlign: "right", opacity: isRub(ohCurId) ? 0.4 : 1 }}/></td>
                      <td style={{ padding: "8px 10px", width: 90, textAlign: "right" }}><span style={{ fontFamily: "monospace", fontSize: 12, color: C.accentText, fontWeight: 600 }}>{fmt(Math.round(ohRub))} ₽</span></td>
                      <td style={{ padding: "8px 6px", width: 30 }}><button onClick={() => delOh(o._key)} style={{ background: "transparent", border: "none", color: C.redText, cursor: "pointer", fontSize: 16, padding: "2px 6px" }}>×</button></td>
                    </tr>
                  );
                })}</tbody>
              </table>
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
                <div style={{ textAlign: "right" }}>
                  <div style={{ color: C.textMuted, fontSize: 11, marginBottom: 2 }}>Итого расходов</div>
                  <div style={{ color: C.accentText, fontWeight: 700, fontSize: 16 }}>
                    {fmt(Math.round(overheads.reduce((s, o) => {
                      const r = parseFloat(o.currency_rate) || parseFloat(form.currency_rate) || 1;
                      const a = parseFloat(o.amount) || 0;
                      const cid = o.currency_id || form.currency_id || 1;
                      return s + (isRub(cid) ? a : a * r);
                    }, 0)))} ₽
                  </div>
                </div>
              </div>
            </div>}
          </Card>
        </>}

        {/* ── Модалка: продажи по партии ── */}
        {batchSales && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setBatchSales(null)}>
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, width: "min(820px,95vw)", maxHeight: "80vh", display: "flex", flexDirection: "column" }} onClick={e => e.stopPropagation()}>
              <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div><div style={{ color: C.text, fontWeight: 700, fontSize: 15 }}>Продажи по партии</div><div style={{ color: C.textMuted, fontSize: 12, marginTop: 2 }}>{batchSales.productName}</div></div>
                <button onClick={() => setBatchSales(null)} style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer", fontSize: 20, padding: "2px 8px" }}>×</button>
              </div>
              <div style={{ overflowY: "auto", flex: 1 }}>
                {batchSalesLoading
                  ? <div style={{ padding: 40, textAlign: "center", color: C.textMuted }}>Загрузка...</div>
                  : batchSales.rows.length === 0
                    ? <div style={{ padding: 40, textAlign: "center", color: C.textDim }}>Продаж по этой партии нет</div>
                    : <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead><tr style={{ borderBottom: `1px solid ${C.border}`, background: C.bg }}>
                          {["Дата", "Накладная", "Покупатель", "Кол-во", "Цена", "Сумма", "Прибыль"].map((h, i) => (
                            <th key={i} style={{ padding: "8px 12px", textAlign: i >= 3 ? "right" : "left", color: C.textMuted, fontSize: 11, fontWeight: 600, textTransform: "uppercase" }}>{h}</th>
                          ))}
                        </tr></thead>
                        <tbody>{batchSales.rows.map((r, i) => {
                          const profit = Number(r.profit) || 0;
                          return <tr key={i} style={{ borderBottom: `1px solid ${C.border}`, background: i % 2 === 0 ? "transparent" : C.surface + "44" }}>
                            <td style={{ padding: "8px 12px", color: C.textDim, fontSize: 12, whiteSpace: "nowrap" }}>{String(r.sale_date).slice(0, 10)}</td>
                            <td style={{ padding: "8px 12px" }}><span style={{ color: C.accentText, fontFamily: "monospace", fontSize: 11 }}>{r.order_number}</span></td>
                            <td style={{ padding: "8px 12px", fontSize: 12 }}>{r.counterparty_name || "Частное лицо"}</td>
                            <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: "monospace", fontSize: 12 }}>{fmt(Number(r.qty))}</td>
                            <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: "monospace", fontSize: 12, color: C.textMuted }}>{fmt(Number(r.price))} ₽</td>
                            <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: "monospace", fontWeight: 600, color: C.accentText }}>{fmt(Math.round(Number(r.revenue)))} ₽</td>
                            <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: profit >= 0 ? C.greenText : C.redText }}>{fmt(Math.round(profit))} ₽</td>
                          </tr>;
                        })}</tbody>
                        <tfoot><tr style={{ borderTop: `2px solid ${C.border}` }}>
                          <td colSpan={3} style={{ padding: "8px 12px", color: C.textMuted, fontSize: 12 }}>Итого:</td>
                          <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: "monospace", fontWeight: 600 }}>{fmt(batchSales.rows.reduce((s, r) => s + Number(r.qty), 0))}</td>
                          <td/>
                          <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: C.accentText }}>{fmt(Math.round(batchSales.rows.reduce((s, r) => s + Number(r.revenue), 0)))} ₽</td>
                          <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: C.greenText }}>{fmt(Math.round(batchSales.rows.reduce((s, r) => s + Number(r.profit), 0)))} ₽</td>
                        </tr></tfoot>
                      </table>
                }
              </div>
            </div>
          </div>
        )}

        {/* ── Модалка: выбор строки для корректировки ── */}
        {corrModal === "pick" && (
          <div onClick={e => { if (e.target === e.currentTarget) setCorrModal(null); }} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ background: C.surface, border: `1px solid ${C.borderLight}`, borderRadius: 10, width: 480, padding: 24, boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <span style={{ color: C.text, fontWeight: 700, fontSize: 15 }}>Выберите строку для корректировки</span>
                <button onClick={() => setCorrModal(null)} style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer", fontSize: 20 }}>×</button>
              </div>
              <div style={{ color: C.textMuted, fontSize: 12, marginBottom: 12 }}>Выберите товар — поставщик будет изменён</div>
              {lines.map(l => (
                <div key={l._key} onClick={() => { setCorrModal({ ...l, line_id: l.id }); setCorrSupplierId(""); setCorrError(""); }}
                  style={{ padding: "10px 14px", borderRadius: 6, border: `1px solid ${C.borderLight}`, marginBottom: 8, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = C.accent}
                  onMouseLeave={e => e.currentTarget.style.borderColor = C.borderLight}>
                  <div>
                    <div style={{ color: C.text, fontSize: 13, fontWeight: 500 }}>{products.find(p => p.id == l.product_id)?.name || "—"}</div>
                    <div style={{ color: C.textMuted, fontSize: 11, marginTop: 2 }}>Поставщик: {l.supplier_name || "—"} · {l.qty} {l.unit_short}</div>
                  </div>
                  <span style={{ color: C.accentText, fontSize: 12 }}>Выбрать →</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Модалка: выбор нового поставщика ── */}
        {corrModal && corrModal !== "pick" && (
          <div onClick={e => { if (e.target === e.currentTarget) { setCorrModal(null); setCorrError(""); } }} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ background: C.surface, border: `1px solid ${C.borderLight}`, borderRadius: 10, width: 440, padding: 24, boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <span style={{ color: C.text, fontWeight: 700, fontSize: 15 }}>Корректировка поставщика</span>
                <button onClick={() => { setCorrModal(null); setCorrError(""); }} style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer", fontSize: 20 }}>×</button>
              </div>
              <div style={{ color: C.textMuted, fontSize: 13, marginBottom: 14 }}>
                Товар: <b style={{ color: C.text }}>{products.find(p => p.id == corrModal.product_id)?.name || "—"}</b><br/>
                Текущий поставщик: <b style={{ color: C.tealText }}>{corrModal.supplier_name || "—"}</b>
              </div>
              <div style={{ marginBottom: 14 }}>
                <Lbl req>Новый поставщик</Lbl>
                <select value={corrSupplierId} onChange={e => setCorrSupplierId(e.target.value)} style={{ width: "100%", background: C.bg, border: `1px solid ${C.borderLight}`, color: C.text, borderRadius: 6, padding: "8px 12px", fontSize: 13, outline: "none" }}>
                  <option value="">— Выберите контрагента —</option>
                  {(counterparties || []).filter(c => (c.active || c.is_active) && String(c.id) !== String(form.counterparty_id)).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              {corrError && <div style={{ color: C.redText, fontSize: 12, marginBottom: 10 }}>{corrError}</div>}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button onClick={() => { setCorrModal(null); setCorrError(""); }} style={{ padding: "7px 16px", background: "transparent", border: `1px solid ${C.borderLight}`, color: C.text, borderRadius: 6, cursor: "pointer", fontSize: 13 }}>Отмена</button>
                <button onClick={handleCorrect} disabled={corrSaving} style={{ padding: "7px 20px", background: corrSaving ? C.tealDim : C.teal, border: "none", color: "#fff", borderRadius: 6, cursor: corrSaving ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600 }}>{corrSaving ? "Выполняется..." : "Применить"}</button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

// ─── ОСТАТКИ НА СКЛАДЕ ────────────────────────────────────────────────────────

export default PurchaseForm;
