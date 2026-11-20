import { useState, useMemo, useRef, useEffect } from "react";
import { C, fmt, fmtDate, uniq, api, NAV, ROLE_PERMISSIONS, canAccess,
  Card, Btn, Lbl, Inp, Sel, Toggle, ConfirmDialog, PageHeader,
  StatusBadge, DTable, SectionCard, inDateRange, DateFilter,
  INIT_WAREHOUSES, INIT_CATEGORIES, INIT_UNITS, INIT_COUNTRIES, INIT_CURRENCIES,
  INIT_ARTICLES, INIT_ACCOUNTS, INIT_ROLES, INIT_USERS, INIT_CP_CATEGORIES,
  INIT_CP, INIT_PRODUCTS, INIT_PAYMENTS, INVOICES, PURCHASES, TRANSFERS,
  STOCK_DATA, MOVEMENTS, PURCHASE_LINES, INVOICE_LINES, STOCK_BY_PRODUCT,
  ALL_GRADES, INIT_WRITE_OFFS, INIT_RETURNS, WO_REASONS, WO_REASON_COLORS } from "../utils/globals";

function GradesPicker({selectedIds,onChange,defaultGradeId,onDefaultChange}){
  const toggle=id=>{if(selectedIds.includes(id)){if(id===defaultGradeId)onDefaultChange(null);onChange(selectedIds.filter(i=>i!==id));}else onChange([...selectedIds,id]);};
  return(
    <div>
      <p style={{color:C.textMuted,fontSize:13,marginBottom:14,lineHeight:1.5}}>Отметьте сорта которые доступны для этого товара в накладной.</p>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(190px,1fr))",gap:8,marginBottom:16}}>
        {ALL_GRADES.map(g=>{const checked=selectedIds.includes(g.id);const isDef=defaultGradeId===g.id;return(
          <div key={g.id} onClick={()=>toggle(g.id)} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",borderRadius:6,cursor:"pointer",border:`1px solid ${checked?C.accent:C.border}`,background:checked?C.accentDim:C.bg,transition:"all 0.15s"}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:16,height:16,borderRadius:4,flexShrink:0,border:`2px solid ${checked?C.accent:C.borderLight}`,background:checked?C.accent:"transparent",display:"flex",alignItems:"center",justifyContent:"center"}}>{checked&&<span style={{color:"#fff",fontSize:10,fontWeight:700}}>✓</span>}</div>
              <div><div style={{color:checked?C.text:C.textMuted,fontSize:13,fontWeight:checked?500:400}}>{g.name}</div><div style={{color:C.textDim,fontSize:11,fontFamily:"monospace"}}>{g.code}</div></div>
            </div>
            {checked&&<div onClick={e=>{e.stopPropagation();onDefaultChange(isDef?null:g.id);}} title={isDef?"Снять дефолт":"Сделать дефолтом"} style={{width:22,height:22,borderRadius:4,display:"flex",alignItems:"center",justifyContent:"center",background:isDef?C.yellowDim:"transparent",border:`1px solid ${isDef?C.yellow:C.borderLight}`,color:isDef?C.yellowText:C.textDim,fontSize:13,cursor:"pointer",flexShrink:0}}>★</div>}
          </div>
        );})}
      </div>
      {selectedIds.length>0&&<div style={{padding:"12px 14px",background:C.bg,borderRadius:6,border:`1px solid ${C.border}`}}>
        <div style={{color:C.textDim,fontSize:11,marginBottom:8,textTransform:"uppercase",letterSpacing:"0.05em"}}>Превью в накладной:</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:6}}>{ALL_GRADES.filter(g=>selectedIds.includes(g.id)).map(g=><span key={g.id} style={{padding:"4px 12px",borderRadius:20,fontSize:12,fontWeight:600,background:defaultGradeId===g.id?C.yellowDim:C.accentDim,color:defaultGradeId===g.id?C.yellowText:C.accentText,border:`1px solid ${defaultGradeId===g.id?C.yellow:C.accent}`}}>{g.name}{defaultGradeId===g.id?" ★":""}</span>)}</div>
      </div>}

    </div>
  );
}


export default GradesPicker;
