import { useState, useMemo, useRef, useEffect } from "react";
import { C, fmt, fmtDate, uniq, api, APP_CONFIG, NAV, ROLE_PERMISSIONS, canAccess,
  Card, Btn, Lbl, Inp, Sel, Toggle, ConfirmDialog, PageHeader,
  StatusBadge, DTable, SectionCard, inDateRange, DateFilter,
  INIT_WAREHOUSES, INIT_CATEGORIES, INIT_UNITS, INIT_COUNTRIES, INIT_CURRENCIES,
  INIT_ARTICLES, INIT_ACCOUNTS, INIT_ROLES, INIT_USERS, INIT_CP_CATEGORIES,
  INIT_CP, INIT_PRODUCTS, INIT_PAYMENTS, INVOICES, PURCHASES, TRANSFERS,
  STOCK_DATA, MOVEMENTS, PURCHASE_LINES, INVOICE_LINES, STOCK_BY_PRODUCT,
  ALL_GRADES, INIT_WRITE_OFFS, INIT_RETURNS, WO_REASONS, WO_REASON_COLORS } from "../utils/globals";

const SECTION_LABELS={
  dashboard:"Дашборд",invoices:"Продажи",purchases:"Закупки",payments:"Платежи",
  cash:"Касса",counterparties:"Взаиморасчёты",stock:"Остатки",movements:"Движение",
  transfers:"Перемещения",write_offs:"Списания",returns:"Возвраты",
  sales_report:"Отчёт продаж",bank:"Банк",opening_balances:"Нач. остатки",
  directories:"Справочники",audit_log:"Журнал аудита",
  intercompany:"Взаимные документы",debt_writeoffs:"Списание долгов",
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
                <Lbl>{isNew?"Пароль (по умолчанию: changeme)":"Новый пароль (оставьте пустым, чтобы не менять)"}</Lbl>
                <input type="password" value={form.password||""} onChange={e=>set("password",e.target.value)}
                  placeholder={isNew?"Введите пароль":"Не изменять"}
                  style={{width:"100%",background:C.bg,border:`1px solid ${C.borderLight}`,color:C.text,borderRadius:6,padding:"8px 12px",fontSize:13,outline:"none"}}/>
              </div>
              <Toggle value={!!form.active} onChange={v=>set("active",v)} label="Активен"/>
              {APP_CONFIG.mode==="single"&&<Toggle value={!!form.is_admin} onChange={v=>set("is_admin",v)} label="Администратор (пользователи и очистка данных)"/>}
            </div>
          )}
          {tab==="perms"&&(
            <div>
              <div style={{color:C.textMuted,fontSize:12,marginBottom:14,lineHeight:1.6}}>
                Настройте индивидуальные права доступа для пользователя.<br/>
                <span style={{color:C.textDim}}>По умолчанию (без выбора) — полный доступ.</span>
              </div>
              <div style={{marginBottom:16,padding:"10px 14px",background:C.bg,border:`1px solid ${C.border}`,borderRadius:6}}>
                <Toggle value={!!form.date_restrict} onChange={v=>set("date_restrict",v)} label="Ограничение по дате — только документы сегодняшним числом"/>
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

const DIR_DATA_MAP={
  warehouses:INIT_WAREHOUSES, products:INIT_PRODUCTS,
  counterparties:INIT_CP, grades:ALL_GRADES, units:INIT_UNITS, countries:INIT_COUNTRIES,
  currencies:INIT_CURRENCIES, articles:INIT_ARTICLES, accounts:INIT_ACCOUNTS,
  roles:INIT_ROLES, users:INIT_USERS,
};


export default UserModal;
