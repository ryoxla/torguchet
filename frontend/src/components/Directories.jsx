import { useState, useMemo, useRef, useEffect } from "react";
import { C, fmt, fmtDate, uniq, api, NAV, ROLE_PERMISSIONS, canAccess, useIsMobile,
  Card, Btn, Lbl, Inp, Sel, Toggle, ConfirmDialog, PageHeader,
  StatusBadge, DTable, SectionCard, inDateRange, DateFilter,
  INIT_WAREHOUSES, INIT_CATEGORIES, INIT_UNITS, INIT_COUNTRIES, INIT_CURRENCIES,
  INIT_ARTICLES, INIT_ACCOUNTS, INIT_ROLES, INIT_USERS, INIT_CP_CATEGORIES,
  INIT_CP, INIT_PRODUCTS, INIT_PAYMENTS, INVOICES, PURCHASES, TRANSFERS,
  STOCK_DATA, MOVEMENTS, PURCHASE_LINES, INVOICE_LINES, STOCK_BY_PRODUCT,
  ALL_GRADES, INIT_WRITE_OFFS, INIT_RETURNS, WO_REASONS, WO_REASON_COLORS, fmtQty } from "../utils/globals";

import DirTable from "./DirTable";

const DIR_CFG={
  warehouses:{
    title:"Склады",color:C.tealText,colorDim:C.tealDim,icon:"▣",
    desc:"Складские помещения и адреса",
    cols:[{k:"name",label:"Наименование",bold:true},{k:"address",label:"Адрес",muted:true},{k:"company",label:"Компания",muted:true},{k:"active",label:"Статус",badge:true}],
    fields:[{k:"name",l:"Наименование",req:true},{k:"address",l:"Адрес"},{k:"company",l:"Компания"},{k:"active",l:"Активен",tog:true}],
  },
  products:{
    title:"Товары",color:C.accentText,colorDim:C.accentDim,icon:"◈",
    desc:"Номенклатура товаров",
    cols:[{k:"name",label:"Наименование",bold:true}],
    fields:[{k:"name",l:"Наименование",req:true}],
  },
  cp_categories:{
    title:"Категории контрагентов",color:C.accentText,colorDim:C.accentDim,icon:"⊟",
    desc:"Регионы, VIP, Дистрибьюторы...",
    cols:[{k:"name",label:"Название",bold:true},{k:"sort_order",label:"Порядок",muted:true},{k:"is_active",label:"Статус",badge:true}],
    fields:[{k:"name",l:"Название",req:true},{k:"sort_order",l:"Порядок сортировки",num:true},{k:"is_active",l:"Активна",tog:true}],
  },
  counterparties: { 
    title:"Контрагенты",color:C.accentText,colorDim:C.accentDim,icon:"◎",
    desc:"Покупатели и поставщики",
    cols:[
      {k:"name",label:"Наименование",bold:true},
      {k:"type",label:"Тип",custom:"cpType"},
      {k:"category_id",label:"Категория",custom:"cpCat"},
      {k:"inn",label:"ИНН",mono:true,muted:true},
      {k:"phone",label:"Телефон",muted:true},
      {k:"email",label:"Email",muted:true},
      {k:"credit_limit",label:"Лимит",custom:"money"},
      {k:"active",label:"Статус",badge:true},
    ],
    fields:[
      {k:"name",l:"Наименование",req:true},
      {k:"type",l:"Тип",sel:["legal","individual"],selL:["Юрлицо","Физлицо"]},
      {k:"category_id",l:"Категория",selDyn:"cpCategories"},
      {k:"inn",l:"ИНН (10 или 12 цифр)",max:12},
      {k:"kpp",l:"КПП (9 цифр, для юрлиц)",max:9},
      {k:"phone",l:"Телефон"},
      {k:"email",l:"Email"},
      {k:"address",l:"Адрес"},
      {k:"credit_limit",l:"Кредитный лимит (₽)",num:true},
      {k:"credit_days",l:"Дней отсрочки",num:true},
      {k:"active",l:"Активен",tog:true},
    ],
  },
  grades:{title:"Сорта",color:C.yellowText,colorDim:C.yellowDim,icon:"★",desc:"Сортность товара",cols:[{k:"name",label:"Наименование",bold:true},{k:"code",label:"Код",mono:true,color:C.yellowText},{k:"sort_order",label:"Порядок",muted:true},{k:"active",label:"Статус",badge:true}],fields:[{k:"name",l:"Наименование",req:true},{k:"code",l:"Код",req:true},{k:"sort_order",l:"Порядок",num:true},{k:"active",l:"Активен",tog:true}]},
  units:{title:"Единицы измерения",color:C.greenText,colorDim:C.greenDim,icon:"⊡",desc:"Кг, тонна, литр и другие",cols:[{k:"name",label:"Наименование",bold:true},{k:"short",label:"Сокр.",mono:true,color:C.greenText},{k:"okei",label:"Код ОКЕИ",muted:true},{k:"active",label:"Статус",badge:true}],fields:[{k:"name",l:"Полное наименование",req:true},{k:"short",l:"Сокращение",req:true},{k:"okei",l:"Код ОКЕИ"},{k:"active",l:"Активна",tog:true}]},
  countries:{title:"Страны",color:C.purpleText,colorDim:C.purpleDim,icon:"◎",desc:"Страны происхождения товара",cols:[{k:"name",label:"Страна",bold:true},{k:"alpha2",label:"Alpha-2",mono:true,color:C.purpleText},{k:"alpha3",label:"Alpha-3",mono:true,color:C.purpleText},{k:"code",label:"Числ. код",muted:true},{k:"active",label:"Статус",badge:true}],fields:[{k:"name",l:"Название",req:true},{k:"alpha2",l:"Alpha-2",req:true,max:2},{k:"alpha3",l:"Alpha-3",req:true,max:3},{k:"code",l:"Числовой код"},{k:"active",l:"Активна",tog:true}]},
  currencies:{title:"Валюты",color:C.yellowText,colorDim:C.yellowDim,icon:"$",desc:"Мультивалютные расчёты",cols:[{k:"code",label:"Код",mono:true,color:C.yellowText,bold:true},{k:"name",label:"Наименование",bold:false},{k:"symbol",label:"Символ",mono:true,muted:true},{k:"is_base",label:"Базовая",custom:"bool"},{k:"active",label:"Статус",badge:true}],fields:[{k:"code",l:"Код (RUB)",req:true,max:3},{k:"name",l:"Наименование"},{k:"symbol",l:"Символ (₽)"},{k:"is_base",l:"Базовая валюта",tog:true},{k:"active",l:"Активна",tog:true}]},
  articles:{title:"Статьи ДДС",color:C.purpleText,colorDim:C.purpleDim,icon:"≡",desc:"Классификация платежей",cols:[{k:"name",label:"Статья",bold:true},{k:"direction",label:"Направление",custom:"direction"},{k:"active",label:"Статус",badge:true}],fields:[{k:"name",l:"Название статьи",req:true},{k:"direction",l:"Направление",sel:["incoming","outgoing","any"],selL:["Входящие","Исходящие","Любое"]},{k:"active",l:"Активна",tog:true}]},
  accounts:{title:"Счета и кассы",color:C.greenText,colorDim:C.greenDim,icon:"⊞",desc:"Расчётные счета и кассы",cols:[{k:"name",label:"Наименование",bold:true},{k:"type",label:"Тип",custom:"accountType"},{k:"currency",label:"Валюта",mono:true,muted:true},{k:"balance",label:"Остаток",custom:"money"},{k:"active",label:"Статус",badge:true}],fields:[{k:"name",l:"Наименование",req:true},{k:"type",l:"Тип",sel:["bank","cash"],selL:["Расчётный счёт","Касса"]},{k:"currency",l:"Валюта"},{k:"account_number",l:"Номер счёта (необязательно)"},{k:"bik",l:"БИК банка (необязательно)"},{k:"bank_name",l:"Название банка (необязательно)"},{k:"active",l:"Активен",tog:true},{k:"is_default",l:"Касса по умолчанию",tog:true}]},
  users:{title:"Пользователи",color:C.accentText,colorDim:C.accentDim,icon:"◈",desc:"Пользователи системы",cols:[{k:"name",label:"Имя",bold:true},{k:"login",label:"Логин",mono:true,color:C.accentText},{k:"email",label:"Email",muted:true},{k:"active",label:"Статус",badge:true}],fields:[{k:"name",l:"Полное имя",req:true},{k:"login",l:"Логин",req:true},{k:"email",l:"Email",req:true},{k:"active",l:"Активен",tog:true}]},
};

const DIR_DATA_MAP={
  warehouses:INIT_WAREHOUSES, products:INIT_PRODUCTS,
  counterparties:INIT_CP, grades:ALL_GRADES, units:INIT_UNITS, countries:INIT_COUNTRIES,
  currencies:INIT_CURRENCIES, articles:INIT_ARTICLES, accounts:INIT_ACCOUNTS,
  roles:INIT_ROLES, users:INIT_USERS,
};

function DirRow({icon,color,colorDim,title,desc,total,active,onClick,onHandleDragStart,onDragOver,onDrop,onDragEnd,isDragOver}){
  return(
    <div onDragOver={onDragOver} onDrop={onDrop} onDragEnd={onDragEnd}
      onMouseEnter={e=>e.currentTarget.style.background=C.surfaceHover}
      onMouseLeave={e=>e.currentTarget.style.background=C.surface}
      style={{display:"flex",alignItems:"center",gap:10,background:C.surface,border:`1px solid ${isDragOver?C.accent:C.border}`,borderLeft:`4px solid ${color}`,borderRadius:8,padding:"11px 14px",transition:"background 0.15s,border-color 0.15s"}}>
      {onHandleDragStart&&(
        <span draggable onDragStart={onHandleDragStart} title="Перетащите, чтобы изменить порядок"
          style={{color:C.textDim,fontSize:15,cursor:"grab",userSelect:"none",lineHeight:1,flexShrink:0,padding:"0 2px"}}>⠿</span>
      )}
      <div onClick={onClick} style={{display:"flex",alignItems:"center",gap:14,flex:1,minWidth:0,cursor:"pointer"}}>
        <div style={{width:34,height:34,borderRadius:7,background:colorDim,display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,color,flexShrink:0}}>{icon}</div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{color:C.text,fontWeight:600,fontSize:14}}>{title}</div>
          <div style={{color:C.textMuted,fontSize:12,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{desc}</div>
        </div>
        {total!=null&&(
          <div style={{color:C.textMuted,fontSize:12,whiteSpace:"nowrap"}}>
            <span style={{color,fontWeight:700,fontFamily:"'JetBrains Mono',monospace"}}>{total}</span> всего
            {active!=null&&<> · <span style={{color:C.greenText,fontWeight:700,fontFamily:"'JetBrains Mono',monospace"}}>{active}</span> активных</>}
          </div>
        )}
        <div style={{color:C.textDim,fontSize:18}}>›</div>
      </div>
    </div>
  );
}

function CurrencyRates({currencies}){
  const [rates,setRates]=useState([]);
  const [loading,setLoading]=useState(true);
  const [filterCur,setFilterCur]=useState("");
  const [modal,setModal]=useState(null);
  const [form,setForm]=useState({currency_id:"",rate_date:new Date().toISOString().slice(0,10),rate:""});
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const setF=(k,v)=>setForm(f=>({...f,[k]:v}));

  const load=()=>{
    setLoading(true);
    api('/currency-rates').then(rows=>setRates(rows)).catch(()=>{}).finally(()=>setLoading(false));
  };
  useEffect(()=>{load();},[]);

  const filtered=rates.filter(r=>!filterCur||String(r.currency_id)===String(filterCur));

  const handleSave=async()=>{
    if(!form.currency_id){setError("Выберите валюту");return;}
    if(!form.rate||parseFloat(form.rate)<=0){setError("Укажите курс");return;}
    if(!form.rate_date){setError("Укажите дату");return;}
    setSaving(true);setError("");
    try{
      if(modal.id){
        await api(`/currency-rates/${modal.id}`,"PUT",{currency_id:parseInt(form.currency_id),rate_date:form.rate_date,rate:parseFloat(form.rate)});
      } else {
        await api("/currency-rates","POST",{currency_id:parseInt(form.currency_id),rate_date:form.rate_date,rate:parseFloat(form.rate)});
      }
      setModal(null);load();
    }catch(e){
      try{setError(JSON.parse(e.message).error||e.message);}catch{setError(e.message);}
    }finally{setSaving(false);}
  };

  const handleDelete=async(id)=>{
    if(!window.confirm("Удалить курс?")) return;
    await api(`/currency-rates/${id}`,"DELETE").catch(()=>{});
    load();
  };

  const openAdd=()=>{
    const nonRub=(currencies||[]).find(c=>c.code!=="RUB"&&(c.active||c.is_active));
    setForm({currency_id:nonRub?.id||"",rate_date:new Date().toISOString().slice(0,10),rate:""});
    setError("");setModal({});
  };
  const openEdit=(r)=>{
    setForm({currency_id:r.currency_id,rate_date:r.rate_date?.slice(0,10)||"",rate:r.rate});
    setError("");setModal({id:r.id});
  };

  const sel={width:"100%",background:C.bg,border:`1px solid ${C.borderLight}`,color:C.text,borderRadius:6,padding:"8px 12px",fontSize:13,outline:"none"};

  return(
    <div style={{display:"flex",justifyContent:"center",padding:"28px 24px"}}>
    <div style={{width:"fit-content",maxWidth:"100%"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
        <div>
          <h1 style={{margin:0,color:C.text,fontSize:20,fontWeight:700}}>Курсы валют</h1>
          <div style={{color:C.textMuted,fontSize:13,marginTop:4}}>{rates.length} записей</div>
        </div>
        <Btn primary onClick={openAdd}>+ Добавить курс</Btn>
      </div>
      <Card style={{padding:"12px 16px",marginBottom:16,width:"100%"}}>
        <div style={{display:"flex",gap:12,alignItems:"center"}}>
          <span style={{color:C.textMuted,fontSize:12}}>Валюта:</span>
          <select value={filterCur} onChange={e=>setFilterCur(e.target.value)} style={{...sel,width:200}}>
            <option value="">Все валюты</option>
            {(currencies||[]).filter(c=>c.code!=="RUB").map(c=><option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
          </select>
        </div>
      </Card>
      {loading?<div style={{padding:32,textAlign:"center",color:C.textMuted}}>Загрузка...</div>:
      <Card style={{overflow:"hidden"}}>
        <table style={{borderCollapse:"collapse"}}>
          <thead><tr style={{background:C.surface}}>
            {["Валюта","Дата","Курс (за 1 ед. в RUB)",""].map((h,i)=>(
              <th key={i} style={{padding:"10px 14px",textAlign:i===2?"right":"left",color:C.textMuted,fontSize:11,fontWeight:600,borderBottom:`1px solid ${C.border}`,whiteSpace:"nowrap"}}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {filtered.length===0&&<tr><td colSpan={4} style={{padding:32,textAlign:"center",color:C.textDim}}>Нет курсов</td></tr>}
            {filtered.map(r=>(
              <tr key={r.id} style={{borderBottom:`1px solid ${C.border}40`}}
                onMouseEnter={e=>e.currentTarget.style.background=C.surface}
                onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <td style={{padding:"10px 14px",fontWeight:600,color:C.yellowText,fontFamily:"monospace"}}>{r.currency_code||r.currency_id}</td>
                <td style={{padding:"10px 14px",color:C.textMuted,fontSize:13}}>{fmtDate(r.rate_date)}</td>
                <td style={{padding:"10px 14px",textAlign:"right",fontWeight:700,fontFamily:"monospace",fontSize:14}}>{parseFloat(r.rate).toLocaleString("ru-RU",{minimumFractionDigits:2,maximumFractionDigits:4})} ₽</td>
                <td style={{padding:"10px 14px",textAlign:"right"}}>
                  <div style={{display:"flex",gap:6,justifyContent:"flex-end"}}>
                    <button onClick={()=>openEdit(r)} style={{padding:"3px 10px",background:"transparent",border:`1px solid ${C.borderLight}`,color:C.textMuted,borderRadius:4,cursor:"pointer",fontSize:12}}>Изменить</button>
                    <button onClick={()=>handleDelete(r.id)} style={{padding:"3px 8px",background:"transparent",border:`1px solid ${C.redDim}`,color:C.redText,borderRadius:4,cursor:"pointer",fontSize:12}}>✕</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>}

      {modal&&<div onClick={e=>{if(e.target===e.currentTarget)setModal(null);}} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center"}}>
        <div style={{background:C.surface,border:`1px solid ${C.borderLight}`,borderRadius:10,width:400,padding:24}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
            <h2 style={{margin:0,color:C.text,fontSize:15,fontWeight:700}}>{modal.id?"Изменить курс":"Добавить курс"}</h2>
            <button onClick={()=>setModal(null)} style={{background:"none",border:"none",color:C.textMuted,cursor:"pointer",fontSize:20}}>×</button>
          </div>
          <div style={{marginBottom:12}}>
            <Lbl req>Валюта</Lbl>
            <select value={form.currency_id} onChange={e=>setF("currency_id",e.target.value)} style={sel}>
              <option value="">— Выберите —</option>
              {(currencies||[]).filter(c=>c.code!=="RUB"&&(c.active||c.is_active)).map(c=><option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
            </select>
          </div>
          <div style={{marginBottom:12}}>
            <Lbl req>Дата</Lbl>
            <input type="date" value={form.rate_date} onChange={e=>setF("rate_date",e.target.value)} style={{...sel,colorScheme:C.scheme}}/>
          </div>
          <div style={{marginBottom:16}}>
            <Lbl req>Курс (1 единица = ? RUB)</Lbl>
            <Inp value={form.rate} onChange={v=>setF("rate",v)} placeholder="например 78.50"/>
          </div>
          {error&&<div style={{color:C.redText,fontSize:12,marginBottom:8}}>{error}</div>}
          <div style={{display:"flex",justifyContent:"flex-end",gap:8}}>
            <Btn onClick={()=>setModal(null)}>Отмена</Btn>
            <Btn primary onClick={handleSave} disabled={saving}>{saving?"Сохранение...":"Сохранить"}</Btn>
          </div>
        </div>
      </div>}
    </div>
    </div>
  );
}

function LegalEntitiesDir({data,setData,onBack}){
  const [rows,setRows]=useState([]);
  const [loading,setLoading]=useState(true);
  const [modal,setModal]=useState(null);
  const [form,setForm]=useState({name:"",inn:"",kpp:"",is_active:true});
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const setF=(k,v)=>setForm(f=>({...f,[k]:v}));
  const inp={width:"100%",background:C.bg,border:`1px solid ${C.borderLight}`,color:C.text,borderRadius:6,padding:"8px 12px",fontSize:13,outline:"none"};

  const load=()=>{
    setLoading(true);
    api('/legal-entities').then(r=>{setRows(r);if(setData)setData(r);}).catch(()=>{}).finally(()=>setLoading(false));
  };
  useEffect(()=>{load();},[]);

  const openAdd=()=>{setForm({name:"",inn:"",kpp:"",is_active:true});setError("");setModal({});};
  const openEdit=r=>{setForm({name:r.name,inn:r.inn||"",kpp:r.kpp||"",is_active:r.is_active});setError("");setModal({id:r.id});};

  const handleSave=async()=>{
    if(!form.name.trim()){setError("Укажите название");return;}
    setSaving(true);setError("");
    try{
      if(modal.id) await api(`/legal-entities/${modal.id}`,"PUT",form);
      else await api("/legal-entities","POST",form);
      setModal(null);load();
    }catch(e){
      try{setError(JSON.parse(e.message).error||e.message);}catch{setError(e.message);}
    }finally{setSaving(false);}
  };

  const handleDelete=async id=>{
    if(!window.confirm("Удалить юридическое лицо?")) return;
    await api(`/legal-entities/${id}`,"DELETE").catch(()=>{});
    load();
  };

  return(
    <div style={{display:"flex",justifyContent:"center",padding:"28px 24px"}}>
    <div style={{width:"fit-content",maxWidth:"100%"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <button onClick={onBack} style={{padding:"7px 14px",background:"transparent",border:`1px solid ${C.borderLight}`,color:C.text,borderRadius:6,cursor:"pointer",fontSize:13,fontWeight:600}}>← Назад</button>
          <h1 style={{margin:0,color:C.text,fontSize:20,fontWeight:700}}>Юридические лица</h1>
        </div>
        <Btn primary onClick={openAdd}>+ Добавить</Btn>
      </div>
      {loading?<div style={{padding:32,textAlign:"center",color:C.textMuted}}>Загрузка...</div>:
      <Card style={{overflow:"hidden"}}>
        <table style={{borderCollapse:"collapse"}}>
          <thead><tr style={{background:C.surface}}>
            {["Название","ИНН","КПП","Статус",""].map((h,i)=>(
              <th key={i} style={{padding:"10px 14px",textAlign:"left",color:C.textMuted,fontSize:11,fontWeight:600,borderBottom:`1px solid ${C.border}`,whiteSpace:"nowrap"}}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {rows.length===0&&<tr><td colSpan={5} style={{padding:32,textAlign:"center",color:C.textDim}}>Нет юридических лиц</td></tr>}
            {rows.map(r=>(
              <tr key={r.id} onDoubleClick={()=>openEdit(r)} style={{borderBottom:`1px solid ${C.border}40`,cursor:"pointer"}}
                onMouseEnter={e=>e.currentTarget.style.background=C.surface}
                onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <td style={{padding:"10px 14px",fontWeight:600,color:C.text}}>{r.name}</td>
                <td style={{padding:"10px 14px",color:C.textMuted,fontFamily:"monospace",fontSize:12}}>{r.inn||"—"}</td>
                <td style={{padding:"10px 14px",color:C.textMuted,fontFamily:"monospace",fontSize:12}}>{r.kpp||"—"}</td>
                <td style={{padding:"10px 14px"}}>
                  <span style={{padding:"2px 8px",borderRadius:8,fontSize:11,fontWeight:600,background:r.is_active?C.greenDim:C.border,color:r.is_active?C.greenText:C.textMuted}}>
                    {r.is_active?"Активно":"Неактивно"}
                  </span>
                </td>
                <td style={{padding:"10px 14px",textAlign:"right"}}>
                  <div style={{display:"flex",gap:6,justifyContent:"flex-end"}}>
                    <button onClick={()=>openEdit(r)} style={{padding:"3px 10px",background:"transparent",border:`1px solid ${C.borderLight}`,color:C.textMuted,borderRadius:4,cursor:"pointer",fontSize:12}}>Изменить</button>
                    <button onClick={()=>handleDelete(r.id)} style={{padding:"3px 8px",background:"transparent",border:`1px solid ${C.redDim}`,color:C.redText,borderRadius:4,cursor:"pointer",fontSize:12}}>✕</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>}
      {modal&&<div onClick={e=>{if(e.target===e.currentTarget)setModal(null);}} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center"}}>
        <div style={{background:C.surface,border:`1px solid ${C.borderLight}`,borderRadius:10,width:440,padding:24}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
            <h2 style={{margin:0,color:C.text,fontSize:15,fontWeight:700}}>{modal.id?"Изменить юрлицо":"Новое юридическое лицо"}</h2>
            <button onClick={()=>setModal(null)} style={{background:"none",border:"none",color:C.textMuted,cursor:"pointer",fontSize:20}}>×</button>
          </div>
          <div style={{marginBottom:12}}><Lbl req>Название</Lbl><input value={form.name} onChange={e=>setF("name",e.target.value)} placeholder="ООО Пример" style={inp}/></div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
            <div><Lbl>ИНН</Lbl><input value={form.inn} onChange={e=>setF("inn",e.target.value)} placeholder="1234567890" maxLength={12} style={inp}/></div>
            <div><Lbl>КПП</Lbl><input value={form.kpp} onChange={e=>setF("kpp",e.target.value)} placeholder="123456789" maxLength={9} style={inp}/></div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16,cursor:"pointer"}} onClick={()=>setF("is_active",!form.is_active)}>
            <div style={{width:32,height:18,borderRadius:9,background:form.is_active?C.accent:C.border,position:"relative",transition:"background 0.2s",flexShrink:0}}>
              <div style={{width:14,height:14,borderRadius:"50%",background:"#fff",position:"absolute",top:2,left:form.is_active?16:2,transition:"left 0.2s"}}/>
            </div>
            <span style={{color:C.textMuted,fontSize:13}}>Активно</span>
          </div>
          {error&&<div style={{color:C.redText,fontSize:12,marginBottom:8}}>{error}</div>}
          <div style={{display:"flex",justifyContent:"flex-end",gap:8}}>
            <Btn onClick={()=>setModal(null)}>Отмена</Btn>
            <Btn primary onClick={handleSave} disabled={saving}>{saving?"Сохранение...":"Сохранить"}</Btn>
          </div>
        </div>
      </div>}
    </div>
    </div>
  );
}

function Directories({cp,setCp,cpCategories,setCpCategories,grades,setGrades,units,setUnits,countries,setCountries,currencies,setCurrencies,articles,setArticles,accounts,setAccounts,warehouses,setWarehouses,roles,setRoles,users,setUsers,products,setProducts,categories,onAddCategory,legalEntities,setLegalEntities,currentUser}){
  const [recalcLoading,setRecalcLoading]=useState(false);
  const [recalcResult,setRecalcResult]=useState(null);
  const handleRecalc=async()=>{
    setRecalcLoading(true);setRecalcResult(null);
    try{
      const r=await api('/recalculate-stock','POST',{});
      setRecalcResult(r.message);
    }catch(e){setRecalcResult('Ошибка: '+e.message);}
    finally{setRecalcLoading(false);}
  };
  const [open,setOpen]=useState(null);
  const ORDER_KEY=`directories_order_${currentUser?.id||"anon"}`;
  const [order,setOrder]=useState(()=>{try{const v=JSON.parse(localStorage.getItem(ORDER_KEY));return Array.isArray(v)?v:null;}catch{return null;}});
  const [dragOverKey,setDragOverKey]=useState(null);
  const dragKey=useRef(null);
  const saveOrder=keys=>{setOrder(keys);try{localStorage.setItem(ORDER_KEY,JSON.stringify(keys));}catch{}};
  const isMobile=useIsMobile();

  // При открытии справочника контрагентов загружаем всех (включая неактивных)
  const handleOpen = key => {
    if (key === 'counterparties') {
      api('/counterparties?all=true').then(r => setCp(r.map(c=>({...c,active:c.is_active})))).catch(()=>{});
    }
    setOpen(key);
  };
  const dataMap={
    cp_categories:[cpCategories,setCpCategories],
    counterparties:[cp,setCp],
    warehouses:[warehouses,setWarehouses],
    products:[products,setProducts],
    grades:[grades,setGrades],units:[units,setUnits],countries:[countries,setCountries],
    currencies:[currencies,setCurrencies],articles:[articles,setArticles],
    accounts:[accounts,setAccounts],roles:[roles,setRoles],users:[users,setUsers],
  };
  const dirs=[
    {key:"cp_categories",color:C.accentText,colorDim:C.accentDim,icon:"⊟"},
    {key:"counterparties",color:C.accentText,colorDim:C.accentDim,icon:"◎"},
    {key:"warehouses",color:C.tealText,colorDim:C.tealDim,icon:"▣"},
    {key:"products",color:C.accentText,colorDim:C.accentDim,icon:"◈"},
    {key:"grades",color:C.yellowText,colorDim:C.yellowDim,icon:"★"},
    {key:"units",color:C.greenText,colorDim:C.greenDim,icon:"⊡"},
    {key:"countries",color:C.purpleText,colorDim:C.purpleDim,icon:"◎"},
    {key:"currencies",color:C.yellowText,colorDim:C.yellowDim,icon:"$"},
    {key:"articles",color:C.purpleText,colorDim:C.purpleDim,icon:"≡"},
    {key:"accounts",color:C.greenText,colorDim:C.greenDim,icon:"⊞"},
    {key:"users",color:C.accentText,colorDim:C.accentDim,icon:"◈"},
  ].map(d=>({...d,...DIR_CFG[d.key],data:dataMap[d.key][0],setData:dataMap[d.key][1]}));

  if(open==="currency_rates") return <CurrencyRates currencies={currencies}/>;
  if(open==="legal_entities") return <LegalEntitiesDir data={legalEntities||[]} setData={setLegalEntities} onBack={()=>setOpen(null)}/>;

  if(open){
    const d=dirs.find(d=>d.key===open);
    return <DirTable configKey={open} data={d.data} setData={d.setData} onBack={()=>setOpen(null)}
      roles={roles} categories={categories} onAddCategory={onAddCategory} cpCategories={cpCategories} units={units} countries={countries} grades={grades} currencies={currencies} legalEntities={legalEntities||[]} currentUser={currentUser}/>;
  }

  // ── элементы лендинга + порядок/перетаскивание ──
  const landingItems=[
    ...dirs.map(d=>{
      const hasActive=d.data.some(r=>"active" in r||"is_active" in r);
      return {key:d.key,icon:d.icon,color:d.color,colorDim:d.colorDim,title:d.title,desc:d.desc,total:d.data.length,active:hasActive?d.data.filter(r=>r.active||r.is_active).length:null,onClick:()=>handleOpen(d.key)};
    }),
    {key:"currency_rates",icon:"%",color:C.yellowText,colorDim:C.yellowDim,title:"Курсы валют",desc:"Исторические курсы по датам",total:null,active:null,onClick:()=>setOpen("currency_rates")},
    {key:"legal_entities",icon:"🏢",color:C.tealText,colorDim:C.tealDim,title:"Юридические лица",desc:"Наши юрлица для привязки к контрагентам",total:(legalEntities||[]).length,active:(legalEntities||[]).filter(l=>l.is_active).length,onClick:()=>setOpen("legal_entities")},
  ];
  const itemMap=Object.fromEntries(landingItems.map(i=>[i.key,i]));
  const orderedKeys=(order||[]).filter(k=>itemMap[k]);
  landingItems.forEach(i=>{if(!orderedKeys.includes(i.key))orderedKeys.push(i.key);});
  const items=orderedKeys.map(k=>itemMap[k]);
  const handleDrop=targetKey=>{
    const from=dragKey.current;
    setDragOverKey(null);dragKey.current=null;
    if(!from||from===targetKey)return;
    const keys=items.map(i=>i.key);
    const fi=keys.indexOf(from),ti=keys.indexOf(targetKey);
    if(fi<0||ti<0)return;
    keys.splice(fi,1);keys.splice(ti,0,from);
    saveOrder(keys);
  };
  return(
    <div style={{display:"flex",justifyContent:"center",padding:"28px 24px"}}>
    <div style={{width:"100%",maxWidth:1080}}>
      <div style={{marginBottom:20}}>
        <h1 style={{margin:0,color:C.text,fontSize:20,fontWeight:700}}>Справочники</h1>
        <div style={{color:C.textMuted,fontSize:13,marginTop:4}}>Нажмите на строку чтобы открыть</div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10}}>
        {items.map(it=>(
          <DirRow key={it.key} icon={it.icon} color={it.color} colorDim={it.colorDim} title={it.title} desc={it.desc} total={it.total} active={it.active} onClick={it.onClick}
            isDragOver={dragOverKey===it.key}
            onHandleDragStart={isMobile?undefined:e=>{dragKey.current=it.key;e.dataTransfer.effectAllowed="move";e.dataTransfer.setData("text/plain",it.key);}}
            onDragOver={isMobile?undefined:e=>{e.preventDefault();if(dragOverKey!==it.key)setDragOverKey(it.key);}}
            onDrop={isMobile?undefined:e=>{e.preventDefault();handleDrop(it.key);}}
            onDragEnd={isMobile?undefined:()=>{dragKey.current=null;setDragOverKey(null);}}/>
        ))}
      </div>
      <div style={{marginTop:20,padding:"14px 18px",background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,color:C.textMuted,fontSize:13,lineHeight:1.6}}>
        <span style={{color:C.accentText,fontWeight:600}}>Категории товаров</span> добавляются в карточке товара — кнопка «+» рядом с полем Категория.
      </div>
      <div style={{marginTop:16,padding:"18px 20px",background:C.surface,border:`1px solid ${C.border}`,borderRadius:8}}>
        <div style={{color:C.text,fontWeight:700,fontSize:14,marginBottom:8}}>⚙ Администрирование</div>
        <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
          <button onClick={handleRecalc} disabled={recalcLoading} style={{padding:"8px 18px",background:recalcLoading?C.tealDim:C.teal,border:"none",color:recalcLoading?C.onTealDim:"#fff",borderRadius:6,cursor:recalcLoading?"not-allowed":"pointer",fontSize:13,fontWeight:600}}>{recalcLoading?"Пересчёт...":"🔄 Пересчитать остатки"}</button>
          <div style={{color:C.textMuted,fontSize:12}}>Синхронизирует остатки на складе с движениями товаров</div>
        </div>
        {recalcResult&&<div style={{marginTop:10,color:C.greenText,fontSize:13,fontWeight:600}}>{recalcResult}</div>}
      </div>
    </div>
    </div>
  );
}






// ─── ЭКРАН АВТОРИЗАЦИИ ────────────────────────────────────────────────────────

export default Directories;
