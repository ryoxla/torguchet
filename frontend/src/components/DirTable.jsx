import { useState, useMemo, useRef, useEffect } from "react";
import { C, fmt, fmtDate, uniq, api, APP_CONFIG, NAV, ROLE_PERMISSIONS, canAccess,
  Card, Btn, Lbl, Inp, Sel, Toggle, ConfirmDialog, PageHeader,
  StatusBadge, DTable, SectionCard, inDateRange, DateFilter,
  INIT_WAREHOUSES, INIT_CATEGORIES, INIT_UNITS, INIT_COUNTRIES, INIT_CURRENCIES,
  INIT_ARTICLES, INIT_ACCOUNTS, INIT_ROLES, INIT_USERS, INIT_CP_CATEGORIES,
  INIT_CP, INIT_PRODUCTS, INIT_PAYMENTS, INVOICES, PURCHASES, TRANSFERS,
  STOCK_DATA, MOVEMENTS, PURCHASE_LINES, INVOICE_LINES, STOCK_BY_PRODUCT,
  ALL_GRADES, INIT_WRITE_OFFS, INIT_RETURNS, WO_REASONS, WO_REASON_COLORS, fmtQty, onAppearanceChange } from "../utils/globals";

import UserModal from "./UserModal";
import ProductCard from "./ProductCard";
import Products from "./Products";
import ImportExcel, { downloadTemplate } from "./ImportExcel";

// Справочники, которые можно загрузить из Excel
const IMPORT_KINDS=new Set(["counterparties","grades","products"]);

const _mk_DIR_CFG=()=>({
  warehouses:{
    title:"Склады",color:C.tealText,colorDim:C.tealDim,icon:"▣",
    desc:"Складские помещения и адреса",
    cols:[{k:"name",label:"Наименование",bold:true},{k:"address",label:"Адрес",muted:true},{k:"company_name",label:"Компания",muted:true},{k:"is_default",label:"По умолч.",custom:"default"},{k:"active",label:"Статус",badge:true}],
    fields:[{k:"name",l:"Наименование",req:true},{k:"address",l:"Адрес"},{k:"company_name",l:"Компания"},{k:"active",l:"Активен",tog:true},{k:"is_default",l:"Склад по умолчанию",tog:true}],
  },
  products:{
    title:"Товары",color:C.accentText,colorDim:C.accentDim,icon:"◈",
    desc:"Номенклатура товаров",
    cols:[{k:"name",label:"Наименование",bold:true},{k:"is_active",label:"Статус",badge:true}],
    fields:[{k:"name",l:"Наименование",req:true}],
  },
  cp_categories:{
    title:"Категории контрагентов",color:C.accentText,colorDim:C.accentDim,icon:"⊟",
    desc:"Регионы, VIP, Дистрибьюторы...",
    cols:[{k:"name",label:"Название",bold:true},{k:"is_active",label:"Статус",badge:true}],
    fields:[{k:"name",l:"Название",req:true},{k:"is_active",l:"Активна",tog:true}],
  },
  counterparties: { 
    title:"Контрагенты",color:C.accentText,colorDim:C.accentDim,icon:"◎",
    desc:"Покупатели и поставщики",
    cols:[
      {k:"name",label:"Наименование",bold:true},
      {k:"type",label:"Тип",custom:"cpType"},
      {k:"category_id",label:"Категория",custom:"cpCat"},
      {k:"inn",label:"ИНН",mono:true,muted:true},
      {k:"currency_code",label:"Валюта",mono:true,color:C.orange},
      {k:"phone",label:"Телефон",muted:true},
      {k:"credit_limit",label:"Лимит",custom:"money"},
      ...(APP_CONFIG.mode==="single"?[]:[{k:"has_cabinet",label:"Кабинет",custom:"cabinet"}]),
      {k:"active",label:"Статус",badge:true},
    ],
    fields:[
      {k:"name",l:"Наименование",req:true},
      {k:"category_id",l:"Категория",selDyn:"cpCategories"},
      {k:"phone",l:"Телефон"},
      {k:"email",l:"Email"},
      {k:"address",l:"Адрес"},
      {k:"credit_limit",l:"Кредитный лимит (₽)",num:true},
      {k:"credit_days",l:"Дней отсрочки",num:true},
      {k:"currency_id",l:"Валюта взаиморасчётов",sel_currencies:true},
      {k:"active",l:"Активен",tog:true},
    ],
  },
  grades:{title:"Сорта",color:C.yellowText,colorDim:C.yellowDim,icon:"★",desc:"Сортность товара",cols:[{k:"name",label:"Наименование",bold:true},{k:"active",label:"Статус",badge:true}],fields:[{k:"name",l:"Наименование",req:true},{k:"active",l:"Активен",tog:true}]},
  units:{title:"Единицы измерения",color:C.greenText,colorDim:C.greenDim,icon:"⊡",desc:"Кг, тонна, литр и другие",cols:[{k:"name",label:"Наименование",bold:true},{k:"short",label:"Сокр.",mono:true,color:C.greenText},{k:"okei",label:"Код ОКЕИ",muted:true}],fields:[{k:"name",l:"Полное наименование",req:true},{k:"short",l:"Сокращение",req:true},{k:"okei",l:"Код ОКЕИ"}]},
  countries:{title:"Страны",color:C.purpleText,colorDim:C.purpleDim,icon:"◎",desc:"Страны происхождения товара",cols:[{k:"name",label:"Страна",bold:true},{k:"alpha2",label:"Alpha-2",mono:true,color:C.purpleText},{k:"alpha3",label:"Alpha-3",mono:true,color:C.purpleText},{k:"code",label:"Числ. код",muted:true}],fields:[{k:"name",l:"Название",req:true},{k:"alpha2",l:"Alpha-2",req:true,max:2},{k:"alpha3",l:"Alpha-3",req:true,max:3},{k:"code",l:"Числовой код"}]},
  currencies:{title:"Валюты",color:C.yellowText,colorDim:C.yellowDim,icon:"$",desc:"Мультивалютные расчёты",cols:[{k:"code",label:"Код",mono:true,color:C.yellowText,bold:true},{k:"name",label:"Наименование",bold:false},{k:"symbol",label:"Символ",mono:true,muted:true},{k:"is_base",label:"Базовая",custom:"bool"}],fields:[{k:"code",l:"Код (RUB)",req:true,max:3},{k:"name",l:"Наименование"},{k:"symbol",l:"Символ (₽)"},{k:"is_base",l:"Базовая валюта",tog:true}]},
  articles:{title:"Статьи ДДС",color:C.purpleText,colorDim:C.purpleDim,icon:"≡",desc:"Классификация платежей",cols:[{k:"name",label:"Статья",bold:true},{k:"direction",label:"Направление",custom:"direction"},{k:"active",label:"Статус",badge:true}],fields:[{k:"name",l:"Название статьи",req:true},{k:"direction",l:"Направление",sel:["incoming","outgoing","any"],selL:["Входящие","Исходящие","Любое"]},{k:"active",l:"Активна",tog:true}]},
  accounts:{title:"Счета и кассы",color:C.greenText,colorDim:C.greenDim,icon:"⊞",desc:"Расчётные счета и кассы",cols:[{k:"name",label:"Наименование",bold:true},{k:"type",label:"Тип",custom:"accountType"},{k:"currency",label:"Валюта",mono:true,muted:true},{k:"balance",label:"Остаток",custom:"money"},{k:"active",label:"Статус",badge:true}],fields:[{k:"name",l:"Наименование",req:true},{k:"type",l:"Тип",sel:["bank","cash"],selL:["Расчётный счёт","Касса"]},{k:"currency",l:"Валюта"},{k:"account_number",l:"Номер счёта (необязательно)"},{k:"bik",l:"БИК банка (необязательно)"},{k:"bank_name",l:"Название банка (необязательно)"},{k:"active",l:"Активен",tog:true},{k:"is_default",l:"Касса по умолчанию",tog:true}]},
  users:{title:"Пользователи",color:C.accentText,colorDim:C.accentDim,icon:"◈",desc:"Пользователи системы",cols:[{k:"name",label:"Имя",bold:true},{k:"login",label:"Логин",mono:true,color:C.accentText},{k:"email",label:"Email",muted:true},{k:"active",label:"Статус",badge:true}],fields:[{k:"name",l:"Полное имя",req:true},{k:"login",l:"Логин",req:true},{k:"email",l:"Email",req:true},{k:"active",l:"Активен",tog:true}]},
});
let DIR_CFG=_mk_DIR_CFG(); onAppearanceChange(()=>{ DIR_CFG=_mk_DIR_CFG(); });

const DIR_DATA_MAP={
  warehouses:INIT_WAREHOUSES, products:INIT_PRODUCTS,
  counterparties:INIT_CP, grades:ALL_GRADES, units:INIT_UNITS, countries:INIT_COUNTRIES,
  currencies:INIT_CURRENCIES, articles:INIT_ARTICLES, accounts:INIT_ACCOUNTS,
  roles:INIT_ROLES, users:INIT_USERS,
};

function DirModal({title,fields,data,onSave,onClose,isNew,cpCategories,currencies,isCounterparty,legalEntities=[]}){
  const [form,setForm]=useState(data||{});
  const set=(k,v)=>setForm(f=>({...f,[k]:v}));
  const [tab,setTab]=useState("main");
  const [saveError,setSaveError]=useState("");
  const [aliases,setAliases]=useState([]);
  const [aliasForm,setAliasForm]=useState({alias_name:"",inn:"",note:""});
  const [aliasLoading,setAliasLoading]=useState(false);
  const [cabinetUser,setCabinetUser]=useState(null);
  const [cabinetForm,setCabinetForm]=useState({login:"",password:"",is_active:true});
  const [cabinetSaving,setCabinetSaving]=useState(false);
  const [cabinetError,setCabinetError]=useState("");
  const [cabinetSuccess,setCabinetSuccess]=useState("");

  useEffect(()=>{
    if(isCounterparty&&data?.id){
      api(`/counterparties/${data.id}/aliases`).then(setAliases).catch(()=>[]);
      api(`/counterparties/${data.id}/cabinet`).then(u=>{
        if(u){setCabinetUser(u);setCabinetForm({login:u.login,password:"",is_active:u.is_active});}
      }).catch(()=>{});
    }
  },[data?.id,isCounterparty]);

  const handleAddAlias=()=>{
    if(!aliasForm.alias_name.trim()||!data?.id) return;
    setAliasLoading(true);
    api(`/counterparties/${data.id}/aliases`,"POST",aliasForm)
      .then(row=>{setAliases(a=>[...a,row]);setAliasForm({alias_name:"",inn:"",note:""}); })
      .catch(()=>{})
      .finally(()=>setAliasLoading(false));
  };
  const handleDeleteAlias=(aliasId)=>{
    api(`/counterparties/${data.id}/aliases/${aliasId}`,"DELETE")
      .then(()=>setAliases(a=>a.filter(x=>x.id!==aliasId)))
      .catch(()=>{});
  };

  const tabStyle=(t)=>({padding:"7px 16px",border:"none",cursor:"pointer",fontSize:13,fontWeight:600,
    background:tab===t?C.accent:"transparent",color:tab===t?"#fff":C.textMuted,borderRadius:6});

  return(
    <div onClick={e=>{if(e.target===e.currentTarget)onClose();}} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{background:C.surface,border:`1px solid ${C.borderLight}`,borderRadius:10,width:520,maxHeight:"90vh",overflow:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.5)"}}>
        <div style={{padding:"18px 20px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{color:C.text,fontWeight:700,fontSize:15}}>{isNew?"Добавить":"Редактировать"} — {title}</span>
          <button onClick={onClose} style={{background:"none",border:"none",color:C.textMuted,cursor:"pointer",fontSize:20}}>×</button>
        </div>
        {isCounterparty&&!isNew&&<div style={{padding:"10px 20px 0",display:"flex",gap:6}}>
          <button style={tabStyle("main")} onClick={()=>setTab("main")}>Основное</button>
          <button style={tabStyle("aliases")} onClick={()=>setTab("aliases")}>🏢 Юридические лица</button>
          {APP_CONFIG.mode!=="single"&&isCounterparty&&data?.id&&<button style={tabStyle("cabinet")} onClick={()=>setTab("cabinet")}>🔑 Кабинет</button>}
        </div>}
        <div style={{padding:20}}>
          {tab==="main"&&fields.filter(f=>!f.cashOnly||(form.type==='cash')).map(f=><div key={f.k} style={{marginBottom:16}}>
            <Lbl req={f.req}>{f.l}</Lbl>
            {f.tog
              ?<Toggle value={!!form[f.k]} onChange={v=>set(f.k,v)} label={form[f.k]?"Да":"Нет"}/>
              :f.selDyn==="cpCategories"
                ?<select value={form[f.k]||""} onChange={e=>set(f.k,+e.target.value)} style={{width:"100%",background:C.bg,border:`1px solid ${C.borderLight}`,color:form[f.k]?C.text:C.textMuted,borderRadius:6,padding:"8px 12px",fontSize:13,outline:"none"}}>
                  <option value="">— Выберите категорию —</option>
                  {(cpCategories||[]).filter(c=>c.is_active).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              :f.sel_currencies
                ?<select value={form[f.k]||""} onChange={e=>set(f.k,+e.target.value||"")} style={{width:"100%",background:C.bg,border:`1px solid ${C.borderLight}`,color:form[f.k]?C.text:C.textMuted,borderRadius:6,padding:"8px 12px",fontSize:13,outline:"none"}}>
                  <option value="">— Выберите валюту —</option>
                  {(currencies||[]).map(c=><option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
                </select>
              :f.sel
                ?<select value={form[f.k]||""} onChange={e=>set(f.k,e.target.value)} style={{width:"100%",background:C.bg,border:`1px solid ${C.borderLight}`,color:form[f.k]?C.text:C.textMuted,borderRadius:6,padding:"8px 12px",fontSize:13,outline:"none"}}>
                  <option value="">— Выберите —</option>
                  {f.sel.map((v,i)=><option key={v} value={v}>{f.selL?.[i]||v}</option>)}
                </select>
                :<input type={f.num?"number":"text"} value={form[f.k]??""} maxLength={f.max} onChange={e=>set(f.k,f.num?+e.target.value:e.target.value)} style={{width:"100%",background:C.bg,border:`1px solid ${C.borderLight}`,color:C.text,borderRadius:6,padding:"8px 12px",fontSize:13,outline:"none"}}/>
            }
          </div>)}
          {tab==="aliases"&&<div>
            <div style={{color:C.textMuted,fontSize:12,marginBottom:12}}>Привяжите юридические лица контрагента для автоматического распознавания в банковской выписке.</div>
            {aliases.length===0&&<div style={{color:C.textDim,fontSize:12,marginBottom:12,padding:"10px",background:C.bg,borderRadius:6}}>Нет привязанных юридических лиц</div>}
            {aliases.map(a=><div key={a.id} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",marginBottom:4,background:C.bg,borderRadius:6,border:`1px solid ${C.border}`}}>
              <span style={{color:C.text,fontSize:13,flex:1,fontWeight:500}}>{a.alias_name}</span>
              {a.inn&&<span style={{color:C.textMuted,fontSize:11,fontFamily:"monospace"}}>ИНН: {a.inn}</span>}
              {a.note&&<span style={{color:C.textMuted,fontSize:11}}>· {a.note}</span>}
              <button onClick={()=>handleDeleteAlias(a.id)} style={{background:"transparent",border:"none",color:C.redText,cursor:"pointer",fontSize:14,padding:"0 4px"}}>✕</button>
            </div>)}
            <div style={{marginTop:12,padding:"12px",background:C.bg,borderRadius:6,border:`1px solid ${C.border}`}}>
              <div style={{color:C.textMuted,fontSize:11,marginBottom:8,fontWeight:600}}>Добавить юридическое лицо</div>
              <div style={{display:"flex",gap:8,alignItems:"flex-end"}}>
                <div style={{flex:1}}>
                  <select value={aliasForm.alias_name} onChange={e=>{
                    const le=legalEntities.find(l=>l.name===e.target.value);
                    setAliasForm(f=>({...f,alias_name:e.target.value,inn:le?.inn||f.inn}));
                  }} style={{width:"100%",background:C.surface,border:`1px solid ${C.borderLight}`,color:aliasForm.alias_name?C.text:C.textMuted,borderRadius:6,padding:"7px 10px",fontSize:13,outline:"none"}}>
                    <option value="">— Выбрать из справочника —</option>
                    {legalEntities.filter(l=>l.is_active).map(l=><option key={l.id} value={l.name}>{l.name}{l.inn?" (ИНН: "+l.inn+")":""}</option>)}
                  </select>
                </div>
                <input value={aliasForm.note} onChange={e=>setAliasForm(f=>({...f,note:e.target.value}))}
                  placeholder="Примечание"
                  style={{flex:1,background:C.surface,border:`1px solid ${C.borderLight}`,color:C.text,borderRadius:6,padding:"7px 10px",fontSize:13,outline:"none"}}/>
                <button onClick={handleAddAlias} disabled={aliasLoading||!aliasForm.alias_name.trim()}
                  style={{padding:"7px 16px",background:C.accent,border:"none",color:"#fff",borderRadius:6,cursor:"pointer",fontSize:13,fontWeight:600,opacity:aliasLoading||!aliasForm.alias_name.trim()?0.5:1,whiteSpace:"nowrap"}}>
                  + Добавить
                </button>
              </div>
            </div>
          </div>}
          {tab==="cabinet"&&isCounterparty&&<div style={{padding:"4px 0"}}>
            <div style={{color:C.textMuted,fontSize:12,marginBottom:16}}>
              {cabinetUser?"Контрагент имеет доступ к личному кабинету.":"Создайте логин и пароль для доступа контрагента к личному кабинету."}
            </div>
            {cabinetError&&<div style={{color:C.redText,fontSize:12,marginBottom:8}}>{cabinetError}</div>}
            {cabinetSuccess&&<div style={{color:C.greenText,fontSize:12,marginBottom:8}}>{cabinetSuccess}</div>}
            <div style={{marginBottom:12}}>
              <Lbl>Логин</Lbl>
              <input value={cabinetForm.login} onChange={e=>setCabinetForm(f=>({...f,login:e.target.value}))}
                placeholder="Логин контрагента"
                style={{width:"100%",background:C.bg,border:`1px solid ${C.borderLight}`,color:C.text,borderRadius:6,padding:"8px 12px",fontSize:13,outline:"none"}}/>
            </div>
            <div style={{marginBottom:12}}>
              <Lbl>{cabinetUser?"Новый пароль (оставьте пустым чтобы не менять)":"Пароль"}</Lbl>
              <input type="password" value={cabinetForm.password} onChange={e=>setCabinetForm(f=>({...f,password:e.target.value}))}
                placeholder={cabinetUser?"Новый пароль":"Пароль"}
                style={{width:"100%",background:C.bg,border:`1px solid ${C.borderLight}`,color:C.text,borderRadius:6,padding:"8px 12px",fontSize:13,outline:"none"}}/>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16}}>
              <div onClick={()=>setCabinetForm(f=>({...f,is_active:!f.is_active}))} style={{width:32,height:18,borderRadius:9,background:cabinetForm.is_active?C.accent:C.border,position:"relative",cursor:"pointer",transition:"background 0.2s",flexShrink:0}}>
                <div style={{width:14,height:14,borderRadius:"50%",background:"#fff",position:"absolute",top:2,left:cabinetForm.is_active?16:2,transition:"left 0.2s"}}/>
              </div>
              <span style={{color:C.textMuted,fontSize:13}}>Доступ активен</span>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={async()=>{
                setCabinetError("");setCabinetSuccess("");
                if(!cabinetForm.login.trim()){setCabinetError("Укажите логин");return;}
                if(!cabinetUser&&!cabinetForm.password.trim()){setCabinetError("Укажите пароль");return;}
                setCabinetSaving(true);
                try{
                  const payload={login:cabinetForm.login,is_active:cabinetForm.is_active};
                  if(cabinetForm.password.trim()) payload.password=cabinetForm.password;
                  if(cabinetUser){
                    await api(`/counterparties/${data.id}/cabinet`,"PUT",payload);
                  } else {
                    await api(`/counterparties/${data.id}/cabinet`,"POST",payload);
                  }
                  setCabinetSuccess("Сохранено!");
                  api(`/counterparties/${data.id}/cabinet`).then(u=>{if(u){setCabinetUser(u);}}).catch(()=>{});
                }catch(e){
                  try{setCabinetError(JSON.parse(e.message).error||e.message);}catch{setCabinetError(e.message);}
                }finally{setCabinetSaving(false);}
              }} disabled={cabinetSaving} style={{padding:"7px 20px",background:C.accent,border:"none",color:"#fff",borderRadius:6,cursor:"pointer",fontSize:13,fontWeight:600}}>
                {cabinetSaving?"Сохранение...":cabinetUser?"Обновить":"Создать доступ"}
              </button>
              {cabinetUser&&<button onClick={async()=>{
                if(!window.confirm("Удалить доступ контрагента?")) return;
                await api(`/counterparties/${data.id}/cabinet`,"DELETE").catch(()=>{});
                setCabinetUser(null);setCabinetForm({login:"",password:"",is_active:true});setCabinetSuccess("Доступ удалён.");
              }} style={{padding:"7px 16px",background:"transparent",border:`1px solid ${C.red}`,color:C.redText,borderRadius:6,cursor:"pointer",fontSize:13}}>Удалить доступ</button>}
            </div>
          </div>}
        </div>
        <div style={{padding:"14px 20px",borderTop:`1px solid ${C.border}`,display:"flex",justifyContent:"flex-end",gap:8,alignItems:"center"}}>
          {saveError&&<span style={{color:C.redText,fontSize:12,flex:1}}>{saveError}</span>}
          <Btn onClick={onClose}>Отмена</Btn>
          {tab==="main"&&<Btn primary onClick={()=>{setSaveError("");onSave(form,setSaveError);}}>{isNew?"Добавить":"Сохранить"}</Btn>}
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
  if(col.custom==="cabinet") return <span style={{color:row[col.k]?C.greenText:C.textDim,fontWeight:700,fontSize:13}} title={row[col.k]?"Есть личный кабинет":"Кабинет не создан"}>{row[col.k]?"✓":"—"}</span>;
  if(col.custom==="direction"){const dM={incoming:["Входящие",C.greenText,C.greenDim],outgoing:["Исходящие",C.redText,C.redDim],any:["Любое",C.textMuted,C.border]};const[dL,dC,dB]=dM[row[col.k]]||["—",C.textDim,C.border];return<span style={{color:dC,background:dB,padding:"2px 8px",borderRadius:10,fontSize:11,fontWeight:600}}>{dL}</span>;}
  if(col.custom==="accountType") return <span style={{color:row[col.k]==="bank"?C.accentText:C.greenText,background:row[col.k]==="bank"?C.accentDim:C.greenDim,padding:"2px 8px",borderRadius:10,fontSize:11,fontWeight:600}}>{row[col.k]==="bank"?"Расч. счёт":"Касса"}</span>;
  if(col.custom==="role_ref"){const r=roles?.find(r=>r.id===row[col.k]);return<span style={{color:C.textMuted,fontSize:12}}>{r?.name||"—"}</span>;}
  return <span style={{color:col.color||(col.bold?C.text:col.muted?C.textMuted:C.text),fontFamily:col.mono?"monospace":"inherit",fontSize:col.mono?12:13,fontWeight:col.bold?600:400}}>{String(row[col.k]??"—")}</span>;
}


function DirTable({configKey,data,setData,onBack,roles,categories,onAddCategory,cpCategories,units,countries,grades=[],currencies=[],legalEntities=[],currentUser,onImported}){
  const cfg=DIR_CFG[configKey];
  const [importOpen,setImportOpen]=useState(false);
  const [tplBusy,setTplBusy]=useState(false);
  // Импорт — для тех же пользователей, что могут добавлять записи (раздел «Справочники» не «только просмотр»)
  const canImport=IMPORT_KINDS.has(configKey)&&(()=>{
    let all={};try{all=JSON.parse(localStorage.getItem("user_perms")||"{}")||{};}catch{all={};}
    return canAccess(currentUser,"directories",(currentUser&&all[currentUser.id])||{})===true;
  })();
  const getTemplate=()=>{setTplBusy(true);downloadTemplate(configKey).catch(e=>alert("Не удалось скачать шаблон: "+e.message)).finally(()=>setTplBusy(false));};
  const importButtons=canImport&&<>
    <Btn onClick={getTemplate} disabled={tplBusy}>{tplBusy?"Готовлю…":"⤓ Скачать шаблон"}</Btn>
    <Btn onClick={()=>setImportOpen(true)}>⇪ Импорт из Excel</Btn>
  </>;
  const [search,setSearch]=useState("");
  const [modal,setModal]=useState(null);
  const [confirm,setConfirm]=useState(null);
  const [openProduct,setOpenProduct]=useState(null);
  
  const filtered=data
    .filter(row=>Object.values(row).some(v=>String(v).toLowerCase().includes(search.toLowerCase())))
    .sort((a,b)=>configKey==="grades"?(a.name||'').localeCompare(b.name||'','ru'):0);
  const nextId=()=>Math.max(0,...data.map(r=>r.id))+1;
  const emptyRow=cfg.fields.reduce((acc,f)=>{acc[f.k]=f.tog?true:f.num?0:"";return acc;},{});
  const handleSave=(form,setSaveError)=>{
  const parseErr=e=>{try{return JSON.parse(e.message).error||e.message;}catch{return e.message;}};
  if(modal.type==="add"){
    if(configKey==="products"){
      api("/products","POST",{sku:form.sku||null,name:form.name,category_id:parseInt(form.category_id)||null,default_unit_id:parseInt(form.default_unit_id)||null,default_country_id:parseInt(form.default_country_id)||null,default_grade_id:parseInt(form.default_grade_id)||null,has_serial:!!form.has_serial,has_batch:!!form.has_batch,min_stock:parseFloat(form.min_stock)||null,is_active:true})
        .then(saved=>{setData(prev=>[...prev,saved]);setModal(null);}).catch(e=>{if(setSaveError)setSaveError(parseErr(e));else alert("Ошибка: "+parseErr(e));});
    } else if(configKey==="counterparties"){
      api("/counterparties","POST",{name:form.name,type:form.type||"legal",category_id:parseInt(form.category_id)||null,inn:form.inn||null,kpp:form.kpp||null,phone:form.phone||null,email:form.email||null,address:form.address||null,credit_limit:parseFloat(form.credit_limit)||null,credit_days:parseInt(form.credit_days)||null,currency_id:parseInt(form.currency_id)||null,is_anonymous:false,is_active:true})
        .then(saved=>{setData(prev=>[...prev,{...saved,active:true}]);setModal(null);}).catch(e=>{if(setSaveError)setSaveError(parseErr(e));else alert("Ошибка: "+parseErr(e));});
    } else if(configKey==="warehouses"){
      api("/warehouses","POST",{name:form.name,address:form.address||null,company_id:1,is_active:true})
        .then(saved=>{setData(prev=>[...prev,{...saved,active:true}]);setModal(null);}).catch(e=>alert("Ошибка: "+e.message));
    } else if(configKey==="cp_categories"){
      api("/counterparty-categories","POST",{name:form.name})
        .then(saved=>{setData(prev=>[...prev,{...saved,active:true}]);setModal(null);}).catch(e=>alert("Ошибка: "+e.message));
    } else if(configKey==="accounts"){
      api("/bank-accounts","POST",{name:form.name,type:form.type||"bank",currency_id:parseInt(form.currency)||null,account_number:form.account_number||null,bik:form.bik||null,bank_name:form.bank_name||null,company_id:1})
        .then(saved=>{setData(prev=>[...prev,{...saved,active:true,currency:saved.currency_code}]);setModal(null);}).catch(e=>alert("Ошибка: "+e.message));
    } else if(configKey==="countries"){
      api("/countries","POST",{name:form.name,alpha2:form.alpha2||null,alpha3:form.alpha3||null,numeric_code:form.code||null})
        .then(saved=>{setData(prev=>[...prev,{...saved,active:true}]);setModal(null);}).catch(e=>alert("Ошибка: "+e.message));
    } else if(configKey==="units"){
      api("/units","POST",{name:form.name,short_name:form.short||null,okei_code:form.okei||null})
        .then(saved=>{setData(prev=>[...prev,{...saved,active:true}]);setModal(null);}).catch(e=>alert("Ошибка: "+e.message));
    } else if(configKey==="grades"){
      api("/grades","POST",{name:form.name,code:form.code||null,sort_order:form.sort_order||0})
        .then(saved=>{setData(prev=>[...prev,{...saved,active:true}]);setModal(null);}).catch(e=>alert("Ошибка: "+e.message));
    } else if(configKey==="product_categories"||configKey==="categories"){
      api("/product-categories","POST",{name:form.name})
        .then(saved=>{setData(prev=>[...prev,{...saved,active:true}]);setModal(null);}).catch(e=>alert("Ошибка: "+e.message));
    } else if(configKey==="articles"){
      api("/finance-articles","POST",{name:form.name,direction:form.direction||"any"})
        .then(saved=>{setData(prev=>[...prev,{...saved,active:true}]);setModal(null);}).catch(e=>alert("Ошибка: "+e.message));
    } else if(configKey==="roles"){
      api("/roles","POST",{name:form.name,description:form.description||null})
        .then(saved=>{setData(prev=>[...prev,{...saved,active:true}]);setModal(null);}).catch(e=>alert("Ошибка: "+e.message));
    } else if(configKey==="currencies"){
      api("/currencies","POST",{code:form.code,name:form.name,symbol:form.symbol||null,is_base:!!form.is_base})
        .then(saved=>{setData(prev=>[...prev,{...saved,active:true}]);setModal(null);}).catch(e=>alert("Ошибка: "+e.message));
    } else if(configKey==="users"){
      api("/users","POST",{login:form.login,full_name:form.name,email:form.email||null,role_id:parseInt(form.role_id)||null,company_id:1,password:form.password||"changeme",is_admin:!!form.is_admin})
        .then(saved=>{
          const userData={...saved,name:saved.full_name,active:true,_perms:form._perms||{}};
          if(form._perms&&Object.keys(form._perms).length>0){
            api(`/user-permissions/${saved.id}`,"PUT",form._perms).catch(console.warn);
          }
          setData(prev=>[...prev,userData]);setModal(null);
        }).catch(e=>alert("Ошибка: "+e.message));
    } else {
      setData(prev=>[...prev,{...form,id:nextId()}]);
    }
  } else {
    if(configKey==="products"){
      api(`/products/${form.id}`,"PUT",{sku:form.sku||null,name:form.name,category_id:parseInt(form.category_id)||null,default_unit_id:parseInt(form.default_unit_id)||null,default_country_id:parseInt(form.default_country_id)||null,default_grade_id:parseInt(form.default_grade_id)||null,has_serial:!!form.has_serial,has_batch:!!form.has_batch,min_stock:parseFloat(form.min_stock)||null,is_active:form.is_active!==false})
        .catch(e=>alert("Ошибка: "+e.message));
    } else if(configKey==="counterparties"){
      api(`/counterparties/${form.id}`,"PUT",{name:form.name,type:form.type||"legal",category_id:parseInt(form.category_id)||null,inn:form.inn||null,kpp:form.kpp||null,phone:form.phone||null,email:form.email||null,address:form.address||null,credit_limit:parseFloat(form.credit_limit)||null,credit_days:parseInt(form.credit_days)||null,currency_id:parseInt(form.currency_id)||null,is_anonymous:!!form.is_anonymous,is_active:form.active!==false})
        .then(saved=>{setData(prev=>prev.map(r=>r.id===saved.id?{...saved,active:saved.is_active,currency_code:saved.currency_code}:r));setModal(null);})
        .catch(e=>{if(setSaveError)setSaveError(parseErr(e));else alert("Ошибка: "+parseErr(e));});
    } else if(configKey==="warehouses"){
      api(`/warehouses/${form.id}`,"PUT",{name:form.name,address:form.address||null,company_name:form.company_name||null,is_active:form.active!==false,is_default:!!form.is_default})
        .catch(e=>alert("Ошибка: "+e.message));
    } else if(configKey==="cp_categories"){
      api(`/counterparty-categories/${form.id}`,"PUT",{name:form.name,is_active:form.active!==false})
        .catch(e=>alert("Ошибка: "+e.message));
    } else if(configKey==="accounts"){
      api(`/bank-accounts/${form.id}`,"PUT",{name:form.name,type:form.type||"bank",currency_id:parseInt(form.currency)||null,account_number:form.account_number||null,bik:form.bik||null,bank_name:form.bank_name||null,is_active:form.active!==false,is_default:!!form.is_default})
        .catch(e=>alert("Ошибка: "+e.message));
    } else if(configKey==="countries"){
      api(`/countries/${form.id}`,"PUT",{name:form.name,alpha2:form.alpha2||null,alpha3:form.alpha3||null,numeric_code:form.code||null})
        .catch(e=>alert("Ошибка: "+e.message));
    } else if(configKey==="units"){
      api(`/units/${form.id}`,"PUT",{name:form.name,short_name:form.short||null,okei_code:form.okei||null})
        .catch(e=>alert("Ошибка: "+e.message));
    } else if(configKey==="grades"){
      api(`/grades/${form.id}`,"PUT",{name:form.name,code:form.code||null,sort_order:form.sort_order||0,is_active:form.active!==false})
        .catch(e=>alert("Ошибка: "+e.message));
    } else if(configKey==="product_categories"||configKey==="categories"){
      api(`/product-categories/${form.id}`,"PUT",{name:form.name,is_active:form.active!==false})
        .catch(e=>alert("Ошибка: "+e.message));
    } else if(configKey==="articles"){
      api(`/finance-articles/${form.id}`,"PUT",{name:form.name,direction:form.direction||"any",is_active:form.active!==false})
        .catch(e=>alert("Ошибка: "+e.message));
    } else if(configKey==="roles"){
      api(`/roles/${form.id}`,"PUT",{name:form.name,description:form.description||null,is_active:form.active!==false})
        .catch(e=>alert("Ошибка: "+e.message));
    } else if(configKey==="currencies"){
      api(`/currencies/${form.id}`,"PUT",{code:form.code,name:form.name,symbol:form.symbol||null,is_base:!!form.is_base})
        .catch(e=>alert("Ошибка: "+e.message));
    } else if(configKey==="users"){
      const putBody={login:form.login,full_name:form.name,email:form.email||null,role_id:parseInt(form.role_id)||null,is_active:form.active!==false,date_restrict:!!form.date_restrict,is_admin:!!form.is_admin};
      if(form.password) putBody.password=form.password;
      api(`/users/${form.id}`,"PUT",putBody).then(()=>{
        // Сохраняем права в БД
        api(`/user-permissions/${form.id}`,"PUT",form._perms||{}).catch(console.warn);
      }).catch(e=>alert("Ошибка: "+e.message));
    }
    setData(prev=>prev.map(r=>r.id===form.id?form:r));
    setModal(null);
  }
};

  // Карточка товара из справочника
  if(openProduct&&configKey==="products"){
    return <ProductCard product={openProduct} onBack={()=>setOpenProduct(null)} onSave={updated=>{
  api(`/products/${updated.id}`,"PUT",{
    sku:updated.sku,name:updated.name,
    category_id:parseInt(updated.category_id)||null,
    default_unit_id:parseInt(updated.default_unit_id)||null,
    default_country_id:parseInt(updated.default_country_id)||null,
    default_grade_id:parseInt(updated.default_grade_id)||null,
    has_serial:!!updated.has_serial,has_batch:!!updated.has_batch,
    min_stock:parseFloat(updated.min_stock)||null,
    weight_kg:parseFloat(updated.weight_kg)||null,
    is_active:updated.is_active!==false,
  }).catch(e=>alert("Ошибка сохранения: "+e.message));
  setData(prev=>prev.map(p=>p.id===updated.id?updated:p));
  setOpenProduct(updated);
}} categories={categories||[]} onAddCategory={onAddCategory||(()=>{})} units={units||[]} countries={countries||[]} grades={grades}/>;
  }
  return(
    <div style={{display:"flex",justifyContent:"center",padding:"28px 24px"}}>
    <div style={{width:"fit-content",maxWidth:"100%",minWidth:480}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12,marginBottom:24}}>
        <div style={{display:"flex",alignItems:"center",gap:14}}>
          <div style={{width:44,height:44,borderRadius:10,background:cfg.colorDim,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,color:cfg.color}}>{cfg.icon}</div>
          <div><h1 style={{margin:0,color:C.text,fontSize:22,fontWeight:700}}>{cfg.title}</h1><div style={{color:C.textMuted,fontSize:13,marginTop:2}}>{cfg.desc} · {data.length} записей</div></div>
          {configKey==="cp_categories"&&<div style={{display:"flex",gap:8,marginLeft:16}}>
            <button onClick={onBack} style={{padding:"8px 16px",background:"transparent",border:`1px solid ${C.borderLight}`,color:C.text,borderRadius:6,cursor:"pointer",fontSize:13,fontWeight:600}}>← Назад</button>
            <Btn primary onClick={()=>setModal({type:"add",row:emptyRow})}>+ Добавить</Btn>
          </div>}
        </div>
        {configKey!=="cp_categories"&&<div style={{display:"flex",gap:8,flexWrap:"wrap",justifyContent:"flex-end"}} data-dir-actions={configKey}>
          <button onClick={onBack} style={{padding:"8px 16px",background:"transparent",border:`1px solid ${C.borderLight}`,color:C.text,borderRadius:6,cursor:"pointer",fontSize:13,fontWeight:600}}>← Назад</button>
          {importButtons}
          {!(configKey==="users" && !(currentUser?.master_role==="superadmin" || (APP_CONFIG.mode==="single" && currentUser?.master_role==="admin"))) && (
            <Btn primary onClick={()=>setModal({type:"add",row:configKey==="counterparties"?{...emptyRow,currency_id:currencies.find(c=>c.code==="RUB")?.id||1}:emptyRow})}>+ Добавить</Btn>
          )}
        </div>}
      </div>
      <div style={{marginBottom:16}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder={`Поиск в справочнике «${cfg.title}»...`} style={{background:C.surface,border:`1px solid ${C.border}`,color:C.text,borderRadius:6,padding:"8px 14px",fontSize:13,width:"100%",maxWidth:360,outline:"none"}}/>
        {search&&<button onClick={()=>setSearch("")} style={{background:"none",border:"none",color:C.textMuted,cursor:"pointer",fontSize:13,marginLeft:8}}>× Сбросить</button>}
      </div>
      <Card>
        <div style={{overflowX:"auto"}}><table>
          <thead><tr style={{borderBottom:`1px solid ${C.border}`}}>{cfg.cols.map((col,i)=><th key={i} style={{padding:"2px 16px",textAlign:"left",color:C.textMuted,fontSize:11,fontWeight:600,letterSpacing:"0.06em",textTransform:"uppercase",whiteSpace:"nowrap"}}>{col.label}</th>)}<th style={{padding:"2px 16px",width:140}}/></tr></thead>
          <tbody>
            {filtered.length===0&&<tr><td colSpan={cfg.cols.length+1} style={{padding:40,textAlign:"center",color:C.textDim}}>Ничего не найдено</td></tr>}
            {filtered.map(row=><tr key={row.id}
              onDoubleClick={()=>configKey==="products"?setOpenProduct(row):setModal({type:"edit",row})}
              style={{borderBottom:`1px solid ${C.border}`,transition:"background 0.1s",cursor:"pointer"}}
              onMouseEnter={e=>e.currentTarget.style.background=C.surfaceHover}
              onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
              {cfg.cols.map((col,ci)=><td key={ci} style={{padding:"2px 16px"}}>{renderCell(col,row,roles,cpCategories)}</td>)}
              <td style={{padding:"2px 16px"}}>
                <div style={{display:"flex",gap:6,justifyContent:"flex-end"}}>
                  {configKey!=="products"&&<button onClick={()=>setModal({type:"edit",row})} style={{padding:"4px 12px",background:"transparent",border:`1px solid ${C.borderLight}`,color:C.textMuted,borderRadius:5,cursor:"pointer",fontSize:12,fontWeight:600}}>Изменить</button>}
                  {configKey!=="products"&&<button onClick={()=>setConfirm({id:row.id,name:row.name||row.code||row.short||""})} style={{padding:"4px 10px",background:"transparent",border:`1px solid ${C.redDim}`,color:C.redText,borderRadius:5,cursor:"pointer",fontSize:12,fontWeight:600}}>✕</button>}
                </div>
              </td>
            </tr>)}
          </tbody>
        </table></div>
        <div style={{padding:"10px 16px",borderTop:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",color:C.textDim,fontSize:12}}>
          <span>Всего: {data.length}{data.some(r=>"active" in r)?` · Активных: ${data.filter(r=>r.active).length}`:""}</span>
          {data.some(r=>"active" in r)&&data.filter(r=>!r.active).length>0&&<span>Неактивных: {data.filter(r=>!r.active).length}</span>}
        </div>
      </Card>
      {modal&&(configKey==="users"
        ?<UserModal data={modal.row} onSave={handleSave} onClose={()=>setModal(null)} isNew={modal.type==="add"} roles={roles}/>
        :<DirModal legalEntities={legalEntities} title={cfg.title} fields={cfg.fields} data={modal.row} onSave={handleSave} onClose={()=>setModal(null)} isNew={modal.type==="add"} cpCategories={cpCategories} currencies={currencies} isCounterparty={configKey==="counterparties"}/>
      )}
      {importOpen&&<ImportExcel kind={configKey} title={cfg.title} onClose={()=>setImportOpen(false)} onImported={res=>onImported&&onImported(configKey,res)}/>}
      {confirm&&<ConfirmDialog text={`Удалить «${confirm.name}»? Это действие нельзя отменить.`} onConfirm={()=>{
  const ep={products:"/products",counterparties:"/counterparties",warehouses:"/warehouses",
    countries:"/countries",units:"/units",grades:"/grades",currencies:"/currencies",
    roles:"/roles",users:"/users",accounts:"/bank-accounts",articles:"/finance-articles",
    cp_categories:"/counterparty-categories","product_categories":"/product-categories"};
  const path=ep[configKey];
  if(path){api(`${path}/${confirm.id}`,"DELETE").then(()=>{setData(prev=>prev.filter(r=>r.id!==confirm.id));}).catch(e=>alert(e.message));}
  else{setData(prev=>prev.filter(r=>r.id!==confirm.id));}
  setConfirm(null);
}} onClose={()=>setConfirm(null)}/>}
    </div>
    </div>
  );
}


// ─── КОНТРАГЕНТЫ — БАЛАНС ────────────────────────────────────────────────────

export default DirTable;
