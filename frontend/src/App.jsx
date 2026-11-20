import { useState, useMemo, useRef, useEffect } from "react";
import { C, fmt, fmtDate, uniq, api, NAV, ROLE_PERMISSIONS, canAccess,
  Card, Btn, Lbl, Inp, Sel, Toggle, ConfirmDialog, PageHeader,
  StatusBadge, DTable, SectionCard, inDateRange, DateFilter,
  INIT_WAREHOUSES, INIT_CATEGORIES, INIT_UNITS, INIT_COUNTRIES, INIT_CURRENCIES,
  INIT_ARTICLES, INIT_ACCOUNTS, INIT_ROLES, INIT_USERS, INIT_CP_CATEGORIES,
  INIT_CP, INIT_PRODUCTS, INIT_PAYMENTS, INVOICES, PURCHASES, TRANSFERS,
  STOCK_DATA, MOVEMENTS, PURCHASE_LINES, INVOICE_LINES, STOCK_BY_PRODUCT,
  ALL_GRADES, INIT_WRITE_OFFS, INIT_RETURNS, WO_REASONS, WO_REASON_COLORS } from "./utils/globals";
import TopBar from "./components/TopBar";
import Dashboard from "./components/Dashboard";
import InvoiceList from "./components/InvoiceList";
import InvoiceForm from "./components/InvoiceForm";
import PurchaseList from "./components/PurchaseList";
import PurchaseForm from "./components/PurchaseForm";
import Payments from "./components/Payments";
import Cash from "./components/Cash";
import Stock from "./components/Stock";
import Movements from "./components/Movements";
import Transfers from "./components/Transfers";
import WriteOffs from "./components/WriteOffs";
import Returns from "./components/Returns";
import SalesReport from "./components/SalesReport";
import Counterparties from "./components/Counterparties";
import Directories from "./components/Directories";
import LoginScreen from "./components/LoginScreen";
import BankStatements from "./components/BankStatements";
import OpeningBalances from "./components/OpeningBalances";
import CabinetScreen from "./components/CabinetScreen";
import DebtorsReport from "./components/DebtorsReport";
import AuditLog from "./components/AuditLog";
import SuperAdmin from "./components/SuperAdmin";
import InterCompanyLog from "./components/InterCompanyLog";
import DebtWriteoffs from "./components/DebtWriteoffs";

function App(){
  const [openPurchaseId,setOpenPurchaseId]=useState(null);
  const [openSaleId,setOpenSaleId]=useState(null);
  const [listRefresh,setListRefresh]=useState(0);
  const [dashRefresh,setDashRefresh]=useState(0);
  const [paymentsRefresh,setPaymentsRefresh]=useState(0);
  const refreshLists=()=>setListRefresh(p=>p+1);
  const [currentUser,setCurrentUser]=useState(()=>{
    try{
      const cab=sessionStorage.getItem('cabinet_user');
      if(cab){const u=JSON.parse(cab);return {...u,_isCabinet:true};}
      return JSON.parse(sessionStorage.getItem('trade_user')||'null');
    }
    catch{ return null; }
  });
  const [screen,setScreen]=useState(()=>{const p=new URLSearchParams(window.location.search);const s=p.get('screen')||'dashboard'; try{const u=JSON.parse(sessionStorage.getItem('trade_user')||'null');if(u&&u.master_role==='superadmin'&&s==='dashboard')return 'superadmin';}catch{}return s;});
  const [loading,setLoading]=useState(true);
  const [products,setProducts]=useState(INIT_PRODUCTS);
  const [categories,setCategories]=useState(INIT_CATEGORIES);
  const [grades,setGrades]=useState(ALL_GRADES);
  const [units,setUnits]=useState(INIT_UNITS);
  const [countries,setCountries]=useState(INIT_COUNTRIES);
  const [currencies,setCurrencies]=useState(INIT_CURRENCIES);
  const [articles,setArticles]=useState(INIT_ARTICLES);
  const [accounts,setAccounts]=useState(INIT_ACCOUNTS);
  const [warehouses,setWarehouses]=useState(INIT_WAREHOUSES);
  const [roles,setRoles]=useState(INIT_ROLES);
  const [users,setUsers]=useState(INIT_USERS);
  const [cp,setCp]=useState(INIT_CP);
  const [cpCategories,setCpCategories]=useState(INIT_CP_CATEGORIES);
  const [legalEntities,setLegalEntities]=useState([]);
  const [selectedProduct,setSelectedProduct]=useState(null);
  const [userPerms,setUserPerms]=useState({});
  const [reloadKey, setReloadKey] = useState(0);
  const [dbStatus,setDbStatus]=useState(null); // 'ok' | 'error'

  // Загружаем справочники из базы при старте
  useEffect(()=>{
    Promise.all([
      api('/currencies'),
      api('/units'),
      api('/countries'),
      api('/grades'),
      api('/roles'),
      api('/users'),
      api('/counterparties'),
      api('/counterparty-categories'),
      api('/warehouses'),
      api('/finance-articles'),
      api('/bank-accounts'),
      api('/products'),
      api('/product-categories'),
      api('/legal-entities'),
      api('/user-permissions'),
    ]).then(([cur,unt,cnt,grd,rls,usr,cps,cpcat,whs,arts,accs,prds,pcats,les,uprm])=>{
      if(cur.length)   setCurrencies(cur.map(r=>({...r,active:true})));
      if(unt.length)   setUnits(unt.map(r=>({...r,short:r.short_name,active:true})));
      if(cnt.length)   setCountries(cnt.map(r=>({...r,active:true})));
      if(grd.length)   setGrades(grd.map(r=>({...r,code:r.code||'—',active:true})));
      if(rls.length)   setRoles(rls.map(r=>({...r,active:true})));
      if(usr.length)   setUsers(usr.map(r=>({...r,name:r.full_name,active:r.is_active})));
      if(cps.length)   setCp(cps.map(r=>({...r,active:r.is_active})));
      if(cpcat.length) setCpCategories(cpcat.map(r=>({...r,active:r.is_active??true})));
      if(whs.length)   setWarehouses(whs.map(r=>({...r,active:r.is_active})));
      if(arts.length)  setArticles(arts.map(r=>({...r,active:r.is_active??true})));
      if(accs.length)  setAccounts(accs.map(r=>({...r,currency:r.currency_code,active:r.is_active})));
      if(prds.length)  setProducts(prds.map(r=>({...r,active:r.is_active})));
      if(pcats.length) setCategories(pcats);
      if(les.length)   setLegalEntities(les);
      if(uprm && Object.keys(uprm).length>0){
        setUserPerms(uprm);
        localStorage.setItem('user_perms', JSON.stringify(uprm));
      }
      setDbStatus('ok');
    }).catch(e=>{
      console.warn('API недоступен, работаем с тестовыми данными:', e.message);
      setDbStatus('error');
    }).finally(()=>setLoading(false));
  },[reloadKey]);

  const handleSaveProduct=updated=>{setProducts(prev=>prev.map(p=>p.id===updated.id?updated:p));setSelectedProduct(updated);};
  const handleAddCategory=name=>{
    const c={id:Math.max(0,...categories.map(c=>c.id))+1,name};
    setCategories(prev=>[...prev,c]);
    api('/product-categories','POST',{name}).catch(console.warn);
    return c;
  };
  const nav=id=>{
    setSelectedProduct(null);
    // superadmin экран — всегда доступен для superadmin
    if(id==='superadmin'){
      if(currentUser?.master_role==='superadmin') setScreen('superadmin');
      return;
    }
    const formScreens={
      invoice_form:'invoices', purchase_form:'purchases',
      debtors_report:'counterparties', creditors_report:'counterparties',
    };
    const checkId=formScreens[id]||id;
    const perms=userPerms;
    const myPerms=currentUser?perms[currentUser.id]||{}:{};
    if(canAccess(currentUser,checkId,myPerms)===false){return;}
    if(id==='dashboard') setDashRefresh(p=>p+1);
    if(id==='payments') setPaymentsRefresh(p=>p+1);
    if(id==='invoices') setOpenSaleId(null);
    if(id==='purchases') setOpenPurchaseId(null);
    setScreen(id);
  };
  window.__appNav=nav;
  const handleLogout=()=>{
    sessionStorage.removeItem('trade_user');
    sessionStorage.removeItem('cabinet_user');
    setCurrentUser(null);
  };
  const handleLogin=user=>{
    // Сбрасываем все справочники перед загрузкой новой компании
    setProducts(INIT_PRODUCTS);
    setCategories(INIT_CATEGORIES);
    setGrades(ALL_GRADES);
    setUnits(INIT_UNITS);
    setCountries(INIT_COUNTRIES);
    setCurrencies(INIT_CURRENCIES);
    setArticles(INIT_ARTICLES);
    setAccounts(INIT_ACCOUNTS);
    setWarehouses(INIT_WAREHOUSES);
    setRoles(INIT_ROLES);
    setUsers(INIT_USERS);
    setCp(INIT_CP);
    setCpCategories(INIT_CP_CATEGORIES);
    setLegalEntities([]);
    setUserPerms({});
    setCurrentUser(user);
    // Суперадмин всегда открывает панель SA
    if(user?.master_role==='superadmin') setScreen('superadmin');
    setReloadKey(p=>p+1);
  };
  const handleCompanyChange=company=>{
    // Сбрасываем все справочники
    setProducts(INIT_PRODUCTS);
    setCategories(INIT_CATEGORIES);
    setGrades(ALL_GRADES);
    setUnits(INIT_UNITS);
    setCountries(INIT_COUNTRIES);
    setCurrencies(INIT_CURRENCIES);
    setArticles(INIT_ARTICLES);
    setAccounts(INIT_ACCOUNTS);
    setWarehouses(INIT_WAREHOUSES);
    setRoles(INIT_ROLES);
    setUsers(INIT_USERS);
    setCp(INIT_CP);
    setCpCategories(INIT_CP_CATEGORIES);
    setLegalEntities([]);
    setUserPerms({});
    // Обновляем company_id пользователя
    const updated={...currentUser, company_id: company.id, company_name: company.name};
    setCurrentUser(updated);
    sessionStorage.setItem('trade_user', JSON.stringify(updated));
    setScreen('dashboard');
    setLoading(true);
    // Триггерим перезагрузку справочников через useEffect
    setReloadKey(p=>p+1);
  };

  const dirProps={
    cp,setCp,cpCategories,setCpCategories,
    grades,setGrades,units,setUnits,countries,setCountries,
    currencies,setCurrencies,articles,setArticles,accounts,setAccounts,
    warehouses,setWarehouses,roles,setRoles,users,setUsers,
    products,setProducts,
    categories,onAddCategory:handleAddCategory,
    legalEntities,setLegalEntities,
    currentUser,
  };

  const screens={
    dashboard:     <Dashboard onNav={nav} refreshKey={dashRefresh}/>,
    invoices:      <InvoiceList onNav={nav} onOpen={id=>{setOpenSaleId(id);nav('invoice_form');}} refreshKey={listRefresh}/>,
    invoice_form:  <InvoiceForm
                     onBack={()=>{setOpenSaleId(null);nav("invoices");}}
                     onSaved={()=>{setOpenSaleId(null);nav("invoices");}}
                     onDeleted={()=>{setOpenSaleId(null);nav("invoices");}}
                     editId={openSaleId}
                     warehouses={warehouses}
                     counterparties={cp}
                     currencies={currencies}
                     accounts={accounts}
                     products={products}
                     currentUser={currentUser}
                   />,
    purchases:     <PurchaseList onNav={nav} onOpen={id=>{setOpenPurchaseId(id);nav('purchase_form');}} refreshKey={listRefresh}/>,
    purchase_form: <PurchaseForm
                     onBack={()=>{setOpenPurchaseId(null);nav("purchases");}}
                     onSaved={()=>{setOpenPurchaseId(null);nav("purchases");}}
                     onDeleted={()=>{setOpenPurchaseId(null);nav("purchases");}}
                     editId={openPurchaseId}
                     warehouses={warehouses}
                     counterparties={cp}
                     currencies={currencies}
                     products={products}
                     units={units}
                     countries={countries}
                     grades={grades}
                     articles={articles}
                     currentUser={currentUser}
                   />,
    payments:      <Payments
                     counterparties={cp}
                     accounts={accounts}
                     currencies={currencies}
                     articles={articles}
                     currentUser={currentUser}
                     legalEntities={legalEntities}
                   />,
    counterparties:<Counterparties counterparties={cp} cpCategories={cpCategories} onNav={nav}/>,
    stock:         <Stock/>,
    movements:     <Movements/>,
    transfers:     <Transfers warehouses={warehouses} currentUser={currentUser}/>,
    write_offs:    <WriteOffs onNav={nav} warehouses={warehouses} products={products} currentUser={currentUser}/>,
    returns:       <Returns onNav={nav} warehouses={warehouses} counterparties={cp} currentUser={currentUser}/>,
    directories:   <Directories {...dirProps}/>,
    sales_report:  <SalesReport warehouses={warehouses} counterparties={cp} products={products} grades={grades}/>,
    cash:          <Cash counterparties={cp} accounts={accounts} currencies={currencies} articles={articles} currentUser={currentUser}/>,
    bank:          <BankStatements accounts={accounts} counterparties={cp}/>,
    opening_balances: <OpeningBalances counterparties={cp} warehouses={warehouses} currencies={currencies} products={products} units={units} countries={countries} grades={grades} accounts={accounts} articles={articles} currentUser={currentUser}/>,
    directories_cp:<Directories {...dirProps}/>,
    debtors_report: <DebtorsReport mode="debtors" cpCategories={cpCategories} counterparties={cp} onBack={()=>nav("counterparties")}/>,
    creditors_report:<DebtorsReport mode="creditors" cpCategories={cpCategories} counterparties={cp} onBack={()=>nav("counterparties")}/>,
    audit_log:       <AuditLog/>,
    intercompany:    <InterCompanyLog counterparties={cp} warehouses={warehouses} products={products} currentUser={currentUser}/>,
    superadmin:      <SuperAdmin user={currentUser} onCompanyChange={handleCompanyChange}/>,
    debt_writeoffs:  <DebtWriteoffs counterparties={cp} currencies={currencies} currentUser={currentUser}/>,
  };

  if(!currentUser) return <LoginScreen onLogin={handleLogin}/>;
  if(currentUser._isCabinet) return <CabinetScreen user={currentUser} onLogout={handleLogout}/>;

  if(loading) return(
    <div style={{background:C.bg,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:16}}>
      <div style={{width:40,height:40,border:`3px solid ${C.border}`,borderTop:`3px solid ${C.accent}`,borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
      <div style={{color:C.textMuted,fontSize:14}}>Подключение к базе данных...</div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return(
    <div style={{background:C.bg,minHeight:"100vh"}}>
      <TopBar screen={screen} onNav={nav} user={currentUser} onLogout={handleLogout}
        onCompanyChange={handleCompanyChange}
        userPerms={currentUser?userPerms[currentUser.id]||{}:{}}/>
      {dbStatus==='error'&&(
        <div style={{position:"fixed",bottom:16,right:16,zIndex:200,background:"#3D1A1A",border:"1px solid #F85149",borderRadius:8,padding:"10px 16px",color:"#FF7B72",fontSize:12,maxWidth:320}}>
          ⚠ API недоступен — работаем с тестовыми данными.<br/>
          <span style={{color:"#7D8590"}}>Запустите: node server.js</span>
        </div>
      )}
      {dbStatus==='ok'&&(
        <div style={{position:"fixed",bottom:16,right:16,zIndex:200,background:"#1A3D22",border:"1px solid #3FB950",borderRadius:"50%",width:28,height:28,display:"flex",alignItems:"center",justifyContent:"center",color:"#56D364",fontSize:14}}>
          ✓
        </div>
      )}
      <div style={{paddingTop:52}}>
        {screen==='payments'
          ?<Payments counterparties={cp} accounts={accounts} currencies={currencies} articles={articles} currentUser={currentUser} legalEntities={legalEntities} refreshKey={paymentsRefresh}/>
          :(screens[screen]||screens.dashboard)}
      </div>
    </div>
  );
}

export default App;
