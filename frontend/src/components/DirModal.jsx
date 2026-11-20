import { useState, useMemo, useRef, useEffect } from "react";
import { C, fmt, fmtDate, uniq, api, NAV, ROLE_PERMISSIONS, canAccess,
  Card, Btn, Lbl, Inp, Sel, Toggle, ConfirmDialog, PageHeader,
  StatusBadge, DTable, SectionCard, inDateRange, DateFilter,
  INIT_WAREHOUSES, INIT_CATEGORIES, INIT_UNITS, INIT_COUNTRIES, INIT_CURRENCIES,
  INIT_ARTICLES, INIT_ACCOUNTS, INIT_ROLES, INIT_USERS, INIT_CP_CATEGORIES,
  INIT_CP, INIT_PRODUCTS, INIT_PAYMENTS, INVOICES, PURCHASES, TRANSFERS,
  STOCK_DATA, MOVEMENTS, PURCHASE_LINES, INVOICE_LINES, STOCK_BY_PRODUCT,
  ALL_GRADES, INIT_WRITE_OFFS, INIT_RETURNS, WO_REASONS, WO_REASON_COLORS } from "../utils/globals";

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


export default DirModal;
