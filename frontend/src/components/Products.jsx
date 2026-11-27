import { useState, useMemo, useRef, useEffect } from "react";
import { C, fmt, fmtDate, uniq, api, NAV, ROLE_PERMISSIONS, canAccess,
  Card, Btn, Lbl, Inp, Sel, Toggle, ConfirmDialog, PageHeader,
  StatusBadge, DTable, SectionCard, inDateRange, DateFilter,
  INIT_WAREHOUSES, INIT_CATEGORIES, INIT_UNITS, INIT_COUNTRIES, INIT_CURRENCIES,
  INIT_ARTICLES, INIT_ACCOUNTS, INIT_ROLES, INIT_USERS, INIT_CP_CATEGORIES,
  INIT_CP, INIT_PRODUCTS, INIT_PAYMENTS, INVOICES, PURCHASES, TRANSFERS,
  STOCK_DATA, MOVEMENTS, PURCHASE_LINES, INVOICE_LINES, STOCK_BY_PRODUCT,
  ALL_GRADES, INIT_WRITE_OFFS, INIT_RETURNS, WO_REASONS, WO_REASON_COLORS, onAppearanceChange } from "../utils/globals";

import ProductCard from "./ProductCard";

function Products({products,categories,onOpen,onAddCategory}){
  const [search,setSearch]=useState("");
  const [catFilter,setCatFilter]=useState("");
  const filtered=products.filter(p=>{
    const cn=categories.find(c=>c.id===p.category_id)?.name||"";
    return(!search||p.name.toLowerCase().includes(search.toLowerCase())||p.sku.toLowerCase().includes(search.toLowerCase()))&&(!catFilter||cn===catFilter);
  });
  return(
    <div style={{padding:"28px 32px"}}>
      <PageHeader title="Справочник товаров" subtitle={`${products.length} позиций · ${products.filter(p=>p.active).length} активных`} actions={<Btn primary>+ Добавить товар</Btn>}/>
      <div style={{display:"flex",gap:10,marginBottom:16}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Поиск по наименованию или артикулу..." style={{background:C.surface,border:`1px solid ${C.border}`,color:C.text,borderRadius:6,padding:"8px 14px",fontSize:13,width:340,outline:"none"}}/>
        <select value={catFilter} onChange={e=>setCatFilter(e.target.value)} style={{background:C.surface,border:`1px solid ${C.border}`,color:catFilter?C.text:C.textMuted,borderRadius:6,padding:"8px 12px",fontSize:13,outline:"none"}}>
          <option value="">Все категории</option>{categories.map(c=><option key={c.id} value={c.name}>{c.name}</option>)}
        </select>
        {(search||catFilter)&&<button onClick={()=>{setSearch("");setCatFilter("");}} style={{background:"none",border:`1px solid ${C.border}`,color:C.textMuted,borderRadius:6,padding:"8px 14px",cursor:"pointer",fontSize:13}}>× Сбросить</button>}
      </div>
      <Card>
        <DTable headers={["Артикул","Наименование","Категория","Ед.","Сорта","Мин. остаток","Статус",""]}
          rows={filtered.map(p=>[
            <span style={{color:C.accentText,fontFamily:"monospace",fontSize:12}}>{p.sku}</span>,
            <span style={{fontWeight:500}}>{p.name}</span>,
            <span style={{color:C.textMuted}}>{categories.find(c=>c.id===p.category_id)?.name||"—"}</span>,
            <span style={{color:C.textMuted}}>{units.find(u=>u.id===p.default_unit_id)?.short||"—"}</span>,
            p.grade_ids.length>0?<div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{ALL_GRADES.filter(g=>p.grade_ids.includes(g.id)).slice(0,3).map(g=><span key={g.id} style={{background:C.accentDim,color:C.accentText,padding:"1px 8px",borderRadius:10,fontSize:11,fontWeight:600}}>{g.code}</span>)}{p.grade_ids.length>3&&<span style={{color:C.textDim,fontSize:11}}>+{p.grade_ids.length-3}</span>}</div>:<span style={{color:C.textDim,fontSize:12}}>Все сорта</span>,
            <span style={{color:C.textMuted}}>{p.min_stock>0?p.min_stock:"—"}</span>,
            <span style={{color:p.active?C.greenText:C.textMuted,background:p.active?C.greenDim:C.border,padding:"2px 10px",borderRadius:20,fontSize:12,fontWeight:600}}>{p.active?"Активен":"Неактивен"}</span>,
            <Btn small onClick={()=>onOpen(p)}>Открыть</Btn>,
          ])}/>
        <div style={{padding:"10px 14px",borderTop:`1px solid ${C.border}`,color:C.textDim,fontSize:12}}>Показано: {filtered.length} из {products.length}</div>
      </Card>
    </div>
  );
}




const _mk_DIR_CFG=()=>({
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
  roles:{title:"Роли",color:C.tealText,colorDim:C.tealDim,icon:"⬡",desc:"Роли пользователей системы",cols:[{k:"name",label:"Роль",bold:true},{k:"description",label:"Описание",muted:true},{k:"active",label:"Статус",badge:true}],fields:[{k:"name",l:"Название роли",req:true},{k:"description",l:"Описание"},{k:"active",l:"Активна",tog:true}]},
  users:{title:"Пользователи",color:C.accentText,colorDim:C.accentDim,icon:"◈",desc:"Пользователи системы",cols:[{k:"name",label:"Имя",bold:true},{k:"login",label:"Логин",mono:true,color:C.accentText},{k:"email",label:"Email",muted:true},{k:"role_id",label:"Роль",custom:"role_ref"},{k:"active",label:"Статус",badge:true}],fields:[{k:"name",l:"Полное имя",req:true},{k:"login",l:"Логин",req:true},{k:"email",l:"Email",req:true},{k:"role_id",l:"Роль",num:true},{k:"active",l:"Активен",tog:true}]},
});
let DIR_CFG=_mk_DIR_CFG(); onAppearanceChange(()=>{ DIR_CFG=_mk_DIR_CFG(); });

// ─── МОДАЛЬНОЕ ОКНО ПОЛЬЗОВАТЕЛЯ (с ролью, паролем, правами) ─────────────────
const SECTION_LABELS={
  dashboard:"Дашборд",invoices:"Продажи",purchases:"Закупки",payments:"Платежи",
  counterparties:"Взаиморасчёты",stock:"Остатки",movements:"Движение",
  transfers:"Перемещения",write_offs:"Списания",returns:"Возвраты",directories:"Справочники",
};


export default Products;
