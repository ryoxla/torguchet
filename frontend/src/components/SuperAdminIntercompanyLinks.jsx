// ============================================================
// frontend/src/components/SuperAdminIntercompanyLinks.jsx
// Вкладка SuperAdmin-панели: связки «контрагент ↔ компания системы»
// Использует endpoints:
//   GET    /api/superadmin/intercompany-links
//   GET    /api/superadmin/companies              (уже есть в SuperAdmin)
//   GET    /api/superadmin/companies/:id/counterparties
//   POST   /api/superadmin/intercompany-links
//   DELETE /api/superadmin/intercompany-links/:id
// ============================================================

import React, { useState, useEffect } from 'react';
import { api, C } from '../utils/globals';

export default function SuperAdminIntercompanyLinks() {
  const [links, setLinks] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [counterparties, setCounterparties] = useState([]);
  const [form, setForm] = useState({ company_id: '', counterparty_id: '', linked_company_id: '' });
  const [cpSearch, setCpSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadLinks = () => {
    api('/superadmin/intercompany-links')
      .then(d => setLinks(Array.isArray(d) ? d : [])).catch(() => {});
  };

  useEffect(() => {
    loadLinks();
    api('/superadmin/companies')
      .then(d => setCompanies(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  // при выборе компании-владельца подгружаем её контрагентов
  useEffect(() => {
    setCounterparties([]);
    setForm(f => ({ ...f, counterparty_id: '' }));
    setCpSearch('');
    if (!form.company_id) return;
    api(`/superadmin/companies/${form.company_id}/counterparties`)
      .then(d => setCounterparties(Array.isArray(d) ? d : [])).catch(() => {});
  }, [form.company_id]);

  const submit = async () => {
    setError('');
    if (!form.company_id || !form.counterparty_id || !form.linked_company_id) {
      setError('Заполните все три поля'); return;
    }
    if (form.company_id === form.linked_company_id) {
      setError('Нельзя связать компанию с самой собой'); return;
    }
    setSaving(true);
    try {
      await api('/superadmin/intercompany-links', 'POST', form);
      setForm({ company_id: '', counterparty_id: '', linked_company_id: '' });
      loadLinks();
    } catch (e) {
      let msg = e.message;
      try { msg = JSON.parse(msg).error || msg; } catch (_) {}
      setError(msg);
    }
    finally { setSaving(false); }
  };

  const remove = async (id) => {
    if (!window.confirm('Удалить связку? Новые документы перестанут попадать в журнал.')) return;
    try { await api(`/superadmin/intercompany-links/${id}`, 'DELETE'); } catch (e) { alert(e.message); }
    loadLinks();
  };

  // проверка зеркальности: для пары (A→B) ищем (B→A)
  const hasMirror = (link) =>
    links.some(l => Number(l.company_id) === Number(link.linked_company_id) &&
                    Number(l.linked_company_id) === Number(link.company_id));

  const filteredCps = cpSearch
    ? counterparties.filter(c => c.name.toLowerCase().includes(cpSearch.toLowerCase()))
    : counterparties;

  const inputStyle = {
    background: C.bg, color: C.text,
    border: `1px solid ${C.borderLight}`, borderRadius: 8,
    padding: '8px 10px', fontSize: 13, width: '100%',
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      <div style={{
        width: '100%', maxWidth: 900, background: C.surface,
        borderRadius: 10, border: `1px solid ${C.border}`, overflow: 'hidden',
      }}>
        <div style={{ padding: '18px 24px', borderBottom: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>Межкомпанейские связки</div>
          <div style={{ fontSize: 13, color: C.textMuted, marginTop: 2 }}>
            Контрагент в справочнике компании = другая компания системы.
            Для полного обмена связка нужна с обеих сторон.
          </div>
        </div>

        {/* Форма создания */}
        <div style={{ padding: '16px 24px', borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 10, alignItems: 'end' }}>
            <div>
              <label style={{ fontSize: 12, color: C.textMuted, display: 'block', marginBottom: 4 }}>Компания-владелец</label>
              <select value={form.company_id} onChange={e => setForm(f => ({ ...f, company_id: e.target.value }))} style={inputStyle}>
                <option value="">Выбрать…</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, color: C.textMuted, display: 'block', marginBottom: 4 }}>
                Её контрагент {counterparties.length > 0 && `(${counterparties.length})`}
              </label>
              <input
                type="text" value={cpSearch} onChange={e => setCpSearch(e.target.value)}
                placeholder={form.company_id ? 'Поиск контрагента…' : 'Сначала выберите компанию'}
                disabled={!form.company_id}
                style={{ ...inputStyle, marginBottom: 6 }}
              />
              <select value={form.counterparty_id} onChange={e => setForm(f => ({ ...f, counterparty_id: e.target.value }))}
                disabled={!form.company_id} style={inputStyle} size={cpSearch ? Math.min(filteredCps.length, 5) || 1 : 1}>
                <option value="">Выбрать…</option>
                {filteredCps.slice(0, 100).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, color: C.textMuted, display: 'block', marginBottom: 4 }}>= Компания системы</label>
              <select value={form.linked_company_id} onChange={e => setForm(f => ({ ...f, linked_company_id: e.target.value }))} style={inputStyle}>
                <option value="">Выбрать…</option>
                {companies.filter(c => String(c.id) !== String(form.company_id))
                  .map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <button onClick={submit} disabled={saving} style={{
              padding: '9px 18px', borderRadius: 8, border: 'none', fontWeight: 600, fontSize: 13,
              background: C.accent, color: '#fff', cursor: 'pointer', height: 36,
            }}>{saving ? '…' : 'Связать'}</button>
          </div>
          {error && <div style={{ color: C.redText, marginTop: 8, fontSize: 13 }}>{error}</div>}
        </div>

        {/* Таблица связок */}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: C.textMuted }}>
              <th style={{ padding: '10px 14px' }}>Компания</th>
              <th style={{ padding: '10px 14px' }}>Контрагент (id)</th>
              <th style={{ padding: '10px 14px' }}>= Компания системы</th>
              <th style={{ padding: '10px 14px' }}>Зеркало</th>
              <th style={{ padding: '10px 14px' }}></th>
            </tr>
          </thead>
          <tbody>
            {links.length === 0 && (
              <tr><td colSpan={5} style={{ padding: 20, textAlign: 'center', color: C.textMuted }}>Связок пока нет</td></tr>
            )}
            {links.map(l => (
              <tr key={l.id} style={{ borderTop: `1px solid ${C.border}` }}>
                <td style={{ padding: '10px 14px', fontWeight: 600, color: C.text }}>{l.company_name}</td>
                <td style={{ padding: '10px 14px', fontFamily: "'JetBrains Mono', monospace", color: C.text }}>#{l.counterparty_id}</td>
                <td style={{ padding: '10px 14px', color: C.text }}>{l.linked_company_name}</td>
                <td style={{ padding: '10px 14px' }}>
                  {hasMirror(l)
                    ? <span style={{ color: C.greenText, fontSize: 12, fontWeight: 600 }}>✓ есть</span>
                    : <span style={{ color: C.yellowText, fontSize: 12, fontWeight: 600 }}>⚠ нет обратной</span>}
                </td>
                <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                  <button onClick={() => remove(l.id)} style={{
                    padding: '5px 12px', borderRadius: 7, border: `1px solid ${C.red}`,
                    background: 'transparent', color: C.redText, fontSize: 12, cursor: 'pointer',
                  }}>Удалить</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
