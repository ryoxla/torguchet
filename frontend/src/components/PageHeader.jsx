function PageHeader({title,subtitle,actions}){
  return <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:24}}><div><h1 style={{margin:0,color:C.text,fontSize:22,fontWeight:700,letterSpacing:"-0.5px"}}>{title}</h1>{subtitle&&<div style={{color:C.textMuted,fontSize:13,marginTop:4}}>{subtitle}</div>}</div>{actions&&<div style={{display:"flex",gap:8}}>{actions}</div>}</div>;
}

