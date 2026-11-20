import { useState, useEffect } from "react";
import { C, fmt, fmtDate, api, Card, ConfirmDialog, SearchSelect, useIsMobile } from "../utils/globals";

/* ─── helpers ─── */
const saldoColor = s => s < 0 ? C.greenText : s > 0 ? C.redText : C.textMuted;
const saldoText  = (s, cur) => s < 0 ? fmt(Math.round(Math.abs(s))) + " " + cur : s > 0 ? "-" + fmt(Math.round(s)) + " " + cur : "0";
const balColor   = b => b > 0 ? C.greenText : b < 0 ? C.redText : C.textMuted;
const balText    = (b, cur) => b > 0 ? fmt(Math.round(b)) + " " + cur : b < 0 ? "-" + fmt(Math.round(Math.abs(b))) + " " + cur : "0";

const TYPE_CFG = {
  sale:        { label: "Продажа",      color: C.accentText },
  purchase:    { label: "Закупка",      color: C.tealText   },
  "payment-in":  { label: "Платёж вх.", color: C.greenText  },
  "payment-out": { label: "Платёж исх.",color: C.redText    },
  return:      { label: "Возврат",      color: C.yellowText },
  overhead:      { label: "Накл. расход",  color: "#A78BFA"    },
  debt_writeoff: { label: "Списание долга", color: C.yellowText },
};

/* ════════════════════════════════════════════
   МОБИЛЬНАЯ КАРТОЧКА КОНТРАГЕНТА в списке
   ════════════════════════════════════════════ */
/* ════════════════════════════════════════════
   МОБИЛЬНЫЙ АККОРДЕОН ФИЛЬТРОВ
   ════════════════════════════════════════════ */
function MobileFiltersAccordion({ dateTo, setDateTo, filterCat, setFilterCat, filterCp, setFilterCp, cpCategories, counterparties, onApply }) {
  const [fOpen, setFOpen] = useState(false);
  const activeCnt = [filterCp, filterCat].filter(Boolean).length;
  const mSelStyle = { background: C.bg, border: `1px solid ${C.borderLight}`, color: C.text, borderRadius: 8, padding: "9px 11px", fontSize: 13, outline: "none", width: "100%", appearance: "none", WebkitAppearance: "none", fontFamily: "inherit" };

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, marginBottom: 12, overflow: "hidden" }}>
      <div onClick={() => setFOpen(o => !o)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 14px", cursor: "pointer" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 600, color: C.text }}>
          🔍 Фильтры
          {activeCnt > 0 && <span style={{ background: C.accent, color: "#fff", borderRadius: 10, fontSize: 10, fontWeight: 700, padding: "1px 7px" }}>{activeCnt}</span>}
        </div>
        <span style={{ color: C.textMuted, fontSize: 12 }}>{fOpen ? "▲" : "▼"}</span>
      </div>
      {fOpen && (
        <div style={{ padding: "0 14px 14px", borderTop: `1px solid ${C.border}` }}>
          <div style={{ color: C.textMuted, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", margin: "11px 0 5px" }}>Баланс на дату</div>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ ...mSelStyle, colorScheme:C.scheme }}/>
          <div style={{ color: C.textMuted, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", margin: "10px 0 5px" }}>Категория</div>
          <select value={filterCat} onChange={e => setFilterCat(e.target.value)} style={mSelStyle}>
            <option value="">Все категории</option>
            {(cpCategories||[]).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div style={{ color: C.textMuted, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", margin: "10px 0 5px" }}>Контрагент</div>
          <SearchSelect value={filterCp} onChange={v => setFilterCp(v)}
            options={[{value:"",label:"Все контрагенты"},...(counterparties||[]).filter(c=>c.active||c.is_active).map(c=>({value:String(c.id),label:c.name}))]}
            placeholder="Поиск контрагента..." />
          <button onClick={() => { onApply(); setFOpen(false); }} style={{ width: "100%", marginTop: 14, padding: "12px", background: C.accent, color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Применить</button>
        </div>
      )}
    </div>
  );
}

function CpRowMobile({ cp, onOpen }) {
  const saldo = Number(cp.saldo) || 0;
  const cur   = cp.currency_code === "RUB" ? "₽" : cp.currency_code || "₽";
  // saldo > 0 → нам должны (зелёный), saldo < 0 → мы должны (красный) — как в десктопе (строка таблицы)
  const saldoCol  = saldo > 0 ? C.greenText : saldo < 0 ? C.redText : C.textMuted;
  const saldoHint = saldo > 0 ? "нам должны" : saldo < 0 ? "мы должны" : "баланс";

  return (
    <div
      onClick={() => onOpen(cp)}
      style={{
        background: C.surface, border: `1px solid ${C.border}`,
        borderRadius: 10, padding: "12px 14px", marginBottom: 7,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 10, cursor: "pointer",
        borderLeft: `3px solid ${saldo > 0 ? C.greenText : saldo < 0 ? C.redText : C.border}`
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginBottom: 3 }}>
          {cp.name}
        </div>
        {cp.category_name && (
          <span style={{ fontSize: 10, color: C.accentText, background: C.accentDim, padding: "1px 7px", borderRadius: 8, fontWeight: 600 }}>
            {cp.category_name}
          </span>
        )}
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 15, color: saldoCol }}>
          {saldo === 0 ? "0" : fmt(Math.round(Math.abs(saldo))) + " " + cur}
        </div>
        <div style={{ fontSize: 10, color: saldoCol, marginTop: 2, fontWeight: 600 }}>
          {saldoHint}
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════
   МОБИЛЬНАЯ КАРТОЧКА — операция
   ════════════════════════════════════════════ */
function OpCardMobile({ op, runBal, cur, fmtA, fmtQ, expanded, onToggle }) {
  let tkey = op._type;
  if (op._type === "payment") tkey = op.direction === "incoming" ? "payment-in" : "payment-out";
  const tc = TYPE_CFG[tkey] || { label: op._type, color: C.text };
  const hasLines = (op._type === "sale" || op._type === "purchase" || op._type === "return") && (op.lines || []).length > 0;
  const note = op._type === "return" ? (op.reason || "") : op._type === "overhead" ? (op.article_name || "") : op.note || "";

  let deb = null, kred = null;
  if (op._deb  != null) deb  = op._deb;
  if (op._kred != null) kred = op._kred;

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, marginBottom: 7, overflow: "hidden" }}>
      <div onClick={hasLines ? onToggle : undefined} style={{ padding: "11px 13px", cursor: hasLines ? "pointer" : "default" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 5 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 600, color: tc.color, marginBottom: 3 }}>{op.number || "—"}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 8, color: tc.color, background: tc.color + "22" }}>{tc.label}</span>
              <span style={{ fontSize: 11, color: C.textDim }}>{fmtDate(op.date || op.created_at)}</span>
            </div>
            {(op.warehouse_name || op.account_name || note) && (
              <div style={{ fontSize: 11, color: C.textMuted, marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {[op.warehouse_name || op.account_name, note].filter(Boolean).join(" · ")}
              </div>
            )}
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            {deb  != null && <div style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: C.accentText }}>+{fmtA(deb)} {cur}</div>}
            {kred != null && <div style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: C.redText }}>−{fmtA(kred)} {cur}</div>}
          </div>
        </div>
      </div>

      {/* Бегущий баланс */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 13px", background: C.bg, borderTop: `1px solid ${C.border}` }}>
        <span style={{ fontSize: 10, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.04em" }}>Баланс</span>
        <span style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: balColor(runBal) }}>{balText(runBal, cur)}</span>
      </div>

      {/* Кнопка детально */}
      {hasLines && (
        <div style={{ padding: "7px 13px", borderTop: `1px solid ${C.border}`, background: C.surface }}>
          <button onClick={onToggle} style={{ width: "100%", padding: "6px", background: "transparent", border: `1px solid ${C.accent}`, color: C.accentText, borderRadius: 7, cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "inherit" }}>
            {expanded ? "▲ Свернуть" : "▼ Детально"}
          </button>
        </div>
      )}

      {/* Строки товаров */}
      {expanded && hasLines && (
        <div style={{ borderTop: `1px solid ${C.border}` }}>
          {(op.lines || []).map((l, li) => {
            const extra = [l.grade_name, l.country_name, l.unit_short].filter(v => v && v !== "—").join(", ");
            return (
              <div key={li} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "8px 13px", gap: 8, borderBottom: li < op.lines.length - 1 ? `1px solid ${C.border}` : "none", background: C.surface + "60" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: C.text, marginBottom: 2 }}>{l.product_name || "—"}</div>
                  {extra && <div style={{ fontSize: 10, color: C.textMuted }}>{extra}</div>}
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontFamily: "monospace", fontSize: 11, color: C.textMuted }}>{fmtQ(l.qty)} × {fmtA(l.price)}</div>
                  <div style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 600, color: C.accentText }}>{fmtA(l.amount)} {cur}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════
   МОБИЛЬНЫЙ ЭКРАН — КАРТОЧКА КОНТРАГЕНТА
   ════════════════════════════════════════════ */
function CpCardMobile({ selected, card, cardLoading, cardDateFrom, cardDateTo, setCardDateFrom, setCardDateTo, onBack, onLoad, onPrint }) {
  const [expanded, setExpanded] = useState({});
  const today = new Date().toISOString().slice(0, 10);
  const cur   = selected.currency_code === "RUB" ? "₽" : selected.currency_code || "₽";
  const fmtA  = v => fmt(Math.round(Number(v) || 0));
  const fmtQ  = v => { const n = parseFloat(v) || 0; return n % 1 === 0 ? n.toLocaleString("ru-RU") : n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 3 }); };

  const saldo    = Number(selected.saldo) || 0;
  const saldoTxt = saldo > 0 ? "Нам должны " + fmt(Math.round(Math.abs(saldo))) + " " + cur
                 : saldo < 0 ? "Мы должны "  + fmt(Math.round(Math.abs(saldo))) + " " + cur
                 : "Расчёты в балансе ✓";
  const saldoCol = saldo > 0 ? C.greenText : saldo < 0 ? C.redText : C.greenText;

  const periods = [
    { l: "Сегодня", f: () => { setCardDateFrom(today); setCardDateTo(today); } },
    { l: "Неделя",  f: () => { const d = new Date(); d.setDate(d.getDate()-7); setCardDateFrom(d.toISOString().slice(0,10)); setCardDateTo(today); } },
    { l: "Месяц",   f: () => { const d = new Date(); d.setMonth(d.getMonth()-1); setCardDateFrom(d.toISOString().slice(0,10)); setCardDateTo(today); } },
    { l: "Всё",     f: () => { setCardDateFrom(""); setCardDateTo(today); } },
  ];
  const [activeP, setActiveP] = useState("Всё");

  /* строим операции с бегущим балансом */
  const allOps = card ? [
    ...(card.sales          || []).map(s => ({ ...s, _type: "sale",          _date: new Date(s.date) })),
    ...(card.purchases      || []).map(s => ({ ...s, _type: "purchase",      _date: new Date(s.date) })),
    ...(card.payments       || []).map(p => ({ ...p, _type: "payment",       _date: new Date(p.date) })),
    ...(card.returns        || []).map(r => ({ ...r, _type: "return",        _date: new Date(r.date) })),
    ...(card.overheads      || []).map(o => ({ ...o, number: o.doc_number, _type: "overhead",      _date: o.date ? new Date(o.date) : new Date() })),
    ...(card.debt_writeoffs || []).map(d => ({ ...d, _type: "debt_writeoff", _date: new Date(d.date) })),
  ].sort((a, b) => a._date - b._date) : [];

  // Добавляем начальный долг как первую строку если он задан
  const openingOp = (card && card.balance_open != null && card.balance_open !== 0) ? [{
    _type: "opening",
    _date: null,
    id: "opening",
    number: "—",
    note: "Начальный остаток",
    amount: Math.abs(Number(card.balance_open)),
    direction: Number(card.balance_open) > 0 ? "credit" : "debit",
  }] : [];

  let runBal = card?.balance_open != null ? Number(card.balance_open) : 0;
  const cpCurId = Number(selected.currency_id) || 1;
  const cpRate  = Number(card?.cp_rate) || 1;

  const ops = allOps.map(op => {
    let deb = null, kred = null;
    if (op._type === "sale")     { kred = Number(op.total_amount)||0; runBal += kred; }
    else if (op._type === "purchase") { deb = Number(op.total_amount)||0; runBal -= deb; }
    else if (op._type === "payment") {
      let amt = Number(op.amount)||0;
      const pCurId = Number(op.currency_id)||1;
      if (pCurId !== cpCurId) { const base = Number(op.amount_base)||amt; amt = cpCurId===1 ? base : base/cpRate; }
      if (op.direction === "incoming") { deb = amt; runBal -= deb; } else { kred = amt; runBal += kred; }
    }
    else if (op._type === "return")   { deb = Number(op.total_amount)||0; runBal -= deb; }
    else if (op._type === "overhead")      { const rate = Number(op.currency_rate)||1; const amtRub = Number(op.amount)||0; deb = cpCurId===1 ? amtRub : amtRub/rate; runBal -= deb; }
    else if (op._type === "debt_writeoff") { deb = Number(op.amount)||0; runBal -= deb; }
    else if (op._type === "opening") { /* баланс уже в runBal, просто показываем */ }
    return { ...op, _deb: deb, _kred: kred, _runBal: runBal };
  });

  const inpStyle = { background: C.bg, border: `1px solid ${C.borderLight}`, color: C.text, borderRadius: 8, padding: "8px 10px", fontSize: 12, fontFamily: "inherit", outline: "none", colorScheme:C.scheme, width: "100%" };

  return (
    <div style={{ minHeight: "100dvh", background: C.bg }}>
      {/* Шапка */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 5 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <button onClick={onBack} style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: "7px 12px", fontSize: 13, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>←</button>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{selected.name}</div>
            {selected.inn && <div style={{ fontSize: 10, color: C.textMuted }}>ИНН: {selected.inn}</div>}
          </div>
        </div>
        <button onClick={onPrint} style={{ background: C.surface, border: `1px solid ${C.borderLight}`, color: C.textMuted, borderRadius: 8, padding: "7px 12px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", flexShrink: 0, marginLeft: 8 }}>🖨</button>
      </div>

      <div style={{ padding: "12px 12px 48px" }}>

        {/* Сальдо Hero */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderLeft: `4px solid ${saldoCol}`, borderRadius: 12, padding: "14px 16px", marginBottom: 12, textAlign: "center" }}>
          <div style={{ color: C.textMuted, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Сальдо</div>
          <div style={{ color: saldoCol, fontSize: 22, fontWeight: 700 }}>{saldoTxt}</div>
        </div>

        {/* KPI 2×2 */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
          {[
            { l: "Продажи",           v: fmt(Math.round(selected.sale_total||0))     + " " + cur, c: C.accentText },
            { l: "Закупки",           v: fmt(Math.round(selected.purchase_total||0)) + " " + cur, c: C.tealText   },
            { l: "Входящие платежи",  v: fmt(Math.round(selected.paid_in||0))        + " " + cur, c: C.greenText  },
            { l: "Исходящие платежи", v: fmt(Math.round(selected.paid_out||0))       + " " + cur, c: C.redText    },
          ].map((k, i) => (
            <div key={i} style={{ background: C.surface, border: `1px solid ${C.border}`, borderTop: `2px solid ${k.c}`, borderRadius: 10, padding: "10px 13px" }}>
              <div style={{ color: C.textMuted, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 3 }}>{k.l}</div>
              <div style={{ color: k.c, fontSize: 15, fontWeight: 700, fontFamily: "monospace" }}>{k.v}</div>
            </div>
          ))}
        </div>

        {/* Период */}
        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2, marginBottom: 10 }}>
          {periods.map(p => (
            <div key={p.l} onClick={() => { setActiveP(p.l); p.f(); setTimeout(() => onLoad(selected, p.l === "Всё" ? "" : cardDateFrom, cardDateTo), 0); }}
              style={{ flexShrink: 0, padding: "6px 13px", background: activeP===p.l ? C.accent : C.surface, border: `1px solid ${activeP===p.l ? C.accent : C.border}`, borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer", color: activeP===p.l ? "#fff" : C.textMuted }}>
              {p.l}
            </div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr auto", gap: 6, alignItems: "center", marginBottom: 12 }}>
          <input type="date" value={cardDateFrom} onChange={e => setCardDateFrom(e.target.value)} style={inpStyle}/>
          <span style={{ color: C.textMuted }}>—</span>
          <input type="date" value={cardDateTo}   onChange={e => setCardDateTo(e.target.value)}   style={inpStyle}/>
          <button onClick={() => onLoad(selected, cardDateFrom, cardDateTo)} style={{ padding: "9px 12px", background: C.accent, color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>OK</button>
        </div>

        {cardLoading && <div style={{ padding: "40px 20px", textAlign: "center", color: C.textMuted }}>Загрузка...</div>}

        {!cardLoading && !card && (
          <div style={{ padding: "40px 20px", textAlign: "center", color: C.textDim, fontSize: 14 }}>
            Выберите период и нажмите OK
          </div>
        )}

        {!cardLoading && card && (<>
          {/* Баланс на начало */}
          {card.balance_open != null && (
            <div style={{ background: C.tealDim, border: `1px solid ${C.teal}`, borderRadius: 8, padding: "9px 14px", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 11, color: C.tealText }}>Баланс на начало периода</span>
              <span style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: C.tealText }}>{balText(card.balance_open, cur)}</span>
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Операции</div>
            <div style={{ fontSize: 11, color: C.textMuted }}>{ops.length} записей</div>
          </div>

          {ops.length === 0 && <div style={{ padding: "40px 20px", textAlign: "center", color: C.textDim, fontSize: 14 }}>Нет операций за период</div>}

          {/* Начальный долг — первой строкой */}
          {openingOp.length>0&&(
            <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 14px",marginBottom:6,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <span style={{fontSize:11,color:C.textMuted,textTransform:"uppercase",letterSpacing:"0.05em"}}>Начальный остаток</span>
              </div>
              <span style={{fontFamily:"monospace",fontSize:13,fontWeight:700,color:Number(card.balance_open)>0?C.accentText:C.redText}}>{balText(card.balance_open, cur)}</span>
            </div>
          )}
          {ops.map((op, idx) => {
            const expKey = op._type + (op.id || idx);
            return (
              <OpCardMobile key={expKey} op={op} runBal={op._runBal} cur={cur} fmtA={fmtA} fmtQ={fmtQ}
                expanded={!!expanded[expKey]} onToggle={() => setExpanded(e => ({ ...e, [expKey]: !e[expKey] }))} />
            );
          })}

          {ops.length > 0 && (
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px", marginTop: 4, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, color: C.textDim }}>Итоговый баланс периода</span>
              <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 15, color: balColor(card.balance_close ?? runBal) }}>
                {balText(card.balance_close ?? runBal, cur)}
              </span>
            </div>
          )}
        </>)}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════
   ГЛАВНЫЙ КОМПОНЕНТ
   ════════════════════════════════════════════ */
function Counterparties({ counterparties, cpCategories, onNav }) {
  const [data,        setData]        = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [search,      setSearch]      = useState("");
  const [filter,      setFilter]      = useState("all");
  const [hideZero,    setHideZero]    = useState(true);
  const [selected,    setSelected]    = useState(null);
  const [card,        setCard]        = useState(null);
  const [cardLoading, setCardLoading] = useState(false);
  const [expandedSales, setExpandedSales] = useState({});

  const today = new Date().toISOString().slice(0, 10);
  const [dateTo,       setDateTo]      = useState(today);
  const [dateFrom,     setDateFrom]    = useState(today);
  const [filterCp,     setFilterCp]    = useState("");
  const [filterCat,    setFilterCat]   = useState("");
  const [cardDateFrom, setCardDateFrom]= useState(today);
  const [cardDateTo,   setCardDateTo]  = useState(today);

  const isMobile = useIsMobile();

  const loadBalance = () => {
    setLoading(true);
    const p = new URLSearchParams();
    if (dateTo)    p.set("date_to",         dateTo);
    if (filterCp)  p.set("counterparty_id", filterCp);
    if (filterCat) p.set("category_id",     filterCat);
    api(`/counterparties/balance?${p}`).then(rows => {
      setData(rows.map(r => ({
        ...r,
        balance_sale:     Number(r.balance_sale)     || 0,
        balance_purchase: Number(r.balance_purchase) || 0,
        currency_code:    r.currency_code  || "RUB",
        currency_name:    r.currency_name  || "Рубль",
        sale_total:       Number(r.sale_total)       || 0,
        purchase_total:   Number(r.purchase_total)   || 0,
        paid_in:          Number(r.paid_in)           || 0,
        paid_out:         Number(r.paid_out)          || 0,
        saldo:            Number(r.saldo)             || 0,
      })));
    }).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { loadBalance(); }, []);

  const openHistory = cp => {
    api(`/counterparties/balance?counterparty_id=${cp.id}`).then(rows => {
      if (rows && rows.length > 0) {
        const fresh = rows[0];
        setSelected({ ...cp, ...fresh,
          balance_sale:     Number(fresh.balance_sale)     || 0,
          balance_purchase: Number(fresh.balance_purchase) || 0,
          currency_code:    fresh.currency_code || "RUB",
          sale_total:       Number(fresh.sale_total)       || 0,
          purchase_total:   Number(fresh.purchase_total)   || 0,
          paid_in:          Number(fresh.paid_in)          || 0,
          paid_out:         Number(fresh.paid_out)         || 0,
          saldo:            Number(fresh.saldo)            || 0,
        });
      } else { setSelected(cp); }
    }).catch(() => setSelected(cp));
    setCard(null);
    setExpandedSales({});
  };

  const loadCard = (cp, dfrom, dto) => {
    setCardLoading(true);
    setCardDateFrom(dfrom || "");
    setCardDateTo(dto || "");
    const p = new URLSearchParams();
    if (dfrom) p.set("date_from", dfrom);
    if (dto)   p.set("date_to",   dto);
    api(`/counterparties/${cp.id}/card?${p}`)
      .then(d => setCard(d))
      .catch(() => setCard({ sales: [], purchases: [], payments: [], returns: [], overheads: [] }))
      .finally(() => setCardLoading(false));
  };

  const toggleRow = id => setExpandedSales(p => ({ ...p, [id]: !p[id] }));

  const filtered = data.filter(c => {
    if (search   && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (hideZero && (Number(c.saldo) || 0) === 0) return false;
    if (filter === "debtors"   && (Number(c.saldo) || 0) <= 0) return false;
    if (filter === "creditors" && (Number(c.saldo) || 0) >= 0) return false;
    return true;
  });

  const totalDebt    = filtered.reduce((s, c) => s + Math.max(Number(c.saldo)||0, 0), 0);
  const totalAdvance = filtered.reduce((s, c) => s + Math.max(c.balance_sale||0, 0), 0);
  const totalCredit  = filtered.reduce((s, c) => s + Math.max(-(Number(c.saldo)||0), 0), 0);
  const netSaldo     = totalDebt - totalCredit;

  const handlePrintCard = () => {
    const cur  = selected.currency_code === "RUB" ? "₽" : selected.currency_code || "₽";
    const fmtA = v => (Math.round(Number(v)||0)).toLocaleString("ru-RU");
    const fmtQ = v => { const n = parseFloat(v)||0; return n%1===0 ? n.toLocaleString("ru-RU") : n.toLocaleString("ru-RU",{minimumFractionDigits:2,maximumFractionDigits:3}); };
    const fmtP = v => (parseFloat(v)||0).toLocaleString("ru-RU",{minimumFractionDigits:2,maximumFractionDigits:2});
    const allOps = [
      ...(card?.sales          ||[]).map(s=>({...s,_type:"sale",          _date:new Date(s.date)})),
      ...(card?.purchases      ||[]).map(s=>({...s,_type:"purchase",      _date:new Date(s.date)})),
      ...(card?.payments       ||[]).map(p=>({...p,_type:"payment",       _date:new Date(p.date)})),
      ...(card?.returns        ||[]).map(r=>({...r,_type:"return",        _date:new Date(r.date)})),
      ...(card?.overheads      ||[]).map(o=>({...o,number:o.doc_number,_type:"overhead",_date:o.date?new Date(o.date):new Date()})),
      ...(card?.debt_writeoffs ||[]).map(d=>({...d,_type:"debt_writeoff",_date:new Date(d.date)})),
    ].sort((a,b)=>a._date-b._date);
    let balance = 0;
    const rows = allOps.map(op=>{
      const d=fmtDate(op.date||op.created_at); let typeLabel="",num=op.number||"—",debet="",kredit="",subRows="";
      if(op._type==="sale"){typeLabel="Продажа";kredit=`<b>${fmtA(op.total_amount)}</b>`;balance-=Number(op.total_amount)||0;subRows=(op.lines||[]).map(l=>{const extra=[l.grade_name,l.country_name,l.unit_short].filter(v=>v&&v!=="—").join(", ");return`<tr class="sub"><td></td><td></td><td></td><td class="indent">${l.product_name||"—"}${extra?", "+extra:""} &nbsp; ${fmtQ(l.qty)} × ${fmtP(l.price)}</td><td class="r dr">${fmtA(l.amount)}</td><td></td><td></td></tr>`;}).join("");}
      else if(op._type==="purchase"){typeLabel="Закупка";debet=`<b>${fmtA(op.total_amount)}</b>`;balance+=Number(op.total_amount)||0;subRows=(op.lines||[]).map(l=>{const extra=[l.grade_name,l.country_name,l.unit_short].filter(v=>v&&v!=="—").join(", ");return`<tr class="sub"><td></td><td></td><td></td><td class="indent">${l.product_name||"—"}${extra?", "+extra:""} &nbsp; ${fmtQ(l.qty)} × ${fmtP(l.price)}</td><td class="dr"></td><td class="r">${fmtA(l.amount)}</td><td></td></tr>`;}).join("");}
      else if(op._type==="payment"){const isIn=op.direction==="incoming";typeLabel=isIn?"Платёж вх.":"Платёж исх.";if(isIn){debet=`<b>${fmtA(op.amount)}</b>`;balance+=Number(op.amount)||0;}else{kredit=`<b>${fmtA(op.amount)}</b>`;balance-=Number(op.amount)||0;}}
      else if(op._type==="return"){typeLabel="Возврат";debet=`<b>${fmtA(op.total_amount)}</b>`;balance+=Number(op.total_amount)||0;subRows=(op.lines||[]).map(l=>{const extra=[l.grade_name,l.country_name,l.unit_short].filter(v=>v&&v!=="—").join(", ");return`<tr class="sub"><td></td><td></td><td></td><td class="indent">${l.product_name||"—"}${extra?", "+extra:""} &nbsp; ${fmtQ(l.qty)} × ${fmtP(l.price)}</td><td class="dr"></td><td class="r">${fmtA(l.amount)}</td><td></td></tr>`;}).join("");}
      else if(op._type==="overhead"){typeLabel="Накл. расход";const rate=Number(op.currency_rate)||1;const amtRub=Number(op.amount)||0;debet=`<b>${fmtA(amtRub/rate)}</b>`;balance+=amtRub/rate;}
      else if(op._type==="debt_writeoff"){typeLabel="Списание долга";debet=`<b>${fmtA(Number(op.amount)||0)}</b>`;balance+=Number(op.amount)||0;}
      const note=op._type==="return"?(op.reason||""):op._type==="overhead"?(op.article_name||""):op.note||"";
      const balText=balance>0?`${fmtA(balance)}`:balance<0?`-${fmtA(Math.abs(balance))}`:"0";
      return`<tr class="doc-row"><td>${d}</td><td>${typeLabel}</td><td>${num}</td><td style="color:#555">${(op.warehouse_name||op.account_name||"")}${note?" · "+note:""}</td><td class="r dr"><b>${debet||"—"}</b></td><td class="r"><b>${kredit||"—"}</b></td><td class="r"><b>${balText}</b></td></tr>${subRows}`;
    }).join("");
    let totDebet=0,totKredit=0;
    (card?.sales||[]).forEach(s=>totKredit+=Number(s.total_amount)||0);
    (card?.payments||[]).forEach(p=>{if(p.direction==="incoming")totDebet+=Number(p.amount)||0;});
    (card?.purchases||[]).forEach(s=>totDebet+=Number(s.total_amount)||0);
    (card?.payments||[]).forEach(p=>{if(p.direction!=="incoming")totKredit+=Number(p.amount)||0;});
    (card?.returns||[]).forEach(r=>totDebet+=Number(r.total_amount)||0);
    (card?.overheads||[]).forEach(o=>{const rate=Number(o.currency_rate)||1;const amtRub=Number(o.amount)||0;const cpCurId=Number(selected.currency_id)||1;totDebet+=cpCurId===1?amtRub:amtRub/rate;});
    const finalBal=totDebet-totKredit;
    const finalText=finalBal<0?`${fmtA(Math.abs(finalBal))} ${cur}`:finalBal>0?`-${fmtA(finalBal)} ${cur}`:"0";
    const html=`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Акт сверки — ${selected.name}</title><style>*{margin:0;padding:0;box-sizing:border-box;}@page{size:A4 portrait;margin:10mm 12mm;}body{font-family:Arial,sans-serif;font-size:8px;}.header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1.5px solid #000;padding-bottom:5px;margin-bottom:7px;}.header h1{font-size:12px;font-weight:700;}.header p{font-size:8px;color:#444;margin-top:2px;}table{width:100%;border-collapse:collapse;table-layout:fixed;}th{border:0.5px solid #999;padding:3px 4px;font-size:7px;font-weight:700;background:#f0f0f0;}th.r{text-align:right;}td{border:0.5px solid #ddd;padding:2px 4px;font-size:8px;vertical-align:top;}td.r{text-align:right;white-space:nowrap;}td.dr{border-right:1px solid #999;}tr.doc-row td{font-size:9px;}tr.sub td{font-size:7px;color:#555;border:none;}tr.sub td.r{text-align:right;}tr.sub td.indent{padding-left:10px;font-style:italic;}tr.tot td{background:#efefef;font-weight:700;font-size:8px;border-top:1.5px solid #000;}tr.saldo-row td{font-size:11px;font-weight:700;text-align:center;padding:6px;border:1.5px solid #000;background:#f5f5f5;}@media print{body{-webkit-print-color-adjust:exact;}}</style></head><body><div class="header"><div><h1>АКТ СВЕРКИ ВЗАИМНЫХ РАСЧЁТОВ</h1><p>Контрагент: <b>${selected.name}</b>${selected.inn?" · ИНН: "+selected.inn:""}</p></div><div style="text-align:right"><p>Период: ${cardDateFrom||"начало"} — ${cardDateTo||"сегодня"}</p><p>Составлен: ${new Date().toLocaleDateString("ru-RU")}</p></div></div><table><colgroup><col style="width:46px"/><col style="width:50px"/><col style="width:70px"/><col/><col style="width:64px"/><col style="width:64px"/><col style="width:70px"/></colgroup><thead><tr><th>Дата</th><th>Тип</th><th>Номер</th><th>Содержание</th><th class="r dr">Дебет</th><th class="r">Кредит</th><th class="r">Баланс</th></tr></thead><tbody>${card?.balance_open!=null?`<tr class="tot" style="background:#e8f4fd"><td colspan="4" style="text-align:right;font-weight:600">Баланс на начало:</td><td class="r dr">${card.balance_open>0?fmtA(card.balance_open):""}</td><td class="r">${card.balance_open<0?fmtA(Math.abs(card.balance_open)):""}</td><td class="r">${card.balance_open>0?fmtA(card.balance_open):card.balance_open<0?"-"+fmtA(Math.abs(card.balance_open)):"0"}</td></tr>`:""}${rows}<tr class="tot"><td colspan="6" style="text-align:right">ИТОГО:</td><td class="r">${finalText}</td></tr><tr class="saldo-row"><td colspan="7">${finalText}</td></tr></tbody></table><script>window.onload=()=>{window.print();}<\/script></body></html>`;
    const w=window.open("","_blank");w.document.write(html);w.document.close();
  };

  const selStyle = { background: C.bg, border: `1px solid ${C.borderLight}`, color: C.text, borderRadius: 6, padding: "6px 10px", fontSize: 12, outline: "none" };
  const inpStyle = { ...selStyle, colorScheme:C.scheme };

  /* ════ МОБИЛЬНЫЙ — карточка контрагента ════ */
  if (isMobile && selected) {
    return (
      <CpCardMobile
        selected={selected} card={card} cardLoading={cardLoading}
        cardDateFrom={cardDateFrom} cardDateTo={cardDateTo}
        setCardDateFrom={setCardDateFrom} setCardDateTo={setCardDateTo}
        onBack={() => { setSelected(null); setCard(null); }}
        onLoad={loadCard}
        onPrint={handlePrintCard}
      />
    );
  }

  /* ════ МОБИЛЬНЫЙ — список контрагентов ════ */
  if (isMobile) {
    return (
      <div style={{ padding: "12px 12px 48px" }}>
        {/* Заголовок */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 18, color: C.text }}>Взаиморасчёты</div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => onNav && onNav("debtors_report")}   style={{ padding: "5px 10px", background: "#1A2D3D", border: `1px solid ${C.accentText}`, color: C.accentText, borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 600 }}>Дебиторы</button>
            <button onClick={() => onNav && onNav("creditors_report")} style={{ padding: "5px 10px", background: "#3D1A1A", border: `1px solid ${C.redText}`,    color: C.redText,    borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 600 }}>Кредиторы</button>
          </div>
        </div>

        {/* Фильтры аккордеон */}
        <MobileFiltersAccordion
          dateTo={dateTo} setDateTo={setDateTo}
          filterCat={filterCat} setFilterCat={setFilterCat}
          filterCp={filterCp} setFilterCp={setFilterCp}
          cpCategories={cpCategories} counterparties={counterparties}
          onApply={loadBalance}
        />

        {/* KPI */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
          {[
            { l: "Нам должны",  v: fmt(Math.round(totalDebt))   + " ₽", c: C.yellowText },
            { l: "Мы должны",   v: fmt(Math.round(totalCredit)) + " ₽", c: C.redText    },
            { l: "Чистое сальдо", v: (netSaldo >= 0 ? "+" : "") + fmt(Math.round(netSaldo)) + " ₽", c: netSaldo >= 0 ? C.greenText : C.redText, span: 2 },
          ].map((k, i) => (
            <div key={i} style={{ background: C.surface, border: `1px solid ${C.border}`, borderLeft: `3px solid ${k.c}`, borderRadius: 10, padding: "10px 14px", gridColumn: k.span ? "1 / -1" : undefined }}>
              <div style={{ color: C.textMuted, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 3 }}>{k.l}</div>
              <div style={{ color: k.c, fontFamily: "monospace", fontSize: 16, fontWeight: 700 }}>{k.v}</div>
            </div>
          ))}
        </div>

        {/* Переключатели */}
        <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
          <div style={{ display: "flex", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
            {[{id:"all",l:"Все"},{id:"debtors",l:"Должники"},{id:"creditors",l:"Кредиторы"}].map(f => (
              <button key={f.id} onClick={() => setFilter(f.id)} style={{ padding: "7px 12px", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, background: filter===f.id ? C.accent : "transparent", color: filter===f.id ? "#fff" : C.textMuted, fontFamily: "inherit" }}>{f.l}</button>
            ))}
          </div>
          <div onClick={() => setHideZero(v => !v)} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", padding: "4px 0" }}>
            <div style={{ width: 32, height: 18, borderRadius: 9, background: hideZero ? C.accent : C.border, position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
              <div style={{ width: 14, height: 14, borderRadius: "50%", background: "#fff", position: "absolute", top: 2, left: hideZero ? 16 : 2, transition: "left 0.2s" }}/>
            </div>
            <span style={{ color: C.textMuted, fontSize: 12 }}>Скрыть нулевые</span>
          </div>
        </div>

        {/* Поиск */}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск по названию..."
          style={{ width: "100%", background: C.surface, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: "9px 12px", fontSize: 13, outline: "none", marginBottom: 12, fontFamily: "inherit" }}/>

        {loading && <div style={{ padding: "40px 20px", textAlign: "center", color: C.textMuted }}>Загрузка...</div>}
        {!loading && filtered.length === 0 && <div style={{ padding: "40px 20px", textAlign: "center", color: C.textDim, fontSize: 14 }}>Нет данных</div>}
        {!loading && filtered.map(c => <CpRowMobile key={c.id} cp={c} onOpen={openHistory} />)}
      </div>
    );
  }

  /* ════ ДЕСКТОПНЫЙ РЕНДЕР (оригинал без изменений) ════ */
  if (selected) {
    const cur = selected.currency_code === "RUB" ? "₽" : selected.currency_code || "₽";
    const bp  = Number(selected.balance_purchase) || 0;
    const bs  = Number(selected.balance_sale)     || 0;
    const saldo = Number(selected.saldo) || 0;
    const saldoTxt = saldo < 0 ? "Мы должны " + fmt(Math.round(Math.abs(saldo))) + " " + cur : saldo > 0 ? "Нам должны " + fmt(Math.round(saldo)) + " " + cur : "Расчёты в балансе ✓";
    const saldoCol = saldo < 0 ? C.redText : saldo > 0 ? C.yellowText : C.greenText;
    const fmtA = v => fmt(Math.round(Number(v)||0));
    const fmtQ = v => { const n = parseFloat(v)||0; return n%1===0 ? n.toLocaleString("ru-RU") : n.toLocaleString("ru-RU",{minimumFractionDigits:2,maximumFractionDigits:3}); };
    const allOps = card ? [
      ...(card.sales||[]).map(s=>({...s,_type:"sale",_date:new Date(s.date)})),
      ...(card.purchases||[]).map(s=>({...s,_type:"purchase",_date:new Date(s.date)})),
      ...(card.payments||[]).map(p=>({...p,_type:"payment",_date:new Date(p.date)})),
      ...(card.returns||[]).map(r=>({...r,_type:"return",_date:new Date(r.date)})),
      ...(card.overheads||[]).map(o=>({...o,number:o.doc_number,_type:"overhead",_date:o.date?new Date(o.date):new Date()})),
      ...(card.debt_writeoffs||[]).map(d=>({...d,_type:"debt_writeoff",_date:new Date(d.date)})),
    ].sort((a,b)=>a._date-b._date) : [];
    let runBal=0, totDeb=0, totKred=0;
    if(card){
      (card.sales||[]).forEach(s=>totKred+=Number(s.total_amount)||0);
      (card.payments||[]).forEach(p=>{if(p.direction==="incoming")totDeb+=Number(p.amount)||0;});
      (card.purchases||[]).forEach(s=>totDeb+=Number(s.total_amount)||0);
      (card.payments||[]).forEach(p=>{if(p.direction!=="incoming")totKred+=Number(p.amount)||0;});
      (card.returns||[]).forEach(r=>totDeb+=Number(r.total_amount)||0);
      (card.overheads||[]).forEach(o=>{const rate=Number(o.currency_rate)||1;const amtRub=Number(o.amount)||0;const cpCurId=Number(selected.currency_id)||1;totDeb+=cpCurId===1?amtRub:amtRub/rate;});
      (card.debt_writeoffs||[]).forEach(d=>totDeb+=Number(d.amount)||0);
    }
    const finalBal=totDeb-totKred;
    const finalTxt=finalBal<0?fmtA(Math.abs(finalBal))+" "+cur:finalBal>0?"-"+fmtA(finalBal)+" "+cur:"0";
    const finalCol=finalBal<0?C.greenText:finalBal>0?C.redText:C.greenText;
    const typeColors={sale:C.accentText,purchase:C.tealText,"payment-in":C.greenText,"payment-out":C.redText,return:C.yellowText,overhead:"#A78BFA",debt_writeoff:C.yellowText};
    const typeLabels={sale:"Продажа",purchase:"Закупка","payment-in":"Платёж вх.","payment-out":"Платёж исх.",return:"Возврат",overhead:"Накл. расход",debt_writeoff:"Списание долга"};
    const thC={fontSize:11,fontWeight:600,padding:"6px 8px",borderBottom:`1px solid ${C.border}`,color:C.textMuted,whiteSpace:"nowrap",background:C.surface};
    const thR={...thC,textAlign:"right"};
    const tdC={padding:"5px 8px",fontSize:12,borderBottom:`1px solid ${C.border}40`,color:C.text,verticalAlign:"top"};
    const tdR={...tdC,textAlign:"right",fontFamily:"monospace",whiteSpace:"nowrap"};
    const tdSub={...tdC,fontSize:11,color:C.textMuted,background:C.surface+"60",paddingLeft:20,borderBottom:"none"};
    const tdSubR={...tdSub,textAlign:"right",fontFamily:"monospace"};
    const sepBorder={borderRight:`2px solid ${C.border}`};
    const rows=[];
    allOps.forEach((op,idx)=>{
      let tkey=op._type;
      if(op._type==="payment")tkey=op.direction==="incoming"?"payment-in":"payment-out";
      const col=typeColors[tkey]||C.text;
      const lbl=typeLabels[tkey]||"";
      const note=op._type==="return"?(op.reason||""):op._type==="overhead"?(op.article_name||""):op.note||"";
      let deb=null,kred=null;
      if(op._type==="sale"){kred=Number(op.total_amount)||0;runBal+=kred;}
      else if(op._type==="purchase"){deb=Number(op.total_amount)||0;runBal-=deb;}
      else if(op._type==="payment"){
        let amt=Number(op.amount)||0;
        const cpCurId=Number(selected.currency_id)||1,pCurId=Number(op.currency_id)||1,pRate=Number(op.currency_rate)||1;
        if(pCurId!==cpCurId){const base=Number(op.amount_base)||amt;amt=cpCurId===1?base:base/pRate;}
        if(op.direction==="incoming"){deb=amt;runBal-=deb;}else{kred=amt;runBal+=kred;}
      }
      else if(op._type==="return"){deb=Number(op.total_amount)||0;runBal-=deb;}
      else if(op._type==="overhead"){const rate=Number(op.currency_rate)||1;const amtRub=Number(op.amount)||0;const cpCurId=Number(selected.currency_id)||1;deb=cpCurId===1?amtRub:amtRub/rate;runBal-=deb;}
      else if(op._type==="debt_writeoff"){deb=Number(op.amount)||0;runBal-=deb;}
      const balCol=runBal>0?C.greenText:runBal<0?C.redText:C.textMuted;
      const balTxt=runBal>0?fmtA(runBal):runBal<0?"-"+fmtA(Math.abs(runBal)):"0";
      const hasLines=(op._type==="sale"||op._type==="purchase"||op._type==="return")&&(op.lines||[]).length>0;
      const expKey=op._type+op.id;
      const isExp=expandedSales[expKey];
      rows.push(<tr key={"op"+idx} style={{background:C.bg}}>
        <td style={{...tdC,color:C.textMuted,fontSize:11}}>{fmtDate(op.date||op.created_at)}</td>
        <td style={tdC}><span style={{color:col,background:col+"22",padding:"2px 7px",borderRadius:8,fontSize:11,fontWeight:600,whiteSpace:"nowrap"}}>{lbl}</span></td>
        <td style={{...tdC,fontFamily:"monospace",fontSize:11,color:col}}>{op.number||"—"}</td>
        <td style={{...tdC,color:C.textMuted,fontSize:11}}>{op.warehouse_name||op.account_name||""}</td>
        <td style={{...tdC,color:C.textMuted,fontSize:11,...sepBorder}}>{note}</td>
        <td style={{...tdR,fontWeight:700,color:C.accentText}}>{deb!=null?"+"+fmtA(deb)+" "+cur:"—"}</td>
        <td style={{...tdR,fontWeight:700,color:C.redText}}>{kred!=null?"-"+fmtA(kred)+" "+cur:"—"}</td>
        <td style={{...tdR,fontWeight:700,color:balCol}}>{balTxt+" "+cur}</td>
        <td style={tdC}>{hasLines&&<button onClick={()=>toggleRow(expKey)} style={{padding:"2px 8px",background:"transparent",border:`1px solid ${C.borderLight}`,color:C.textMuted,borderRadius:4,cursor:"pointer",fontSize:11,whiteSpace:"nowrap"}}>{isExp?"▲ Свернуть":"▼ Детально"}</button>}</td>
      </tr>);
      if(isExp){(op.lines||[]).forEach((l,li)=>{const extra=[l.grade_name,l.country_name,l.unit_short].filter(v=>v&&v!=="—").join(", ");rows.push(<tr key={"sub"+idx+"_"+li}><td style={tdSub}></td><td style={tdSub}></td><td style={tdSub}></td><td style={tdSub}>{l.product_name||"—"}{extra?", "+extra:""}</td><td style={{...tdSub,...sepBorder}}></td><td style={tdSubR}>{fmtQ(l.qty)} × {fmtA(l.price)}</td><td style={{...tdSubR,color:C.textMuted}}>{fmtA(l.amount)} {cur}</td><td style={tdSub}></td><td style={tdSub}></td></tr>);});}
    });

    return (
      <div style={{display:"flex",justifyContent:"center",padding:"28px 24px"}}>
        <div style={{width:"100%",maxWidth:1100}}>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16,paddingBottom:16,borderBottom:`1px solid ${C.border}`}}>
            <button onClick={()=>{setSelected(null);setCard(null);}} style={{padding:"7px 14px",background:"transparent",border:`1px solid ${C.borderLight}`,color:C.text,borderRadius:6,cursor:"pointer",fontSize:13,fontWeight:600}}>← Назад</button>
            <h1 style={{margin:0,color:C.text,fontSize:20,fontWeight:700}}>{selected.name}</h1>
            {selected.inn&&<span style={{color:C.textMuted,fontSize:12}}>ИНН: {selected.inn}</span>}
            {selected.category_name&&<span style={{color:C.accent,background:C.accentDim,padding:"2px 8px",borderRadius:8,fontSize:11,fontWeight:600}}>{selected.category_name}</span>}
            <div style={{marginLeft:"auto"}}><button onClick={handlePrintCard} style={{padding:"7px 16px",background:C.surface,border:`1px solid ${C.borderLight}`,color:C.text,borderRadius:6,cursor:"pointer",fontSize:13,fontWeight:600}}>🖨 Печать</button></div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:16}}>
            {[{l:"Продажи",v:fmt(Math.round(selected.sale_total))+" "+cur,c:C.accentText},{l:"Закупки",v:fmt(Math.round(selected.purchase_total))+" "+cur,c:C.tealText},{l:"Входящие платежи",v:fmt(Math.round(selected.paid_in))+" "+cur,c:C.greenText},{l:"Исходящие платежи",v:fmt(Math.round(selected.paid_out))+" "+cur,c:C.redText}].map((k,i)=>(
              <Card key={i} style={{padding:"14px 16px"}}><div style={{color:C.textMuted,fontSize:11,marginBottom:6}}>{k.l}</div><div style={{color:k.c,fontSize:18,fontWeight:700}}>{k.v}</div></Card>
            ))}
          </div>
          <Card style={{padding:"14px 20px",marginBottom:16,borderLeft:`4px solid ${saldoCol}`}}>
            <div style={{color:C.textMuted,fontSize:11,marginBottom:4}}>Сальдо (итоговый баланс)</div>
            <div style={{color:saldoCol,fontSize:22,fontWeight:700}}>{saldoTxt}</div>
          </Card>
          <Card style={{padding:"12px 16px",marginBottom:16}}>
            <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
              <span style={{color:C.textMuted,fontSize:12}}>Период:</span>
              {[{l:"Сегодня",f:()=>{setCardDateFrom(today);setCardDateTo(today);}},{l:"Неделя",f:()=>{const d=new Date();const from=new Date(d);from.setDate(d.getDate()-7);setCardDateFrom(from.toISOString().slice(0,10));setCardDateTo(today);}},{l:"Месяц",f:()=>{const d=new Date();const from=new Date(d);from.setMonth(d.getMonth()-1);setCardDateFrom(from.toISOString().slice(0,10));setCardDateTo(today);}},{l:"Всё",f:()=>{setCardDateFrom("");setCardDateTo(today);}}].map(b=><button key={b.l} onClick={b.f} style={{padding:"4px 10px",background:C.surface,border:`1px solid ${C.borderLight}`,color:C.textMuted,borderRadius:5,cursor:"pointer",fontSize:11,fontWeight:600}}>{b.l}</button>)}
              <input type="date" value={cardDateFrom} onChange={e=>setCardDateFrom(e.target.value)} style={{background:C.bg,border:`1px solid ${C.borderLight}`,color:C.text,borderRadius:5,padding:"5px 8px",fontSize:12,outline:"none",colorScheme:C.scheme}}/>
              <span style={{color:C.textMuted}}>—</span>
              <input type="date" value={cardDateTo}   onChange={e=>setCardDateTo(e.target.value)}   style={{background:C.bg,border:`1px solid ${C.borderLight}`,color:C.text,borderRadius:5,padding:"5px 8px",fontSize:12,outline:"none",colorScheme:C.scheme}}/>
              <button onClick={()=>loadCard(selected,cardDateFrom,cardDateTo)} style={{padding:"6px 18px",background:C.accent,border:"none",color:"#fff",borderRadius:6,cursor:"pointer",fontSize:13,fontWeight:600}}>Применить</button>
              {!card&&<button onClick={()=>loadCard(selected,cardDateFrom,cardDateTo)} style={{padding:"6px 18px",background:C.surface,border:`1px solid ${C.borderLight}`,color:C.text,borderRadius:6,cursor:"pointer",fontSize:13,fontWeight:600}}>📋 Загрузить карточку</button>}
            </div>
          </Card>
          {cardLoading&&<div style={{padding:32,textAlign:"center",color:C.textMuted}}>Загрузка...</div>}
          {!cardLoading&&card&&(
            <div>
              {allOps.length===0
                ?<div style={{padding:32,textAlign:"center",color:C.textMuted}}>Нет операций за выбранный период</div>
                :<Card style={{overflow:"hidden"}}>
                  <div className="ct-wrap"><table className="ct" style={{width:"100%"}}>
                    <thead><tr>
                      <th style={{...thC,width:80}}>Дата</th><th style={{...thC,width:90}}>Тип</th><th style={{...thC,width:110}}>Номер</th>
                      <th style={thC}>Содержание</th><th style={{...thC,...sepBorder}}>Примечание</th>
                      <th style={{...thR,width:130}}>Дебет (нам)</th><th style={{...thR,width:130}}>Кредит (от нас)</th>
                      <th style={{...thR,width:130}}>Баланс</th><th style={{...thC,width:90}}></th>
                    </tr></thead>
                    <tbody>
                      {card.balance_open!=null&&(<tr style={{background:C.tealDim,borderBottom:`1px solid ${C.border}`}}>
                        <td colSpan={5} style={{...tdC,fontWeight:600,fontSize:11,color:C.tealText,...sepBorder}}>Баланс на начало периода ({cardDateFrom||"—"})</td>
                        <td style={tdR}></td><td style={tdR}></td>
                        <td style={{...tdR,fontWeight:700,color:card.balance_open>0?C.greenText:card.balance_open<0?C.redText:C.greenText}}>
                          {card.balance_open>0?fmtA(card.balance_open):card.balance_open<0?"-"+fmtA(Math.abs(card.balance_open)):"0"} {cur}
                        </td>
                        <td style={tdC}></td>
                      </tr>)}
                      {rows}
                      <tr style={{background:C.surface,borderTop:`2px solid ${C.border}`}}>
                        <td colSpan={5} style={{...tdC,fontWeight:700,textAlign:"right",color:C.textMuted,fontSize:11,...sepBorder}}>ИТОГО:</td>
                        <td style={tdR}></td><td style={tdR}></td>
                        <td style={{...tdR,fontWeight:700,fontSize:14,color:finalCol}}>{finalTxt}</td>
                        <td style={tdC}></td>
                      </tr>
                    </tbody>
                  </table></div>
                </Card>
              }
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{display:"flex",justifyContent:"center",padding:"28px 24px"}}>
      <div style={{width:"100%",maxWidth:900}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14,paddingBottom:16,borderBottom:`1px solid ${C.border}`}}>
          <h1 style={{color:C.text,fontSize:20,fontWeight:700,margin:0}}>Взаиморасчёты</h1>
          <div style={{marginLeft:"auto",display:"flex",gap:8}}>
            <button onClick={()=>onNav&&onNav("debtors_report")}   style={{padding:"5px 14px",background:"#1A2D3D",border:`1px solid ${C.accentText}`,color:C.accentText,borderRadius:6,cursor:"pointer",fontSize:12,fontWeight:600}}>📋 Дебиторы</button>
            <button onClick={()=>onNav&&onNav("creditors_report")} style={{padding:"5px 14px",background:"#3D1A1A",border:`1px solid ${C.redText}`,color:C.redText,borderRadius:6,cursor:"pointer",fontSize:12,fontWeight:600}}>📋 Кредиторы</button>
          </div>
        </div>
        <Card style={{padding:"12px 16px",marginBottom:14}}>
          <div style={{display:"flex",gap:10,alignItems:"flex-end",flexWrap:"wrap"}}>
            <div><div style={{color:C.textMuted,fontSize:10,textTransform:"uppercase",marginBottom:3}}>Период от</div><input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={{...inpStyle,width:"100%"}}/></div>
            <div><div style={{color:C.textMuted,fontSize:10,textTransform:"uppercase",marginBottom:3}}>Баланс на дату</div><input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} style={{...inpStyle,width:"100%"}}/></div>
            <div><div style={{color:C.textMuted,fontSize:10,textTransform:"uppercase",marginBottom:3}}>Категория</div>
              <select value={filterCat} onChange={e=>setFilterCat(e.target.value)} style={{...selStyle,width:"100%"}}>
                <option value="">Все категории</option>
                {(cpCategories||[]).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div><div style={{color:C.textMuted,fontSize:10,textTransform:"uppercase",marginBottom:3}}>Контрагент</div>
              <SearchSelect value={filterCp} onChange={v=>setFilterCp(v)} options={[{value:"",label:"Все контрагенты"},...(counterparties||[]).filter(c=>c.active||c.is_active).map(c=>({value:String(c.id),label:c.name}))]} placeholder="Поиск контрагента..."/>
            </div>
            <div><div style={{marginBottom:4,fontSize:10}}>&nbsp;</div><button onClick={loadBalance} style={{padding:"5px 14px",background:C.accent,border:"none",color:"#fff",borderRadius:6,cursor:"pointer",fontSize:12,fontWeight:600,whiteSpace:"nowrap"}}>Применить</button></div>
          </div>
        </Card>
        <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap"}}>
          {[{l:"Дебиторка (нам должны)",v:fmt(Math.round(totalDebt))+" ₽",c:C.yellowText},{l:"Авансы покупателей",v:fmt(Math.round(totalAdvance))+" ₽",c:C.greenText},{l:"Чистое сальдо",v:(netSaldo>=0?"+":"")+fmt(Math.round(netSaldo))+" ₽",c:netSaldo>=0?C.greenText:C.redText},{l:"Кредиторка (мы должны)",v:fmt(Math.round(totalCredit))+" ₽",c:C.redText}].map((k,i)=>(
            <Card key={i} style={{padding:"8px 14px",borderLeft:`3px solid ${k.c}`,display:"inline-block",minWidth:0}}>
              <div style={{color:C.textMuted,fontSize:10,textTransform:"uppercase",letterSpacing:"0.04em",marginBottom:2,whiteSpace:"nowrap"}}>{k.l}</div>
              <div style={{color:k.c,fontSize:15,fontWeight:700,fontFamily:"monospace",whiteSpace:"nowrap"}}>{k.v}</div>
            </Card>
          ))}
        </div>
        <div style={{display:"flex",gap:8,marginBottom:12,alignItems:"center"}}>
          <div style={{display:"flex",border:`1px solid ${C.borderLight}`,borderRadius:6,overflow:"hidden"}}>
            {[{id:"all",l:"Все"},{id:"debtors",l:"Должники"},{id:"creditors",l:"Кредиторы"}].map(f=>(
              <button key={f.id} onClick={()=>setFilter(f.id)} style={{padding:"6px 14px",border:"none",cursor:"pointer",fontSize:12,fontWeight:600,background:filter===f.id?C.accent:C.surface,color:filter===f.id?"#fff":C.textMuted,fontFamily:"inherit"}}>{f.l}</button>
            ))}
            <div style={{display:"flex",alignItems:"center",gap:8,marginLeft:8,cursor:"pointer"}} onClick={()=>setHideZero(v=>!v)}>
              <div style={{width:32,height:18,borderRadius:9,background:hideZero?C.accent:C.border,position:"relative",transition:"background 0.2s",flexShrink:0}}>
                <div style={{width:14,height:14,borderRadius:"50%",background:"#fff",position:"absolute",top:2,left:hideZero?16:2,transition:"left 0.2s"}}/>
              </div>
              <span style={{color:C.textMuted,fontSize:12,whiteSpace:"nowrap"}}>Скрыть нулевые</span>
            </div>
          </div>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Поиск по имени..." style={{background:C.surface,border:`1px solid ${C.border}`,color:C.text,borderRadius:6,padding:"6px 12px",fontSize:13,width:220,outline:"none"}}/>
        </div>
        <Card>
          {loading?<div style={{padding:32,textAlign:"center",color:C.textMuted}}>Загрузка...</div>
            :<div className="ct-wrap"><table className="ct">
              <thead><tr><th>Контрагент</th><th>Категория</th><th className="r">Сальдо</th><th style={{width:80}}></th></tr></thead>
              <tbody>
                {filtered.length===0&&<tr><td colSpan={4} style={{padding:32,textAlign:"center",color:C.textDim}}>Нет данных</td></tr>}
                {filtered.map(c=>(
                  <tr key={c.id} onDoubleClick={()=>openHistory(c)} style={{cursor:"pointer"}}>
                    <td style={{fontWeight:500}}>{c.name}</td>
                    <td><span style={{color:C.accentText,background:C.accentDim,padding:"2px 8px",borderRadius:10,fontSize:11}}>{c.category_name||"—"}</span></td>
                    <td className="r">{(()=>{const saldo=Number(c.saldo)||0;const cur2=c.currency_code==="RUB"?"₽":c.currency_code||"₽";return<span style={{fontWeight:700,fontFamily:"monospace",fontSize:12,color:saldo>0?C.greenText:saldo<0?C.redText:C.textDim}}>{saldo>0?fmt(Math.round(saldo))+" "+cur2:saldo<0?"-"+fmt(Math.round(Math.abs(saldo)))+" "+cur2:"0"}</span>;})()}</td>
                    <td><button onClick={()=>openHistory(c)} style={{padding:"2px 8px",background:"transparent",border:`1px solid ${C.borderLight}`,color:C.textMuted,borderRadius:4,cursor:"pointer",fontSize:11}}>Открыть</button></td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          }
        </Card>
      </div>
    </div>
  );
}

export default Counterparties;

// v2
