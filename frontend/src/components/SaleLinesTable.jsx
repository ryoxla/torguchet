import { useState, useMemo, useRef, useEffect } from "react";
import { C, fmt, fmtDate, uniq, api, NAV, ROLE_PERMISSIONS, canAccess,
  Card, Btn, Lbl, Inp, Sel, Toggle, ConfirmDialog, PageHeader,
  StatusBadge, DTable, SectionCard, inDateRange, DateFilter,
  INIT_WAREHOUSES, INIT_CATEGORIES, INIT_UNITS, INIT_COUNTRIES, INIT_CURRENCIES,
  INIT_ARTICLES, INIT_ACCOUNTS, INIT_ROLES, INIT_USERS, INIT_CP_CATEGORIES,
  INIT_CP, INIT_PRODUCTS, INIT_PAYMENTS, INVOICES, PURCHASES, TRANSFERS,
  STOCK_DATA, MOVEMENTS, PURCHASE_LINES, INVOICE_LINES, STOCK_BY_PRODUCT,
  ALL_GRADES, INIT_WRITE_OFFS, INIT_RETURNS, WO_REASONS, WO_REASON_COLORS, fmtQty } from "../utils/globals";

function SaleLinesTable({lines,addLine,updLine,delLine,inp,currencyCode="RUB",currencyRate=1,onSave,saving=false}){
  const [lineSort,setLineSort]=useState({col:"",dir:1});
  const [lineFilter,setLineFilter]=useState({product:"",batch:"",grade:"",country:"",supplier:"",unit:""});
  const setLF=(k,v)=>setLineFilter(f=>({...f,[k]:v}));
  const hasLineFilter=Object.values(lineFilter).some(v=>v);

  // Дублировать строку: max_qty = оригинальный остаток минус сумма всех qty по этой партии
  const dupLine=(l)=>{
    const batchKey=l.batch_id||l.product_id;
    const usedQty=lines
      .filter(x=>(x.batch_id||x.product_id)===batchKey)
      .reduce((s,x)=>s+(parseFloat(x.qty)||0),0);
    const originalMax=l.max_qty!=null?l.max_qty:0;
    // Вычитаем уже внесённые qty из оригинального остатка
    const remaining=Math.max(0, originalMax - usedQty + (parseFloat(l.qty)||0));
    // Пересчитываем max_qty для существующих строк этой партии тоже
    const newMax=Math.max(0, originalMax - usedQty);
    // Обновляем max_qty у всех строк этой партии
    lines.forEach(x=>{
      if((x.batch_id||x.product_id)===batchKey){
        updLine(x._key,"max_qty",newMax);
      }
    });
    // Добавляем новую строку
    delLine&&updLine&&addLine&&void 0; // ensure refs
    const newLine={
      ...l,
      _key:Date.now()+Math.random(),
      qty:"",
      max_qty:newMax,
    };
    // Используем внешний dupLine если есть, иначе через addLine trick
    // Передаём через событие — вызываем через addDupLine prop если есть
    if(typeof addLine._dup === 'function'){
      addLine._dup(newLine);
    }
  };

  const sortedLines=useMemo(()=>{
    let arr=[...lines];
    if(lineFilter.product) arr=arr.filter(l=>(l.product_name||"").toLowerCase().includes(lineFilter.product.toLowerCase()));
    if(lineFilter.batch)   arr=arr.filter(l=>(l.batch_number||"").toLowerCase().includes(lineFilter.batch.toLowerCase()));
    if(lineFilter.grade)   arr=arr.filter(l=>(l.grade_name||"").toLowerCase().includes(lineFilter.grade.toLowerCase()));
    if(lineFilter.country) arr=arr.filter(l=>(l.country_name||"").toLowerCase().includes(lineFilter.country.toLowerCase()));
    if(lineFilter.supplier) arr=arr.filter(l=>(l.supplier_name||"").toLowerCase().includes(lineFilter.supplier.toLowerCase()));
    if(lineFilter.unit) arr=arr.filter(l=>(l.unit_short||"").toLowerCase().includes(lineFilter.unit.toLowerCase()));
    if(lineSort.col){
      const val=(x,col)=>{
        if(col==="purchase_date") return x.purchase_date?new Date(x.purchase_date).getTime():0;
        if(col==="product")  return x.product_name||"";
        if(col==="batch")    return x.batch_number||"";
        if(col==="grade")    return x.grade_name||"";
        if(col==="country")  return x.country_name||"";
        if(col==="supplier") return x.supplier_name||"";
        if(col==="qty")      return parseFloat(x.qty)||0;
        if(col==="price")    return parseFloat(x.price)||0;
        return (parseFloat(x.qty)||0)*(parseFloat(x.price)||0);
      };
      arr.sort((a,b)=>{
        const va=val(a,lineSort.col), vb=val(b,lineSort.col);
        return typeof va==="string"?va.localeCompare(vb)*lineSort.dir:(va-vb)*lineSort.dir;
      });
    }
    return arr;
  },[lines,lineSort,lineFilter]);
  const toggleSort=col=>setLineSort(s=>s.col===col?{col,dir:s.dir*-1}:{col,dir:1});
  const SortTh=({col,children,className})=>{
    const active=lineSort.col===col;
    return <th className={className} onClick={()=>toggleSort(col)} style={{cursor:"pointer",userSelect:"none",whiteSpace:"nowrap"}}>
      {children}{active?(lineSort.dir===1?" ↑":" ↓"):" ↕"}
    </th>;
  };
  const fInp={background:C.bg,border:`1px solid ${C.borderLight}`,color:C.text,borderRadius:3,padding:"3px 6px",fontSize:11,outline:"none",width:"100%"};
  const filtTotal=sortedLines.reduce((s,l)=>{const q=parseFloat(l.qty)||0,p=parseFloat(l.price)||0;return s+q*p;},0);

  // Пересчёт max_qty с учётом дублей той же партии
  const getEffectiveMax=(l)=>{
    if(l.max_qty==null) return null;
    const batchKey=String(l.batch_id||l.product_id);
    // Суммируем qty всех строк этой партии КРОМЕ текущей
    const usedByOthers=lines
      .filter(x=>x._key!==l._key&&String(x.batch_id||x.product_id)===batchKey)
      .reduce((s,x)=>s+(parseFloat(x.qty)||0),0);
    return Math.max(0, l.max_qty - usedByOthers);
  };

  // Добавить дубль строки
  const handleDupLine=(l)=>{
    const batchKey=String(l.batch_id||l.product_id);
    const usedQty=lines
      .filter(x=>String(x.batch_id||x.product_id)===batchKey)
      .reduce((s,x)=>s+(parseFloat(x.qty)||0),0);
    const remaining=Math.max(0,(l.max_qty||0)-usedQty);
    const newLine={
      ...l,
      _key:Date.now()+Math.random(),
      qty:"",
      price:"",
      max_qty:l.max_qty,
    };
    // Вставляем новую строку через addLine с флагом
    addLine(newLine);
  };

  return <Card style={{marginBottom:16}}>
    <div style={{padding:"10px 16px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <span style={{color:C.text,fontWeight:600,fontSize:14}}>
        Товарные позиции{" "}
        <span style={{color:C.textDim,fontWeight:400,fontSize:12}}>{hasLineFilter?`${sortedLines.length} из ${lines.length}`:lines.length}</span>
        {hasLineFilter&&<button onClick={()=>setLineFilter({product:"",batch:"",grade:"",country:"",supplier:"",unit:""})} style={{marginLeft:8,fontSize:11,color:C.redText,background:"none",border:"none",cursor:"pointer",fontWeight:600}}>× сбросить</button>}
      </span>
      <Btn small onClick={()=>addLine()}>+ Добавить строку</Btn>
    </div>
    {lines.length===0
      ?<div style={{padding:32,textAlign:"center",color:C.textDim,fontSize:13}}>Нажмите «+ Добавить строку»</div>
      :<div className="ct-wrap"><table className="ct" style={{tableLayout:"fixed"}}>
        <colgroup>
          <col style={{width:80}}/>
          <col style={{width:190}}/><col style={{width:90}}/><col style={{width:85}}/><col style={{width:85}}/>
          <col style={{width:78}}/><col style={{width:84}}/><col style={{width:84}}/><col style={{width:84}}/>
          <col style={{width:84}}/><col style={{width:84}}/><col style={{width:55}}/>
        </colgroup>
        <thead>
          <tr>
            <SortTh col="purchase_date">Дата</SortTh>
            <SortTh col="product">Товар</SortTh>
            <SortTh col="batch">Партия</SortTh>
            <SortTh col="grade">Сорт</SortTh>
            <SortTh col="country">Страна</SortTh>
            <SortTh col="supplier">Поставщик</SortTh>
            <th>Ед.</th>
            <th className="r">В наличии</th>
            <SortTh col="qty" className="r">Кол-во</SortTh>
            <SortTh col="price" className="r">Цена</SortTh>
            <SortTh col="amount" className="r">Сумма</SortTh>
            <th className="r">Себест. ₽</th>
            <th></th>
          </tr>
          <tr style={{background:C.surface}}>
            <td></td>
            <td style={{padding:"3px 4px"}}><input value={lineFilter.product} onChange={e=>setLF("product",e.target.value)} placeholder="Фильтр..." style={fInp}/></td>
            <td style={{padding:"3px 4px"}}><input value={lineFilter.batch} onChange={e=>setLF("batch",e.target.value)} placeholder="Фильтр..." style={fInp}/></td>
            <td style={{padding:"3px 4px"}}><input value={lineFilter.grade} onChange={e=>setLF("grade",e.target.value)} placeholder="Фильтр..." style={fInp}/></td>
            <td style={{padding:"3px 4px"}}><input value={lineFilter.country} onChange={e=>setLF("country",e.target.value)} placeholder="Фильтр..." style={fInp}/></td>
            <td style={{padding:"3px 4px"}}><input value={lineFilter.supplier} onChange={e=>setLF("supplier",e.target.value)} placeholder="Фильтр..." style={fInp}/></td>
            <td style={{padding:"3px 4px"}}><input value={lineFilter.unit} onChange={e=>setLF("unit",e.target.value)} placeholder="..." style={fInp}/></td>
            <td></td><td></td><td></td><td></td><td></td>
          </tr>
        </thead>
        <tbody>{sortedLines.map((l,rowIdx)=>{
          const q=parseFloat(l.qty)||0,p=parseFloat(l.price)||0,amt=q*p;
          const cost=Number(l.cost_price)||0;
          const margin=p>0&&cost>0?((p-cost)/p*100):null;
          const effectiveMax=getEffectiveMax(l);
          const overQty=l.qty&&effectiveMax!=null&&parseFloat(l.qty)>effectiveMax;
          const arrowNav=e=>{
            const inputs=document.querySelectorAll('.sale-line-input');
            const idx=Array.from(inputs).indexOf(e.target);
            if(idx===-1) return;
            if(e.key==="ArrowRight"||e.key==="ArrowLeft"){e.preventDefault();const next=e.key==="ArrowRight"?inputs[idx+1]:inputs[idx-1];if(next){next.focus();next.select();}}
            if(e.key==="ArrowDown"||e.key==="ArrowUp"){e.preventDefault();const next=e.key==="ArrowDown"?inputs[idx+2]:inputs[idx-2];if(next){next.focus();next.select();}}
            if(e.key==="Enter"){e.preventDefault();const next=inputs[idx+1];if(next){next.focus();next.select();}}
          };
          return <tr key={l._key} style={{background:rowIdx%2===0?"transparent":C.surface+"44"}}>
            <td style={{color:C.textMuted,fontSize:11,padding:"4px 6px",whiteSpace:"nowrap"}}>{l.purchase_date?fmtDate(l.purchase_date):"—"}</td>
            <td style={{fontWeight:500,fontSize:12,padding:"4px 6px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{l.product_name||"—"}</td>
            <td style={{padding:"4px 6px"}}><span style={{fontFamily:"monospace",fontSize:11,color:C.text}}>{l.batch_number||"—"}</span></td>
            <td style={{color:C.text,fontSize:11,padding:"4px 6px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{l.grade_name||"—"}</td>
            <td style={{color:C.text,fontSize:11,padding:"4px 6px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{l.country_name||"—"}</td>
            <td style={{color:C.text,fontSize:11,padding:"4px 6px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{l.supplier_name||"—"}</td>
            <td style={{color:C.text,fontSize:11,padding:"4px 6px",textAlign:"center"}}>{l.unit_short||"—"}</td>
            <td style={{padding:"4px 6px",textAlign:"right"}}>
              <span style={{fontFamily:"monospace",fontSize:11,fontWeight:600,color:overQty?C.redText:C.greenText}}>
                {effectiveMax!=null?fmtQty(effectiveMax):"-"} {l.unit_short}
              </span>
            </td>
            <td style={{padding:"3px 4px",textAlign:"right"}}><input className="sale-line-input" type="text" inputMode="decimal" draggable={false} onDragStart={e=>e.preventDefault()} onDrop={e=>e.preventDefault()} value={l.qty} onChange={e=>updLine(l._key,"qty",e.target.value)} onBlur={e=>{const v=parseFloat(e.target.value);if(!isNaN(v))updLine(l._key,"qty",parseFloat(v.toFixed(2)).toString());}} onKeyDown={arrowNav} onFocus={e=>e.target.select()} placeholder="0" style={{...inp,width:"100%",borderColor:overQty?C.red:C.borderLight,padding:"3px 6px"}}/></td>
            <td style={{padding:"3px 4px",textAlign:"right"}}><input className="sale-line-input" type="text" inputMode="decimal" draggable={false} onDragStart={e=>e.preventDefault()} onDrop={e=>e.preventDefault()} value={l.price} onChange={e=>updLine(l._key,"price",e.target.value)} onBlur={e=>{const v=parseFloat(e.target.value);if(!isNaN(v))updLine(l._key,"price",parseFloat(v.toFixed(2)).toString());}} onKeyDown={arrowNav} onFocus={e=>e.target.select()} placeholder="0.00" style={{...inp,width:"100%",padding:"3px 6px"}}/></td>
            <td style={{padding:"4px 6px",textAlign:"right"}}>
              <span style={{fontWeight:700,fontFamily:"monospace",fontSize:12,color:C.accentText}}>{fmt(Math.round(amt*100)/100)} {currencyCode}</span>
              {currencyCode!=="RUB"&&<div style={{fontSize:10,color:C.textMuted}}>{fmt(Math.round(amt*currencyRate))} ₽</div>}
            </td>
            <td style={{padding:"4px 6px",textAlign:"right"}}>
              {cost>0?<>
                <span style={{fontFamily:"monospace",fontSize:11,color:C.text}}>{cost.toLocaleString("ru-RU",{minimumFractionDigits:2,maximumFractionDigits:2})} ₽</span>
                {margin!==null&&<div style={{fontSize:10,color:margin>=0?C.greenText:C.redText,fontWeight:600}}>{margin>=0?"+":""}{Math.round(margin)}%</div>}
              </>:<span style={{color:C.textDim,fontSize:11}}>—</span>}
            </td>
            <td style={{padding:"3px 2px",textAlign:"center"}}>
              <div style={{display:"flex",flexDirection:"row",gap:3,alignItems:"center",justifyContent:"center"}}>
                <button
                  onClick={()=>handleDupLine(l)}
                  title="Добавить ещё строку по этой партии"
                  style={{background:"none",border:`1px solid ${C.borderLight}`,color:C.tealText,cursor:"pointer",fontSize:12,padding:"1px 4px",borderRadius:3,lineHeight:1}}
                >+</button>
                <button onClick={()=>delLine(l._key)} style={{background:"none",border:"none",color:C.redText,cursor:"pointer",fontSize:14,padding:"1px 3px"}}>×</button>
              </div>
            </td>
          </tr>;
        })}</tbody>
        <tfoot><tr>
          <td colSpan={10} style={{textAlign:"right",color:C.textMuted,fontSize:11,padding:"8px 6px"}}>{hasLineFilter?"Итого по фильтру:":"Итого:"}</td>
          <td style={{textAlign:"right",padding:"8px 6px"}}>
            <span style={{color:C.accentText,fontWeight:700,fontSize:14,fontFamily:"monospace"}}>{fmt(Math.round(filtTotal*100)/100)} {currencyCode}</span>
            {currencyCode!=="RUB"&&<div style={{fontSize:11,color:C.textMuted}}>{fmt(Math.round(filtTotal*currencyRate))} ₽</div>}
          </td>
          <td style={{padding:"8px 6px",textAlign:"center"}}>
            {onSave&&<button onClick={onSave} disabled={saving} style={{padding:"4px 12px",background:saving?C.tealDim:C.teal,border:"none",color:"#fff",borderRadius:6,cursor:saving?"not-allowed":"pointer",fontSize:12,fontWeight:700,whiteSpace:"nowrap"}}>{saving?"...":"Сохранить"}</button>}
          </td>
          <td/>
        </tr></tfoot>
      </table></div>
    }
  </Card>;
}


export default SaleLinesTable;
