import { useState, useEffect } from "react";
import { C, fmt, api, Card, PageHeader, useIsMobile } from "../utils/globals";

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
