import { useState, useEffect } from "react";
import { C, api, Btn, Lbl } from "../utils/globals";
import SuperAdminIntercompanyLinks from "./SuperAdminIntercompanyLinks";

function SuperAdmin({ user, onCompanyChange }) {
  const [tab, setTab] = useState('companies'); // 'companies' | 'users'
  const [companies, setCompanies] = useState([]);
  const [selected, setSelected] = useState(null);
  const [users, setUsers] = useState([]);
  const [masterUsers, setMasterUsers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [showProfile, setShowProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({ login:'', password:'', password2:'' });
  const [editUser, setEditUser] = useState(null); // редактируемый master user
  const [pwdPopup, setPwdPopup] = useState(null); // { userId, login, value }
  const [showNewUser, setShowNewUser] = useState(false);
  const [newUserForm, setNewUserForm] = useState({ login:'', full_name:'', company_id:'', role:'user', password:'' });
  const [form, setForm] = useState({ name:'', inn:'', db_url:'', contacts:'', admin_login:'', admin_password:'' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = () => api('/superadmin/companies').then(setCompanies).catch(console.warn);
  const loadMasterUsers = () => api('/superadmin/users').then(setMasterUsers).catch(console.warn);

  useEffect(() => { load(); loadMasterUsers(); }, []);

  const loadUsers = (companyId) => {
    api(`/superadmin/companies/${companyId}/users`).then(setUsers).catch(()=>setUsers([]));
  };

  const selectCompany = (c) => { setSelected(c); loadUsers(c.id); };
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleCreate = async () => {
    if (!form.name || !form.db_url) { setError('Укажите название и Database URL'); return; }
    setLoading(true); setError(''); setSuccess('');
    try {
      await api('/superadmin/companies', 'POST', form);
      setSuccess(`Компания "${form.name}" создана!`);
      setForm({ name:'', inn:'', db_url:'', contacts:'', admin_login:'', admin_password:'' });
      setShowForm(false);
      load(); loadMasterUsers();
    } catch(e) { setError(e.message || 'Ошибка создания'); }
    finally { setLoading(false); }
  };

  const toggleActive = async (c) => {
    try {
      await api(`/superadmin/companies/${c.id}`, 'PUT', { ...c, is_active: !c.is_active });
      load();
      if (selected?.id === c.id) setSelected(p => ({ ...p, is_active: !p.is_active }));
    } catch(e) { setError(e.message); }
  };

  const handleSaveEdit = async () => {
    if (!editForm.name) { setError('Укажите название'); return; }
    setLoading(true); setError(''); setSuccess('');
    try {
      await api(`/superadmin/companies/${selected.id}`, 'PUT', { ...selected, ...editForm });
      setSuccess('Изменения сохранены');
      setEditForm(null);
      setSelected(p => ({ ...p, ...editForm }));
      load();
    } catch(e) { setError(e.message || 'Ошибка сохранения'); }
    finally { setLoading(false); }
  };

  const handleSaveProfile = async () => {
    if (!profileForm.login) { setError('Укажите логин'); return; }
    if (profileForm.password && profileForm.password !== profileForm.password2) { setError('Пароли не совпадают'); return; }
    setLoading(true); setError(''); setSuccess('');
    try {
      await api('/superadmin/profile', 'PUT', { login: profileForm.login, password: profileForm.password || undefined });
      setSuccess('Профиль обновлён');
      setProfileForm({ login:'', password:'', password2:'' });
      setShowProfile(false);
    } catch(e) { setError(e.message || 'Ошибка сохранения'); }
    finally { setLoading(false); }
  };

  const handleCreateUser = async () => {
    const { login, full_name, company_id, role, password } = newUserForm;
    if (!login || !password || !company_id) { setError('Укажите логин, пароль и компанию'); return; }
    setLoading(true); setError(''); setSuccess('');
    try {
      await api('/superadmin/users', 'POST', { login, full_name, company_id: parseInt(company_id), role, password });
      setSuccess(`Пользователь "${login}" создан`);
      setNewUserForm({ login:'', full_name:'', company_id:'', role:'user', password:'' });
      setShowNewUser(false);
      loadMasterUsers();
    } catch(e) { setError(e.message || 'Ошибка создания'); }
    finally { setLoading(false); }
  };

  const handleSaveUser = async () => {
    if (!editUser.login) { setError('Укажите логин'); return; }
    setLoading(true); setError(''); setSuccess('');
    try {
      const payload = { ...editUser };
      if (editUser.newPassword) payload.password = editUser.newPassword;
      delete payload.newPassword;
      await api(`/superadmin/users/${editUser.id}`, 'PUT', payload);
      setSuccess('Пользователь обновлён');
      setEditUser(null);
      loadMasterUsers();
    } catch(e) { setError(e.message || 'Ошибка сохранения'); }
    finally { setLoading(false); }
  };

  const handleDeleteUser = async (u) => {
    if (!window.confirm(`Удалить пользователя "${u.login}"?`)) return;
    try {
      await api(`/superadmin/users/${u.id}`, 'DELETE');
      loadMasterUsers();
    } catch(e) { setError(e.message); }
  };

  const switchToCompany = (c) => { if (onCompanyChange) onCompanyChange(c); };

  const inputStyle = {
    width: '100%', background: C.bg, border: `1px solid ${C.borderLight}`,
    color: C.text, borderRadius: 6, padding: '9px 12px', fontSize: 13,
    outline: 'none', boxSizing: 'border-box'
  };

  const selStyle = { ...inputStyle, cursor: 'pointer' };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px' }}>

      {/* Заголовок */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ color: C.text, fontSize: 20, fontWeight: 700 }}>Superadmin панель</div>
          <div style={{ color: C.textMuted, fontSize: 12, marginTop: 3 }}>{companies.length} компаний · {masterUsers.length} пользователей</div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={() => { setShowProfile(p=>!p); setError(''); setSuccess(''); setProfileForm({ login: user?.login||'', password:'', password2:'' }); }}
            style={{ background: showProfile?C.accentDim:'transparent', border:`1px solid ${showProfile?C.accent:C.borderLight}`, color: showProfile?C.accentText:C.textMuted, borderRadius:6, padding:'6px 12px', cursor:'pointer', fontSize:12, fontWeight:600 }}>
            👤 Мой профиль
          </button>
          {tab==='companies' && (
            <Btn onClick={() => { setShowForm(p=>!p); setError(''); setSuccess(''); }}>
              {showForm ? '✕ Отмена' : '+ Новая компания'}
            </Btn>
          )}
        </div>
      </div>

      {/* Вкладки */}
      <div style={{ display:'flex', gap:4, marginBottom:20, borderBottom:`1px solid ${C.border}`, paddingBottom:0 }}>
        {[['companies','🏢 Компании'],['users','👥 Пользователи'],['links','🔄 Связки']].map(([id,label])=>(
          <button key={id} onClick={()=>{setTab(id);setError('');setSuccess('');}}
            style={{ padding:'8px 16px', background:'transparent', border:'none', borderBottom:`2px solid ${tab===id?C.accent:'transparent'}`, color:tab===id?C.accentText:C.textMuted, cursor:'pointer', fontSize:13, fontWeight:tab===id?600:400 }}>
            {label}
          </button>
        ))}
      </div>

      {/* Уведомления */}
      {error && <div style={{ background:'#3D1A1A', border:'1px solid #F85149', borderRadius:8, padding:'10px 14px', color:'#FF7B72', fontSize:13, marginBottom:16 }}>{error}</div>}
      {success && <div style={{ background:'#1A3D22', border:'1px solid #3FB950', borderRadius:8, padding:'10px 14px', color:'#56D364', fontSize:13, marginBottom:16 }}>{success}</div>}

      {/* Форма профиля */}
      {showProfile && (
        <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:10, padding:20, marginBottom:20 }}>
          <div style={{ color:C.text, fontWeight:600, fontSize:14, marginBottom:16 }}>Мой профиль — {user?.login}</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div style={{ gridColumn:'1/-1' }}><Lbl req>Логин</Lbl><input style={inputStyle} value={profileForm.login} onChange={e=>setProfileForm(p=>({...p,login:e.target.value}))} /></div>
            <div><Lbl>Новый пароль</Lbl><input style={inputStyle} type="password" value={profileForm.password} onChange={e=>setProfileForm(p=>({...p,password:e.target.value}))} placeholder="оставь пустым чтобы не менять" /></div>
            <div><Lbl>Повтори пароль</Lbl><input style={inputStyle} type="password" value={profileForm.password2} onChange={e=>setProfileForm(p=>({...p,password2:e.target.value}))} /></div>
          </div>
          <div style={{ marginTop:16, display:'flex', gap:8 }}>
            <Btn onClick={handleSaveProfile} disabled={loading}>{loading?'Сохранение...':'Сохранить'}</Btn>
            <Btn variant="ghost" onClick={()=>setShowProfile(false)}>Отмена</Btn>
          </div>
        </div>
      )}

      {/* ── ВКЛАДКА КОМПАНИИ ── */}
      {tab==='companies' && (<>
        {showForm && (
          <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:10, padding:20, marginBottom:20 }}>
            <div style={{ color:C.text, fontWeight:600, fontSize:14, marginBottom:16 }}>Новая компания</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <div><Lbl req>Название</Lbl><input style={inputStyle} value={form.name} onChange={e=>set('name',e.target.value)} placeholder="ООО Ромашка" /></div>
              <div><Lbl>ИНН</Lbl><input style={inputStyle} value={form.inn} onChange={e=>set('inn',e.target.value)} placeholder="1234567890" /></div>
              <div style={{ gridColumn:'1/-1' }}><Lbl req>Database URL</Lbl><input style={inputStyle} value={form.db_url} onChange={e=>set('db_url',e.target.value)} placeholder="postgresql://postgres:ПАРОЛЬ@localhost:5433/имя_новой_базы (базу создаст программа)" /></div>
              <div><Lbl>Логин admin</Lbl><input style={inputStyle} value={form.admin_login} onChange={e=>set('admin_login',e.target.value)} placeholder="admin_romashka" /></div>
              <div><Lbl>Пароль admin</Lbl><input style={inputStyle} type="password" value={form.admin_password} onChange={e=>set('admin_password',e.target.value)} /></div>
              <div style={{ gridColumn:'1/-1' }}><Lbl>Контакты</Lbl><input style={inputStyle} value={form.contacts} onChange={e=>set('contacts',e.target.value)} placeholder="Телефон, email..." /></div>
            </div>
            <div style={{ marginTop:16, display:'flex', gap:8 }}>
              <Btn onClick={handleCreate} disabled={loading}>{loading?'Создание...':'Создать компанию'}</Btn>
              <Btn variant="ghost" onClick={()=>setShowForm(false)}>Отмена</Btn>
            </div>
          </div>
        )}

        <div style={{ display:'grid', gridTemplateColumns: selected?'1fr 1fr':'1fr', gap:16 }}>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {companies.map(c=>(
              <div key={c.id} onClick={()=>selectCompany(c)}
                style={{ background:selected?.id===c.id?C.accentDim:C.surface, border:`1px solid ${selected?.id===c.id?C.accent:C.border}`, borderRadius:8, padding:'12px 16px', cursor:'pointer' }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <div style={{ width:32, height:32, borderRadius:8, background:`linear-gradient(135deg,${C.accent},#1a56cc)`, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:13, fontWeight:700 }}>{c.name[0]}</div>
                    <div>
                      <div style={{ color:C.text, fontWeight:600, fontSize:14 }}>{c.name}</div>
                      <div style={{ color:C.textMuted, fontSize:11 }}>ID: {c.id}{c.inn?` · ИНН: ${c.inn}`:''}</div>
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:8 }}>
                    {user?.company_id===c.id&&<span style={{ fontSize:10, color:C.accentText, background:C.accentDim, padding:'2px 7px', borderRadius:4, fontWeight:600 }}>текущая</span>}
                    <span style={{ fontSize:10, color:c.is_active?'#56D364':C.textMuted, background:c.is_active?'#1A3D22':C.surface, padding:'2px 7px', borderRadius:4, border:`1px solid ${c.is_active?'#3FB950':C.border}` }}>
                      {c.is_active?'активна':'отключена'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {selected&&(
            <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:10, padding:20 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
                <div style={{ color:C.text, fontWeight:600, fontSize:15 }}>{selected.name}</div>
                <div style={{ display:'flex', gap:8 }}>
                  <button onClick={()=>{setEditForm(editForm?null:{name:selected.name,inn:selected.inn||'',db_url:selected.db_url||''});setError('');setSuccess('');}}
                    style={{ background:editForm?C.accentDim:'transparent', border:`1px solid ${editForm?C.accent:C.borderLight}`, color:editForm?C.accentText:C.textMuted, borderRadius:6, padding:'6px 12px', cursor:'pointer', fontSize:12 }}>
                    {editForm?'✕ Отмена':'✏ Изменить'}
                  </button>
                  <button onClick={()=>switchToCompany(selected)} style={{ background:C.accent, border:'none', color:'#fff', borderRadius:6, padding:'6px 12px', cursor:'pointer', fontSize:12, fontWeight:600 }}>Войти →</button>
                  <button onClick={()=>toggleActive(selected)} style={{ background:'transparent', border:`1px solid ${C.borderLight}`, color:selected.is_active?C.redText:'#56D364', borderRadius:6, padding:'6px 12px', cursor:'pointer', fontSize:12 }}>
                    {selected.is_active?'Отключить':'Включить'}
                  </button>
                </div>
              </div>

              {editForm?(
                <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:16 }}>
                  <div><Lbl req>Название</Lbl><input style={inputStyle} value={editForm.name} onChange={e=>setEditForm(p=>({...p,name:e.target.value}))} /></div>
                  <div><Lbl>ИНН</Lbl><input style={inputStyle} value={editForm.inn} onChange={e=>setEditForm(p=>({...p,inn:e.target.value}))} /></div>
                  <div><Lbl>Database URL</Lbl><input style={inputStyle} value={editForm.db_url} onChange={e=>setEditForm(p=>({...p,db_url:e.target.value}))} /></div>
                  <div style={{ display:'flex', gap:8 }}>
                    <Btn onClick={handleSaveEdit} disabled={loading}>{loading?'Сохранение...':'Сохранить'}</Btn>
                    <Btn variant="ghost" onClick={()=>setEditForm(null)}>Отмена</Btn>
                  </div>
                </div>
              ):(
                <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:16 }}>
                  {selected.inn&&<div style={{ fontSize:12 }}><span style={{ color:C.textMuted }}>ИНН: </span><span style={{ color:C.text }}>{selected.inn}</span></div>}
                  <div style={{ fontSize:12 }}><span style={{ color:C.textMuted }}>Создана: </span><span style={{ color:C.text }}>{new Date(selected.created_at).toLocaleDateString('ru-RU')}</span></div>
                </div>
              )}

              <div style={{ color:C.textMuted, fontSize:11, letterSpacing:'0.08em', marginBottom:8 }}>ПОЛЬЗОВАТЕЛИ</div>
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {users.length===0&&<div style={{ color:C.textMuted, fontSize:12 }}>Нет пользователей</div>}
                {users.map(u=>(
                  <div key={u.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'7px 10px', background:C.bg, borderRadius:6 }}>
                    <div>
                      <span style={{ color:C.text, fontSize:13, fontWeight:500 }}>{u.login}</span>
                      {u.full_name&&u.full_name!==u.login&&<span style={{ color:C.textMuted, fontSize:11, marginLeft:8 }}>{u.full_name}</span>}
                    </div>
                    <span style={{ fontSize:10, color:u.role==='admin'?C.accentText:C.textMuted, background:u.role==='admin'?C.accentDim:'transparent', padding:'2px 7px', borderRadius:4 }}>{u.role}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </>)}

      {/* ── ВКЛАДКА ПОЛЬЗОВАТЕЛИ ── */}
      {tab==='users' && (
        <>
        <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:12 }}>
          <Btn onClick={()=>{setShowNewUser(p=>!p);setError('');setSuccess('');}}>
            {showNewUser?'✕ Отмена':'+ Новый пользователь'}
          </Btn>
        </div>

        {showNewUser && (
          <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:10, padding:20, marginBottom:16 }}>
            <div style={{ color:C.text, fontWeight:600, fontSize:14, marginBottom:16 }}>Новый пользователь</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <div><Lbl req>Логин</Lbl><input style={inputStyle} value={newUserForm.login} onChange={e=>setNewUserForm(p=>({...p,login:e.target.value}))} placeholder="ivanov" /></div>
              <div><Lbl>Имя</Lbl><input style={inputStyle} value={newUserForm.full_name} onChange={e=>setNewUserForm(p=>({...p,full_name:e.target.value}))} placeholder="Иванов Иван" /></div>
              <div>
                <Lbl req>Компания</Lbl>
                <select style={{...inputStyle,cursor:'pointer'}} value={newUserForm.company_id} onChange={e=>setNewUserForm(p=>({...p,company_id:e.target.value}))}>
                  <option value="">— Выберите —</option>
                  {companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <Lbl>Роль</Lbl>
                <select style={{...inputStyle,cursor:'pointer'}} value={newUserForm.role} onChange={e=>setNewUserForm(p=>({...p,role:e.target.value}))}>
                  {['user','admin','superadmin'].map(r=><option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div style={{gridColumn:'1/-1'}}><Lbl req>Пароль</Lbl><input style={inputStyle} type="password" value={newUserForm.password} onChange={e=>setNewUserForm(p=>({...p,password:e.target.value}))} placeholder="••••••••" /></div>
            </div>
            <div style={{ marginTop:16, display:'flex', gap:8 }}>
              <Btn onClick={handleCreateUser} disabled={loading}>{loading?'Создание...':'Создать'}</Btn>
              <Btn variant="ghost" onClick={()=>setShowNewUser(false)}>Отмена</Btn>
            </div>
          </div>
        )}

        <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:10, overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ borderBottom:`1px solid ${C.border}` }}>
                {['ID','Логин','Имя','Компания','Роль','Активен',''].map(h=>(
                  <th key={h} style={{ padding:'10px 14px', color:C.textMuted, fontSize:11, fontWeight:600, textAlign:'left', letterSpacing:'0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {masterUsers.map(u=>(
                <tr key={u.id} style={{ borderBottom:`1px solid ${C.border}`, background: editUser?.id===u.id?C.accentDim:'transparent' }}>
                  {editUser?.id===u.id ? (
                    <>
                      <td style={{ padding:'8px 14px', color:C.textMuted, fontSize:12 }}>{u.id}</td>
                      <td style={{ padding:'4px 8px' }}><input style={{...inputStyle, padding:'5px 8px'}} value={editUser.login} onChange={e=>setEditUser(p=>({...p,login:e.target.value}))} /></td>
                      <td style={{ padding:'4px 8px' }}><input style={{...inputStyle, padding:'5px 8px'}} value={editUser.full_name||''} onChange={e=>setEditUser(p=>({...p,full_name:e.target.value}))} /></td>
                      <td style={{ padding:'4px 8px' }}>
                        <select style={{...selStyle, padding:'5px 8px'}} value={editUser.company_id} onChange={e=>setEditUser(p=>({...p,company_id:parseInt(e.target.value)}))}>
                          {companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </td>
                      <td style={{ padding:'4px 8px' }}>
                        <select style={{...selStyle, padding:'5px 8px'}} value={editUser.role} onChange={e=>setEditUser(p=>({...p,role:e.target.value}))}>
                          {['superadmin','admin','user'].map(r=><option key={r} value={r}>{r}</option>)}
                        </select>
                      </td>
                      <td style={{ padding:'4px 8px' }}>
                        <select style={{...selStyle, padding:'5px 8px'}} value={editUser.is_active?'1':'0'} onChange={e=>setEditUser(p=>({...p,is_active:e.target.value==='1'}))}>
                          <option value="1">Да</option>
                          <option value="0">Нет</option>
                        </select>
                      </td>
                      <td style={{ padding:'4px 8px' }}>
                        <div style={{ display:'flex', gap:4 }}>
                          <button onClick={handleSaveUser} disabled={loading} style={{ background:C.accent, border:'none', color:'#fff', borderRadius:5, padding:'4px 10px', cursor:'pointer', fontSize:12 }}>✓</button>
                          <button onClick={()=>setEditUser(null)} style={{ background:'transparent', border:`1px solid ${C.borderLight}`, color:C.textMuted, borderRadius:5, padding:'4px 10px', cursor:'pointer', fontSize:12 }}>✕</button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td style={{ padding:'10px 14px', color:C.textMuted, fontSize:12 }}>{u.id}</td>
                      <td style={{ padding:'10px 14px', color:C.text, fontSize:13, fontWeight:500 }}>{u.login}</td>
                      <td style={{ padding:'10px 14px', color:C.textMuted, fontSize:12 }}>{u.full_name||'—'}</td>
                      <td style={{ padding:'10px 14px' }}>
                        <span style={{ fontSize:12, color:C.accentText, background:C.accentDim, padding:'2px 8px', borderRadius:4 }}>{u.company_name}</span>
                      </td>
                      <td style={{ padding:'10px 14px' }}>
                        <span style={{ fontSize:11, color: u.role==='superadmin'?'#f59e0b': u.role==='admin'?C.accentText:C.textMuted, background: u.role==='superadmin'?'#3d2a00': u.role==='admin'?C.accentDim:'transparent', padding:'2px 7px', borderRadius:4 }}>{u.role}</span>
                      </td>
                      <td style={{ padding:'10px 14px' }}>
                        <span style={{ fontSize:11, color:u.is_active?'#56D364':C.redText }}>{u.is_active?'Да':'Нет'}</span>
                      </td>
                      <td style={{ padding:'10px 14px' }}>
                        <div style={{ display:'flex', gap:4 }}>
                          <button onClick={()=>setEditUser({...u})} style={{ background:'transparent', border:`1px solid ${C.borderLight}`, color:C.textMuted, borderRadius:5, padding:'4px 10px', cursor:'pointer', fontSize:12 }}>✏</button>
                          <button onClick={()=>setPwdPopup({userId:u.id, login:u.login, value:''})} title="Сменить пароль" style={{ background:'transparent', border:`1px solid ${C.borderLight}`, color:'#f59e0b', borderRadius:5, padding:'4px 8px', cursor:'pointer', fontSize:12 }}>🔑</button>
                          {u.role!=='superadmin'&&<button onClick={()=>handleDeleteUser(u)} style={{ background:'transparent', border:`1px solid ${C.borderLight}`, color:C.redText, borderRadius:5, padding:'4px 10px', cursor:'pointer', fontSize:12 }}>🗑</button>}
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
      {/* Попап смены пароля */}
      {pwdPopup && (
        <div onClick={e=>{if(e.target===e.currentTarget)setPwdPopup(null);}} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:300, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:10, padding:24, width:320 }}>
            <div style={{ color:C.text, fontWeight:600, fontSize:14, marginBottom:16 }}>Сменить пароль — {pwdPopup.login}</div>
            <Lbl req>Новый пароль</Lbl>
            <input style={inputStyle} type="password" value={pwdPopup.value} onChange={e=>setPwdPopup(p=>({...p,value:e.target.value}))} placeholder="Введите новый пароль" autoFocus />
            <div style={{ display:'flex', gap:8, marginTop:16 }}>
              <Btn onClick={async()=>{
                if(!pwdPopup.value){setError('Введите пароль');return;}
                setLoading(true);setError('');
                try{
                  await api(`/superadmin/users/${pwdPopup.userId}`,'PUT',{
                    ...masterUsers.find(u=>u.id===pwdPopup.userId),
                    password:pwdPopup.value
                  });
                  setSuccess(`Пароль для ${pwdPopup.login} изменён`);
                  setPwdPopup(null);
                }catch(e){setError(e.message||'Ошибка');}
                finally{setLoading(false);}
              }} disabled={loading}>{loading?'...':'Сохранить'}</Btn>
              <Btn variant="ghost" onClick={()=>setPwdPopup(null)}>Отмена</Btn>
            </div>
          </div>
        </div>
      )}

      {/* ── ВКЛАДКА СВЯЗКИ ── */}
      {tab==='links' && <SuperAdminIntercompanyLinks/>}

    </div>
  );
}

export default SuperAdmin;
