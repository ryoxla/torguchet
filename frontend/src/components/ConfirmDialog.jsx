function ConfirmDialog({text,onConfirm,onClose}){
  return <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{background:C.surface,border:`1px solid ${C.borderLight}`,borderRadius:10,width:400,padding:24,boxShadow:"0 20px 60px rgba(0,0,0,0.5)"}}><div style={{color:C.text,fontWeight:700,fontSize:15,marginBottom:10}}>Подтвердите действие</div><div style={{color:C.textMuted,fontSize:13,marginBottom:20,lineHeight:1.5}}>{text}</div><div style={{display:"flex",justifyContent:"flex-end",gap:8}}><Btn onClick={onClose}>Отмена</Btn><Btn danger onClick={onConfirm}>Удалить</Btn></div></div></div>;
}

// ─── ПРАВА ДОСТУПА ───────────────────────────────────────────────────────────
// Базовые права по роли. readonly=true означает просмотр без создания/редактирования.
const ROLE_PERMISSIONS={
  admin:    {dashboard:true,invoices:true,purchases:true,payments:true,cash:true,counterparties:true,stock:true,movements:true,transfers:true,write_offs:true,returns:true,directories:true,sales_report:true},
  manager:  {dashboard:true,invoices:true,purchases:true,payments:true,cash:true,counterparties:true,stock:true,movements:true,transfers:false,write_offs:false,returns:false,directories:false,sales_report:true},
  accountant:{dashboard:true,invoices:true,purchases:true,payments:true,cash:true,counterparties:true,stock:true,movements:true,transfers:false,write_offs:false,returns:false,directories:false,sales_report:true},
  warehouse: {dashboard:true,invoices:"readonly",purchases:"readonly",payments:false,counterparties:false,stock:true,movements:true,transfers:false,write_offs:false,returns:false,directories:false,sales_report:false},
};

// canAccess(user, section) → false | true | "readonly"
// Сначала смотрим персональные разрешения (userPerms), потом роль.
function canAccess(user, section, userPerms={}){
  if(!user) return false;
  // Персональное переопределение
  if(section in userPerms) return userPerms[section];
  const role=user.role_name?.toLowerCase()||'';
  const perms=ROLE_PERMISSIONS[role]||ROLE_PERMISSIONS.manager;
  return perms[section]??false;
}

// ─── НАВИГАЦИЯ ────────────────────────────────────────────────────────────────
const NAV=[
  {id:"dashboard",label:"Дашборд"},
  {id:"invoices",label:"Продажи"},
  {id:"purchases",label:"Закупки"},
  {id:"payments",label:"Платежи"},
  {id:"cash",label:"Касса"},
  {id:"counterparties",label:"Взаиморасчёты"},
  {id:"stock",label:"Остатки"},
  {id:"movements",label:"Движение"},
  {id:"transfers",label:"Перемещения"},
  {id:"write_offs",label:"Списания"},
  {id:"returns",label:"Возвраты"},
  {id:"sales_report",label:"Отчёт продаж"},
  {id:"directories",label:"Справочники"},
];


