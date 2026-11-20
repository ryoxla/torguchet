function StatusBadge({status}){
  const m={
    draft:     {l:"Черновик",  c:C.textMuted,  b:C.border},
    posted:    {l:"Проведён",  c:C.greenText,  b:C.greenDim},
    planned:   {l:"Плановый", c:C.yellowText, b:C.yellowDim},
  };
  const s=m[status]||m.draft;
  return <span style={{background:s.b,color:s.c,padding:"2px 10px",borderRadius:20,fontSize:12,fontWeight:600,whiteSpace:"nowrap"}}>{s.l}</span>;
}

