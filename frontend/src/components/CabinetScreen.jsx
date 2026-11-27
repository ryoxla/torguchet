import { useState, useEffect } from "react";
import { C, fmt, fmtDate, api, Card, Btn, useIsMobile, onAppearanceChange } from "../utils/globals";

/* ─── конфиг типов операций ─── */
const _mk_TYPE_CONFIG=()=>({
  sale:       { label: "Продажа",      color: C.accentText,  bg: C.accentText  + "22" },
  purchase:   { label: "Закупка",      color: C.tealText,    bg: C.tealText    + "22" },
  "pay-in":   { label: "Платёж вх.",   color: C.greenText,   bg: C.greenDim          },
  "pay-out":  { label: "Платёж исх.",  color: C.redText,     bg: C.redDim            },
  return:     { label: "Возврат",      color: C.yellowText,  bg: C.yellowDim         },
  overhead:   { label: "Накл. расход", color: C.purpleText||"#A78BFA", bg: (C.purpleDim||"#2D1F4E") },
});
let TYPE_CONFIG=_mk_TYPE_CONFIG(); onAppearanceChange(()=>{ TYPE_CONFIG=_mk_TYPE_CONFIG(); });

function typeKey(op) {
  if (op._type === "payment") return op.direction === "incoming" ? "pay-in" : "pay-out";
  return op._type;
}

function balColor(b) {
  return b > 0 ? C.greenText : b < 0 ? C.redText : C.textMuted;
}
function balText(b, cur) {
  if (b > 0)  return "+" + fmt(Math.round(b))  + " " + cur;
  if (b < 0)  return "−" + fmt(Math.round(-b)) + " " + cur;
  return "0";
}

/* ════════════════════════════════════════════
   МОБИЛЬНАЯ КАРТОЧКА одной операции
   ════════════════════════════════════════════ */
function OpCardMobile({ op, runBal, cur, fmtA, expanded, onToggle }) {
  const tk  = typeKey(op);
  const tc  = TYPE_CONFIG[tk] || { label: op._type, color: C.text, bg: C.border };
  const hasLines = (op.lines || []).length > 0;
  const canPrint = op._type === "sale" || op._type === "purchase";

  const handlePrint = () => {
    const lines = op.lines || [];
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${op.number}</title>
    <style>body{font-family:Arial,sans-serif;font-size:12px;padding:20px}
    h2{margin-bottom:4px}p{margin:2px 0}
    table{width:100%;border-collapse:collapse;margin-top:12px}
    th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}
    th{background:#f0f0f0;font-weight:600}.r{text-align:right}
    .total{font-weight:700;background:#f9f9f9}
    @media print{button{display:none}}</style></head><body>
    <h2>${op._type === "sale" ? "Расходная накладная" : "Приходная накладная"} №${op.number || ""}</h2>
    <p>Дата: ${fmtDate(op.date || op.created_at)}</p>
    <table><thead><tr><th>№</th><th>Товар</th><th class="r">Кол-во</th><th class="r">Цена</th><th class="r">Сумма</th></tr></thead>
    <tbody>${lines.map((l, i) => `<tr><td>${i + 1}</td><td>${l.product_name || ""}</td>
      <td class="r">${(parseFloat(l.qty) || 0).toLocaleString("ru-RU")}</td>
      <td class="r">${fmt(Number(l.price) || 0)}</td>
      <td class="r">${fmt(Number(l.amount) || 0)}</td></tr>`).join("")}
    <tr class="total"><td colspan="4" style="text-align:right">Итого:</td>
    <td class="r">${fmtA(op.total_amount)} ${cur}</td></tr>
    </tbody></table>
    <script>window.onload=()=>window.print()<\/script></body></html>`;
    const w = window.open("", "_blank");
    w.document.write(html);
    w.document.close();
  };

  /* дебет/кредит */
  let debLabel = null, kredLabel = null;
  if (op._deb  != null) debLabel  = "+" + fmtA(op._deb)  + " " + cur;
  if (op._kred != null) kredLabel = "−" + fmtA(op._kred) + " " + cur;

  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: 10, marginBottom: 7, overflow: "hidden"
    }}>
      {/* ── Основное тело ── */}
      <div
        onClick={hasLines ? onToggle : undefined}
        style={{ padding: "11px 13px", cursor: hasLines ? "pointer" : "default" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
          {/* Левая часть */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: "monospace", fontSize: 12, fontWeight: 600,
              color: tc.color, marginBottom: 3
            }}>
              {op.number || "—"}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span style={{
                fontSize: 10, fontWeight: 700, padding: "2px 8px",
                borderRadius: 8, color: tc.color, background: tc.bg
              }}>
                {tc.label}
              </span>
              <span style={{ fontSize: 11, color: C.textDim }}>
                {fmtDate(op.date || op.created_at)}
              </span>
            </div>
            {(op.note || op.warehouse_name) && (
              <div style={{
                fontSize: 11, color: C.textMuted, marginTop: 3,
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"
              }}>
                {op.note || op.warehouse_name}
              </div>
            )}
          </div>
          {/* Правая часть — суммы */}
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            {debLabel  && <div style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: C.accentText }}>{debLabel}</div>}
            {kredLabel && <div style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: C.redText }}>{kredLabel}</div>}
          </div>
        </div>
      </div>

      {/* ── Бегущий баланс ── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "7px 13px", background: C.bg, borderTop: `1px solid ${C.border}`
      }}>
        <span style={{ fontSize: 10, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.04em" }}>
          Баланс после операции
        </span>
        <span style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: balColor(runBal) }}>
          {balText(runBal, cur)}
        </span>
      </div>

      {/* ── Кнопки действий ── */}
      {(hasLines || canPrint) && (
        <div style={{
          display: "flex", gap: 6, padding: "8px 13px",
          borderTop: `1px solid ${C.border}`, background: C.surfaceHover || C.surface
        }}>
          {hasLines && (
            <button
              onClick={onToggle}
              style={{
                flex: 1, padding: "7px", background: "transparent",
                border: `1px solid ${C.accent}`, color: C.accentText,
                borderRadius: 7, cursor: "pointer", fontSize: 11, fontWeight: 600,
                fontFamily: "inherit"
              }}
            >
              {expanded ? "▲ Свернуть" : "▼ Детально"}
            </button>
          )}
          {canPrint && (
            <button
              onClick={handlePrint}
              style={{
                flex: 1, padding: "7px", background: "transparent",
                border: `1px solid ${C.borderLight}`, color: C.textMuted,
                borderRadius: 7, cursor: "pointer", fontSize: 11, fontWeight: 600,
                fontFamily: "inherit"
              }}
            >
              🖨 Печать
            </button>
          )}
        </div>
      )}

      {/* ── Детализация строк ── */}
      {expanded && hasLines && (
        <div style={{ borderTop: `1px solid ${C.border}` }}>
          {(op.lines || []).map((l, li) => {
            const extra = [l.grade_name, l.country_name, l.unit_short]
              .filter(v => v && v !== "—").join(", ");
            return (
              <div
                key={li}
                style={{
                  display: "flex", justifyContent: "space-between", alignItems: "flex-start",
                  padding: "8px 13px", gap: 8,
                  borderBottom: li < op.lines.length - 1 ? `1px solid ${C.border}` : "none",
                  background: C.surface + "60"
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: C.text, marginBottom: 2 }}>
                    {l.product_name || "—"}
                  </div>
                  {extra && (
                    <div style={{ fontSize: 10, color: C.textMuted }}>{extra}</div>
                  )}
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontFamily: "monospace", fontSize: 11, color: C.textMuted }}>
                    {(parseFloat(l.qty) || 0).toLocaleString("ru-RU")} × {fmtA(l.price)}
                  </div>
                  <div style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 600, color: C.accentText }}>
                    {fmtA(l.amount)} {cur}
                  </div>
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
   МОБИЛЬНЫЙ ЭКРАН
   ════════════════════════════════════════════ */
function CabinetMobile({ user, card, loading, dateFrom, dateTo, setDateFrom, setDateTo, onLoad, onLogout, cur, fmtA, currentBalance }) {
  const [expanded, setExpanded] = useState({});
  const today    = new Date().toISOString().slice(0, 10);

  const periods = [
    { l: "Сегодня", f: () => { setDateFrom(today); setDateTo(today); } },
    { l: "Неделя",  f: () => { const d = new Date(); d.setDate(d.getDate() - 7); setDateFrom(d.toISOString().slice(0, 10)); setDateTo(today); } },
    { l: "Месяц",   f: () => { const d = new Date(); d.setMonth(d.getMonth() - 1); setDateFrom(d.toISOString().slice(0, 10)); setDateTo(today); } },
    { l: "Год",     f: () => { setDateFrom(new Date().getFullYear()+'-01-01'); setDateTo(today); } },
    { l: "Всё",     f: () => { setDateFrom(""); setDateTo(today); } },
  ];

  const [activeP, setActiveP] = useState("Месяц"); // по умолчанию месяц

  /* строим список операций с бегущим балансом */
  const buildOps = () => {
    if (!card) return { ops: [], finalBal: 0 };
    const allOps = [
      ...(card.sales     || []).map(s => ({ ...s, _type: "sale" })),
      ...(card.purchases || []).map(s => ({ ...s, _type: "purchase" })),
      ...(card.payments  || []).map(p => ({ ...p, _type: "payment" })),
      ...(card.returns   || []).map(r => ({ ...r, _type: "return" })),
      ...(card.overheads || []).map(o => ({ ...o, number: o.doc_number, _type: "overhead",
        date: o.date || new Date().toISOString() })),
    ].sort((a, b) => new Date(a.date || a.created_at) - new Date(b.date || b.created_at));

    let runBal = card.balance_open != null ? Number(card.balance_open) : 0;
    const cpCurId = Number(user.currency_id) || 1;
    const cpRate  = Number(card.cp_rate) || 1;

    const ops = allOps.map(op => {
      let deb = null, kred = null;
      if (op._type === "sale") {
        kred = Number(op.total_amount) || 0; runBal -= kred;
      } else if (op._type === "purchase") {
        deb = Number(op.total_amount) || 0; runBal -= deb;
      } else if (op._type === "payment") {
        let amt = Number(op.amount) || 0;
        const pCurId = Number(op.currency_id) || 1;
        if (pCurId !== cpCurId) {
          const base = Number(op.amount_base) || amt;
          amt = cpCurId === 1 ? base : base / cpRate;
        }
        if (op.direction === "incoming") { deb = amt; runBal += deb; }
        else                             { kred = amt; runBal -= kred; }
      } else if (op._type === "return") {
        deb = Number(op.total_amount) || 0; runBal += deb;
      } else if (op._type === "overhead") {
        const rate = Number(op.currency_rate) || 1;
        const amtRub = Number(op.amount) || 0;
        deb = cpCurId === 1 ? amtRub : amtRub / rate;
        runBal -= deb;
      }
      return { ...op, _deb: deb, _kred: kred, _runBal: runBal };
    });

    return { ops, finalBal: runBal };
  };

  const { ops, finalBal } = buildOps();
  const toggleExpand = key => setExpanded(e => ({ ...e, [key]: !e[key] }));

  const inpStyle = {
    background: C.bg, border: `1px solid ${C.borderLight}`,
    color: C.text, borderRadius: 8, padding: "8px 10px",
    fontSize: 12, fontFamily: "inherit", outline: "none", colorScheme: "dark", width: "100%"
  };

  return (
    <div style={{ minHeight: "100dvh", background: C.bg }}>

      {/* ── Шапка ── */}
      <div style={{
        background: C.surface, borderBottom: `1px solid ${C.border}`,
        padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between",
        position: "sticky", top: 0, zIndex: 5
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 8,
            background: `linear-gradient(135deg,${C.accent},#1a56cc)`,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontSize: 16, fontWeight: 800, flexShrink: 0
          }}>Т</div>
          <div>
            <div style={{ color: C.text, fontWeight: 700, fontSize: 15 }}>Личный кабинет</div>
            <div style={{ color: C.textMuted, fontSize: 11, marginTop: 1 }}>{user.cp_name}</div>
          </div>
        </div>
        <button
          onClick={onLogout}
          style={{
            padding: "5px 12px", background: "transparent",
            border: `1px solid ${C.borderLight}`, color: C.textMuted,
            borderRadius: 6, cursor: "pointer", fontSize: 12, fontFamily: "inherit"
          }}
        >
          Выйти
        </button>
      </div>

      <div style={{ padding: "12px 12px 48px" }}>

        {/* ── Balance Hero — текущее сальдо, не зависит от фильтра ── */}
        <div style={{
          background: C.surface, border: `1px solid ${C.border}`,
          borderRadius: 12, padding: 16, marginBottom: 12, textAlign: "center"
        }}>
          <div style={{ color: C.textMuted, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
            Текущее сальдо
          </div>
          <div style={{ fontFamily: "monospace", fontSize: 28, fontWeight: 700,
            color: currentBalance != null ? balColor(currentBalance) : C.textMuted, marginBottom: 4 }}>
            {currentBalance != null ? balText(currentBalance, cur) : "—"}
          </div>
          <div style={{ fontSize: 11, color: C.textDim }}>на сегодня, все операции</div>
        </div>

        {/* ── Период — чипы ── */}
        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2, marginBottom: 10 }}>
          {periods.map(p => (
            <div
              key={p.l}
              onClick={() => { setActiveP(p.l); p.f(); setTimeout(onLoad, 0); }}
              style={{
                flexShrink: 0, padding: "6px 13px",
                background: activeP === p.l ? C.accent : C.surface,
                border: `1px solid ${activeP === p.l ? C.accent : C.border}`,
                borderRadius: 20, fontSize: 12, fontWeight: 600,
                cursor: "pointer", color: activeP === p.l ? "#fff" : C.textMuted,
                transition: "all 0.15s"
              }}
            >
              {p.l}
            </div>
          ))}
        </div>

        {/* ── Произвольный период ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr auto", gap: 6, alignItems: "center", marginBottom: 12 }}>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={inpStyle} />
          <span style={{ color: C.textMuted, fontSize: 13 }}>—</span>
          <input type="date" value={dateTo}   onChange={e => setDateTo(e.target.value)}   style={inpStyle} />
          <button
            onClick={onLoad}
            style={{
              padding: "9px 14px", background: C.accent, color: "#fff",
              border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700,
              cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap"
            }}
          >
            OK
          </button>
        </div>

        {/* ── Загрузка ── */}
        {loading && (
          <div style={{ padding: "40px 20px", textAlign: "center", color: C.textMuted, fontSize: 14 }}>
            Загрузка...
          </div>
        )}

        {/* ── Список операций ── */}
        {!loading && card && (<>
          {/* Баланс на начало */}
          {card.balance_open != null && (
            <div style={{
              background: C.tealDim, border: `1px solid ${C.teal}`,
              borderRadius: 8, padding: "10px 14px", marginBottom: 8,
              display: "flex", justifyContent: "space-between", alignItems: "center"
            }}>
              <span style={{ fontSize: 11, color: C.tealText }}>Баланс на начало периода</span>
              <span style={{ fontFamily: "monospace", fontSize: 14, fontWeight: 700, color: C.tealText }}>
                {balText(card.balance_open, cur)}
              </span>
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Операции</div>
            <div style={{ fontSize: 11, color: C.textMuted }}>{ops.length} записей</div>
          </div>

          {ops.length === 0 && (
            <div style={{ padding: "40px 20px", textAlign: "center", color: C.textDim, fontSize: 14 }}>
              Операций нет
            </div>
          )}

          {ops.map((op, idx) => {
            const expKey = op._type + (op.id || idx);
            return (
              <OpCardMobile
                key={expKey}
                op={op}
                runBal={op._runBal}
                cur={cur}
                fmtA={fmtA}
                expanded={!!expanded[expKey]}
                onToggle={() => toggleExpand(expKey)}
              />
            );
          })}

          {/* Итоговый баланс периода */}
          {ops.length > 0 && (
            <div style={{
              background: C.surface, border: `1px solid ${C.border}`,
              borderRadius: 10, padding: "12px 14px", marginTop: 4,
              display: "flex", justifyContent: "space-between", alignItems: "center"
            }}>
              <div>
                <div style={{ fontSize: 12, color: C.textDim }}>Баланс периода</div>
                <div style={{ fontSize: 10, color: C.dim || C.textDim, marginTop: 1 }}>
                  {dateFrom || "начало"} — {dateTo || "сегодня"}
                </div>
              </div>
              <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 16, color: balColor(card.balance_close ?? finalBal) }}>
                {balText(card.balance_close ?? finalBal, cur)}
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
function CabinetScreen({ user, onLogout }) {
  const [card,           setCard]           = useState(null);
  const [loading,        setLoading]        = useState(false);
  const [expanded,       setExpanded]       = useState({});
  const [currentBalance, setCurrentBalance] = useState(null); // сальдо независимо от фильтра

  const today = new Date().toISOString().slice(0, 10);
  // по умолчанию — месяц назад
  const monthAgo = (() => { const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 10); })();

  const [dateFrom, setDateFrom] = useState(monthAgo);
  const [dateTo,   setDateTo]   = useState(today);

  const isMobile = useIsMobile();

  const cur  = user.currency_code === "RUB" ? "₽" : user.currency_code || "₽";
  const fmtA = v => fmt(Math.round(Number(v) || 0));

  // Текущее сальдо — один раз при монтировании, без date_from
  useEffect(() => {
    api(`/counterparties/${user.counterparty_id}/card?date_to=${today}`)
      .then(d => setCurrentBalance(d.balance_close))
      .catch(() => {});
  }, []);

  // Баланс периода — по фильтру
  const loadCard = () => {
    setLoading(true);
    const p = new URLSearchParams();
    if (dateFrom) p.set("date_from", dateFrom);
    if (dateTo)   p.set("date_to",   dateTo);
    api(`/counterparties/${user.counterparty_id}/card?${p}`)
      .then(setCard)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadCard(); }, []);

  /* ── Мобильный рендер ── */
  if (isMobile) return (
    <CabinetMobile
      user={user}
      card={card}
      loading={loading}
      dateFrom={dateFrom}
      dateTo={dateTo}
      setDateFrom={setDateFrom}
      setDateTo={setDateTo}
      onLoad={loadCard}
      onLogout={onLogout}
      cur={cur}
      fmtA={fmtA}
      currentBalance={currentBalance}
    />
  );

  /* ── Десктопный рендер (оригинал без изменений) ── */
  const inp = {
    background: C.bg, border: `1px solid ${C.borderLight}`, color: C.text,
    borderRadius: 5, padding: "5px 8px", fontSize: 12, outline: "none", colorScheme: "dark"
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg }}>
      {/* Шапка */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: `linear-gradient(135deg,${C.accent},#1a56cc)`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 18, fontWeight: 800 }}>Т</div>
          <div>
            <div style={{ color: C.text, fontWeight: 700, fontSize: 15 }}>Личный кабинет</div>
            <div style={{ color: C.textMuted, fontSize: 12 }}>{user.cp_name}</div>
          </div>
        </div>
        <button onClick={onLogout} style={{ padding: "6px 14px", background: "transparent", border: `1px solid ${C.borderLight}`, color: C.textMuted, borderRadius: 6, cursor: "pointer", fontSize: 13 }}>Выйти</button>
      </div>

      <div style={{ padding: "24px 32px", maxWidth: 1200, margin: "0 auto" }}>
        {/* Фильтры */}
        <Card style={{ padding: "12px 16px", marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ color: C.textMuted, fontSize: 12 }}>Период:</span>
            {[
              { l: "Сегодня", f: () => { setDateFrom(today); setDateTo(today); } },
              { l: "Неделя",  f: () => { const d = new Date(); const from = new Date(d); from.setDate(d.getDate() - 7); setDateFrom(from.toISOString().slice(0, 10)); setDateTo(today); } },
              { l: "Месяц",   f: () => { const d = new Date(); const from = new Date(d); from.setMonth(d.getMonth() - 1); setDateFrom(from.toISOString().slice(0, 10)); setDateTo(today); } },
              { l: "Год",     f: () => { setDateFrom(firstDay); setDateTo(today); } },
              { l: "Всё",     f: () => { setDateFrom(""); setDateTo(today); } },
            ].map(b => (
              <button key={b.l} onClick={b.f} style={{ padding: "4px 10px", background: C.surface, border: `1px solid ${C.borderLight}`, color: C.textMuted, borderRadius: 5, cursor: "pointer", fontSize: 11, fontWeight: 600 }}>{b.l}</button>
            ))}
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={inp} />
            <span style={{ color: C.textMuted }}>—</span>
            <input type="date" value={dateTo}   onChange={e => setDateTo(e.target.value)}   style={inp} />
            <button onClick={loadCard} style={{ padding: "6px 16px", background: C.accent, border: "none", color: "#fff", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Применить</button>
          </div>
        </Card>

        {loading && <div style={{ padding: 32, textAlign: "center", color: C.textMuted }}>Загрузка...</div>}

        {card && (() => {
          const allOps = [
            ...(card.sales     || []).map(s => ({ ...s, _type: "sale",     _date: new Date(s.date) })),
            ...(card.purchases || []).map(s => ({ ...s, _type: "purchase", _date: new Date(s.date) })),
            ...(card.payments  || []).map(p => ({ ...p, _type: "payment",  _date: new Date(p.date) })),
            ...(card.returns   || []).map(r => ({ ...r, _type: "return",   _date: new Date(r.date) })),
            ...(card.overheads || []).map(o => ({ ...o, number: o.doc_number, _type: "overhead", _date: o.date ? new Date(o.date) : new Date() })),
          ].sort((a, b) => a._date - b._date);

          let runBal = 0;
          const typeColors  = { sale: C.accentText, purchase: C.tealText, "payment-in": C.greenText, "payment-out": C.redText, return: C.yellowText, overhead: C.purpleText || "#A78BFA" };
          const typeLabels  = { sale: "Продажа", purchase: "Закупка", "payment-in": "Платёж вх.", "payment-out": "Платёж исх.", return: "Возврат", overhead: "Накл. расход" };
          const thC = { fontSize: 11, fontWeight: 600, padding: "8px 12px", borderBottom: `1px solid ${C.border}`, color: C.textMuted, background: C.surface };
          const thR = { ...thC, textAlign: "right" };
          const tdC = { padding: "8px 12px", fontSize: 13, borderBottom: `1px solid ${C.border}40`, color: C.text };
          const tdR = { ...tdC, textAlign: "right", fontFamily: "monospace" };
          const sepBorder = { borderRight: `2px solid ${C.border}` };

          const rows = [];
          allOps.forEach((op, idx) => {
            let tkey = op._type;
            if (op._type === "payment") tkey = op.direction === "incoming" ? "payment-in" : "payment-out";
            const col = typeColors[tkey] || C.text;
            const lbl = typeLabels[tkey] || "";
            let deb = null, kred = null;
            if (op._type === "sale")     { kred = Number(op.total_amount) || 0; runBal += kred; }
            else if (op._type === "purchase") { deb = Number(op.total_amount) || 0; runBal -= deb; }
            else if (op._type === "payment") {
              let amt = Number(op.amount) || 0;
              const cpCurId = Number(user.currency_id) || 1;
              const pCurId  = Number(op.currency_id) || 1;
              const cpRate  = Number(card.cp_rate) || 1;
              if (pCurId !== cpCurId) { const base = Number(op.amount_base) || amt; amt = cpCurId === 1 ? base : base / cpRate; }
              if (op.direction === "incoming") { deb = amt; runBal -= deb; }
              else { kred = amt; runBal += kred; }
            }
            else if (op._type === "return") { deb = Number(op.total_amount) || 0; runBal -= deb; }
            else if (op._type === "overhead") {
              const rate = Number(op.currency_rate) || 1;
              const amtRub = Number(op.amount) || 0;
              const cpCurId = Number(user.currency_id) || 1;
              deb = cpCurId === 1 ? amtRub : amtRub / rate;
              runBal -= deb;
            }
            const balCol = runBal > 0 ? C.greenText : runBal < 0 ? C.redText : C.textMuted;
            const balTxt = runBal > 0 ? fmtA(runBal) : runBal < 0 ? "-" + fmtA(Math.abs(runBal)) : "0";
            const hasLines = (op._type === "sale" || op._type === "purchase" || op._type === "return") && (op.lines || []).length > 0;
            const expKey = op._type + op.id;
            const isExp  = expanded[expKey];

            rows.push(
              <tr key={"op" + idx} style={{ background: C.bg }}>
                <td style={{ ...tdC, color: C.textMuted, fontSize: 12 }}>{fmtDate(op.date || op.created_at)}</td>
                <td style={tdC}><span style={{ color: col, background: col + "22", padding: "2px 7px", borderRadius: 8, fontSize: 11, fontWeight: 600 }}>{lbl}</span></td>
                <td style={{ ...tdC, fontFamily: "monospace", fontSize: 12, color: col }}>{op.number || "—"}</td>
                <td style={{ ...tdC, ...sepBorder, color: C.textMuted, fontSize: 12 }}>{op.note || op.warehouse_name || ""}</td>
                <td style={{ ...tdR, color: C.accentText, fontWeight: 700 }}>{deb  != null ? "+" + fmtA(deb)  + " " + cur : "—"}</td>
                <td style={{ ...tdR, color: C.redText,    fontWeight: 700 }}>{kred != null ? "-" + fmtA(kred) + " " + cur : "—"}</td>
                <td style={{ ...tdR, fontWeight: 700, color: balCol }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
                    <span>{balTxt + " " + cur}</span>
                    {hasLines && (
                      <button onClick={() => setExpanded(e => ({ ...e, [expKey]: !e[expKey] }))} style={{ padding: "2px 8px", background: "transparent", border: `1px solid ${C.borderLight}`, color: C.textMuted, borderRadius: 4, cursor: "pointer", fontSize: 11, whiteSpace: "nowrap" }}>
                        {isExp ? "▲ Свернуть" : "▼ Детально"}
                      </button>
                    )}
                    {(op._type === "sale" || op._type === "purchase") && (
                      <button onClick={() => {
                        const lines = op.lines || [];
                        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${op.number}</title>
                        <style>body{font-family:Arial,sans-serif;font-size:12px;padding:20px}h2{margin-bottom:4px}p{margin:2px 0}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}th{background:#f0f0f0;font-weight:600}.r{text-align:right}.total{font-weight:700;background:#f9f9f9}@media print{button{display:none}}</style></head><body>
                        <h2>${op._type === "sale" ? "Расходная накладная" : "Приходная накладная"} №${op.number || ""}</h2>
                        <p>Дата: ${fmtDate(op.date || op.created_at)}</p><p>Контрагент: ${user.cp_name}</p>
                        <table><thead><tr><th>№</th><th>Товар</th><th class="r">Кол-во</th><th class="r">Цена</th><th class="r">Сумма</th></tr></thead>
                        <tbody>${lines.map((l, i) => `<tr><td>${i + 1}</td><td>${l.product_name || ""}</td><td class="r">${(parseFloat(l.qty) || 0).toLocaleString("ru-RU")}</td><td class="r">${fmt(Number(l.price) || 0)}</td><td class="r">${fmt(Number(l.amount) || 0)}</td></tr>`).join("")}
                        <tr class="total"><td colspan="4" style="text-align:right">Итого:</td><td class="r">${fmtA(op.total_amount)} ${cur}</td></tr></tbody></table>
                        <script>window.onload=()=>window.print()<\/script></body></html>`;
                        const w = window.open("", "_blank"); w.document.write(html); w.document.close();
                      }} style={{ padding: "2px 8px", background: "transparent", border: `1px solid ${C.borderLight}`, color: C.textMuted, borderRadius: 4, cursor: "pointer", fontSize: 11, whiteSpace: "nowrap" }}>
                        🖨 Печать
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );

            if (isExp) {
              const tdSub  = { ...tdC, fontSize: 11, color: C.textMuted, background: C.surface + "60", paddingLeft: 20 };
              const tdSubR = { ...tdSub, textAlign: "right", fontFamily: "monospace" };
              (op.lines || []).forEach((l, li) => {
                const extra = [l.grade_name, l.country_name, l.unit_short].filter(v => v && v !== "—").join(", ");
                rows.push(
                  <tr key={"sub" + idx + "_" + li}>
                    <td style={tdSub}></td><td style={tdSub}></td><td style={tdSub}></td>
                    <td style={{ ...tdSub, ...sepBorder }}>{l.product_name || "—"}{extra ? ", " + extra : ""}</td>
                    <td style={tdSubR}>{(parseFloat(l.qty) || 0).toLocaleString("ru-RU")} × {fmtA(l.price)}</td>
                    <td style={{ ...tdSubR, color: C.textMuted }}>{fmtA(l.amount)} {cur}</td>
                    <td style={tdSub}></td>
                  </tr>
                );
              });
            }
          });

          const b        = card.balance_close != null ? card.balance_close : runBal;
          const balColor = b > 0 ? C.greenText : b < 0 ? C.redText : C.greenText;
          const balTxt   = b > 0 ? fmtA(b) + " " + cur : b < 0 ? "-" + fmtA(Math.abs(b)) + " " + cur : "0";

          return (
            <Card style={{ overflow: "hidden" }}>
              <div className="ct-wrap">
                <table className="ct" style={{ width: "100%" }}>
                  <thead>
                    <tr>
                      <th style={{ ...thC, width: 90 }}>Дата</th>
                      <th style={{ ...thC, width: 110 }}>Тип</th>
                      <th style={{ ...thC, width: 140 }}>Номер</th>
                      <th style={{ ...thC, ...sepBorder }}>Примечание</th>
                      <th style={{ ...thR, width: 140 }}>Дебет (нам)</th>
                      <th style={{ ...thR, width: 140 }}>Кредит (от нас)</th>
                      <th style={{ ...thR, width: 140 }}>Баланс</th>
                    </tr>
                  </thead>
                  <tbody>
                    {card.balance_open != null && (
                      <tr style={{ background: C.tealDim }}>
                        <td colSpan={4} style={{ ...tdC, ...sepBorder, color: C.tealText, fontWeight: 600, fontSize: 11 }}>
                          Баланс на начало периода ({dateFrom || "—"})
                        </td>
                        <td style={tdR}></td><td style={tdR}></td>
                        <td style={{ ...tdR, fontWeight: 700, color: card.balance_open > 0 ? C.greenText : card.balance_open < 0 ? C.redText : C.greenText }}>
                          {card.balance_open > 0 ? fmtA(card.balance_open) : card.balance_open < 0 ? "-" + fmtA(Math.abs(card.balance_open)) : "0"} {cur}
                        </td>
                      </tr>
                    )}
                    {rows}
                    <tr style={{ background: C.surface, borderTop: `2px solid ${C.border}` }}>
                      <td colSpan={4} style={{ ...tdC, fontWeight: 700, textAlign: "right", color: C.textMuted, fontSize: 11, ...sepBorder }}>ИТОГО:</td>
                      <td style={tdR}></td><td style={tdR}></td>
                      <td style={{ ...tdR, fontWeight: 700, fontSize: 15, color: balColor }}>{balTxt}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </Card>
          );
        })()}
      </div>
    </div>
  );
}

export default CabinetScreen;
