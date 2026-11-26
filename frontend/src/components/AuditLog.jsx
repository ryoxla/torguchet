import { useState, useEffect } from "react";
import { C, fmt, api, Btn, DateFilter, inDateRange } from "../utils/globals";

const TABLE_LABELS = {
  orders_sale:     "Расход",
  orders_purchase: "Приход",
  payments:        "Платёж",
  write_offs:      "Списание",
  returns:         "Возврат",
  transfers:       "Перемещение",
};

const ACTION_LABELS = { INSERT:"Создан", UPDATE:"Изменён", DELETE:"Удалён" };
const ACTION_COLORS = { INSERT:C.greenText, UPDATE:C.accentText, DELETE:C.redText };
const ACTION_BG     = { INSERT:C.greenDim,  UPDATE:C.accentDim,  DELETE:C.redDim  };
const ACTION_ICONS  = { INSERT:"✚", UPDATE:"✎", DELETE:"✕" };

function DiffBlock({ action, old_data, new_data }) {
  const old_ = old_data  ? (typeof old_data  === "string" ? JSON.parse(old_data)  : old_data)  : {};
  const nw   = new_data  ? (typeof new_data  === "string" ? JSON.parse(new_data)  : new_data)  : {};
  const skip = ["id","created_at","updated_at","company_id","created_by"];

  const fmtVal = v => {
    if (v === null || v === undefined) return "—";
    if (Array.isArray(v)) return null;
    return String(v);
  };

  const changed = action === "UPDATE"
    ? Object.keys(nw).filter(k => !skip.includes(k) && k !== "lines" && JSON.stringify(old_[k]) !== JSON.stringify(nw[k]))
    : [];

  const oldLines = Array.isArray(old_.lines) ? old_.lines : [];
  const newLines = Array.isArray(nw.lines)   ? nw.lines   : [];
  const linesChanged = JSON.stringify(oldLines) !== JSON.stringify(newLines);

  if (!changed.length && !linesChanged && action === "UPDATE") return null;

  return (
    <div style={{background:C.bg,borderRadius:4,padding:"8px 12px",fontSize:11,marginTop:6}}>
      {changed.map(k => (
        <div key={k} style={{display:"flex",gap:8,marginBottom:4,alignItems:"center",flexWrap:"wrap"}}>
          <span style={{color:C.textMuted,minWidth:140}}>{k}:</span>
          <span style={{color:C.redText,textDecoration:"line-through",fontFamily:"monospace"}}>{fmtVal(old_[k])}</span>
          <span style={{color:C.textDim}}>→</span>
          <span style={{color:C.greenText,fontFamily:"monospace"}}>{fmtVal(nw[k])}</span>
        </div>
      ))}
      {(linesChanged || action === "INSERT") && newLines.length > 0 && (
        <div style={{marginTop: changed.length ? 8 : 0}}>
          <div style={{color:C.textMuted,marginBottom:4,fontWeight:600}}>
            {action === "INSERT" ? "Состав документа:" : "Изменения в строках:"}
          </div>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead>
              <tr style={{borderBottom:`1px solid ${C.border}`}}>
                {["Товар","Партия","Кол-во","Цена","Сумма"].map(h => (
                  <th key={h} style={{padding:"3px 6px",textAlign:h==="Товар"||h==="Партия"?"left":"right",color:C.textDim,fontWeight:600}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {newLines.map((ln, idx) => {
                const oldLn = oldLines.find(o => o.product_id === ln.product_id && o.batch_id === ln.batch_id) || {};
                const qtyChanged   = oldLn.qty && String(oldLn.qty) !== String(ln.qty);
                const priceChanged = (oldLn.price || oldLn.cost_price) && String(oldLn.price || oldLn.cost_price) !== String(ln.price || ln.cost_price);
                const isNew = !oldLines.find(o => o.product_id === ln.product_id && o.batch_id === ln.batch_id);
                return (
                  <tr key={idx} style={{borderBottom:`1px solid ${C.border}`,background:isNew?C.greenDim+"22":"transparent"}}>
                    <td style={{padding:"3px 6px",color:C.text}}>{ln.product_name || ln.product_id}</td>
                    <td style={{padding:"3px 6px",color:C.textMuted,fontFamily:"monospace",fontSize:10}}>{ln.batch_number || ln.batch_id || "—"}</td>
                    <td style={{padding:"3px 6px",textAlign:"right",color:qtyChanged?C.accentText:C.text,fontFamily:"monospace"}}>
                      {qtyChanged ? <><span style={{color:C.redText,textDecoration:"line-through"}}>{oldLn.qty}</span> → </> : null}{ln.qty}
                    </td>
                    <td style={{padding:"3px 6px",textAlign:"right",color:priceChanged?C.accentText:C.text,fontFamily:"monospace"}}>
                      {priceChanged ? <><span style={{color:C.redText,textDecoration:"line-through"}}>{oldLn.price||oldLn.cost_price}</span> → </> : null}{ln.price||ln.cost_price||"—"}
                    </td>
                    <td style={{padding:"3px 6px",textAlign:"right",fontFamily:"monospace",color:C.text}}>
                      {ln.amount ? fmt(Math.round(parseFloat(ln.amount))) : fmt(Math.round((parseFloat(ln.qty)||0)*(parseFloat(ln.price||ln.cost_price)||0)))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AuditLogScreen() {
  const [log, setLog]         = useState([]);
  const [loading, setLoading] = useState(true);
  const [users, setUsers]     = useState([]);

  // Фильтры
  const [filterTable,  setFilterTable]  = useState("");
  const [filterUser,   setFilterUser]   = useState("");
  const [filterAction, setFilterAction] = useState("");
  const [dateFrom,     setDateFrom]     = useState("");
  const [dateTo,       setDateTo]       = useState("");
  const [expanded,     setExpanded]     = useState({});

  const inputStyle = {
    background:C.bg, border:`1px solid ${C.borderLight}`,
    color:C.text, borderRadius:6, padding:"6px 10px",
    fontSize:12, outline:"none"
  };

  useEffect(() => {
    api('/users').then(u => setUsers(u)).catch(() => {});
    loadLog();
  }, []);

  const loadLog = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterTable)  params.set("table_name", filterTable);
    if (filterUser)   params.set("user_id",    filterUser);
    if (filterAction) params.set("action",      filterAction);
    if (dateFrom) {
      const [d,m,y] = dateFrom.split(".");
      if (d&&m&&y) params.set("date_from", `${y}-${m}-${d}`);
    }
    if (dateTo) {
      const [d,m,y] = dateTo.split(".");
      if (d&&m&&y) {
        const dt = new Date(`${y}-${m}-${d}`);
        dt.setDate(dt.getDate() + 1);
        params.set("date_to", dt.toISOString().slice(0,10));
      }
    }
    api(`/audit?${params.toString()}`)
      .then(rows => setLog(rows))
      .catch(() => setLog([]))
      .finally(() => setLoading(false));
  };

  const toggleExpand = id => setExpanded(p => ({...p, [id]: !p[id]}));

  const resetFilters = () => {
    setFilterTable(""); setFilterUser(""); setFilterAction("");
    setDateFrom(""); setDateTo("");
  };

  return (
    <div style={{maxWidth:1100,margin:"0 auto",padding:"24px 16px"}}>
      {/* Заголовок */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
        <div>
          <h1 style={{margin:0,color:C.text,fontSize:22,fontWeight:700}}>Журнал аудита</h1>
          <div style={{color:C.textMuted,fontSize:13,marginTop:3}}>Все изменения документов в системе</div>
        </div>
        <div style={{color:C.textMuted,fontSize:12}}>Записей: <b style={{color:C.text}}>{log.length}</b></div>
      </div>

      {/* Фильтры */}
      <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"14px 16px",marginBottom:16,display:"flex",flexWrap:"wrap",gap:10,alignItems:"center"}}>
        <select value={filterTable} onChange={e=>setFilterTable(e.target.value)} style={inputStyle}>
          <option value="">Все документы</option>
          {Object.entries(TABLE_LABELS).map(([v,l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select value={filterAction} onChange={e=>setFilterAction(e.target.value)} style={inputStyle}>
          <option value="">Все действия</option>
          <option value="INSERT">Создан</option>
          <option value="UPDATE">Изменён</option>
          <option value="DELETE">Удалён</option>
        </select>
        <select value={filterUser} onChange={e=>setFilterUser(e.target.value)} style={inputStyle}>
          <option value="">Все пользователи</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.full_name||u.login}</option>)}
        </select>
        <DateFilter dateFrom={dateFrom} dateTo={dateTo} onFrom={setDateFrom} onTo={setDateTo}/>
        <Btn primary small onClick={loadLog}>Применить</Btn>
        <Btn small onClick={resetFilters}>Сбросить</Btn>
      </div>

      {/* Таблица */}
      <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,overflow:"hidden"}}>
        {/* Шапка */}
        <div style={{display:"grid",gridTemplateColumns:"140px 110px 130px 100px 1fr",gap:0,borderBottom:`1px solid ${C.border}`,padding:"8px 16px"}}>
          {["Дата / время","Действие","Документ","Пользователь","Детали"].map(h => (
            <div key={h} style={{color:C.textMuted,fontSize:11,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.05em"}}>{h}</div>
          ))}
        </div>

        {loading && (
          <div style={{padding:40,textAlign:"center",color:C.textDim,fontSize:13}}>Загрузка...</div>
        )}
        {!loading && !log.length && (
          <div style={{padding:40,textAlign:"center",color:C.textDim,fontSize:13}}>Записей не найдено</div>
        )}
        {!loading && log.map((l, i) => {
          const isOpen = !!expanded[l.id];
          const hasDetails = (l.action === "INSERT" || l.action === "UPDATE") && l.new_data;
          return (
            <div key={l.id} style={{borderBottom: i < log.length-1 ? `1px solid ${C.border}` : "none", background: isOpen ? C.surfaceHover : "transparent"}}>
              <div
                style={{display:"grid",gridTemplateColumns:"140px 110px 130px 100px 1fr",gap:0,padding:"10px 16px",alignItems:"center",cursor:hasDetails?"pointer":"default"}}
                onClick={() => hasDetails && toggleExpand(l.id)}
              >
                {/* Дата */}
                <div style={{color:C.textMuted,fontSize:12,fontFamily:"monospace"}}>
                  {new Date(l.created_at).toLocaleString("ru-RU",{day:"2-digit",month:"2-digit",year:"2-digit",hour:"2-digit",minute:"2-digit"})}
                </div>
                {/* Действие */}
                <div>
                  <span style={{background:ACTION_BG[l.action],color:ACTION_COLORS[l.action],padding:"2px 10px",borderRadius:20,fontSize:11,fontWeight:700}}>
                    {ACTION_ICONS[l.action]} {ACTION_LABELS[l.action]||l.action}
                  </span>
                </div>
                {/* Документ */}
                <div>
                  <div style={{color:C.text,fontSize:13}}>{TABLE_LABELS[l.table_name]||l.table_name}</div>
                  {l.new_data?.number && <div style={{color:C.textMuted,fontSize:11,fontFamily:"monospace"}}>{(typeof l.new_data==="string"?JSON.parse(l.new_data):l.new_data).number}</div>}
                  {l.old_data?.number && !l.new_data?.number && <div style={{color:C.textMuted,fontSize:11,fontFamily:"monospace"}}>{(typeof l.old_data==="string"?JSON.parse(l.old_data):l.old_data).number}</div>}
                </div>
                {/* Пользователь */}
                <div style={{color:C.textMuted,fontSize:12}}>{l.user_name||"Система"}</div>
                {/* Детали */}
                <div style={{color:C.textDim,fontSize:11}}>
                  {hasDetails
                    ? <span style={{color:C.accentText}}>{isOpen?"▲ Скрыть":"▼ Показать"}</span>
                    : <span>—</span>
                  }
                </div>
              </div>
              {isOpen && hasDetails && (
                <div style={{padding:"0 16px 12px 16px"}}>
                  <DiffBlock action={l.action} old_data={l.old_data} new_data={l.new_data}/>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AuditLogDoc({ table, recordId }) {
  const [log, setLog]         = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({});

  useEffect(() => {
    if (!recordId) return;
    setLoading(true);
    api(`/audit/${table}/${recordId}`)
      .then(rows => setLog(rows))
      .catch(() => setLog([]))
      .finally(() => setLoading(false));
  }, [table, recordId]);

  const toggleExpand = id => setExpanded(p => ({...p, [id]: !p[id]}));

  if (loading) return <div style={{padding:24,textAlign:"center",color:C.textDim,fontSize:13}}>Загрузка...</div>;
  if (!log.length) return <div style={{padding:24,textAlign:"center",color:C.textDim,fontSize:13}}>История изменений пуста</div>;

  return (
    <div style={{padding:4}}>
      {log.map((l, i) => {
        const isOpen = !!expanded[l.id];
        const hasDetails = (l.action === "INSERT" || l.action === "UPDATE") && l.new_data;
        return (
          <div key={l.id} style={{borderBottom: i < log.length-1 ? `1px solid ${C.border}` : "none"}}>
            <div style={{display:"flex",gap:12,padding:"10px 0",alignItems:"flex-start",cursor:hasDetails?"pointer":"default"}}
              onClick={() => hasDetails && toggleExpand(l.id)}>
              <div style={{width:34,height:34,borderRadius:"50%",background:ACTION_BG[l.action],display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:14,color:ACTION_COLORS[l.action]}}>
                {ACTION_ICONS[l.action]}
              </div>
              <div style={{flex:1}}>
                <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:3}}>
                  <span style={{color:ACTION_COLORS[l.action],fontWeight:700,fontSize:12}}>{ACTION_LABELS[l.action]||l.action}</span>
                  <span style={{color:C.textMuted,fontSize:11}}>{l.user_name||"Система"}</span>
                  <span style={{color:C.textDim,fontSize:11,marginLeft:"auto"}}>{new Date(l.created_at).toLocaleString("ru-RU")}</span>
                  {hasDetails && <span style={{color:C.accentText,fontSize:11}}>{isOpen?"▲":"▼"}</span>}
                </div>
                {isOpen && hasDetails && (
                  <DiffBlock action={l.action} old_data={l.old_data} new_data={l.new_data}/>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Умный экспорт: если переданы table+recordId — показываем историю документа,
// иначе — полный журнал аудита
function AuditLog({ table, recordId }) {
  if (table && recordId) return <AuditLogDoc table={table} recordId={recordId}/>;
  return <AuditLogScreen/>;
}

export default AuditLog;
