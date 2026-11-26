import { useState, useEffect } from "react";
import { C, fmt, fmtDate, api, Card, Btn, Lbl, Inp, fmtQty } from "../utils/globals";
import PaymentForm from "./PaymentForm";

function OpeningBalances({counterparties,warehouses,currencies,products,units,countries,grades,accounts,articles,currentUser}){
  const [tab,setTab]=useState("finance");
  const [date,setDate]=useState(new Date().toISOString().slice(0,10));
  const [finLines,setFinLines]=useState([]);
  const [stockLines,setStockLines]=useState([]);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");
  const [history,setHistory]=useState([]);
  const [histLoading,setHistLoading]=useState(true);
  const [editStock,setEditStock]=useState(null);
  const [editStockSaving,setEditStockSaving]=useState(false);
  const [editPaymentId,setEditPaymentId]=useState(null);

  const today=new Date().toISOString().slice(0,10);
  const sel={background:C.bg,border:`1px solid ${C.borderLight}`,color:C.text,borderRadius:6,padding:"6px 10px",fontSize:13,outline:"none",width:"100%"};
  const inp={background:C.bg,border:`1px solid ${C.borderLight}`,color:C.text,borderRadius:6,padding:"6px 10px",fontSize:13,outline:"none",width:"100%"};

  const loadHistory=()=>{
    setHistLoading(true);
    api('/opening-balances/history').then(setHistory).catch(()=>setHistory([])).finally(()=>setHistLoading(false));
  };
  useEffect(()=>{loadHistory();},[]);

  // Финансы
  const addFinLine=()=>setFinLines(p=>[...p,{_key:Date.now(),counterparty_id:"",direction:"incoming",amount:"",currency_id:(currencies.find(c=>c.code==="RUB")||currencies[0])?.id||1,note:""}]);
  const updFin=(key,k,v)=>setFinLines(p=>p.map(l=>l._key===key?{...l,[k]:v}:l));
  const delFin=key=>setFinLines(p=>p.filter(l=>l._key!==key));

  // Склад
  const addStockLine=()=>setStockLines(p=>[...p,{_key:Date.now(),warehouse_id:"",product_id:"",unit_id:"",country_id:"",grade_id:"",qty:"",cost_price:"",note:""}]);
  const updStock=(key,k,v)=>setStockLines(p=>p.map(l=>l._key===key?{...l,[k]:v}:l));
  const delStock=key=>setStockLines(p=>p.filter(l=>l._key!==key));

  const handleStockEditSave=async()=>{
    setEditStockSaving(true);
    try{
      await api(`/opening-balances/stock/${editStock.record_id}`,"PUT",{qty:parseFloat(editStock.qty),cost_price:parseFloat(editStock.cost_price)||0});
      setEditStock(null);loadHistory();
    }catch(e){alert("Ошибка: "+e.message);}
    finally{setEditStockSaving(false);}
  };

  const handleDblClick=(r)=>{
    if(r.type==="finance"){
      setEditPaymentId(r.record_id);
    } else {
      setEditStock({record_id:r.record_id,qty:r.qty,cost_price:r.cost_price||"",name:r.name});
    }
  };

  const handleDelete=async(r)=>{
    if(!window.confirm(`Удалить запись "${r.name}"?`)) return;
    try{
      if(r.type==="finance"){
        await api(`/payments/${r.record_id}`,"DELETE");
      } else {
        await api(`/opening-balances/stock/${r.record_id}`,"DELETE");
      }
      loadHistory();
    }catch(e){alert("Ошибка: "+e.message);}
  };

  const handleSave=async()=>{
    setError("");setSuccess("");
    if(!date){setError("Укажите дату");return;}
    const validFin=finLines.filter(l=>l.counterparty_id&&l.amount&&parseFloat(l.amount)>0);
    const validStock=stockLines.filter(l=>l.warehouse_id&&l.product_id&&l.qty&&parseFloat(l.qty)>0);
    if(!validFin.length&&!validStock.length){setError("Добавьте хотя бы одну строку");return;}
    setSaving(true);
    try{
      await api("/opening-balances","POST",{
        date,
        finance:validFin.map(l=>({
          counterparty_id:parseInt(l.counterparty_id),
          direction:l.direction,
          amount:parseFloat(l.amount),
          currency_id:parseInt(l.currency_id)||1,
          note:l.note||null,
        })),
        stock:validStock.map(l=>({
          warehouse_id:parseInt(l.warehouse_id),
          product_id:parseInt(l.product_id),
          unit_id:parseInt(l.unit_id)||null,
          country_id:parseInt(l.country_id)||null,
          grade_id:parseInt(l.grade_id)||null,
          qty:parseFloat(l.qty),
          cost_price:parseFloat(l.cost_price)||0,
          note:l.note||null,
        })),
      });
      setSuccess("Начальные остатки успешно сохранены!");
      setFinLines([]);setStockLines([]);
      loadHistory();
    }catch(e){
      try{setError(JSON.parse(e.message).error||e.message);}catch{setError(e.message);}
    }finally{setSaving(false);}
  };

  const tabStyle=(t)=>({padding:"8px 20px",border:"none",cursor:"pointer",fontSize:13,fontWeight:600,
    background:"transparent",color:tab===t?C.accentText:C.textMuted,
    borderBottom:tab===t?`2px solid ${C.accent}`:"2px solid transparent"});

  if(editPaymentId) return(
    <PaymentForm
      editId={editPaymentId}
      onBack={()=>{setEditPaymentId(null);loadHistory();}}
      onSaved={()=>{setEditPaymentId(null);loadHistory();}}
      onDeleted={()=>{setEditPaymentId(null);loadHistory();}}
      counterparties={counterparties||[]}
      accounts={accounts||[]}
      currencies={currencies||[]}
      articles={articles||[]}
      currentUser={currentUser}
    />
  );

  return(
    <div style={{padding:"28px 32px"}}>
      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:20}}>
        <div>
          <h1 style={{margin:0,color:C.text,fontSize:22,fontWeight:700}}>Ввод начальных остатков</h1>
          <div style={{color:C.textMuted,fontSize:13,marginTop:4}}>Введите остатки на дату начала работы в системе</div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div>
            <Lbl>Дата начальных остатков</Lbl>
            <input type="date" value={date} onChange={e=>setDate(e.target.value)}
              style={{...inp,width:180,colorScheme:"dark"}}/>
          </div>
          <div style={{marginTop:20}}>
            <Btn primary onClick={handleSave} disabled={saving}>{saving?"Сохранение...":"💾 Провести"}</Btn>
          </div>
        </div>
      </div>

      {error&&<div style={{color:C.redText,background:C.redDim,border:`1px solid ${C.red}`,borderRadius:6,padding:"10px 14px",marginBottom:14,fontSize:13}}>{error}</div>}
      {success&&<div style={{color:C.greenText,background:C.greenDim,border:`1px solid ${C.green}`,borderRadius:6,padding:"10px 14px",marginBottom:14,fontSize:13}}>{success}</div>}

      <div style={{borderBottom:`1px solid ${C.border}`,marginBottom:16,display:"flex"}}>
        <button style={tabStyle("finance")} onClick={()=>setTab("finance")}>💰 Финансовые остатки</button>
        <button style={tabStyle("stock")} onClick={()=>setTab("stock")}>📦 Складские остатки</button>
        <button style={tabStyle("debts")} onClick={()=>setTab("debts")}>📋 Долги покупателей</button>
        <button style={tabStyle("creditor_debts")} onClick={()=>setTab("creditor_debts")}>📋 Долги поставщикам</button>
      </div>

      {tab==="finance"&&<>
        <Card style={{marginBottom:16,overflow:"hidden"}}>
          <div style={{padding:"10px 16px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{color:C.text,fontWeight:600,fontSize:14}}>Задолженности контрагентов</span>
            <Btn small onClick={addFinLine}>+ Добавить строку</Btn>
          </div>
          {finLines.length===0
            ?<div style={{padding:32,textAlign:"center",color:C.textDim,fontSize:13}}>Нажмите «+ Добавить строку» чтобы внести задолженность</div>
            :<div className="ct-wrap"><table className="ct" style={{width:"100%"}}>
              <thead><tr>
                <th>Контрагент</th>
                <th style={{width:160}}>Направление</th>
                <th style={{width:130}}>Сумма</th>
                <th style={{width:100}}>Валюта</th>
                <th>Примечание</th>
                <th style={{width:32}}></th>
              </tr></thead>
              <tbody>{finLines.map(l=>(
                <tr key={l._key}>
                  <td style={{padding:"6px 8px"}}>
                    <select value={l.counterparty_id} onChange={e=>updFin(l._key,"counterparty_id",e.target.value)} style={sel}>
                      <option value="">— Контрагент —</option>
                      {(counterparties||[]).filter(c=>c.active||c.is_active).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </td>
                  <td style={{padding:"6px 8px"}}>
                    <select value={l.direction} onChange={e=>updFin(l._key,"direction",e.target.value)} style={sel}>
                      <option value="incoming">Нам должны ↑</option>
                      <option value="outgoing">Мы должны ↓</option>
                    </select>
                  </td>
                  <td style={{padding:"6px 8px"}}>
                    <input type="number" min="0" step="0.01" value={l.amount} onChange={e=>updFin(l._key,"amount",e.target.value)} placeholder="0.00" style={inp}/>
                  </td>
                  <td style={{padding:"6px 8px"}}>
                    <select value={l.currency_id} onChange={e=>updFin(l._key,"currency_id",e.target.value)} style={sel}>
                      {(currencies||[]).map(c=><option key={c.id} value={c.id}>{c.code}</option>)}
                    </select>
                  </td>
                  <td style={{padding:"6px 8px"}}>
                    <input value={l.note} onChange={e=>updFin(l._key,"note",e.target.value)} placeholder="Примечание" style={inp}/>
                  </td>
                  <td style={{padding:"6px 4px"}}>
                    <button onClick={()=>delFin(l._key)} style={{background:"transparent",border:"none",color:C.redText,cursor:"pointer",fontSize:16,padding:"2px 6px"}}>×</button>
                  </td>
                </tr>
              ))}</tbody>
            </table></div>
          }
        </Card>
        {finLines.length>0&&<div style={{color:C.textMuted,fontSize:12,padding:"0 4px"}}>
          Итого строк: {finLines.filter(l=>l.counterparty_id&&l.amount).length} · 
          Нам должны: {fmt(Math.round(finLines.filter(l=>l.direction==="incoming"&&l.amount).reduce((s,l)=>s+parseFloat(l.amount)||0,0)))} · 
          Мы должны: {fmt(Math.round(finLines.filter(l=>l.direction==="outgoing"&&l.amount).reduce((s,l)=>s+parseFloat(l.amount)||0,0)))}
        </div>}
      </>}

      {tab==="stock"&&<>
        <Card style={{marginBottom:16,overflow:"hidden"}}>
          <div style={{padding:"10px 16px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{color:C.text,fontWeight:600,fontSize:14}}>Остатки на складах</span>
            <Btn small onClick={addStockLine}>+ Добавить строку</Btn>
          </div>
          {stockLines.length===0
            ?<div style={{padding:32,textAlign:"center",color:C.textDim,fontSize:13}}>Нажмите «+ Добавить строку» чтобы внести остаток</div>
            :<div className="ct-wrap"><table className="ct" style={{width:"100%"}}>
              <thead><tr>
                <th>Склад</th>
                <th>Товар</th>
                <th style={{width:90}}>Ед.</th>
                <th style={{width:90}}>Сорт</th>
                <th style={{width:90}}>Страна</th>
                <th style={{width:100,textAlign:"right"}}>Кол-во</th>
                <th style={{width:110,textAlign:"right"}}>Себест. ₽</th>
                <th style={{width:32}}></th>
              </tr></thead>
              <tbody>{stockLines.map(l=>(
                <tr key={l._key}>
                  <td style={{padding:"6px 8px"}}>
                    <select value={l.warehouse_id} onChange={e=>updStock(l._key,"warehouse_id",e.target.value)} style={sel}>
                      <option value="">— Склад —</option>
                      {(warehouses||[]).filter(w=>w.active||w.is_active).map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                  </td>
                  <td style={{padding:"6px 8px"}}>
                    <select value={l.product_id} onChange={e=>updStock(l._key,"product_id",e.target.value)} style={sel}>
                      <option value="">— Товар —</option>
                      {(products||[]).filter(p=>p.active||p.is_active).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </td>
                  <td style={{padding:"6px 8px"}}>
                    <select value={l.unit_id} onChange={e=>updStock(l._key,"unit_id",e.target.value)} style={sel}>
                      <option value="">—</option>
                      {(units||[]).map(u=><option key={u.id} value={u.id}>{u.short||u.short_name}</option>)}
                    </select>
                  </td>
                  <td style={{padding:"6px 8px"}}>
                    <select value={l.grade_id} onChange={e=>updStock(l._key,"grade_id",e.target.value)} style={sel}>
                      <option value="">—</option>
                      {(grades||[]).map(g=><option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                  </td>
                  <td style={{padding:"6px 8px"}}>
                    <select value={l.country_id} onChange={e=>updStock(l._key,"country_id",e.target.value)} style={sel}>
                      <option value="">—</option>
                      {(countries||[]).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </td>
                  <td style={{padding:"6px 8px"}}>
                    <input type="number" min="0" step="0.001" value={l.qty} onChange={e=>updStock(l._key,"qty",e.target.value)} placeholder="0" style={{...inp,textAlign:"right"}}/>
                  </td>
                  <td style={{padding:"6px 8px"}}>
                    <input type="number" min="0" step="0.01" value={l.cost_price} onChange={e=>updStock(l._key,"cost_price",e.target.value)} placeholder="0.00" style={{...inp,textAlign:"right"}}/>
                  </td>
                  <td style={{padding:"6px 4px"}}>
                    <button onClick={()=>delStock(l._key)} style={{background:"transparent",border:"none",color:C.redText,cursor:"pointer",fontSize:16,padding:"2px 6px"}}>×</button>
                  </td>
                </tr>
              ))}</tbody>
            </table></div>
          }
        </Card>
        {stockLines.length>0&&<div style={{color:C.textMuted,fontSize:12,padding:"0 4px"}}>
          Итого позиций: {stockLines.filter(l=>l.warehouse_id&&l.product_id&&l.qty).length}
        </div>}
      </>}

      {/* История проведённых документов */}
      <div style={{marginTop:32,borderTop:`1px solid ${C.border}`,paddingTop:20}}>
        <h2 style={{margin:"0 0 14px",color:C.text,fontSize:16,fontWeight:700}}>История проведённых остатков</h2>
        {histLoading?<div style={{color:C.textMuted,fontSize:13}}>Загрузка...</div>:
        history.length===0?<div style={{color:C.textDim,fontSize:13,padding:"20px 0"}}>Нет проведённых начальных остатков</div>:
        <Card style={{overflow:"hidden"}}>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead><tr style={{background:C.surface}}>
              {["Дата","Тип","Контрагент / Товар","Направление","Сумма / Кол-во","Примечание",""].map((h,i)=>(
                <th key={i} style={{padding:"10px 14px",textAlign:"left",color:C.textMuted,fontSize:11,fontWeight:600,borderBottom:`1px solid ${C.border}`}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>{history.map((r,i)=>(
              <tr key={i} style={{borderBottom:`1px solid ${C.border}40`,cursor:"pointer"}}
                onDoubleClick={()=>handleDblClick(r)}
                onMouseEnter={e=>e.currentTarget.style.background=C.surface}
                onMouseLeave={e=>e.currentTarget.style.background="transparent"}
                title="Двойной клик для редактирования">
                <td style={{padding:"9px 14px",color:C.textMuted,fontSize:12}}>{fmtDate(r.date)}</td>
                <td style={{padding:"9px 14px"}}>
                  <span style={{fontSize:11,padding:"2px 8px",borderRadius:8,background:r.type==="finance"?C.accentDim:C.tealDim,color:r.type==="finance"?C.accentText:C.tealText,fontWeight:600}}>
                    {r.type==="finance"?"💰 Финансы":"📦 Склад"}
                  </span>
                </td>
                <td style={{padding:"9px 14px",color:C.text,fontWeight:500,fontSize:13}}>{r.name||"—"}</td>
                <td style={{padding:"9px 14px",fontSize:12,color:r.direction==="incoming"?C.greenText:r.direction==="outgoing"?C.redText:C.textMuted,fontWeight:600}}>
                  {r.direction==="incoming"?"Нам должны ↑":r.direction==="outgoing"?"Мы должны ↓":"—"}
                </td>
                <td style={{padding:"9px 14px",fontFamily:"monospace",fontSize:13,fontWeight:700,color:C.accentText}}>
                  {r.amount?fmt(Math.round(parseFloat(r.amount)))+" "+(r.currency_code||"₽"):fmtQty(r.qty)+" "+(r.unit_short||"")}
                </td>
                <td style={{padding:"9px 14px",color:C.textMuted,fontSize:12}}>{r.note||"—"}</td>
                <td style={{padding:"9px 8px",textAlign:"right"}}>
                  <button onClick={e=>{e.stopPropagation();handleDelete(r);}} style={{background:"transparent",border:`1px solid ${C.redDim}`,color:C.redText,borderRadius:4,cursor:"pointer",fontSize:12,padding:"2px 8px"}}>✕</button>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </Card>}
      </div>

      {editStock&&<div onClick={e=>{if(e.target===e.currentTarget)setEditStock(null);}} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center"}}>
        <div style={{background:C.surface,border:`1px solid ${C.borderLight}`,borderRadius:10,width:380,padding:24}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <h2 style={{margin:0,color:C.text,fontSize:15,fontWeight:700}}>Редактировать остаток</h2>
            <button onClick={()=>setEditStock(null)} style={{background:"none",border:"none",color:C.textMuted,cursor:"pointer",fontSize:20}}>×</button>
          </div>
          <div style={{color:C.textMuted,fontSize:12,marginBottom:16}}>{editStock.name}</div>
          <div style={{marginBottom:12}}>
            <Lbl req>Количество</Lbl>
            <input type="number" min="0" step="0.001" value={editStock.qty} onChange={e=>setEditStock(s=>({...s,qty:e.target.value}))}
              style={{width:"100%",background:C.bg,border:`1px solid ${C.borderLight}`,color:C.text,borderRadius:6,padding:"8px 12px",fontSize:13,outline:"none"}}/>
          </div>
          <div style={{marginBottom:20}}>
            <Lbl>Себестоимость ₽</Lbl>
            <input type="number" min="0" step="0.01" value={editStock.cost_price} onChange={e=>setEditStock(s=>({...s,cost_price:e.target.value}))}
              style={{width:"100%",background:C.bg,border:`1px solid ${C.borderLight}`,color:C.text,borderRadius:6,padding:"8px 12px",fontSize:13,outline:"none"}}/>
          </div>
          <div style={{display:"flex",justifyContent:"flex-end",gap:8}}>
            <Btn onClick={()=>setEditStock(null)}>Отмена</Btn>
            <Btn primary onClick={handleStockEditSave} disabled={editStockSaving}>{editStockSaving?"Сохранение...":"Сохранить"}</Btn>
          </div>
        </div>
      </div>}

      {tab==="debts"&&<DebtImport/>}
      {tab==="creditor_debts"&&<CreditorDebtImport/>}
    </div>
  );
}

// ─── Компонент загрузки начальных долгов из Excel ──────────────────────────
function DebtImport() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const fileRef = useState(null);
  const inputRef = { current: null };

  // Конвертация Excel serial date → YYYY-MM-DD
  const excelDateToISO = (val) => {
    if (!val) return null;
    const n = parseFloat(String(val).replace(',', '.'));
    if (!isNaN(n) && n > 40000 && n < 60000) {
      const date = new Date((n - 25569) * 86400000);
      return date.toISOString().slice(0, 10);
    }
    // Текстовые даты типа "01-май-26", "29-сен-25"
    const months = { 'янв':0,'фев':1,'мар':2,'апр':3,'май':4,'июн':5,'июл':6,'авг':7,'сен':8,'окт':9,'ноя':10,'дек':11 };
    const m = String(val).match(/(\d{1,2})-([а-я]{3})-(\d{2,4})/i);
    if (m) {
      const mon = months[m[2].toLowerCase()];
      const yr = parseInt(m[3]) < 100 ? 2000 + parseInt(m[3]) : parseInt(m[3]);
      if (mon !== undefined) return `${yr}-${String(mon+1).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
    }
    return String(val);
  };

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setError(""); setResult(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        // Динамический импорт XLSX
        const XLSX = window.XLSX || null;
        if (!XLSX) { setError("Библиотека XLSX не загружена. Попробуйте CSV."); return; }
        const wb = XLSX.read(ev.target.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

        // Парсим иерархическую структуру
        let currentCp = null;
        const parsed = [];
        for (const row of raw) {
          const col0 = row[0] ? String(row[0]).trim() : null;
          const col1 = row[1] !== null && row[1] !== undefined ? parseFloat(String(row[1]).replace(',','.')) : null;
          const col2 = row[2] !== null && row[2] !== undefined ? row[2] : null;
          const col3 = row[3] !== null && row[3] !== undefined ? parseFloat(String(row[3]).replace(',','.')) : null;

          if (col0 && col1 > 0) {
            // Строка контрагента: col0=имя, col1=общий долг, col2=дата первой накладной, col3=сумма первой накладной
            currentCp = col0;
            if (col2 && col3 > 0) {
              parsed.push({ counterparty_name: currentCp, date: excelDateToISO(col2), amount: col3 });
            }
          } else if (!col0 && currentCp && col2 && col3 > 0) {
            // Строка детализации: col2=дата, col3=сумма
            parsed.push({ counterparty_name: currentCp, date: excelDateToISO(col2), amount: col3 });
          }
        }
        setRows(parsed);
      } catch(err) {
        setError("Ошибка чтения файла: " + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleImport = async () => {
    if (!rows.length) return;
    setLoading(true); setError(""); setResult(null);
    try {
      const res = await api('/opening-debts', 'POST', { lines: rows });
      setResult(res);
      setRows([]);
    } catch(e) {
      setError("Ошибка: " + e.message);
    } finally { setLoading(false); }
  };

  const GREEN=C.greenBright, RED=C.redBright, AMBER=C.amberBright, BLUE=C.blueBright, MUTED="#6b7280";

  return (
    <div style={{maxWidth:700}}>
      <Card style={{padding:20,marginBottom:16}}>
        <div style={{marginBottom:12}}>
          <div style={{fontWeight:700,color:C.text,fontSize:14}}>Загрузка начальных долгов из Excel</div>
          <div style={{color:C.textMuted,fontSize:12,marginTop:2}}>Формат: Контрагент / Общий долг / Дата / Сумма накладной</div>
        </div>
        <input ref={r=>inputRef.current=r} type="file" accept=".xlsx,.xls" onChange={handleFile} style={{display:"none"}}/>
        <button onClick={()=>inputRef.current?.click()} style={{padding:"8px 18px",background:C.teal,border:"none",color:"#fff",borderRadius:6,cursor:"pointer",fontSize:13,fontWeight:600}}>
          📂 Выбрать файл Excel
        </button>
        {error&&<div style={{color:RED,fontSize:13,marginTop:10}}>{error}</div>}
      </Card>
      {rows.length>0&&!result&&(
        <Card style={{padding:20,marginBottom:16}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div style={{color:C.text,fontWeight:600}}>Предпросмотр: {rows.length} строк</div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setRows([])} style={{padding:"7px 14px",background:"transparent",border:`1px solid ${C.borderLight}`,color:C.textMuted,borderRadius:6,cursor:"pointer",fontSize:13}}>Отмена</button>
              <button onClick={handleImport} disabled={loading} style={{padding:"7px 20px",background:loading?C.tealDim:C.teal,border:"none",color:"#fff",borderRadius:6,cursor:loading?"not-allowed":"pointer",fontSize:13,fontWeight:600}}>
                {loading?"Загрузка...":"✓ Создать накладные"}
              </button>
            </div>
          </div>
          <div style={{maxHeight:300,overflowY:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
              <thead><tr style={{borderBottom:`1px solid ${C.border}`}}>
                <th style={{textAlign:"left",padding:"4px 8px",color:C.textMuted}}>Контрагент</th>
                <th style={{textAlign:"left",padding:"4px 8px",color:C.textMuted}}>Дата</th>
                <th style={{textAlign:"right",padding:"4px 8px",color:C.textMuted}}>Сумма</th>
              </tr></thead>
              <tbody>
                {rows.map((r,i)=>(
                  <tr key={i} style={{borderBottom:`1px solid ${C.border}`}}>
                    <td style={{padding:"4px 8px",color:C.text}}>{r.counterparty_name}</td>
                    <td style={{padding:"4px 8px",color:C.textMuted}}>{r.date||"—"}</td>
                    <td style={{padding:"4px 8px",textAlign:"right",color:AMBER,fontFamily:"monospace"}}>{r.amount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {result&&(
        <Card style={{padding:16}}>
          <div style={{color:GREEN,fontWeight:700,fontSize:14,marginBottom:8}}>✓ Загрузка завершена</div>
          <div style={{color:C.text,fontSize:13}}>Создано накладных: <b>{result.created}</b></div>
          <div style={{color:C.textMuted,fontSize:13}}>Пропущено: <b>{result.skipped}</b></div>
          {result.errors?.length>0&&<div style={{color:RED,fontSize:12,marginTop:8}}>{result.errors.join(", ")}</div>}
        </Card>
      )}
      {rows.length===0&&!result&&(
        <Card style={{padding:48,textAlign:"center",color:C.textDim,fontSize:14}}>
          Выберите Excel-файл с долгами для предпросмотра
        </Card>
      )}
    </div>
  );
}


// ─── Компонент загрузки долгов поставщикам из Excel ────────────────────────
function CreditorDebtImport() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const inputRef = { current: null };

  const excelDateToISO = (val) => {
    if (!val) return null;
    const n = parseFloat(String(val).replace(',', '.'));
    if (!isNaN(n) && n > 40000 && n < 60000) {
      const date = new Date((n - 25569) * 86400000);
      return date.toISOString().slice(0, 10);
    }
    const months = { 'янв':0,'фев':1,'мар':2,'апр':3,'май':4,'июн':5,'июл':6,'авг':7,'сен':8,'окт':9,'ноя':10,'дек':11 };
    const m = String(val).match(/(\d{1,2})-([а-я]{3})-(\d{2,4})/i);
    if (m) {
      const mon = months[m[2].toLowerCase()];
      const yr = parseInt(m[3]) < 100 ? 2000 + parseInt(m[3]) : parseInt(m[3]);
      if (mon !== undefined) return `${yr}-${String(mon+1).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
    }
    return String(val);
  };

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setError(""); setResult(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const XLSX = window.XLSX || null;
        if (!XLSX) { setError("Библиотека XLSX не загружена."); return; }
        const wb = XLSX.read(ev.target.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
        let currentCp = null;
        const parsed = [];
        for (const row of raw) {
          const col0 = row[0] ? String(row[0]).trim() : null;
          const col1 = row[1] !== null && row[1] !== undefined ? parseFloat(String(row[1]).replace(',','.')) : null;
          const col2 = row[2] !== null && row[2] !== undefined ? row[2] : null;
          const col3 = row[3] !== null && row[3] !== undefined ? parseFloat(String(row[3]).replace(',','.')) : null;
          if (col0 && col1 > 0) {
            currentCp = col0;
            if (col2 && col3 > 0) parsed.push({ counterparty_name: currentCp, date: excelDateToISO(col2), amount: col3 });
          } else if (!col0 && currentCp && col2 && col3 > 0) {
            parsed.push({ counterparty_name: currentCp, date: excelDateToISO(col2), amount: col3 });
          }
        }
        setRows(parsed);
      } catch(err) { setError("Ошибка чтения файла: " + err.message); }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleImport = async () => {
    if (!rows.length) return;
    setLoading(true); setError(""); setResult(null);
    try {
      const res = await api('/opening-creditor-debts', 'POST', { lines: rows });
      setResult(res); setRows([]);
    } catch(e) { setError("Ошибка: " + e.message); }
    finally { setLoading(false); }
  };

  const GREEN=C.greenBright, RED=C.redBright, AMBER=C.amberBright;

  return (
    <div style={{maxWidth:700}}>
      <Card style={{padding:20,marginBottom:16}}>
        <div style={{marginBottom:12}}>
          <div style={{fontWeight:700,color:C.text,fontSize:14}}>Загрузка начальных долгов поставщикам из Excel</div>
          <div style={{color:C.textMuted,fontSize:12,marginTop:2}}>Формат: Поставщик / Общий долг / Дата / Сумма накладной</div>
        </div>
        <input ref={r=>inputRef.current=r} type="file" accept=".xlsx,.xls" onChange={handleFile} style={{display:"none"}}/>
        <button onClick={()=>inputRef.current?.click()} style={{padding:"8px 18px",background:C.teal,border:"none",color:"#fff",borderRadius:6,cursor:"pointer",fontSize:13,fontWeight:600}}>
          📂 Выбрать файл Excel
        </button>
        {error&&<div style={{color:RED,fontSize:13,marginTop:10}}>{error}</div>}
      </Card>
      {rows.length>0&&(
        <Card style={{padding:20,marginBottom:16}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div style={{color:C.text,fontWeight:600}}>Предпросмотр: {rows.length} строк</div>
            <button onClick={handleImport} disabled={loading} style={{padding:"7px 20px",background:loading?C.tealDim:C.teal,border:"none",color:"#fff",borderRadius:6,cursor:loading?"not-allowed":"pointer",fontSize:13,fontWeight:600}}>
              {loading?"Загрузка...":"✓ Создать накладные"}
            </button>
          </div>
          <div style={{maxHeight:300,overflowY:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
              <thead><tr style={{borderBottom:`1px solid ${C.border}`}}>
                <th style={{textAlign:"left",padding:"4px 8px",color:C.textMuted}}>Поставщик</th>
                <th style={{textAlign:"left",padding:"4px 8px",color:C.textMuted}}>Дата</th>
                <th style={{textAlign:"right",padding:"4px 8px",color:C.textMuted}}>Сумма</th>
              </tr></thead>
              <tbody>
                {rows.map((r,i)=>(
                  <tr key={i} style={{borderBottom:`1px solid ${C.border}`}}>
                    <td style={{padding:"4px 8px",color:C.text}}>{r.counterparty_name}</td>
                    <td style={{padding:"4px 8px",color:C.textMuted}}>{r.date}</td>
                    <td style={{padding:"4px 8px",textAlign:"right",color:AMBER,fontFamily:"monospace"}}>{r.amount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {result&&(
        <Card style={{padding:16}}>
          <div style={{color:GREEN,fontWeight:700,fontSize:14,marginBottom:8}}>✓ Загрузка завершена</div>
          <div style={{color:C.text,fontSize:13}}>Создано накладных: <b>{result.created}</b></div>
          <div style={{color:C.textMuted,fontSize:13}}>Пропущено: <b>{result.skipped}</b></div>
          {result.errors?.length>0&&<div style={{color:RED,fontSize:12,marginTop:8}}>{result.errors.join(", ")}</div>}
        </Card>
      )}
      {rows.length===0&&!result&&(
        <Card style={{padding:48,textAlign:"center",color:C.textDim,fontSize:14}}>
          Выберите Excel-файл с долгами поставщикам для предпросмотра
        </Card>
      )}
    </div>
  );
}

export default OpeningBalances;
