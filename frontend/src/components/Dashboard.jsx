import { useState, useEffect } from "react";
import { C, fmt, api, Card, PageHeader, useIsMobile, styleKeyForUser } from "../utils/globals";

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
};

/* ════════════════════════════════════════════
   МОБИЛЬНЫЙ ДАШБОРД
   ════════════════════════════════════════════ */
function DashboardMobile({ data, from, to, setFrom, setTo, dateStr, onNav }) {
  const sales       = data.sales        || { total: 0, cnt: 0 };
  const cashSales   = data.cash_sales   || { total: 0, cnt: 0 };
  const creditSales = data.credit_sales || { total: 0, cnt: 0 };
  const writeOffs   = data.write_offs   || { total: 0, cnt: 0 };
  const acSum       = data.accounts_summary || { total: 0 };
  const commission  = data.commission_sales || { cash: { total:0, cnt:0 }, credit: { total:0, cnt:0 } };
  const commissionTotal = commission.cash.total + commission.credit.total;
  const profit      = (data.sales_excl_commission ?? sales.total) - (data.cost_total || 0);
  const margin      = (data.sales_excl_commission||0) > 0 ? Math.round(profit / data.sales_excl_commission * 100) : 0;

  const kpis = [
    { l: "Продажи",      v: fmt(Math.round(sales.total)) + " ₽", sub: sales.cnt + " накл.", c: C.greenText },
    {
      l: "Кредит / Наличные",
      v: fmt(Math.round(creditSales.total)) + " / " + fmt(Math.round(cashSales.total)) + " ₽",
      sub: creditSales.cnt + " кред. · " + cashSales.cnt + " нал.",
      c: C.yellowText,
    },
    { l: "Сумма списания", v: fmt(Math.round(writeOffs.total)) + " ₽", sub: writeOffs.cnt + " списаний", c: C.redText },
    { l: "Прибыль",        v: fmt(Math.round(profit)) + " ₽ · " + margin + "%", sub: "валовая прибыль", c: profit >= 0 ? C.greenText : C.redText },
  ];

  const dInp = {
    flex:1, padding:"7px 8px", background:C.bg, border:`1px solid ${C.borderLight}`,
    color:C.text, borderRadius:6, fontSize:12, outline:"none", fontFamily:"inherit",
  };

  return (
    <div style={{ padding: "12px 12px 48px" }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
        <div>
          <div style={{ fontWeight:700, fontSize:18, color:C.text, letterSpacing:"-0.3px" }}>Дашборд</div>
          <div style={{ fontSize:11, color:C.textMuted, marginTop:2 }}>{dateStr}</div>
        </div>
        <div style={{ display:"flex", gap:6 }}>
          <button onClick={() => onNav && onNav("debtors_report")}
            style={{ padding:"5px 10px", background:C.accentSoft, border:`1px solid ${C.accentText}`, color:C.accentText, borderRadius:6, cursor:"pointer", fontSize:11, fontWeight:600, fontFamily:"inherit" }}>
            Дебиторы
          </button>
          <button onClick={() => onNav && onNav("creditors_report")}
            style={{ padding:"5px 10px", background:C.redDim, border:`1px solid ${C.redText}`, color:C.redText, borderRadius:6, cursor:"pointer", fontSize:11, fontWeight:600, fontFamily:"inherit" }}>
            Кредиторы
          </button>
        </div>
      </div>

      <div style={{ display:"flex", gap:8, marginBottom:14 }}>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={dInp}/>
        <input type="date" value={to}   onChange={e => setTo(e.target.value)}   style={dInp}/>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:14 }}>
        {kpis.map((k, i) => (
          <div key={i} style={{
            background:C.surface, border:`1px solid ${C.border}`,
            borderTop:`3px solid ${k.c}`, borderRadius:10, padding:"11px 13px",
          }}>
            <div style={{ color:C.textMuted, fontSize:10, textTransform:"uppercase", letterSpacing:"0.04em", marginBottom:4 }}>{k.l}</div>
            <div style={{ color:k.c, fontSize:15, fontWeight:700, fontFamily:"monospace", marginBottom:2 }}>{k.v}</div>
            <div style={{ color:C.textDim, fontSize:11 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:1, background:C.border, borderRadius:10, overflow:"hidden", marginBottom:14 }}>
        <div style={{ background:C.surface, padding:"11px 13px" }}>
          <div style={{ color:C.textDim, fontSize:10, textTransform:"uppercase", letterSpacing:"0.04em", marginBottom:4 }}>Поступления</div>
          <div style={{ color:C.greenText, fontWeight:700, fontSize:16, fontFamily:"monospace" }}>{fmt(Math.round(data.payments_period?.incoming||0))} ₽</div>
          <div style={{ color:C.textDim, fontSize:10, marginTop:2 }}>за период</div>
        </div>
        <div style={{ background:C.surface, padding:"11px 13px" }}>
          <div style={{ color:C.textDim, fontSize:10, textTransform:"uppercase", letterSpacing:"0.04em", marginBottom:4 }}>Оплачено</div>
          <div style={{ color:C.redText, fontWeight:700, fontSize:16, fontFamily:"monospace" }}>{fmt(Math.round(data.payments_period?.outgoing||0))} ₽</div>
          <div style={{ color:C.textDim, fontSize:10, marginTop:2 }}>за период</div>
        </div>
      </div>

      {commissionTotal > 0 && (
        <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderTop:`3px solid ${C.purpleText||C.accentText}`, borderRadius:10, padding:"11px 13px", marginBottom:14 }}>
          <div style={{ color:C.textDim, fontSize:10, textTransform:"uppercase", letterSpacing:"0.04em", marginBottom:4 }}>Продажи Комиссия</div>
          <div style={{ color:C.accentText, fontSize:15, fontWeight:700, fontFamily:"monospace", marginBottom:2 }}>{fmt(Math.round(commissionTotal))} ₽</div>
          <div style={{ color:C.textDim, fontSize:11 }}>Кредит: {fmt(Math.round(commission.credit.total))} ₽ ({commission.credit.cnt}) · Наличные: {fmt(Math.round(commission.cash.total))} ₽ ({commission.cash.cnt})</div>
        </div>
      )}

      <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:10, overflow:"hidden" }}>
        <div style={{ padding:"11px 14px", borderBottom:`1px solid ${C.border}`, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <span style={{ fontWeight:600, fontSize:13, color:C.text }}>Денежные средства</span>
          {(data.accounts||[]).length > 1 && (
            <span style={{ fontFamily:"monospace", fontWeight:700, fontSize:14, color:acSum.total>=0?C.greenText:C.redText }}>{fmt(Math.round(acSum.total))} ₽</span>
          )}
        </div>
        {(data.accounts||[]).length === 0
          ? <div style={{ padding:"20px 14px", color:C.textDim, fontSize:12, textAlign:"center" }}>Счета не найдены</div>
          : (data.accounts||[]).map((a, i, arr) => (
            <div key={a.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"11px 14px", borderBottom:i<arr.length-1?`1px solid ${C.border}`:"none" }}>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <div style={{ width:8, height:8, borderRadius:"50%", flexShrink:0, background:a.type==="bank"?C.accentText:C.greenText }}/>
                <div>
                  <div style={{ color:C.text, fontSize:14, fontWeight:500 }}>{a.name}</div>
                  <div style={{ color:C.textDim, fontSize:10, marginTop:1 }}>{a.type==="bank"?"Расч. счёт":"Касса"}{a.currency_code?" · "+a.currency_code:""}</div>
                </div>
              </div>
              <div style={{ color:a.balance>0?C.greenText:a.balance<0?C.redText:C.textMuted, fontWeight:700, fontSize:15, fontFamily:"monospace" }}>
                {a.balance<0?"−":""}{fmt(Math.abs(Math.round(a.balance)))} ₽
              </div>
            </div>
          ))
        }
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════
   СОСТОЯНИЯ ЗАГРУЗКИ / ОШИБКИ
   ════════════════════════════════════════════ */
function LoadingState({ dateStr, isMobile }) {
  return (
    <div style={{ padding: isMobile ? "12px" : "28px 32px" }}>
      {isMobile && <div style={{ fontWeight:700, fontSize:18, color:C.text, marginBottom:4 }}>Дашборд</div>}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:260, color:C.textMuted, fontSize:14 }}>
        <div style={{ textAlign:"center" }}>
          <div style={{ width:32, height:32, border:`2px solid ${C.border}`, borderTop:`2px solid ${C.accent}`, borderRadius:"50%", animation:"spin 0.8s linear infinite", margin:"0 auto 12px" }}/>
          Загрузка данных...
        </div>
      </div>
    </div>
  );
}

function ErrorState({ dateStr, isMobile }) {
  return (
    <div style={{ padding: isMobile ? "12px" : "28px 32px" }}>
      {!isMobile && <PageHeader title="Дашборд" subtitle={`Сегодня, ${dateStr}`}/>}
      <Card style={{ padding:32, textAlign:"center", color:C.redText }}>Не удалось загрузить данные дашборда</Card>
    </div>
  );
}

/* ════════════════════════════════════════════
   ГЛАВНЫЙ КОМПОНЕНТ
   ════════════════════════════════════════════ */
function Dashboard({ onNav, refreshKey = 0 }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(todayStr());
  const [to,   setTo]   = useState(todayStr());

  const isMobile = useIsMobile();

  useEffect(() => {
    if (!from || !to) return;
    setLoading(true);
    api(`/dashboard?from=${from}&to=${to}`)
      .then(d  => { setData(d);   setLoading(false); })
      .catch(() => { setLoading(false); });
  }, [refreshKey, from, to]);

  const today      = new Date();
  const monthNames = ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];
  const dateStr    = `${today.getDate()} ${monthNames[today.getMonth()]} ${today.getFullYear()}`;

  if (loading)  return <LoadingState dateStr={dateStr} isMobile={isMobile}/>;
  if (!data)    return <ErrorState   dateStr={dateStr} isMobile={isMobile}/>;
  if (isMobile) return <DashboardMobile data={data} from={from} to={to} setFrom={setFrom} setTo={setTo} dateStr={dateStr} onNav={onNav}/>;

  /* ── Десктоп ── */
  const acSum       = data.accounts_summary || { bank_total:0, cash_total:0, total:0 };
  const sales       = data.sales            || { total:0, cnt:0 };
  const cashSales   = data.cash_sales       || { total:0, cnt:0 };
  const creditSales = data.credit_sales     || { total:0, cnt:0 };
  const writeOffs   = data.write_offs       || { total:0, cnt:0 };
  const commission  = data.commission_sales || { cash: { total:0, cnt:0 }, credit: { total:0, cnt:0 } };
  const commissionTotal = commission.cash.total + commission.credit.total;
  const profit      = (data.sales_excl_commission ?? sales.total) - (data.cost_total || 0);
  const margin      = (data.sales_excl_commission||0) > 0 ? Math.round(profit / data.sales_excl_commission * 100) : 0;

  const kpis = [
    { l:"Продажи", v:fmt(Math.round(sales.total)) + " ₽", sub:sales.cnt + " накладных", c:C.greenText },
    {
      l:"Кредит / Наличные",
      v:fmt(Math.round(creditSales.total)) + " / " + fmt(Math.round(cashSales.total)) + " ₽",
      sub:creditSales.cnt + " кред. · " + cashSales.cnt + " нал.",
      c:C.yellowText,
    },
    { l:"Сумма списания", v:fmt(Math.round(writeOffs.total)) + " ₽", sub:writeOffs.cnt + " списаний", c:C.redText },
    { l:"Прибыль",        v:fmt(Math.round(profit)) + " ₽ · " + margin + "%", sub:"валовая прибыль", c:profit >= 0 ? C.greenText : C.redText },
  ];

  const dInp = {
    padding:"6px 10px", background:C.bg, border:`1px solid ${C.borderLight}`,
    color:C.text, borderRadius:6, fontSize:12, outline:"none", fontFamily:"inherit",
  };

  /* ── Раскладка сводки зависит от стиля оформления (логика и данные общие) ── */
  const uiStyle = styleKeyForUser();
  if (uiStyle === "b") {
  /* ── Вариант B: плотная «рабочая» сводка ── */
  const shift = days => { const d = new Date(); d.setDate(d.getDate() - days); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
  const presets = [ { l:"Сегодня", f:todayStr() }, { l:"Неделя", f:shift(6) }, { l:"Месяц", f:shift(29) } ];
  const mono = { fontFamily:"monospace", fontWeight:700 };
  const cells = [
    { l:"Выручка",     v:sales.total,       s:`${sales.cnt} накл.`,          c:C.text },
    { l:"В кредит",    v:creditSales.total, s:`${creditSales.cnt} накл.`,    c:C.yellowText },
    { l:"Наличными",   v:cashSales.total,   s:`${cashSales.cnt} накл.`,      c:C.greenText },
    { l:"Валовая прибыль", v:profit,        s:`маржа ${margin}%`,            c:profit>=0?C.greenText:C.redText },
    { l:"Списания",    v:writeOffs.total,   s:`${writeOffs.cnt} док.`,       c:writeOffs.total?C.redText:C.textMuted },
  ];
  const tiles = [
    { id:"new_sale",  l:"Новая продажа",  k:"F2", primary:true },
    { id:"new_purchase", l:"Новый приход",   k:"F3" },
    { id:"payments",      l:"Платёж",         k:"F4" },
    { id:"stock",         l:"Остатки товара", k:"" },
    { id:"returns",       l:"Возврат",        k:"" },
    { id:"write_offs",    l:"Списание",       k:"" },
  ];
  const accs = data.accounts || [];
  const head = { padding:"8px 12px", borderBottom:`1px solid ${C.border}`, color:C.text, fontWeight:700, fontSize:12.5, display:"flex", justifyContent:"space-between", alignItems:"center", background:C.thBg };

  return (
    <div style={{ padding:"14px 16px 40px" }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
        <h1 style={{ color:C.text, margin:0, marginRight:8 }}>Сводка</h1>
        <span style={{ color:C.textMuted, fontSize:12 }}>{dateStr}</span>
        <div style={{ marginLeft:"auto", display:"flex", gap:4 }}>
          {presets.map(p => { const on = from===p.f && to===todayStr();
            return <button key={p.l} onClick={() => { setFrom(p.f); setTo(todayStr()); }} style={{ padding:"5px 10px", fontSize:12, fontWeight:600, cursor:"pointer", border:`1px solid ${on?C.accent:C.borderLight}`, background:on?C.accent:C.surface, color:on?"#fff":C.text }}>{p.l}</button>; })}
        </div>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={dInp}/>
        <span style={{ color:C.textDim }}>—</span>
        <input type="date" value={to} onChange={e => setTo(e.target.value)} style={dInp}/>
      </div>

      {/* KPI одной полосой */}
      <Card style={{ display:"grid", gridTemplateColumns:"repeat(5, minmax(0,1fr))", marginBottom:12, overflow:"hidden" }}>
        {cells.map((k, i) => (
          <div key={i} style={{ padding:"10px 14px", borderLeft:i?`1px solid ${C.border}`:"none" }}>
            <div style={{ color:C.textMuted, fontSize:11, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.04em" }}>{k.l}</div>
            <div style={{ ...mono, color:k.c, fontSize:20, marginTop:4 }}>{fmt(Math.round(k.v))} ₽</div>
            <div style={{ color:C.textDim, fontSize:11.5, marginTop:2 }}>{k.s}</div>
          </div>
        ))}
      </Card>

      <div style={{ display:"grid", gridTemplateColumns:"minmax(0,1fr) minmax(0,1.25fr) minmax(0,1fr)", gap:12, alignItems:"start" }}>
        {/* Быстрые действия */}
        <Card>
          <div style={head}><span>Быстрые действия</span><span style={{ color:C.textDim, fontWeight:500, fontSize:11 }}>Ctrl+K — поиск</span></div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, padding:10 }}>
            {tiles.map(t => (
              <button key={t.id} onClick={() => onNav && onNav(t.id)}
                style={{ height:62, display:"flex", flexDirection:"column", justifyContent:"space-between", alignItems:"flex-start", padding:"8px 10px", cursor:"pointer", textAlign:"left",
                  background:t.primary?C.accent:C.surface, color:t.primary?"#fff":C.text, border:t.primary?"none":`1px solid ${C.borderLight}`, fontSize:13.5, fontWeight:650 }}>
                <span>+ {t.l}</span>
                {t.k ? <span style={{ fontSize:10.5, fontWeight:700, padding:"0 5px", border:`1px solid ${t.primary?"rgba(255,255,255,.5)":C.borderLight}`, borderRadius:3, color:t.primary?"#fff":C.textMuted }}>{t.k}</span> : <span/>}
              </button>
            ))}
          </div>
        </Card>

        {/* Деньги — компактная таблица */}
        <Card style={{ overflow:"hidden" }}>
          <div style={head}><span>Денежные средства</span><span style={{ ...mono, color:acSum.total>=0?C.greenText:C.redText }}>{fmt(Math.round(acSum.total))} ₽</span></div>
          <table style={{ width:"100%" }}>
            <thead><tr><th style={{ textAlign:"left", position:"static" }}>Счёт / касса</th><th style={{ textAlign:"left", position:"static" }}>Тип</th><th style={{ textAlign:"right", position:"static" }}>Остаток</th></tr></thead>
            <tbody>
              {accs.map(a => (
                <tr key={a.id}>
                  <td>{a.name}</td>
                  <td style={{ color:C.textMuted }}>{a.type==="bank"?"Банк":"Касса"} · {a.currency_code||"RUB"}</td>
                  <td style={{ ...mono, textAlign:"right", color:a.balance<0?C.redText:C.text }}>{a.balance<0?"−":""}{fmt(Math.abs(Math.round(a.balance)))} ₽</td>
                </tr>
              ))}
              <tr><td style={{ color:C.greenText, fontWeight:600 }}>↓ Поступило за период</td><td/><td style={{ ...mono, textAlign:"right", color:C.greenText }}>{fmt(Math.round(data.payments_period?.incoming||0))} ₽</td></tr>
              <tr><td style={{ color:C.redText, fontWeight:600 }}>↑ Оплачено за период</td><td/><td style={{ ...mono, textAlign:"right", color:C.redText }}>{fmt(Math.round(data.payments_period?.outgoing||0))} ₽</td></tr>
            </tbody>
          </table>
        </Card>

        {/* Взаиморасчёты */}
        <Card>
          <div style={head}><span>Взаиморасчёты</span></div>
          <div style={{ padding:10, display:"flex", flexDirection:"column", gap:8 }}>
            <button onClick={() => onNav && onNav("debtors_report")} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px", cursor:"pointer", background:C.greenDim, border:`1px solid ${C.border}`, color:C.greenText, fontWeight:700, fontSize:13.5 }}>
              <span>Дебиторы <span style={{ fontWeight:500, color:C.textMuted, fontSize:12 }}>· нам должны</span></span><span>→</span>
            </button>
            <button onClick={() => onNav && onNav("creditors_report")} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px", cursor:"pointer", background:C.redDim, border:`1px solid ${C.border}`, color:C.redText, fontWeight:700, fontSize:13.5 }}>
              <span>Кредиторы <span style={{ fontWeight:500, color:C.textMuted, fontSize:12 }}>· мы должны</span></span><span>→</span>
            </button>
            <button onClick={() => onNav && onNav("sales_report")} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px", cursor:"pointer", background:C.surface, border:`1px solid ${C.borderLight}`, color:C.text, fontWeight:700, fontSize:13.5 }}>
              <span>Отчёт продаж</span><span>→</span>
            </button>
            {commissionTotal > 0 && <div style={{ padding:"8px 4px", fontSize:12, color:C.textMuted }}>Комиссия: <b style={{ color:C.accentText }}>{fmt(Math.round(commissionTotal))} ₽</b></div>}
          </div>
        </Card>
      </div>
    </div>
  );
  }
  if (uiStyle === "a" || uiStyle === "c") {
  /* ── Период: быстрые кнопки ── */
  const shift = days => { const d = new Date(); d.setDate(d.getDate() - days); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
  const presets = [
    { l:"Сегодня", f:todayStr() },
    { l:"7 дней",  f:shift(6) },
    { l:"30 дней", f:shift(29) },
  ];
  const ico = (d, col) => (
    <div style={{ width:38, height:38, borderRadius:11, background:col.bg, color:col.fg, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d={d}/></svg>
    </div>
  );
  const cards = [
    { l:"Выручка", v:fmt(Math.round(sales.total))+" ₽", sub:sales.cnt+" накладных за период", i:"M3 17l6-6 4 4 8-8M14 7h7v7", col:{bg:C.accentDim, fg:C.accentText} },
    { l:"В кредит / наличными", v:fmt(Math.round(creditSales.total))+" ₽", v2:fmt(Math.round(cashSales.total))+" ₽", sub:creditSales.cnt+" в кредит · "+cashSales.cnt+" за наличные", i:"M2 7h20v12H2zM2 11h20", col:{bg:C.yellowDim, fg:C.yellowText} },
    { l:"Валовая прибыль", v:fmt(Math.round(profit))+" ₽", badge:margin+"%", sub:"маржа от продаж", i:"M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6", col:{bg:C.greenDim, fg:C.greenText} },
    { l:"Списания", v:fmt(Math.round(writeOffs.total))+" ₽", sub:writeOffs.cnt+" документов", i:"M3 6h18M19 6l-1 14H6L5 6M10 11v6M14 11v6", col:{bg:C.redDim, fg:C.redText} },
  ];
  const actions = [
    { l:"Новая продажа",  s:"Расходная накладная · F2", id:"new_sale",  i:"M12 5v14M5 12h14", primary:true },
    { l:"Новый приход",   s:"Поступление товара · F3",  id:"new_purchase", i:"M12 3v12M7 10l5 5 5-5M4 21h16" },
    { l:"Платёж",         s:"Оплата / поступление · F4", id:"payments",     i:"M2 7h20v12H2zM2 11h20" },
    { l:"Остатки",        s:"Товар на складе",      id:"stock",        i:"M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5 9-5" },
    { l:"Дебиторы",       s:"Нам должны",           id:"debtors_report", i:"M7 17 17 7M7 7h10v10" },
    { l:"Кредиторы",      s:"Мы должны",            id:"creditors_report", i:"M17 7 7 17M17 17H7V7" },
  ];
  const accs = data.accounts || [];
  const maxAbs = Math.max(1, ...accs.map(a => Math.abs(a.balance||0)));

  return (
    <div style={{ padding:"28px 32px 48px", maxWidth:1320, margin:"0 auto" }}>
      {/* Шапка */}
      <div style={{ display:"flex", alignItems:"flex-end", gap:16, marginBottom:22, flexWrap:"wrap" }}>
        <div style={{ marginRight:"auto" }}>
          <div style={{ color:C.textMuted, fontSize:13, marginBottom:4 }}>{dateStr}</div>
          <h1 style={{ color:C.text, fontSize:26, fontWeight:700, margin:0 }}>Дашборд</h1>
        </div>
        <div style={{ display:"flex", background:C.surface, border:`1px solid ${C.border}`, borderRadius:C.radiusSm||8, padding:3, gap:2 }}>
          {presets.map(p => {
            const on = from === p.f && to === todayStr();
            return <button key={p.l} onClick={() => { setFrom(p.f); setTo(todayStr()); }}
              style={{ padding:"6px 12px", border:"none", background:on?C.accent:"transparent", color:on?"#fff":C.textMuted, fontSize:12.5, fontWeight:600, cursor:"pointer", borderRadius:7 }}>{p.l}</button>;
          })}
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={dInp}/>
          <span style={{ color:C.textDim }}>—</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} style={dInp}/>
        </div>
      </div>

      {/* KPI */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4, minmax(0,1fr))", gap:16, marginBottom:20 }}>
        {cards.map((k, i) => { const hk = i===0 && C.hero; return (
          <Card key={i} style={{ padding:"18px 20px", ...(hk?{ background:C.hero, border:"none", boxShadow:C.btnShadow }:{}) }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
              <div style={{ color:hk?"rgba(255,255,255,.85)":C.textMuted, fontSize:13, fontWeight:500 }}>{k.l}</div>
              {ico(k.i, hk?{bg:"rgba(255,255,255,.18)",fg:"#fff"}:k.col)}
            </div>
            <div style={{ display:"flex", alignItems:"baseline", gap:8 }}>
              <div style={{ color:hk?"#fff":C.text, fontSize:26, fontWeight:750, letterSpacing:"-0.03em", fontVariantNumeric:"tabular-nums" }}>{k.v}</div>
              {k.badge && <span style={{ background:C.greenDim, color:C.greenText, fontSize:12, fontWeight:700, padding:"2px 8px", borderRadius:20 }}>{k.badge}</span>}
            </div>
            {k.v2 && <div style={{ color:C.textMuted, fontSize:14, fontWeight:600, marginTop:2 }}>+ {k.v2} наличными</div>}
            <div style={{ color:hk?"rgba(255,255,255,.75)":C.textDim, fontSize:12, marginTop:k.v2?4:8 }}>{k.sub}</div>
          </Card>
        ); })}
      </div>

      {commissionTotal > 0 && (
        <Card style={{ padding:"14px 20px", marginBottom:20, display:"flex", alignItems:"center", gap:24 }}>
          <div style={{ color:C.text, fontWeight:600 }}>Продажи комиссия</div>
          <div style={{ color:C.accentText, fontWeight:700 }}>{fmt(Math.round(commissionTotal))} ₽</div>
          <div style={{ color:C.textMuted, fontSize:13 }}>кредит {fmt(Math.round(commission.credit.total))} ₽ · наличные {fmt(Math.round(commission.cash.total))} ₽</div>
        </Card>
      )}

      <div style={{ display:"grid", gridTemplateColumns:"minmax(0,1.6fr) minmax(0,1fr)", gap:20 }}>
        {/* Деньги */}
        <Card>
          <div style={{ padding:"18px 22px 6px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <div>
              <div style={{ color:C.text, fontWeight:650, fontSize:15 }}>Денежные средства</div>
              <div style={{ color:C.textMuted, fontSize:12.5, marginTop:2 }}>Остатки на счетах и в кассах</div>
            </div>
            <div style={{ textAlign:"right" }}>
              <div style={{ color:C.textDim, fontSize:11.5 }}>Всего</div>
              <div style={{ color:acSum.total>=0?C.text:C.redText, fontWeight:700, fontSize:22, letterSpacing:"-0.02em" }}>{fmt(Math.round(acSum.total))} ₽</div>
            </div>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, padding:"12px 22px" }}>
            <div style={{ background:C.greenDim, borderRadius:C.radiusSm||8, padding:"12px 14px" }}>
              <div style={{ color:C.greenText, fontSize:12, fontWeight:600 }}>↓ Поступило за период</div>
              <div style={{ color:C.text, fontSize:18, fontWeight:700, marginTop:4 }}>{fmt(Math.round(data.payments_period?.incoming||0))} ₽</div>
            </div>
            <div style={{ background:C.redDim, borderRadius:C.radiusSm||8, padding:"12px 14px" }}>
              <div style={{ color:C.redText, fontSize:12, fontWeight:600 }}>↑ Оплачено за период</div>
              <div style={{ color:C.text, fontSize:18, fontWeight:700, marginTop:4 }}>{fmt(Math.round(data.payments_period?.outgoing||0))} ₽</div>
            </div>
          </div>
          <div style={{ padding:"4px 22px 16px" }}>
            {accs.length === 0
              ? <div style={{ padding:16, color:C.textDim, fontSize:12, textAlign:"center" }}>Счета не найдены</div>
              : accs.map(a => (
                <div key={a.id} style={{ display:"flex", alignItems:"center", gap:14, padding:"11px 0", borderTop:`1px solid ${C.border}` }}>
                  <div style={{ width:34, height:34, borderRadius:10, background:a.type==="bank"?C.accentDim:C.greenDim, color:a.type==="bank"?C.accentText:C.greenText, display:"flex", alignItems:"center", justifyContent:"center", fontSize:15 }}>{a.type==="bank"?"🏦":"💵"}</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ color:C.text, fontSize:13.5, fontWeight:550 }}>{a.name}</div>
                    <div style={{ height:5, background:C.surfaceHover, borderRadius:4, marginTop:6, overflow:"hidden" }}>
                      <div style={{ width:`${Math.round(Math.abs(a.balance||0)/maxAbs*100)}%`, height:"100%", background:a.balance<0?C.red:(a.type==="bank"?C.accent:C.green), borderRadius:4 }}/>
                    </div>
                  </div>
                  <div style={{ color:a.balance<0?C.redText:C.text, fontWeight:700, fontSize:15, minWidth:120, textAlign:"right" }}>{a.balance<0?"−":""}{fmt(Math.abs(Math.round(a.balance)))} ₽</div>
                </div>
              ))}
          </div>
        </Card>

        {/* Быстрые действия */}
        <Card style={{ padding:"18px 18px 14px" }}>
          <div style={{ color:C.text, fontWeight:650, fontSize:15, padding:"0 4px 12px" }}>Быстрые действия</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            {actions.map(a => (
              <button key={a.id} onClick={() => onNav && onNav(a.id)}
                style={{ display:"flex", flexDirection:"column", alignItems:"flex-start", gap:8, padding:"14px", textAlign:"left", cursor:"pointer",
                  background:a.primary?C.accent:C.surface, color:a.primary?"#fff":C.text, border:a.primary?"none":`1px solid ${C.border}`,
                  boxShadow:a.primary?(C.btnShadow||"none"):"none", fontFamily:"inherit" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={a.primary?"#fff":C.accentText} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={a.i}/></svg>
                <span style={{ fontSize:13.5, fontWeight:650 }}>{a.l}</span>
                <span style={{ fontSize:11.5, opacity:a.primary?0.85:1, color:a.primary?"#fff":C.textMuted, marginTop:-4 }}>{a.s}</span>
              </button>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
  }

  /* ── Классический стиль ── */
  return (
    /* ── Центрирующая обёртка ── */
    <div style={{ display:"flex", justifyContent:"center", padding:"28px 24px" }}>
      <div style={{ width:"100%", maxWidth:520 }}>

        {/* Шапка */}
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:20, flexWrap:"wrap" }}>
          <h1 style={{ color:C.text, fontSize:20, fontWeight:700, margin:0, marginRight:4 }}>Дашборд</h1>
          <label style={{ color:C.textMuted, fontSize:11, marginLeft:6 }}>От</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={dInp}/>
          <label style={{ color:C.textMuted, fontSize:11 }}>До</label>
          <input type="date" value={to}   onChange={e => setTo(e.target.value)}   style={dInp}/>
          <div style={{ color:C.textMuted, fontSize:11, marginLeft:"auto" }}>{dateStr}</div>
        </div>

        {/* KPI карточки */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:16 }}>
          {kpis.map((k, i) => (
            <Card key={i} style={{
              padding:"14px 18px",
              borderTop:`3px solid ${k.c}`,
            }}>
              <div style={{ color:C.textMuted, fontSize:10, textTransform:"uppercase", letterSpacing:"0.04em", marginBottom:6 }}>{k.l}</div>
              <div style={{ color:k.c, fontSize:18, fontWeight:700, fontFamily:"monospace", marginBottom:3 }}>{k.v}</div>
              <div style={{ color:C.textDim, fontSize:11 }}>{k.sub}</div>
            </Card>
          ))}
        </div>

        {/* Продажи Комиссия */}
        {commissionTotal > 0 && (
          <Card style={{ marginBottom:16, borderTop:`3px solid ${C.purpleText||C.accentText}` }}>
            <div style={{ padding:"12px 16px", borderBottom:`1px solid ${C.border}`, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <span style={{ color:C.text, fontWeight:600, fontSize:13 }}>Продажи Комиссия</span>
              <span style={{ fontFamily:"monospace", fontWeight:700, fontSize:14, color:C.accentText }}>{fmt(Math.round(commissionTotal))} ₽</span>
            </div>
            <div style={{ display:"flex", gap:1, background:C.border }}>
              <div style={{ flex:1, background:C.surface, padding:"10px 16px" }}>
                <div style={{ color:C.textDim, fontSize:10, textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:3 }}>Кредит</div>
                <div style={{ color:C.yellowText, fontWeight:700, fontSize:15, fontFamily:"monospace" }}>{fmt(Math.round(commission.credit.total))} ₽</div>
                <div style={{ color:C.textDim, fontSize:11, marginTop:2 }}>{commission.credit.cnt} накл.</div>
              </div>
              <div style={{ flex:1, background:C.surface, padding:"10px 16px" }}>
                <div style={{ color:C.textDim, fontSize:10, textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:3 }}>Наличные</div>
                <div style={{ color:C.greenText, fontWeight:700, fontSize:15, fontFamily:"monospace" }}>{fmt(Math.round(commission.cash.total))} ₽</div>
                <div style={{ color:C.textDim, fontSize:11, marginTop:2 }}>{commission.cash.cnt} накл.</div>
              </div>
            </div>
          </Card>
        )}

        {/* Денежные средства */}
        <Card>
          <div style={{ padding:"12px 16px", borderBottom:`1px solid ${C.border}`, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <span style={{ color:C.text, fontWeight:600, fontSize:13 }}>Денежные средства</span>
            {(data.accounts||[]).length > 1 && (
              <span style={{ fontFamily:"monospace", fontWeight:700, fontSize:14, color:acSum.total>=0?C.greenText:C.redText }}>{fmt(Math.round(acSum.total))} ₽</span>
            )}
          </div>
          <div style={{ display:"flex", gap:1, background:C.border, marginBottom:1 }}>
            <div style={{ flex:1, background:C.surface, padding:"10px 16px" }}>
              <div style={{ color:C.textDim, fontSize:10, textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:3 }}>Поступления за период</div>
              <div style={{ color:C.greenText, fontWeight:700, fontSize:15, fontFamily:"monospace" }}>{fmt(Math.round(data.payments_period?.incoming||0))} ₽</div>
            </div>
            <div style={{ flex:1, background:C.surface, padding:"10px 16px" }}>
              <div style={{ color:C.textDim, fontSize:10, textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:3 }}>Оплачено за период</div>
              <div style={{ color:C.redText, fontWeight:700, fontSize:15, fontFamily:"monospace" }}>{fmt(Math.round(data.payments_period?.outgoing||0))} ₽</div>
            </div>
          </div>
          <div style={{ padding:"8px 0" }}>
            {(data.accounts||[]).length === 0
              ? <div style={{ padding:16, color:C.textDim, fontSize:12, textAlign:"center" }}>Счета не найдены</div>
              : (data.accounts||[]).map(a => (
                <div key={a.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 16px", borderBottom:`1px solid ${C.border}` }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <div style={{ width:6, height:6, borderRadius:"50%", background:a.type==="bank"?C.accentText:C.greenText, flexShrink:0 }}/>
                    <div>
                      <div style={{ color:C.text, fontSize:13, fontWeight:500 }}>{a.name}</div>
                      <div style={{ color:C.textDim, fontSize:10 }}>{a.type==="bank"?"Расч. счёт":"Касса"}{a.currency_code?" · "+a.currency_code:""}</div>
                    </div>
                  </div>
                  <div style={{ color:a.balance>0?C.greenText:a.balance<0?C.redText:C.textMuted, fontWeight:700, fontSize:14, fontFamily:"monospace" }}>
                    {a.balance>=0?"":"−"}{fmt(Math.abs(Math.round(a.balance)))} ₽
                  </div>
                </div>
              ))
            }
            {(data.accounts||[]).length > 1 && (
              <div style={{ display:"flex", justifyContent:"space-between", padding:"10px 16px", background:C.bg }}>
                <span style={{ color:C.textMuted, fontSize:12, fontWeight:600 }}>Итого</span>
                <span style={{ color:acSum.total>=0?C.greenText:C.redText, fontWeight:700, fontSize:14, fontFamily:"monospace" }}>{fmt(Math.round(acSum.total))} ₽</span>
              </div>
            )}
          </div>
        </Card>

      </div>
    </div>
  );
}

export default Dashboard;
