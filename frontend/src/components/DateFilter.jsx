function DateFilter({dateFrom,dateTo,onFrom,onTo}){
  const today=new Date();
  const fmt2=d=>{const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),dd=String(d.getDate()).padStart(2,'0');return `${dd}.${m}.${y}`;};
  const toISO=d=>{const p=d.split('.');return p.length===3?`${p[2]}-${p[1]}-${p[0]}`:'';};
  const fromISO=s=>{const p=s.split('-');return p.length===3?`${p[2]}.${p[1]}.${p[0]}`:'';};
  const setPreset=days=>{
    const to=new Date(today);
    const from=new Date(today);
    from.setDate(from.getDate()-days+1);
    onFrom(fmt2(from));onTo(fmt2(to));
  };
  const presets=[{l:'Сегодня',d:1},{l:'Неделя',d:7},{l:'Месяц',d:30}];
  const inputStyle={background:C.bg,border:`1px solid ${C.borderLight}`,color:C.text,borderRadius:5,padding:'4px 8px',fontSize:12,outline:'none',width:120,colorScheme:'dark'};
  const active=dateFrom||dateTo;
  return(
    <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
      {presets.map(p=><button key={p.l} onClick={()=>setPreset(p.d)} style={{padding:'4px 10px',borderRadius:5,border:`1px solid ${C.borderLight}`,background:'transparent',color:C.textMuted,fontSize:12,cursor:'pointer',fontWeight:400}}>{p.l}</button>)}
      <div style={{width:1,height:18,background:C.borderLight,margin:'0 2px'}}/>
      <input type="date" value={toISO(dateFrom)} onChange={e=>onFrom(fromISO(e.target.value))} style={inputStyle} title="Дата от"/>
      <span style={{color:C.textDim,fontSize:12}}>—</span>
      <input type="date" value={toISO(dateTo)} onChange={e=>onTo(fromISO(e.target.value))} style={inputStyle} title="Дата до"/>
      {active&&<button onClick={()=>{onFrom('');onTo('');}} style={{padding:'3px 8px',borderRadius:5,border:`1px solid ${C.borderLight}`,background:'transparent',color:C.redText,fontSize:11,cursor:'pointer',fontWeight:600}}>× сброс</button>}
    </div>
  );
}

// ─── УТИЛИТА: фильтрация по дате ─────────────────────────────────────────────
function inDateRange(dateStr,from,to){
  if(!from&&!to)return true;
  // dateStr format: DD.MM.YYYY
  const parse=s=>{const p=s.split('.');return p.length===3?new Date(`${p[2]}-${p[1]}-${p[0]}`):null;};
  const d=parse(dateStr);if(!d)return true;
  if(from){const f=parse(from);if(f&&d<f)return false;}
  if(to){const t=parse(to);if(t&&d>t)return false;}
  return true;
}


