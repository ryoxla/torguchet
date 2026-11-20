import { useState, useMemo, useRef, useEffect } from "react";
import { C, fmt, fmtDate, uniq, api, NAV, ROLE_PERMISSIONS, canAccess,
  Card, Btn, Lbl, Inp, Sel, Toggle, ConfirmDialog, PageHeader,
  StatusBadge, DTable, SectionCard, inDateRange, DateFilter,
  INIT_WAREHOUSES, INIT_CATEGORIES, INIT_UNITS, INIT_COUNTRIES, INIT_CURRENCIES,
  INIT_ARTICLES, INIT_ACCOUNTS, INIT_ROLES, INIT_USERS, INIT_CP_CATEGORIES,
  INIT_CP, INIT_PRODUCTS, INIT_PAYMENTS, INVOICES, PURCHASES, TRANSFERS,
  STOCK_DATA, MOVEMENTS, PURCHASE_LINES, INVOICE_LINES, STOCK_BY_PRODUCT,
  ALL_GRADES, INIT_WRITE_OFFS, INIT_RETURNS, WO_REASONS, WO_REASON_COLORS, fmtQty, isDateRestricted } from "../utils/globals";

import AuditLog from "./AuditLog";
function SearchSelect({value, onChange, options, placeholder="— Выберите —", style={}}){
  const [query,setQuery]=useState("");
  const [open,setOpen]=useState(false);
  const ref=useRef(null);
  const selected=options.find(o=>String(o.value)===String(value));
  const filtered=query?options.filter(o=>o.label.toLowerCase().includes(query.toLowerCase())):options;

  useEffect(()=>{
    const handler=e=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false);};
    document.addEventListener("mousedown",handler);
    return()=>document.removeEventListener("mousedown",handler);
  },[]);

  return(
    <div ref={ref} style={{position:"relative",...style}}>
      <div style={{display:"flex",alignItems:"center",background:C.bg,border:"1px solid #30363d",borderRadius:6,overflow:"hidden"}}>
        <input
          value={open?query:selected?.label||""}
          onChange={e=>{setQuery(e.target.value);setOpen(true);if(!e.target.value){onChange("");}}}
          onFocus={()=>{setQuery("");setOpen(true);}}
          placeholder={placeholder}
          style={{flex:1,background:"transparent",border:"none",color:C.text,padding:"8px 12px",fontSize:13,outline:"none"}}
        />
        {value&&<button type="button" onClick={()=>{onChange("");setQuery("");}} style={{background:"none",border:"none",color:C.textMuted,cursor:"pointer",padding:"0 8px",fontSize:14}}>×</button>}
        <span style={{color:C.textMuted,padding:"0 8px",fontSize:11}}>{open?"▲":"▼"}</span>
      </div>
      {open&&(
        <div style={{position:"absolute",top:"100%",left:0,right:0,zIndex:999,background:C.surface,border:"1px solid #30363d",borderRadius:6,maxHeight:220,overflowY:"auto",boxShadow:"0 8px 24px rgba(0,0,0,0.5)",marginTop:2}}>
          {filtered.length===0
            ?<div style={{padding:"10px 14px",color:C.textMuted,fontSize:12}}>Ничего не найдено</div>
            :filtered.map(o=>(
              <div key={o.value} onClick={()=>{onChange(o.value);setQuery("");setOpen(false);}}
                style={{padding:"8px 14px",cursor:"pointer",fontSize:13,color:String(o.value)===String(value)?C.accentText:C.text,background:String(o.value)===String(value)?C.border:"transparent"}}
                onMouseEnter={e=>e.currentTarget.style.background=C.border}
                onMouseLeave={e=>e.currentTarget.style.background=String(o.value)===String(value)?C.border:"transparent"}
              >{o.label}</div>
            ))
          }
        </div>
      )}
    </div>
  );
}

function PaymentForm({onBack,onSaved,onDeleted,editId,direction:initDir,counterparties,accounts,currencies,articles,currentUser,defaultAccountId,forceCashOnly=false}){
  const [activeTab,setActiveTab]=useState('form');
  const today=new Date().toISOString().slice(0,10);
  const newNum="ПЛ-...";
  const defCur=(currencies||[]).find(c=>c.is_base||c.code==="RUB");
  const [form,setForm]=useState({
    number:newNum, direction:initDir||"incoming",
    payment_date:today, counterparty_id:"", bank_account_id:"",
    article_id:"", currency_id:defCur?.id||"",
    currency_rate:"1", amount:"", purpose:"", note:"",
    legal_name:"", pp_number:"",
    bank_account_id: defaultAccountId||"" ,
  });
  const [saving,setSaving]=useState(false);
  useEffect(()=>{if(!editId){api(`/payments/next-number`).then(r=>{setForm(f=>({...f,number:r.number}));}).catch(()=>{});}},[ editId]);
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(!!editId);
  const [confirmDel,setConfirmDel]=useState(false);
  const [isOpeningDebt,setIsOpeningDebt]=useState(false);
  const setF=(k,v)=>setForm(f=>({...f,[k]:v}));
  const [cpSaldo, setCpSaldo] = useState(null);

  // Загружаем сальдо контрагента
  const handleCpChange = v => {
    setF("counterparty_id", v);
    if (v) {
      api(`/counterparties/balance?counterparty_id=${v}`).then(rows => {
        const cp = rows.find(c => String(c.id) === String(v));
        setCpSaldo(cp && cp.saldo != null ? Number(cp.saldo) : null);
      }).catch(() => setCpSaldo(null));
    } else {
      setCpSaldo(null);
    }
  };
  useEffect(()=>{
    if(!editId) return;
    api(`/payments/${editId}`).then(data=>{
      // Признак начального долга — пустой bank_account_id в БД (обычные платежи
      // не могут быть сохранены без счёта, поэтому это надёжный маркер).
      setIsOpeningDebt(!data.bank_account_id);
      setForm({
        number:data.number||"",
        direction:data.direction||initDir||"incoming",
        payment_date:data.payment_date?data.payment_date.slice(0,10):today,
        counterparty_id:data.counterparty_id||"",
        bank_account_id:data.bank_account_id||"",
        article_id:data.article_id||"",
        currency_id:data.currency_id||"",
        currency_rate:data.currency_rate||"1",
        amount:Number(data.amount)||"",
        purpose:data.purpose||"",
        note:data.note||"",
        legal_name:data.legal_name||"",
        pp_number:data.pp_number||"",
      });
    }).catch(e=>setError("Ошибка загрузки: "+e.message))
    .finally(()=>setLoading(false));
  },[editId]);
  useEffect(()=>{
    if((currencies||[]).length&&!form.currency_id){
      const def=currencies.find(c=>c.is_base||c.code==="RUB")||currencies[0];
      if(def) setF("currency_id",def.id);
    }
  },[currencies]);
  const isIn=form.direction==="incoming";
  const handleSave=async()=>{
    if(isDateRestricted(currentUser, form.payment_date)){setError("Нет доступа: можно редактировать только документы сегодняшней датой");return;}
    if(!form.amount||parseFloat(form.amount)<=0){setError("Укажите сумму");return;}
    if(!form.bank_account_id && !isOpeningDebt){setError("Укажите счёт или кассу");return;}
    setSaving(true);setError("");
    try{
      if(editId) {
        await api(`/payments/${editId}`,"PUT",{
          number:form.number, direction:form.direction,
          article_id:parseInt(form.article_id)||null,
          bank_account_id:form.bank_account_id?parseInt(form.bank_account_id):null,
          counterparty_id:parseInt(form.counterparty_id)||null,
          currency_id:parseInt(form.currency_id)||defCur?.id,
          currency_rate:parseFloat(form.currency_rate)||1,
          amount:parseFloat(form.amount),
          amount_base:parseFloat(form.amount)*(parseFloat(form.currency_rate)||1),
          payment_date:form.payment_date,
          purpose:form.purpose||null,
          note:form.note||null,
          legal_name:form.legal_name||null,
          pp_number:form.pp_number||null,
        });
      } else {
      await api("/payments","POST",{
        number:form.number,
        direction:form.direction,
        article_id:parseInt(form.article_id)||null,
        bank_account_id:parseInt(form.bank_account_id),
        counterparty_id:parseInt(form.counterparty_id)||null,
        currency_id:parseInt(form.currency_id)||defCur?.id,
        currency_rate:parseFloat(form.currency_rate)||1,
        amount:parseFloat(form.amount),
        amount_base:parseFloat(form.amount)*(parseFloat(form.currency_rate)||1),
        payment_date:form.payment_date,
        purpose:form.purpose||null,
        note:form.note||null,
        legal_name:form.legal_name||null,
        pp_number:form.pp_number||null,
        created_by:currentUser?.id||null,
      });
      }
      if(onSaved)onSaved();
    }catch(e){setError("Ошибка: "+e.message);}
    finally{setSaving(false);}
  };
  const sel={width:"100%",background:C.bg,border:`1px solid ${C.borderLight}`,color:C.text,borderRadius:6,padding:"8px 12px",fontSize:13,outline:"none"};
  if(loading) return <div style={{padding:60,textAlign:"center",color:C.textMuted}}>Загрузка...</div>;
  return(
    <div style={{padding:"24px 32px"}}>
      <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:20}}>
        <div style={{width:42,height:42,borderRadius:8,background:isIn?C.greenDim:C.redDim,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,color:isIn?C.greenText:C.redText}}>{isIn?"↓":"↑"}</div>
        <div>
          <h1 style={{margin:0,color:C.text,fontSize:20,fontWeight:700}}>{isIn?"Входящий платёж":"Исходящий платёж"}</h1>
          <div style={{color:C.textMuted,fontFamily:"monospace",fontSize:12,marginTop:4}}>{form.number}</div>
        </div>
        <button onClick={onBack} style={{padding:"7px 14px",background:"transparent",border:`1px solid ${C.borderLight}`,color:C.text,borderRadius:6,cursor:"pointer",fontSize:13,fontWeight:600}}>← Назад</button>
        {editId&&<button onClick={()=>{ if(isDateRestricted(currentUser, form.payment_date)){alert("Нет доступа: можно удалять только документы сегодняшней датой");return;} setConfirmDel(true); }} style={{padding:"7px 14px",background:"transparent",border:`1px solid ${C.red}`,color:C.redText,borderRadius:6,cursor:"pointer",fontSize:13,fontWeight:600}}>Удалить</button>}
        <button onClick={handleSave} disabled={saving} style={{padding:"7px 20px",background:saving?C.accentDim:C.accent,border:"none",color:"#fff",borderRadius:6,cursor:saving?"not-allowed":"pointer",fontSize:13,fontWeight:600}}>{saving?"Сохранение...":"Сохранить"}</button>
      </div>
      {confirmDel&&<ConfirmDialog text={`Удалить платёж ${form.number}?`} onConfirm={()=>{api(`/payments/${editId}`,"DELETE").then(()=>{if(onDeleted)onDeleted();}).catch(e=>alert(e.message));setConfirmDel(false);}} onClose={()=>setConfirmDel(false)}/>}
      {editId&&<div style={{display:"flex",gap:0,marginBottom:16,borderBottom:`1px solid ${C.border}`}}>
        {[{id:"form",l:"Документ"},{id:"history",l:"История изменений"}].map(t=>(
          <button key={t.id} onClick={()=>setActiveTab(t.id)} style={{padding:"8px 20px",border:"none",borderBottom:activeTab===t.id?`2px solid ${C.accent}`:"2px solid transparent",background:"transparent",color:activeTab===t.id?C.accentText:C.textMuted,cursor:"pointer",fontSize:13,fontWeight:activeTab===t.id?600:400}}>{t.l}</button>
        ))}
      </div>}
      {activeTab==="history"&&editId?<Card style={{padding:16}}><AuditLog table="payments" recordId={editId}/></Card>:null}
      {activeTab==="form"&&<>
      {error&&<div style={{color:C.redText,background:C.redDim,border:`1px solid ${C.red}`,borderRadius:6,padding:"10px 14px",marginBottom:14,fontSize:13}}>{error}</div>}
      <Card style={{padding:20}}>
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {/* Направление + Счёт/Касса */}
          <div style={{display:"flex",gap:10,alignItems:"flex-end"}}>
            <div><Lbl>Направление</Lbl>
              <div style={{display:"flex",border:`1px solid ${C.borderLight}`,borderRadius:6,overflow:"hidden"}}>
                {[{id:"incoming",l:"↓ Входящий"},{id:"outgoing",l:"↑ Исходящий"}].map(d=>
                  <button key={d.id} onClick={()=>setF("direction",d.id)} style={{padding:"8px 14px",border:"none",cursor:"pointer",fontSize:12,fontWeight:600,background:form.direction===d.id?(d.id==="incoming"?C.greenDim:C.redDim):C.bg,color:form.direction===d.id?(d.id==="incoming"?C.greenText:C.redText):C.textMuted}}>{d.l}</button>
                )}
              </div>
            </div>
            <div style={{flex:1}}>{isOpeningDebt ? <Lbl>Счёт / Касса</Lbl> : <Lbl req>Счёт / Касса</Lbl>}
              <select value={form.bank_account_id} onChange={e=>setF("bank_account_id",e.target.value)} style={sel}>
                <option value="">{isOpeningDebt ? "— (необязательно)" : "Выберите счёт"}</option>
                {(accounts||[]).filter(a=>a.active||a.is_active).map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          </div>
          {/* Дата + Валюта + Курс */}
          <div style={{display:"flex",gap:10,alignItems:"flex-end"}}>
            <div><Lbl>Дата</Lbl><input type="date" value={form.payment_date} onChange={e=>setF("payment_date",e.target.value)} style={{...sel,width:150}}/></div>
            <div><Lbl>Валюта</Lbl>
              <select value={form.currency_id} onChange={e=>setF("currency_id",e.target.value)} style={{...sel,width:90}}>
                {(currencies||[]).map(c=><option key={c.id} value={c.id}>{c.code}</option>)}
              </select>
            </div>
            <div><Lbl>Курс</Lbl><input type="number" value={form.currency_rate} onChange={e=>setF("currency_rate",e.target.value)} style={{...sel,width:90}}/></div>
          </div>
          {/* Контрагент + Сальдо */}
          <div style={{display:"flex",gap:10,alignItems:"flex-end"}}>
            <div style={{flex:1}}><Lbl>Контрагент</Lbl>
              <SearchSelect
                value={form.counterparty_id}
                onChange={v=>handleCpChange(v)}
                options={(counterparties||[]).filter(c=>c.active||c.is_active).map(c=>({value:c.id,label:c.name}))}
                placeholder="— Не указан —"
                style={{width:"100%"}}
              />
            </div>
            {cpSaldo !== null && (
              <div style={{paddingBottom:2,whiteSpace:"nowrap"}}>
                <div style={{color:C.textMuted,fontSize:10,textTransform:"uppercase",marginBottom:3}}>Сальдо</div>
                <div style={{fontFamily:"monospace",fontSize:13,fontWeight:700,color:cpSaldo>=0?C.accentText:C.redText}}>
                  {cpSaldo>=0?"+":""}{fmt(Math.round(cpSaldo))} ₽
                </div>
              </div>
            )}
          </div>
          {/* Сумма */}
          <div><Lbl req>Сумма</Lbl>
            <div style={{position:"relative"}}>
              <input type="number" value={form.amount} onChange={e=>setF("amount",e.target.value)} placeholder="0.00" style={{...sel,paddingLeft:28}}/>
              <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:C.textDim,fontSize:13}}>₽</span>
            </div>
            {form.amount&&<div style={{color:isIn?C.greenText:C.redText,fontSize:12,marginTop:4,fontWeight:600}}>{isIn?"+":"-"}{fmt(Math.round(parseFloat(form.amount)||0))} ₽</div>}
          </div>
          {/* Статья ДДС */}
          <div><Lbl>Статья ДДС</Lbl>
            <select value={form.article_id} onChange={e=>setF("article_id",e.target.value)} style={sel}>
              <option value="">— Не указана —</option>
              {(articles||[]).filter(a=>a.active||a.is_active).map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          {/* Номер п/п + Юрлицо + Назначение — только для безналичных */}
          {!forceCashOnly&&<>
          <div style={{display:"flex",gap:10}}>
            <div style={{width:120}}><Lbl>Номер п/п</Lbl><input value={form.pp_number} onChange={e=>setF("pp_number",e.target.value)} placeholder="123" style={{...sel,width:"100%"}}/></div>
            <div style={{flex:1}}><Lbl>Юридическое лицо</Lbl><input value={form.legal_name} onChange={e=>setF("legal_name",e.target.value)} placeholder="например ООО Балтфуд" style={{...sel,width:"100%"}}/></div>
          </div>
          <div><Lbl>Назначение платежа</Lbl><input value={form.purpose} onChange={e=>setF("purpose",e.target.value)} placeholder="Оплата по накладной..." style={sel}/></div>
          </>}
          {/* Примечание */}
          <div><Lbl>Примечание</Lbl><input value={form.note||""} onChange={e=>setF("note",e.target.value)} placeholder="Комментарий к платежу..." style={sel}/></div>
        </div>
      </Card>
      </>
      }
    </div>
  );
}


// ─── ПЛАТЕЖИ ──────────────────────────────────────────────────────────────────

export default PaymentForm;
