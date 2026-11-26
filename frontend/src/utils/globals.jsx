import { useState, useMemo, useRef, useEffect } from "react";


// ── ТЕМЫ ОФОРМЛЕНИЯ ──────────────────────────────────────────
const THEME_BASE={
  bg:"#0D1117",surface:"#161B22",surfaceHover:"#1C2128",
  border:"#21262D",borderLight:"#30363D",
  text:"#E6EDF3",textMuted:"#7D8590",textDim:"#484F58",
  accent:"#2F81F7",accentDim:"#1F4B8E",accentText:"#79C0FF",
  green:"#3FB950",greenDim:"#1A3D22",greenText:"#56D364",
  red:"#F85149",redDim:"#3D1A1A",redText:"#FF7B72",
  yellow:"#D29922",yellowDim:"#3D2E0A",yellowText:"#E3B341",
  purple:"#8B5CF6",purpleDim:"#2D1F4E",purpleText:"#A78BFA",
  teal:"#00B4D8",tealDim:"#003D4D",tealText:"#48CAE4",scheme:"dark",
  // Доп. оттенки для строк таблиц, плашек и кнопок-«мягких» (раньше были зашиты в компонентах под тёмную тему)
  accentSoft:"#1A2D3D",rowOpen:"#1a2030",rowSub:"#161e2e",rowSubHover:"#1e2535",
  infoSoft:"#1e3a5f",violetSoft:"#3a1e5f",greenSoft:"#1a3a2a",
  greenBright:"#4ade80",redBright:"#f87171",amberBright:"#fbbf24",blueBright:"#60a5fa",violetBright:"#c084fc",
  orange:"#f59e0b",orangeDim:"#3d2a00",borderStrong:"rgba(255,255,255,0.15)",
};

export const THEMES={
  dark:    { key:"dark",     label:"Тёмная",   colors: THEME_BASE },
  light:   { key:"light",    label:"Светлая",  colors: {
    bg:"#F4F6F8",surface:"#FFFFFF",surfaceHover:"#EEF1F4",
    border:"#E2E6EA",borderLight:"#CFD6DD",
    text:"#1A1F26",textMuted:"#5A6472",textDim:"#98A2B0",
    accent:"#2F81F7",accentDim:"#DBEAFE",accentText:"#1D4ED8",
    green:"#16A34A",greenDim:"#DCFCE7",greenText:"#15803D",
    red:"#DC2626",redDim:"#FEE2E2",redText:"#B91C1C",
    yellow:"#B45309",yellowDim:"#FEF3C7",yellowText:"#92400E",
    purple:"#7C3AED",purpleDim:"#EDE9FE",purpleText:"#6D28D9",
    teal:"#0891B2",tealDim:"#CFFAFE",tealText:"#0E7490",scheme:"light",
    accentSoft:"#DBEAFE",rowOpen:"#E3ECFA",rowSub:"#F3F6FB",rowSubHover:"#E8EEF7",
    infoSoft:"#DBEAFE",violetSoft:"#EDE9FE",greenSoft:"#DCFCE7",
    greenBright:"#15803D",redBright:"#B91C1C",amberBright:"#92400E",blueBright:"#1D4ED8",violetBright:"#6D28D9",
    orange:"#B45309",orangeDim:"#FEF3C7",borderStrong:"#CFD6DD",
  }},
  contrast:{ key:"contrast", label:"Контраст", colors: {
    bg:"#000000",surface:"#0D0D0D",surfaceHover:"#1A1A1A",
    border:"#3A3A3A",borderLight:"#555555",
    text:"#FFFFFF",textMuted:"#C8C8C8",textDim:"#8A8A8A",
    accent:"#4C9FFF",accentDim:"#0B3B7A",accentText:"#9ECBFF",
    green:"#4ADE80",greenDim:"#12351C",greenText:"#86EFAC",
    red:"#FF6B62",redDim:"#4A1414",redText:"#FF9B94",
    yellow:"#F0B429",yellowDim:"#4A3708",yellowText:"#FFD766",
    purple:"#A78BFA",purpleDim:"#3A2A66",purpleText:"#C4B5FD",
    teal:"#22D3EE",tealDim:"#0A4A5A",tealText:"#67E8F9",scheme:"dark",
    // Доп. оттенки для строк таблиц, плашек и кнопок-«мягких» (раньше были зашиты в компонентах под тёмную тему)
    accentSoft:"#1A2D3D",rowOpen:"#1a2030",rowSub:"#161e2e",rowSubHover:"#1e2535",
    infoSoft:"#1e3a5f",violetSoft:"#3a1e5f",greenSoft:"#1a3a2a",
    greenBright:"#4ade80",redBright:"#f87171",amberBright:"#fbbf24",blueBright:"#60a5fa",violetBright:"#c084fc",
    orange:"#f59e0b",orangeDim:"#3d2a00",borderStrong:"rgba(255,255,255,0.15)",
  }},
  emerald: { key:"emerald",  label:"Изумруд",  colors: { ...THEME_BASE, accent:"#10B981",accentDim:"#064E3B",accentText:"#6EE7B7" }},
  indigo:  { key:"indigo",   label:"Индиго",   colors: { ...THEME_BASE, accent:"#6366F1",accentDim:"#312E81",accentText:"#A5B4FC" }},
};

export function themeKeyForUser(){
  try{
    const u=JSON.parse(sessionStorage.getItem("trade_user")||"null");
    const k=localStorage.getItem("trade_theme_"+(u?.id||"anon"));
    return (k&&THEMES[k])?k:"dark";
  }catch(e){ return "dark"; }
}

// C — активная палитра. Вычисляется при загрузке модуля из сохранённого пресета пользователя.
export const C={ ...THEMES[themeKeyForUser()].colors };
try{ document.documentElement.style.colorScheme = C.scheme || "dark"; }catch(e){}
try{ const _r=document.documentElement.style; _r.setProperty("--app-text", C.text); _r.setProperty("--app-text-muted", C.textMuted); _r.setProperty("--app-border", C.borderLight); }catch(e){}

export function setTheme(key){
  if(!THEMES[key]) return;
  try{
    const u=JSON.parse(sessionStorage.getItem("trade_user")||"null");
    localStorage.setItem("trade_theme_"+(u?.id||"anon"), key);
  }catch(e){}
  window.location.reload(); // перечитываем C с новым пресетом
}

// Переключатель темы (иконка + поповер со свотчами). Для меню пользователя в шапке.
export function ThemeMenu(){
  const [open,setOpen]=useState(false);
  const ref=useRef(null);
  const cur=themeKeyForUser();
  useEffect(()=>{
    const h=e=>{ if(ref.current&&!ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown",h);
    return ()=>document.removeEventListener("mousedown",h);
  },[]);
  return(
    <div ref={ref} style={{position:"relative"}}>
      <button type="button" onClick={()=>setOpen(o=>!o)} title="Оформление"
        style={{background:"transparent",border:`1px solid ${C.borderLight}`,color:C.textMuted,borderRadius:5,padding:"4px 8px",cursor:"pointer",fontSize:13,lineHeight:1}}>🎨</button>
      {open&&(
        <div style={{position:"absolute",right:0,top:"calc(100% + 8px)",minWidth:190,background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,boxShadow:"0 8px 24px rgba(0,0,0,0.4)",zIndex:600,overflow:"hidden"}}>
          <div style={{padding:"7px 12px",fontSize:10,color:C.textDim,letterSpacing:"0.08em",borderBottom:`1px solid ${C.border}`}}>ОФОРМЛЕНИЕ</div>
          {Object.values(THEMES).map(t=>{
            const active=t.key===cur;
            return(
              <button key={t.key} type="button" onClick={()=>setTheme(t.key)}
                style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,padding:"8px 12px",background:active?C.accentDim:"transparent",border:"none",color:active?C.accentText:C.text,cursor:"pointer",fontSize:13,fontFamily:"inherit"}}
                onMouseEnter={e=>{ if(!active) e.currentTarget.style.background=C.surfaceHover; }}
                onMouseLeave={e=>{ if(!active) e.currentTarget.style.background="transparent"; }}>
                <span>{t.label}</span>
                <span style={{display:"flex",gap:3}}>
                  <span style={{width:13,height:13,borderRadius:3,background:t.colors.bg,border:`1px solid ${t.colors.borderLight}`}}/>
                  <span style={{width:13,height:13,borderRadius:3,background:t.colors.accent}}/>
                  <span style={{width:13,height:13,borderRadius:3,background:t.colors.surface,border:`1px solid ${t.colors.borderLight}`}}/>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
export const fmt=n=>new Intl.NumberFormat("ru-RU").format(n);
export const fmtQty=n=>{const v=parseFloat(n);if(isNaN(v))return"—";return Number.isInteger(v)?new Intl.NumberFormat("ru-RU").format(v):new Intl.NumberFormat("ru-RU",{minimumFractionDigits:0,maximumFractionDigits:3}).format(v);};
export const fmtDate=d=>{if(!d)return"—";const s=String(d).slice(0,10);const[y,m,dd]=s.split("-");return dd&&m&&y?`${dd}.${m}.${y}`:"—";};
export const uniq=(arr,key)=>[...new Set(arr.map(r=>r[key]))].sort();

// ─── ХУКИ ────────────────────────────────────────────────────────────────────
export function useIsMobile(breakpoint=768){
  const [isMobile,setIsMobile]=useState(()=>window.innerWidth<breakpoint);
  useEffect(()=>{
    const handler=()=>setIsMobile(window.innerWidth<breakpoint);
    window.addEventListener("resize",handler);
    return ()=>window.removeEventListener("resize",handler);
  },[breakpoint]);
  return isMobile;
}

// ─── СПРАВОЧНИКИ ─────────────────────────────────────────────────────────────
export const INIT_CATEGORIES=[];
export const ALL_GRADES=[];
export const INIT_UNITS=[];
export const INIT_COUNTRIES=[];
export const INIT_CURRENCIES=[];
export const INIT_ARTICLES=[];
export const INIT_ACCOUNTS=[];
export const INIT_WAREHOUSES=[];
export const INIT_ROLES=[];
export const INIT_USERS=[];

// ─── ДАННЫЕ ───────────────────────────────────────────────────────────────────
export const INVOICES=[];
export const PURCHASES=[];
export const PURCHASE_LINES=[
  {id:1,product:"Мука пшеничная в/с",unit:"кг",grade:"Высший",country:"Россия",qty:5000,price:50,vat:10,amount:275000},
  {id:2,product:"Сахар-песок ГОСТ",unit:"кг",grade:"1-й",country:"Беларусь",qty:2000,price:62,vat:10,amount:136400},
  {id:3,product:"Масло подсолн. рафин.",unit:"л",grade:"—",country:"Россия",qty:500,price:115,vat:20,amount:69000},
];
export const INVOICE_LINES=[
  {id:1,product:"Мука пшеничная в/с",batch:"Партия #2241",unit:"кг",grade:"Высший",country:"Россия",qty:2000,price:52,discount:0,vat:10,amount:114400},
  {id:2,product:"Сахар-песок ГОСТ",batch:"Партия #2198",unit:"кг",grade:"1-й",country:"Беларусь",qty:500,price:68,discount:5,vat:10,amount:32300},
  {id:3,product:"Масло подсолн. рафин.",batch:"Партия #2205",unit:"л",grade:"—",country:"Россия",qty:300,price:125,discount:0,vat:20,amount:45000},
];
// COUNTERPARTIES удалён — данные объединены в INIT_CP (см. ниже)

export const INIT_CP_CATEGORIES=[];
export const INIT_CP=[];
export const STOCK_DATA=[];
export const MOVEMENTS=[];
export const INIT_PRODUCTS=[];
export const STOCK_BY_PRODUCT={};
export const INIT_PAYMENTS=[];
export const TRANSFERS=[];




// ─── UI КОМПОНЕНТЫ ────────────────────────────────────────────────────────────
export const Card=({children,style})=><div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,...style}}>{children}</div>;
export const Btn=({children,primary,small,danger,onClick,disabled})=><button type="button" onClick={onClick} disabled={disabled} style={{padding:small?"5px 12px":"8px 16px",background:primary?C.accent:danger?C.redDim:"transparent",color:primary?"#fff":danger?C.redText:C.text,border:primary?"none":danger?`1px solid ${C.red}`:`1px solid ${C.borderLight}`,borderRadius:6,cursor:disabled?"not-allowed":"pointer",fontSize:small?12:13,fontWeight:600,whiteSpace:"nowrap",opacity:disabled?0.5:1}}>{children}</button>;
export const Lbl=({children,req})=><label style={{color:C.textMuted,fontSize:11,display:"block",marginBottom:5,textTransform:"uppercase",letterSpacing:"0.05em"}}>{children}{req&&<span style={{color:C.redText}}> *</span>}</label>;
export const Inp=({value,onChange,placeholder,type})=><input type={type||"text"} value={value||""} onChange={e=>onChange(e.target.value)} placeholder={placeholder} style={{width:"100%",background:C.bg,border:`1px solid ${C.borderLight}`,color:C.text,borderRadius:6,padding:"8px 12px",fontSize:13,outline:"none"}}/>;
export const Sel=({value,onChange,options,ph})=><select value={value||""} onChange={e=>onChange(e.target.value)} style={{width:"100%",background:C.bg,border:`1px solid ${C.borderLight}`,color:value?C.text:C.textMuted,borderRadius:6,padding:"8px 12px",fontSize:13,outline:"none"}}>{ph&&<option value="">{ph}</option>}{options.map(o=><option key={o.v||o} value={o.v||o}>{o.l||o}</option>)}</select>;
export const Toggle=({value,onChange,label})=><div style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer"}} onClick={()=>onChange(!value)}><div style={{width:38,height:21,borderRadius:11,background:value?C.green:C.border,position:"relative",transition:"background 0.2s"}}><div style={{width:17,height:17,borderRadius:"50%",background:"#fff",position:"absolute",top:2,left:value?19:2,transition:"left 0.2s"}}/></div><span style={{color:C.textMuted,fontSize:13}}>{label}</span></div>;

export function StatusBadge({status}){
  const m={
    draft:     {l:"Черновик",  c:C.textMuted,  b:C.border},
    posted:    {l:"Проведён",  c:C.greenText,  b:C.greenDim},
    planned:   {l:"Плановый", c:C.yellowText, b:C.yellowDim},
  };
  const s=m[status]||m.draft;
  return <span style={{background:s.b,color:s.c,padding:"2px 10px",borderRadius:20,fontSize:12,fontWeight:600,whiteSpace:"nowrap"}}>{s.l}</span>;
}

export function PageHeader({title,subtitle,actions}){
  return <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:24}}><div><h1 style={{margin:0,color:C.text,fontSize:22,fontWeight:700,letterSpacing:"-0.5px"}}>{title}</h1>{subtitle&&<div style={{color:C.textMuted,fontSize:13,marginTop:4}}>{subtitle}</div>}</div>{actions&&<div style={{display:"flex",gap:8}}>{actions}</div>}</div>;
}

export function DTable({headers,rows,alignRight=[]}){
  return <div style={{overflowX:"auto"}}><table><thead><tr style={{borderBottom:`1px solid ${C.border}`}}>{headers.map((h,i)=><th key={i} style={{padding:"10px 14px",textAlign:alignRight.includes(i)?"right":"left",color:C.textMuted,fontSize:11,fontWeight:600,letterSpacing:"0.05em",textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>)}</tr></thead><tbody>{rows.map((row,ri)=><tr key={ri} style={{borderBottom:`1px solid ${C.border}`,transition:"background 0.1s"}} onMouseEnter={e=>e.currentTarget.style.background=C.surfaceHover} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>{row.map((cell,ci)=><td key={ci} style={{padding:"11px 14px",color:C.text,fontSize:13,textAlign:alignRight.includes(ci)?"right":"left"}}>{cell}</td>)}</tr>)}</tbody></table></div>;
}

export function SectionCard({title,subtitle,children,action}){
  return <Card><div style={{padding:"14px 20px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><div style={{color:C.text,fontWeight:600,fontSize:14}}>{title}</div>{subtitle&&<div style={{color:C.textMuted,fontSize:12,marginTop:2}}>{subtitle}</div>}</div>{action&&action}</div><div style={{padding:20}}>{children}</div></Card>;
}

export function ConfirmDialog({text,onConfirm,onClose}){
  return <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{background:C.surface,border:`1px solid ${C.borderLight}`,borderRadius:10,width:400,padding:24,boxShadow:"0 20px 60px rgba(0,0,0,0.5)"}}><div style={{color:C.text,fontWeight:700,fontSize:15,marginBottom:10}}>Подтвердите действие</div><div style={{color:C.textMuted,fontSize:13,marginBottom:20,lineHeight:1.5}}>{text}</div><div style={{display:"flex",justifyContent:"flex-end",gap:8}}><Btn onClick={onClose}>Отмена</Btn><Btn danger onClick={onConfirm}>Удалить</Btn></div></div></div>;
}

// ─── ПРАВА ДОСТУПА ───────────────────────────────────────────────────────────
// Базовые права по роли. readonly=true означает просмотр без создания/редактирования.

export function SearchSelect({value, onChange, options=[], placeholder="Поиск..."}){
  const [query,setQuery]=useState("");
  const [open,setOpen]=useState(false);
  const ref=useRef(null);
  const selected=options.find(o=>String(o.value)===String(value));
  const filtered=query
    ?options.filter(o=>o.label.toLowerCase().includes(query.toLowerCase()))
    :options;
  useEffect(()=>{
    const handler=e=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false);};
    document.addEventListener("mousedown",handler);
    return()=>document.removeEventListener("mousedown",handler);
  },[]);
  const inpStyle={width:"100%",background:C.bg,border:`1px solid ${C.borderLight}`,color:C.text,borderRadius:6,padding:"8px 12px",fontSize:13,outline:"none",boxSizing:"border-box"};
  return(
    <div ref={ref} style={{position:"relative"}}>
      <input
        type="text"
        value={open?query:(selected?selected.label:"")}
        onChange={e=>{setQuery(e.target.value);setOpen(true);}}
        onFocus={()=>{setQuery("");setOpen(true);}}
        placeholder={placeholder}
        style={inpStyle}
      />
      {open&&filtered.length>0&&(
        <div style={{position:"absolute",top:"100%",left:0,right:0,zIndex:999,background:C.surface,border:`1px solid ${C.border}`,borderRadius:6,maxHeight:220,overflowY:"auto",marginTop:2,boxShadow:"0 4px 16px rgba(0,0,0,0.4)"}}>
          {filtered.map(o=>(
            <div key={o.value} onMouseDown={()=>{onChange(o.value);setQuery("");setOpen(false);}}
              style={{padding:"8px 12px",cursor:"pointer",fontSize:13,color:C.text,background:String(o.value)===String(value)?C.border:"transparent"}}
              onMouseEnter={e=>e.currentTarget.style.background=C.border}
              onMouseLeave={e=>e.currentTarget.style.background=String(o.value)===String(value)?C.border:"transparent"}
            >{o.label}</div>
          ))}
        </div>
      )}
    </div>
  );
}

export const ROLE_PERMISSIONS={
  admin:    {dashboard:true,invoices:true,purchases:true,payments:true,cash:true,counterparties:true,stock:true,movements:true,transfers:true,write_offs:true,returns:true,directories:true,sales_report:true,bank:true,opening_balances:true,audit_log:true,intercompany:true,debt_writeoffs:true},
  manager:  {dashboard:true,invoices:true,purchases:true,payments:true,cash:true,counterparties:true,stock:true,movements:true,transfers:false,write_offs:false,returns:false,directories:false,sales_report:true,bank:true,opening_balances:false,audit_log:false,intercompany:false,debt_writeoffs:false},
  accountant:{dashboard:true,invoices:true,purchases:true,payments:true,cash:true,counterparties:true,stock:true,movements:true,transfers:false,write_offs:false,returns:false,directories:false,sales_report:true,bank:true,opening_balances:true,audit_log:true,intercompany:true,debt_writeoffs:true},
  warehouse: {dashboard:true,invoices:"readonly",purchases:"readonly",payments:false,counterparties:false,stock:true,movements:true,transfers:false,write_offs:false,returns:false,directories:false,sales_report:false,bank:false,opening_balances:false,audit_log:false,intercompany:false,debt_writeoffs:false},
};

// canAccess(user, section) → false | true | "readonly"
// Сначала смотрим персональные разрешения (userPerms), потом роль.
export function canAccess(user, section, userPerms={}){
  if(!user) return false;
  // Персональное переопределение — если задано, используем
  if(section in userPerms) return userPerms[section];
  // Роль используется только как метка, права настраиваются индивидуально
  // По умолчанию — полный доступ
  return true;
}

// isDateRestricted(user, docDate) → true если пользователю запрещено трогать этот документ по дате
// docDate — строка 'YYYY-MM-DD' или 'DD.MM.YYYY'
export function isDateRestricted(user, docDate){
  if(!user?.date_restrict) return false;
  if(!docDate) return false;
  const today = new Date().toISOString().slice(0,10); // YYYY-MM-DD
  let d = String(docDate).slice(0,10);
  // Если формат DD.MM.YYYY — конвертируем
  if(d.includes('.')){
    const [dd,mm,yyyy] = d.split('.');
    d = `${yyyy}-${mm}-${dd}`;
  }
  return d !== today;
}

// ─── НАВИГАЦИЯ ────────────────────────────────────────────────────────────────
export const NAV=[
  {id:"dashboard",label:"Дашборд"},
  {id:"purchases",label:"Приход"},
  {id:"invoices",label:"Расход"},
  {id:"payments",label:"Платежи"},
  {id:"cash",label:"Касса"},
  {id:"counterparties",label:"Взаиморасчёты"},
  {id:"stock",label:"Остатки"},
  {id:"movements",label:"Движение"},
  {id:"transfers",label:"Перемещения"},
  {id:"write_offs",label:"Списания"},
  {id:"returns",label:"Возвраты"},
  {id:"bank",label:"🏦 Банк"},
  {id:"intercompany",label:"🔄 Взаимные док-ты"},
  {id:"opening_balances",label:"📋 Нач. остатки"},
  {id:"sales_report",label:"Отчёт продаж"},
  {id:"directories",label:"Справочники"},
  {id:"audit_log",label:"🔍 Журнал аудита"},
  {id:"debt_writeoffs",label:"✂ Списание долгов"},
  {id:"clear_data",label:"🗑 Очистить данные"},
];



// ─── API СЛОЙ ────────────────────────────────────────────────────────────────
// Относительный /api: собранный фронтенд ходит на тот же сервер, что отдал страницу.
export const API = '/api';
// Заполняется loadConfig() до первого рендера. mode: 'single' | 'multi'.
export const APP_CONFIG = { mode: 'multi', version: '' };

export async function loadConfig(){
  try{
    const r = await fetch(API + '/config');
    if(r.ok) Object.assign(APP_CONFIG, await r.json());
  }catch{ /* без сети остаётся mode=multi, version='' */ }
}

export async function api(path, method='GET', body=null){
  const user = JSON.parse(sessionStorage.getItem('trade_user') || sessionStorage.getItem('cabinet_user') || 'null');
  const companyId = user?.company_id || '1';
  const headers = {
    'Content-Type': 'application/json',
    'X-Company-ID': String(companyId),
  };
  if(user?.token) headers.Authorization = 'Bearer ' + user.token;
  const opts = { method, headers };
  if(body) opts.body = JSON.stringify(body);
  const r = await fetch(API+path, opts);
  if(r.status === 401 && !String(path).endsWith('/login')){
    if(user?.token){
      sessionStorage.removeItem('trade_user');
      sessionStorage.removeItem('cabinet_user');
      window.location.reload();
    }
    throw new Error('Сессия истекла, войдите заново');
  }
  if(!r.ok) throw new Error(await r.text());
  return r.json();
}


export function DateFilter({dateFrom,dateTo,onFrom,onTo}){
  const today=new Date();
  const fmt2=d=>{const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),dd=String(d.getDate()).padStart(2,'0');return `${dd}.${m}.${y}`;};
  const toISO=d=>{const p=d.split('.');return p.length===3?`${p[2]}-${p[1]}-${p[0]}`:'';};
  const fromISO=s=>{const p=s.split('-');return p.length===3?`${p[2]}.${p[1]}.${p[0]}`:'';};
  const setPreset=days=>{const to=new Date(today);const from=new Date(today);from.setDate(from.getDate()-days+1);onFrom(fmt2(from));onTo(fmt2(to));};
  const presets=[{l:'Сегодня',d:1},{l:'Неделя',d:7},{l:'Месяц',d:30}];
  const inputStyle={background:C.bg,border:`1px solid ${C.borderLight}`,color:C.text,borderRadius:5,padding:'4px 8px',fontSize:12,outline:'none',width:120,colorScheme:C.scheme};
  const active=dateFrom||dateTo;
  return(
    <div style={{display:'flex',alignItems:'center',gap:6}}>
      {presets.map(p=><button type="button" key={p.l} onClick={()=>setPreset(p.d)} style={{padding:'4px 10px',borderRadius:5,border:`1px solid ${C.borderLight}`,background:'transparent',color:C.textMuted,fontSize:12,cursor:'pointer'}}>{p.l}</button>)}
      <input type="date" value={toISO(dateFrom)} onChange={e=>onFrom(fromISO(e.target.value))} style={inputStyle}/>
      <span style={{color:C.textDim,fontSize:12}}>—</span>
      <input type="date" value={toISO(dateTo)} onChange={e=>onTo(fromISO(e.target.value))} style={inputStyle}/>
      {active&&<button type="button" onClick={()=>{onFrom('');onTo('');}} style={{padding:'3px 8px',borderRadius:5,border:`1px solid ${C.borderLight}`,background:'transparent',color:C.redText,fontSize:11,cursor:'pointer',fontWeight:600}}>× сброс</button>}
    </div>
  );
}

export function inDateRange(dateStr,from,to){
  if(!from&&!to)return true;
  const parse=s=>{const p=s.split('.');return p.length===3?new Date(`${p[2]}-${p[1]}-${p[0]}`):null;};
  const d=parse(dateStr);if(!d)return true;
  if(from){const f=parse(from);if(f&&d<f)return false;}
  if(to){const t=parse(to);if(t&&d>t)return false;}
  return true;
}



// ─── МОДАЛЬНОЕ ОКНО ПОЛЬЗОВАТЕЛЯ (с ролью, паролем, правами) ─────────────────
const SECTION_LABELS={
  dashboard:"Дашборд",purchases:"Приход",invoices:"Расход",payments:"Платежи",
  cash:"Касса",counterparties:"Взаиморасчёты",stock:"Остатки",movements:"Движение",
  transfers:"Перемещения",write_offs:"Списания",returns:"Возвраты",
  sales_report:"Отчёт продаж",bank:"Банк",opening_balances:"Нач. остатки",
  directories:"Справочники",audit_log:"Журнал аудита",
  intercompany:"Взаимные документы",debt_writeoffs:"Списание долгов",
  clear_data:"Очистить данные",
};

function UserModal({data,onSave,onClose,isNew,roles}){
  const [tab,setTab]=useState("main"); // "main" | "perms"
  const [form,setForm]=useState(data||{active:true});
  const [perms,setPerms]=useState(data?._perms||{});
  const set=(k,v)=>setForm(f=>({...f,[k]:v}));

  const togglePerm=(section,val)=>{
    setPerms(p=>({...p,[section]:val}));
  };

  const handleSave=()=>{
    onSave({...form,_perms:perms});
  };

  const tabBtn=(id,label)=>(
    <button onClick={()=>setTab(id)} style={{padding:"7px 18px",border:"none",cursor:"pointer",fontSize:13,fontWeight:tab===id?600:400,background:tab===id?C.accent:"transparent",color:tab===id?"#fff":C.textMuted,borderRadius:6}}>
      {label}
    </button>
  );

  return(
    <div onClick={e=>{if(e.target===e.currentTarget)onClose();}} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{background:C.surface,border:`1px solid ${C.borderLight}`,borderRadius:10,width:520,maxHeight:"90vh",overflow:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.5)"}}>
        {/* Заголовок */}
        <div style={{padding:"18px 20px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{color:C.text,fontWeight:700,fontSize:15}}>{isNew?"Новый пользователь":"Редактировать пользователя"}</span>
          <button onClick={onClose} style={{background:"none",border:"none",color:C.textMuted,cursor:"pointer",fontSize:20}}>×</button>
        </div>
        {/* Вкладки */}
        <div style={{padding:"10px 20px",borderBottom:`1px solid ${C.border}`,display:"flex",gap:4,background:C.bg}}>
          {tabBtn("main","Основные данные")}
          {tabBtn("perms","Права доступа")}
        </div>
        <div style={{padding:20}}>
          {tab==="main"&&(
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              <div><Lbl req>Полное имя</Lbl><Inp value={form.name||form.full_name} onChange={v=>set("name",v)} placeholder="Иванов Иван Иванович"/></div>
              <div><Lbl req>Логин</Lbl><Inp value={form.login} onChange={v=>set("login",v)} placeholder="ivanov"/></div>
              <div><Lbl>Email</Lbl><Inp value={form.email} onChange={v=>set("email",v)} placeholder="ivanov@company.ru"/></div>
              <div>
                <Lbl req>Роль</Lbl>
                <select value={form.role_id||""} onChange={e=>set("role_id",+e.target.value)}
                  style={{width:"100%",background:C.bg,border:`1px solid ${C.borderLight}`,color:form.role_id?C.text:C.textMuted,borderRadius:6,padding:"8px 12px",fontSize:13,outline:"none"}}>
                  <option value="">— Выберите роль —</option>
                  {(roles||[]).filter(r=>r.active||r.is_active).map(r=>(
                    <option key={r.id} value={r.id}>{r.name}{r.description?" — "+r.description:""}</option>
                  ))}
                </select>
              </div>
              <div>
                <Lbl>{isNew?"Пароль (по умолчанию: changeme)":"Новый пароль (оставьте пустым, чтобы не менять)"}</Lbl>
                <input type="password" value={form.password||""} onChange={e=>set("password",e.target.value)}
                  placeholder={isNew?"Введите пароль":"Не изменять"}
                  style={{width:"100%",background:C.bg,border:`1px solid ${C.borderLight}`,color:C.text,borderRadius:6,padding:"8px 12px",fontSize:13,outline:"none"}}/>
              </div>
              <Toggle value={!!form.active} onChange={v=>set("active",v)} label="Активен"/>
              <Toggle value={!!form.date_restrict} onChange={v=>set("date_restrict",v)} label="Ограничение по дате (только документы сегодняшним числом)"/>
            </div>
          )}
          {tab==="perms"&&(
            <div>
              <div style={{color:C.textMuted,fontSize:12,marginBottom:14,lineHeight:1.6}}>
                Настройте индивидуальные права доступа для пользователя.<br/>
                <span style={{color:C.textDim}}>По умолчанию (без выбора) — полный доступ.</span>
              </div>
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead>
                  <tr style={{borderBottom:`1px solid ${C.border}`}}>
                    <th style={{textAlign:"left",padding:"6px 10px",color:C.textMuted,fontSize:11,fontWeight:600,textTransform:"uppercase"}}>Раздел</th>
                    <th style={{textAlign:"center",padding:"6px 8px",color:C.greenText,fontSize:11,fontWeight:600,textTransform:"uppercase"}}>Полный</th>
                    <th style={{textAlign:"center",padding:"6px 8px",color:C.yellowText,fontSize:11,fontWeight:600,textTransform:"uppercase"}}>Только просмотр</th>
                    <th style={{textAlign:"center",padding:"6px 8px",color:C.redText,fontSize:11,fontWeight:600,textTransform:"uppercase"}}>Запрет</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(SECTION_LABELS).map(([sec,label])=>{
                    const cur=sec in perms?perms[sec]:true;
                    return(
                      <tr key={sec} style={{borderBottom:`1px solid ${C.border}`}}>
                        <td style={{padding:"8px 10px",color:C.text,fontSize:13}}>{label}</td>
                        {[
                          {val:true,    label:"✓", color:C.greenText},
                          {val:"readonly",label:"👁", color:C.yellowText},
                          {val:false,   label:"✗", color:C.redText},
                        ].map(opt=>(
                          <td key={String(opt.val)} style={{textAlign:"center",padding:"8px 4px"}}>
                            <button onClick={()=>togglePerm(sec,opt.val)}
                              style={{width:36,height:28,border:`1px solid ${cur===opt.val||String(cur)===String(opt.val)?opt.color:C.borderLight}`,borderRadius:5,background:cur===opt.val||String(cur)===String(opt.val)?opt.color+"22":"transparent",color:cur===opt.val||String(cur)===String(opt.val)?opt.color:C.textDim,cursor:"pointer",fontSize:12,fontWeight:600}}>
                              {opt.label}
                            </button>
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div style={{padding:"14px 20px",borderTop:`1px solid ${C.border}`,display:"flex",justifyContent:"flex-end",gap:8}}>
          <Btn onClick={onClose}>Отмена</Btn>
          <Btn primary onClick={handleSave}>{isNew?"Добавить":"Сохранить"}</Btn>
        </div>
      </div>
    </div>
  );
}


function DirModal({title,fields,data,onSave,onClose,isNew,cpCategories}){
  const [form,setForm]=useState(data||{});
  const set=(k,v)=>setForm(f=>({...f,[k]:v}));
  return(
    <div onClick={e=>{if(e.target===e.currentTarget)onClose();}} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{background:C.surface,border:`1px solid ${C.borderLight}`,borderRadius:10,width:480,maxHeight:"85vh",overflow:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.5)"}}>
        <div style={{padding:"18px 20px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{color:C.text,fontWeight:700,fontSize:15}}>{isNew?"Добавить":"Редактировать"} — {title}</span><button onClick={onClose} style={{background:"none",border:"none",color:C.textMuted,cursor:"pointer",fontSize:20}}>×</button></div>
        <div style={{padding:20}}>{fields.filter(f=>!f.cashOnly||(form.type==='cash')).map(f=><div key={f.k} style={{marginBottom:16}}>
          <Lbl req={f.req}>{f.l}</Lbl>
          {f.tog
            ?<Toggle value={!!form[f.k]} onChange={v=>set(f.k,v)} label={form[f.k]?"Да":"Нет"}/>
            :f.selDyn==="cpCategories"
              ?<select value={form[f.k]||""} onChange={e=>set(f.k,+e.target.value)} style={{width:"100%",background:C.bg,border:`1px solid ${C.borderLight}`,color:form[f.k]?C.text:C.textMuted,borderRadius:6,padding:"8px 12px",fontSize:13,outline:"none"}}>
                <option value="">— Выберите категорию —</option>
                {(cpCategories||[]).filter(c=>c.is_active).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            :f.sel
              ?<select value={form[f.k]||""} onChange={e=>set(f.k,e.target.value)} style={{width:"100%",background:C.bg,border:`1px solid ${C.borderLight}`,color:form[f.k]?C.text:C.textMuted,borderRadius:6,padding:"8px 12px",fontSize:13,outline:"none"}}>
                <option value="">— Выберите —</option>
                {f.sel.map((v,i)=><option key={v} value={v}>{f.selL?.[i]||v}</option>)}
              </select>
              :<input type={f.num?"number":"text"} value={form[f.k]??""} maxLength={f.max} onChange={e=>set(f.k,f.num?+e.target.value:e.target.value)} style={{width:"100%",background:C.bg,border:`1px solid ${C.borderLight}`,color:C.text,borderRadius:6,padding:"8px 12px",fontSize:13,outline:"none"}}/>
          }
        </div>)}</div>
        <div style={{padding:"14px 20px",borderTop:`1px solid ${C.border}`,display:"flex",justifyContent:"flex-end",gap:8}}>
          <Btn onClick={onClose}>Отмена</Btn>
          <Btn primary onClick={()=>onSave(form)}>{isNew?"Добавить":"Сохранить"}</Btn>
        </div>
      </div>
    </div>
  );
}

function renderCell(col,row,roles,cpCategories){
  if(col.badge) return <span style={{color:(row[col.k]||row.active)?C.greenText:C.textMuted,background:(row[col.k]||row.active)?C.greenDim:C.border,padding:"2px 10px",borderRadius:20,fontSize:12,fontWeight:600}}>{(row[col.k]||row.active)?"Активен":"Неактивен"}</span>;
  if(col.custom==="cpType") return <span style={{color:C.textMuted,fontSize:12}}>{row[col.k]==="legal"?"Юрлицо":"Физлицо"}</span>;
  if(col.custom==="cpCat"){
    const cat=cpCategories?.find(c=>c.id===row[col.k]);
    return cat?<span style={{color:C.accentText,background:C.accentDim,padding:"2px 8px",borderRadius:10,fontSize:11,fontWeight:600}}>{cat.name}</span>:<span style={{color:C.textDim}}>—</span>;
  }
  if(col.custom==="type") return <span style={{color:C.textMuted,fontSize:12}}>{row[col.k]==="legal"?"Юрлицо":"Физлицо"}</span>;
  if(col.custom==="role"){const rM={buyer:["Покупатель",C.accentText,C.accentDim],supplier:["Поставщик",C.purpleText,C.purpleDim],both:["Оба",C.greenText,C.greenDim]};const[rL,rC,rB]=rM[row[col.k]]||["—",C.textDim,C.border];return<span style={{color:rC,background:rB,padding:"2px 8px",borderRadius:10,fontSize:11,fontWeight:600}}>{rL}</span>;}
  if(col.custom==="money") return <span style={{color:row[col.k]>0?C.yellowText:C.textDim,fontWeight:600}}>{row[col.k]>0?fmt(row[col.k])+" ₽":"—"}</span>;
  if(col.custom==="bool") return <span style={{color:row[col.k]?C.greenText:C.textDim}}>{row[col.k]?"Да":"—"}</span>;
  if(col.custom==="direction"){const dM={incoming:["Входящие",C.greenText,C.greenDim],outgoing:["Исходящие",C.redText,C.redDim],any:["Любое",C.textMuted,C.border]};const[dL,dC,dB]=dM[row[col.k]]||["—",C.textDim,C.border];return<span style={{color:dC,background:dB,padding:"2px 8px",borderRadius:10,fontSize:11,fontWeight:600}}>{dL}</span>;}
  if(col.custom==="accountType") return <span style={{color:row[col.k]==="bank"?C.accentText:C.greenText,background:row[col.k]==="bank"?C.accentDim:C.greenDim,padding:"2px 8px",borderRadius:10,fontSize:11,fontWeight:600}}>{row[col.k]==="bank"?"Расч. счёт":"Касса"}</span>;
  if(col.custom==="role_ref"){const r=roles?.find(r=>r.id===row[col.k]);return<span style={{color:C.textMuted,fontSize:12}}>{r?.name||"—"}</span>;}
  return <span style={{color:col.color||(col.bold?C.text:col.muted?C.textMuted:C.text),fontFamily:col.mono?"monospace":"inherit",fontSize:col.mono?12:13,fontWeight:col.bold?600:400}}>{String(row[col.k]??"—")}</span>;
}

export const WO_REASONS={damage:"Порча",expiry:"Истёк срок",loss:"Недостача",other:"Прочее"};
export const WO_REASON_COLORS={damage:[C.red,C.redDim],expiry:[C.yellow,C.yellowDim],loss:[C.purple,C.purpleDim],other:[C.textMuted,C.border]};export const INIT_WRITE_OFFS=[];
export const INIT_RETURNS=[];
