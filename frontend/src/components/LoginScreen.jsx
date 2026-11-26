import { useState, useMemo, useRef, useEffect } from "react";
import { C, fmt, fmtDate, uniq, api, APP_CONFIG, NAV, ROLE_PERMISSIONS, canAccess,
  Card, Btn, Lbl, Inp, Sel, Toggle, ConfirmDialog, PageHeader,
  StatusBadge, DTable, SectionCard, inDateRange, DateFilter,
  INIT_WAREHOUSES, INIT_CATEGORIES, INIT_UNITS, INIT_COUNTRIES, INIT_CURRENCIES,
  INIT_ARTICLES, INIT_ACCOUNTS, INIT_ROLES, INIT_USERS, INIT_CP_CATEGORIES,
  INIT_CP, INIT_PRODUCTS, INIT_PAYMENTS, INVOICES, PURCHASES, TRANSFERS,
  STOCK_DATA, MOVEMENTS, PURCHASE_LINES, INVOICE_LINES, STOCK_BY_PRODUCT,
  ALL_GRADES, INIT_WRITE_OFFS, INIT_RETURNS, WO_REASONS, WO_REASON_COLORS } from "../utils/globals";

function LoginScreen({onLogin}){
  const [login,setLogin]=useState("");
  const [password,setPassword]=useState("");
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(false);
  const [mode,setMode]=useState("admin"); // "admin" | "cabinet"

  const handleSubmit=async()=>{
    if(!login||!password){setError("Введите логин и пароль");return;}
    setLoading(true);setError("");
    try{
      if(mode==="cabinet"){
        const data=await api('/cabinet/login','POST',{login,password});
        sessionStorage.setItem('cabinet_user',JSON.stringify(data));
        onLogin({...data,_isCabinet:true});
      } else {
        const data=await api('/login','POST',{login,password});
        const user={...data.user,token:data.token};
        sessionStorage.setItem('trade_user',JSON.stringify(user));
        onLogin(user);
      }
    }catch(e){
      let msg="Нет связи с сервером";
      try{ const j=JSON.parse(e.message); if(j&&j.error) msg=j.error; }catch{}
      setError(msg);
    }finally{
      setLoading(false);
    }
  };

  const handleKey=e=>{if(e.key==="Enter")handleSubmit();};

  return(
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{width:380}}>
        {/* Лого */}
        <div style={{textAlign:"center",marginBottom:32}}>
          <div style={{width:56,height:56,borderRadius:12,background:`linear-gradient(135deg,${C.accent},#1a56cc)`,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:26,fontWeight:800,margin:"0 auto 12px"}}>Т</div>
          <div style={{color:C.text,fontWeight:700,fontSize:22,letterSpacing:"-0.5px"}}>ТоргУчёт</div>
          <div style={{color:C.textMuted,fontSize:13,marginTop:4}}>Система управления оптовой торговлей</div>
        </div>

        {/* Переключатель режима — в одной базе личного кабинета нет */}
        {APP_CONFIG.mode!=="single"&&(
        <div style={{display:"flex",background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:4,marginBottom:20}}>
          <button onClick={()=>{setMode("admin");setError("");}} style={{flex:1,padding:"8px 0",border:"none",borderRadius:6,cursor:"pointer",fontSize:13,fontWeight:600,background:mode==="admin"?C.accent:"transparent",color:mode==="admin"?"#fff":C.textMuted,transition:"all 0.15s"}}>
            Сотрудник
          </button>
          <button onClick={()=>{setMode("cabinet");setError("");}} style={{flex:1,padding:"8px 0",border:"none",borderRadius:6,cursor:"pointer",fontSize:13,fontWeight:600,background:mode==="cabinet"?C.accent:"transparent",color:mode==="cabinet"?"#fff":C.textMuted,transition:"all 0.15s"}}>
            Личный кабинет
          </button>
        </div>
        )}

        {/* Форма */}
        <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:28}}>
          <div style={{marginBottom:16}}>
            <Lbl>Логин</Lbl>
            <input
              value={login} onChange={e=>setLogin(e.target.value)} onKeyDown={handleKey}
              placeholder="Введите логин" autoFocus
              style={{width:"100%",background:C.bg,border:`1px solid ${error?C.red:C.borderLight}`,color:C.text,borderRadius:6,padding:"10px 12px",fontSize:14,outline:"none",boxSizing:"border-box"}}
            />
          </div>
          <div style={{marginBottom:20}}>
            <Lbl>Пароль</Lbl>
            <input
              type="password" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={handleKey}
              placeholder="Введите пароль"
              style={{width:"100%",background:C.bg,border:`1px solid ${error?C.red:C.borderLight}`,color:C.text,borderRadius:6,padding:"10px 12px",fontSize:14,outline:"none",boxSizing:"border-box"}}
            />
          </div>
          {error&&<div style={{color:C.redText,fontSize:13,marginBottom:14,background:C.redDim,padding:"8px 12px",borderRadius:6}}>{error}</div>}
          <button
            onClick={handleSubmit} disabled={loading}
            style={{width:"100%",padding:"11px",background:loading?C.accentDim:C.accent,border:"none",color:loading?C.onAccentDim:"#fff",borderRadius:6,cursor:loading?"not-allowed":"pointer",fontSize:14,fontWeight:700,transition:"background 0.15s"}}
          >
            {loading?"Вход...":"Войти"}
          </button>
        </div>

        <div style={{textAlign:"center",marginTop:16,color:C.textDim,fontSize:12}}>
          По вопросам доступа обратитесь к администратору
          {APP_CONFIG.version&&<div style={{marginTop:6,fontSize:11,opacity:.7}}>Версия {APP_CONFIG.version}</div>}
        </div>
      </div>
    </div>
  );
}

// ─── API СЛОЙ ────────────────────────────────────────────────────────────────


export default LoginScreen;
