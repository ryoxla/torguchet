function SectionCard({title,subtitle,children,action}){
  return <Card><div style={{padding:"14px 20px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><div style={{color:C.text,fontWeight:600,fontSize:14}}>{title}</div>{subtitle&&<div style={{color:C.textMuted,fontSize:12,marginTop:2}}>{subtitle}</div>}</div>{action&&action}</div><div style={{padding:20}}>{children}</div></Card>;
}

