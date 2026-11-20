import { useState, useEffect } from 'react';
import { api } from '../utils/globals'; // путь как в TopBar

const C = {
  bg: '#0f1117',
  surface: '#161b26',
  border: '#232a3a',
  text: '#e6e9f0',
  muted: '#8b93a7',
  danger: '#e5484d',
  dangerBg: '#2a1416',
};

// Таблицы-справочники: уходят в отдельную свёрнутую секцию «Справочники»
// и не попадают под кнопку «выделить документы».
const DIRECTORY_TABLES = new Set([
  'counterparties', 'counterparty_categories', 'counterparty_aliases',
  'products', 'product_categories', 'product_grades', 'product_links',
  'countries', 'units', 'grades', 'currencies', 'currency_rates',
  'finance_articles', 'bank_accounts', 'warehouses', 'legal_entities',
  'report_templates', 'sync_queue',
]);

function isDirectory(name) {
  return DIRECTORY_TABLES.has(name);
}

// Действующий пользователь для серверной проверки прав (связь с master по login)
function getActor() {
  try {
    const u = JSON.parse(sessionStorage.getItem('trade_user') || '{}');
    return { login: u.login || '' };
  } catch {
    return { login: '' };
  }
}

export default function ClearDataModal({ open, onClose }) {
  const [tables, setTables] = useState([]);   // [{table, rows}]
  const [checked, setChecked] = useState({}); // {table: true}
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [dirOpen, setDirOpen] = useState(false);

  const actor = getActor();

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setMsg(null);
    setChecked({});
    setConfirm('');
    const q = `?login=${encodeURIComponent(actor.login)}`;
    api(`/admin/tables${q}`)
      .then((data) => setTables(Array.isArray(data) ? data : []))
      .catch((e) => setMsg({ ok: false, text: e?.message || 'Не удалось загрузить таблицы' }))
      .finally(() => setLoading(false));
  }, [open]);

  if (!open) return null;

  const docs = tables.filter((t) => !isDirectory(t.table));
  const dirs = tables.filter((t) => isDirectory(t.table));
  const selected = tables.filter((t) => checked[t.table]);
  const ready = selected.length > 0 && confirm.trim() === 'ОЧИСТИТЬ';

  const toggle = (name) => setChecked((p) => ({ ...p, [name]: !p[name] }));
  const setMany = (list, val) =>
    setChecked((p) => {
      const next = { ...p };
      list.forEach((t) => { next[t.table] = val; });
      return next;
    });

  async function run() {
    if (!ready || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await api('/admin/clear-data', 'POST', {
        tables: selected.map((t) => t.table),
        confirm: confirm.trim(),
        login: actor.login,
      });
      setMsg({ ok: true, text: `Готово. Очищено таблиц: ${res.cleared?.length ?? selected.length}` });
      setChecked({});
      setConfirm('');
      // обновим счётчики строк
      api(`/admin/tables?login=${encodeURIComponent(actor.login)}`)
        .then((d) => Array.isArray(d) && setTables(d)).catch(() => {});
    } catch (e) {
      setMsg({ ok: false, text: e?.message || 'Ошибка очистки' });
    } finally {
      setBusy(false);
    }
  }

  function close() {
    if (busy) return;
    setConfirm('');
    setMsg(null);
    onClose?.();
  }

  const rowStyle = {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '7px 10px', borderRadius: 8, cursor: 'pointer',
  };
  const countStyle = { marginLeft: 'auto', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: C.muted };

  const Row = (t) => (
    <label key={t.table} style={{ ...rowStyle, background: checked[t.table] ? C.dangerBg : 'transparent' }}>
      <input type="checkbox" checked={!!checked[t.table]} onChange={() => toggle(t.table)} />
      <span style={{ fontSize: 13 }}>{t.table}</span>
      <span style={countStyle}>{t.rows}</span>
    </label>
  );

  const linkBtn = {
    background: 'transparent', border: 'none', color: C.muted,
    cursor: 'pointer', fontSize: 12, fontFamily: 'Geologica, sans-serif', padding: 0,
  };

  return (
    <div onClick={close} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: 'min(460px, 100%)', maxHeight: '86vh', display: 'flex', flexDirection: 'column',
        background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14,
        color: C.text, fontFamily: 'Geologica, sans-serif', overflow: 'hidden',
      }}>
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ fontSize: 17, fontWeight: 600, color: C.danger }}>Очистка данных</span>
          <button onClick={close} disabled={busy} aria-label="Закрыть"
            style={{ background: 'transparent', border: 'none', color: C.muted, cursor: busy ? 'default' : 'pointer', fontSize: 22, lineHeight: 1, padding: 0 }}>
            ×
          </button>
        </div>

        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto' }}>
          <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.5 }}>
            Отметьте таблицы для очистки. Действие необратимо — сделайте бэкап заранее.
            Справа указано число строк.
          </div>

          {loading && <div style={{ fontSize: 13, color: C.muted }}>Загрузка таблиц…</div>}

          {!loading && tables.length > 0 && (
            <>
              <div style={{ display: 'flex', gap: 14 }}>
                <button style={linkBtn} onClick={() => setMany(docs, true)}>выделить документы</button>
                <button style={linkBtn} onClick={() => setMany(tables, false)}>снять всё</button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {docs.map(Row)}
              </div>

              {dirs.length > 0 && (
                <div>
                  <button style={{ ...linkBtn, color: C.text, fontSize: 13 }} onClick={() => setDirOpen((o) => !o)}>
                    {dirOpen ? '▲' : '▼'} Справочники ({dirs.length})
                  </button>
                  {dirOpen && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 6 }}>
                      {dirs.map(Row)}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          <div>
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 6 }}>
              Выбрано таблиц: <b style={{ color: C.text }}>{selected.length}</b>. Для подтверждения введите слово <b style={{ color: C.text }}>ОЧИСТИТЬ</b>:
            </div>
            <input
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="ОЧИСТИТЬ"
              style={{
                width: '100%', boxSizing: 'border-box', background: C.bg,
                border: `1px solid ${confirm.trim() === 'ОЧИСТИТЬ' ? C.danger : C.border}`,
                borderRadius: 8, color: C.text, padding: '10px 12px',
                fontFamily: 'JetBrains Mono, monospace', fontSize: 14, outline: 'none',
              }}
            />
          </div>

          {msg && (
            <div style={{
              fontSize: 13, color: msg.ok ? '#3dd68c' : C.danger,
              background: msg.ok ? 'transparent' : C.dangerBg,
              borderRadius: 8, padding: msg.ok ? 0 : '8px 12px',
            }}>
              {msg.text}
            </div>
          )}
        </div>

        <div style={{ padding: '14px 20px', borderTop: `1px solid ${C.border}`, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button onClick={close} disabled={busy} style={{
            background: 'transparent', color: C.muted, border: `1px solid ${C.border}`,
            borderRadius: 8, padding: '9px 16px', cursor: busy ? 'default' : 'pointer', fontFamily: 'Geologica, sans-serif',
          }}>
            Отмена
          </button>
          <button onClick={run} disabled={!ready || busy} style={{
            background: ready && !busy ? C.danger : '#3a2426', color: '#fff', border: 'none',
            borderRadius: 8, padding: '9px 16px', cursor: ready && !busy ? 'pointer' : 'default',
            fontFamily: 'Geologica, sans-serif', opacity: ready && !busy ? 1 : 0.6,
          }}>
            {busy ? 'Очистка…' : `Удалить (${selected.length})`}
          </button>
        </div>
      </div>
    </div>
  );
}
