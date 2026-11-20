import { useState, useEffect, useRef } from "react";
import { C, fmt, fmtDate, api, Card, SearchSelect } from "../utils/globals";

// ─── ПАРСЕРЫ ПО БАНКАМ ───────────────────────────────────────────────────────

const BANKS = [
  { id: "natsstandart", label: "Национальный стандарт", encoding: "windows-1251" },
  { id: "tbank",        label: "Т-Банк (Тинькофф)",     encoding: "utf-8" },
  { id: "alfabank",     label: "АльфаБанк",               encoding: "windows-1251" },
];

function parseNatsStandart(text) {
  const rows = text.split('\n').map(r => r.split(';').map(c => c.trim().replace(/^"|"$/g, '')));
  const result = [];
  for (const r of rows) {
    if (r.length < 10) continue;
    const docNum = r[0] || '';
    const dateStr = r[1] || '';
    const cpName = r[2] || '';
    const inn = r[3] || '';
    const debit  = Math.abs(parseFloat((r[8] || '').replace(',', '.')) || 0);
    const credit = Math.abs(parseFloat((r[9] || '').replace(',', '.')) || 0);
    const purpose = r[10] || '';
    if (!dateStr || !/\d{2}\.\d{2}\.\d{4}/.test(dateStr)) continue;
    if (!debit && !credit) continue;
    const parts = dateStr.split('.');
    const isoDate = parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : dateStr;
    if (credit > 0) result.push({ operation_date: isoDate, direction: 'in',  amount: credit, counterparty_name: cpName, counterparty_inn: inn, purpose, doc_number: docNum });
    if (debit  > 0) result.push({ operation_date: isoDate, direction: 'out', amount: debit,  counterparty_name: cpName, counterparty_inn: inn, purpose, doc_number: docNum });
  }
  return result;
}

function parseTBankLine(line) {
  const result = []; let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (inQ && line[i+1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
    else if (ch === ';' && !inQ) { result.push(cur); cur = ''; }
    else cur += ch;
  }
  result.push(cur); return result;
}

function parseTBank(text) {
  const cleaned = text.replace(/\uFEFF/, '');
  const lines = cleaned.split('\n');
  const result = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim(); if (!line) continue;
    const r = parseTBankLine(line); if (r.length < 10) continue;
    const typeOp  = (r[1]  || '').trim();
    const dateStr = (r[2]  || '').trim();
    const docNum  = (r[3]  || '').trim();
    const amtRaw  = (r[5]  || '').trim();
    const purpose = (r[8]  || '').trim();
    const inn     = (r[23] || '').trim();
    const cpName  = (r[24] || '').trim();
    if (!dateStr || !/\d{2}\.\d{2}\.\d{4}/.test(dateStr)) continue;
    const amount = Math.abs(parseFloat(amtRaw.replace(',', '.').replace(/\s/g, '')) || 0);
    if (!amount) continue;
    const parts = dateStr.split('.');
    const isoDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
    result.push({ operation_date: isoDate, direction: typeOp === 'Кредит' ? 'in' : 'out', amount, counterparty_name: cpName || null, counterparty_inn: inn || null, purpose: purpose || null, doc_number: docNum || null });
  }
  return result;
}

function parseAlfaBank(text) {
  const lines = text.split('\n'); const result = [];
  for (let i = 2; i < lines.length; i++) {
    const r = lines[i].split('\t'); if (r.length < 33) continue;
    const dc      = (r[28] || '').trim();
    const dateStr = (r[29] || '').trim();
    const docNum  = (r[31] || '').trim();
    const amtRaw  = (r[32] || '').trim();
    const cpName  = dc === 'C' ? (r[34] || '').trim() : (r[42] || '').trim();
    const inn     = dc === 'C' ? (r[35] || '').trim() : (r[43] || '').trim();
    const purpose = (r[64] || '').trim();
    if (!dateStr || !/\d{2}\.\d{2}\.\d{4}/.test(dateStr)) continue;
    const amount = Math.abs(parseFloat(amtRaw.replace(',', '.').replace(/\s/g, '')) || 0);
    if (!amount) continue;
    if (dc !== 'C' && dc !== 'D') continue;
    const parts = dateStr.split('.');
    const isoDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
    result.push({ operation_date: isoDate, direction: dc === 'C' ? 'in' : 'out', amount, counterparty_name: cpName || null, counterparty_inn: inn || null, purpose: purpose || null, doc_number: docNum || null });
  }
  return result;
}

function parseByBank(bankId, text) {
  if (bankId === 'natsstandart') return parseNatsStandart(text);
  if (bankId === 'tbank')        return parseTBank(text);
  if (bankId === 'alfabank')     return parseAlfaBank(text);
  return [];
}

function readFileWithEncoding(file, encoding) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsText(file, encoding);
  });
}

// ─── КОМПОНЕНТ ───────────────────────────────────────────────────────────────

function BankStatements({ accounts, counterparties }) {
  const [statements,    setStatements]    = useState([]);
  const [selected,      setSelected]      = useState(null);
  const [lines,         setLines]         = useState([]);
  const [loading,       setLoading]       = useState(false);
  const [linesLoading,  setLinesLoading]  = useState(false);
  const [filter,        setFilter]        = useState("all");
  const [matchCp,       setMatchCp]       = useState({});
  const [saveAlias,     setSaveAlias]     = useState({});
  const [uploadModal,   setUploadModal]   = useState(false);
  const [uploadForm,    setUploadForm]    = useState({ bank_account_id: "", date_from: "", date_to: "", bank_id: "" });
  const [parsedLines,   setParsedLines]   = useState([]);
  const [fileName,      setFileName]      = useState("");
  const [uploadError,   setUploadError]   = useState("");
  const [uploading,     setUploading]     = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const fileRef = useRef();

  const handleDelete = async (id) => {
    try { await api(`/bank-statements/${id}`, 'DELETE'); setStatements(prev => prev.filter(s => s.id !== id)); setConfirmDelete(null); }
    catch(e) { alert('Ошибка удаления: ' + e.message); }
  };

  useEffect(() => { loadStatements(); }, []);

  const loadStatements = () => {
    setLoading(true);
    api('/bank-statements').then(setStatements).catch(() => {}).finally(() => setLoading(false));
  };

  const openStatement = (stmt) => {
    setSelected(stmt); setLinesLoading(true);
    api(`/bank-statements/${stmt.id}/lines`).then(rows => setLines(rows)).catch(() => {}).finally(() => setLinesLoading(false));
  };

  const handleMatch = async (lineId) => {
    const cpId = matchCp[lineId]; if (!cpId) return;
    await api(`/bank-statement-lines/${lineId}/match`, 'POST', { counterparty_id: cpId, save_alias: !!saveAlias[lineId] });
    setLines(prev => prev.map(l => l.id === lineId ? { ...l, status: 'posted', counterparty_id: parseInt(cpId) } : l));
    setSelected(prev => ({ ...prev, new_lines: Math.max(0, parseInt(prev.new_lines) - 1), posted_lines: parseInt(prev.posted_lines) + 1 }));
  };

  const handleSkip = async (lineId) => {
    await api(`/bank-statement-lines/${lineId}/skip`, 'POST', {});
    setLines(prev => prev.map(l => l.id === lineId ? { ...l, status: 'skipped' } : l));
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    setUploadError(''); setParsedLines([]); setFileName(file.name);
    const bank = BANKS.find(b => b.id === uploadForm.bank_id);
    if (!bank) { setUploadError('Сначала выберите банк'); return; }
    try {
      const text = await readFileWithEncoding(file, bank.encoding);
      const rows = parseByBank(bank.id, text);
      if (!rows.length) { setUploadError('Не удалось распознать строки. Проверьте формат файла.'); return; }
      setParsedLines(rows);
      const dates = rows.map(r => r.operation_date).sort();
      setUploadForm(f => ({ ...f, date_from: dates[0], date_to: dates[dates.length - 1] }));
    } catch(e) { setUploadError('Ошибка чтения файла: ' + e.message); }
  };

  const handleUpload = async () => {
    setUploadError('');
    if (!uploadForm.bank_account_id) { setUploadError('Выберите счёт'); return; }
    if (!parsedLines.length) { setUploadError('Сначала загрузите файл'); return; }
    setUploading(true);
    try {
      await api('/bank-statements', 'POST', { ...uploadForm, lines: parsedLines });
      resetModal(); loadStatements();
    } catch(e) { setUploadError('Ошибка загрузки: ' + e.message); }
    finally { setUploading(false); }
  };

  const resetModal = () => {
    setUploadModal(false); setParsedLines([]); setFileName(''); setUploadError('');
    setUploadForm({ bank_account_id: '', date_from: '', date_to: '', bank_id: '' });
  };

  const statusColor = s => s === 'posted' ? C.greenText : s === 'matched' ? C.accentText : s === 'skipped' ? C.textDim : C.yellowText;
  const statusLabel = s => s === 'posted' ? '✅ Проведён' : s === 'matched' ? '🔗 Сопоставлен' : s === 'skipped' ? '⏭ Пропущен' : '🟡 Новый';

  const sel = { background: C.bg, border: `1px solid ${C.borderLight}`, color: C.text, borderRadius: 6, padding: '7px 10px', fontSize: 13, outline: 'none', width: '100%' };
  const inp = { background: C.bg, border: `1px solid ${C.borderLight}`, color: C.text, borderRadius: 6, padding: '7px 10px', fontSize: 13, outline: 'none' };

  const filteredLines = lines.filter(l => filter === 'all' || l.status === filter);
  const cpMap = Object.fromEntries(counterparties.map(c => [c.id, c.name]));

  /* ══════════════════════════════════════
     ДЕТАЛЬНАЯ ВЫПИСКА (список строк)
     ══════════════════════════════════════ */
  if (selected) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '28px 24px' }}>
      <div style={{ width: 'fit-content', maxWidth: '100%' }}>

        {/* Шапка */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, paddingBottom: 16, borderBottom: `1px solid ${C.border}`, flexWrap: 'wrap', width: '100%' }}>
          <button type="button" onClick={() => { setSelected(null); setLines([]); }}
            style={{ background: 'transparent', border: `1px solid ${C.borderLight}`, color: C.text, borderRadius: 6, padding: '7px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>← Назад</button>
          <h1 style={{ margin: 0, color: C.text, fontSize: 18, fontWeight: 700 }}>Выписка #{selected.id} · {selected.account_name || '—'}</h1>
          <span style={{ color: C.textMuted, fontSize: 12 }}>{fmtDate(selected.date_from)} — {fmtDate(selected.date_to)}</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            {[['all','Все'],['new','Новые'],['posted','Проведённые'],['skipped','Пропущенные']].map(([v,l]) => (
              <button type="button" key={v} onClick={() => setFilter(v)} style={{ padding: '6px 12px', background: filter === v ? C.accent : 'transparent', border: `1px solid ${filter === v ? C.accent : C.borderLight}`, color: filter === v ? '#fff' : C.textMuted, borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>{l}</button>
            ))}
          </div>
        </div>

        {/* KPI */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 16, width: '100%' }}>
          {[
            { l: 'Всего строк',      v: selected.total_lines,  c: C.text      },
            { l: 'Проведено',        v: selected.posted_lines, c: C.greenText },
            { l: 'Не сопоставлено', v: selected.new_lines,    c: C.yellowText },
            { l: 'Пропущено',        v: parseInt(selected.total_lines) - parseInt(selected.posted_lines) - parseInt(selected.new_lines), c: C.textDim },
          ].map((k, i) => (
            <Card key={i} style={{ padding: '14px 16px' }}>
              <div style={{ color: C.textMuted, fontSize: 11, marginBottom: 4 }}>{k.l}</div>
              <div style={{ color: k.c, fontSize: 22, fontWeight: 700 }}>{k.v}</div>
            </Card>
          ))}
        </div>

        {/* Таблица строк */}
        {linesLoading
          ? <div style={{ padding: 32, textAlign: 'center', color: C.textMuted }}>Загрузка...</div>
          : <Card style={{ overflow: 'hidden' }}>
              <div className="ct-wrap">
                <table className="ct">
                  <thead><tr>
                    <th style={{ whiteSpace: 'nowrap', width: 1 }}>Дата</th>
                    <th style={{ whiteSpace: 'nowrap', width: 1 }}>Направление</th>
                    <th style={{ whiteSpace: 'nowrap', width: 1, textAlign: 'right' }}>Сумма</th>
                    <th style={{ width: 200 }}>Контрагент из банка</th>
                    <th style={{ width: 110 }}>ИНН</th>
                    <th>Назначение</th>
                    <th style={{ width: 110 }}>Статус</th>
                    <th style={{ width: 260 }}>Сопоставление</th>
                  </tr></thead>
                  <tbody>
                    {filteredLines.map(l => {
                      const isNew = l.status === 'new';
                      const matchedName = l.counterparty_id ? cpMap[l.counterparty_id] : null;
                      return (
                        <tr key={l.id} style={{ borderBottom: `1px solid ${C.border}40` }}>
                          <td style={{ padding: '8px 10px', fontSize: 12, color: C.textDim, whiteSpace: 'nowrap' }}>{fmtDate(l.operation_date)}</td>
                          <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                            <span style={{ color: l.direction === 'in' ? C.greenText : C.redText, fontWeight: 600, fontSize: 12 }}>
                              {l.direction === 'in' ? '↓ Приход' : '↑ Расход'}
                            </span>
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: l.direction === 'in' ? C.greenText : C.redText, whiteSpace: 'nowrap' }}>
                            {fmt(l.amount)} ₽
                          </td>
                          <td style={{ padding: '8px 10px', fontSize: 12, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={l.counterparty_name || ''}>{l.counterparty_name || '—'}</td>
                          <td style={{ padding: '8px 10px', fontSize: 11, color: C.textMuted, fontFamily: 'monospace' }}>{l.counterparty_inn || '—'}</td>
                          <td style={{ padding: '8px 10px', fontSize: 11, color: C.textMuted, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={l.purpose || ''}>{l.purpose || '—'}</td>
                          <td style={{ padding: '8px 10px' }}>
                            <span style={{ color: statusColor(l.status), fontSize: 11, fontWeight: 600 }}>{statusLabel(l.status)}</span>
                            {matchedName && <div style={{ color: C.accentText, fontSize: 11, marginTop: 2 }}>{matchedName}</div>}
                          </td>
                          <td style={{ padding: '6px 8px' }}>
                            {isNew && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <SearchSelect
                                  value={matchCp[l.id] || ''}
                                  onChange={v => setMatchCp(p => ({ ...p, [l.id]: v }))}
                                  options={(counterparties||[]).filter(c=>c.active||c.is_active).map(c=>({value:String(c.id),label:c.name}))}
                                  placeholder="Выбрать контрагента..."
                                />
                                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                  <label style={{ display: 'flex', gap: 4, alignItems: 'center', color: C.textMuted, fontSize: 11, cursor: 'pointer' }}>
                                    <input type="checkbox" checked={!!saveAlias[l.id]} onChange={e => setSaveAlias(p => ({ ...p, [l.id]: e.target.checked }))} />
                                    Запомнить
                                  </label>
                                  <button type="button" onClick={() => handleMatch(l.id)} disabled={!matchCp[l.id]}
                                    style={{ flex: 1, padding: '3px 8px', background: matchCp[l.id] ? C.accent : C.surface, border: 'none', color: matchCp[l.id] ? '#fff' : C.textDim, borderRadius: 4, cursor: matchCp[l.id] ? 'pointer' : 'default', fontSize: 11, fontWeight: 600 }}>
                                    Провести
                                  </button>
                                  <button type="button" onClick={() => handleSkip(l.id)}
                                    style={{ padding: '3px 8px', background: 'transparent', border: `1px solid ${C.borderLight}`, color: C.textMuted, borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>
                                    Пропустить
                                  </button>
                                </div>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
        }
      </div>
    </div>
  );

  /* ══════════════════════════════════════
     СПИСОК ВЫПИСОК
     ══════════════════════════════════════ */
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '28px 24px' }}>
      <div style={{ width: 'fit-content', maxWidth: '100%' }}>

        {/* Шапка */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24, paddingBottom: 16, borderBottom: `1px solid ${C.border}`, width: '100%' }}>
          <div>
            <h1 style={{ margin: 0, color: C.text, fontSize: 20, fontWeight: 700 }}>Банковские выписки</h1>
            <div style={{ color: C.textMuted, fontSize: 12, marginTop: 4 }}>{statements.length} выписок</div>
          </div>
          <div style={{ marginLeft: 'auto' }}>
            <button type="button" onClick={() => setUploadModal(true)}
              style={{ padding: '8px 20px', background: C.accent, border: 'none', color: '#fff', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              + Загрузить выписку
            </button>
          </div>
        </div>

        {/* Таблица выписок */}
        {loading
          ? <div style={{ padding: 32, textAlign: 'center', color: C.textMuted, width: '100%' }}>Загрузка...</div>
          : statements.length === 0
            ? <div style={{ padding: 64, textAlign: 'center', color: C.textDim, width: '100%' }}>Нет загруженных выписок</div>
            : <Card style={{ overflow: 'hidden' }}>
                <table style={{ borderCollapse: 'collapse' }}>
                  <thead><tr style={{ background: C.surface }}>
                    {['#', 'Счёт', 'Период', 'Загружена', 'Всего', 'Проведено', 'Новых', ''].map((h, i) => (
                      <th key={i} style={{ padding: '10px 14px', textAlign: i >= 4 ? 'right' : 'left', color: C.textMuted, fontSize: 11, fontWeight: 600, borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {statements.map(s => (
                      <tr key={s.id} style={{ borderBottom: `1px solid ${C.border}40`, cursor: 'pointer' }}
                        onMouseEnter={e => e.currentTarget.style.background = C.surface}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        onClick={() => openStatement(s)}>
                        <td style={{ padding: '12px 14px', color: C.textMuted, fontSize: 12 }}>#{s.id}</td>
                        <td style={{ padding: '12px 14px', color: C.text, fontWeight: 600 }}>{s.account_name || '—'}</td>
                        <td style={{ padding: '12px 14px', color: C.textMuted, fontSize: 12 }}>{fmtDate(s.date_from)} — {fmtDate(s.date_to)}</td>
                        <td style={{ padding: '12px 14px', color: C.textMuted, fontSize: 12 }}>{fmtDate(s.loaded_at)}</td>
                        <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 600 }}>{s.total_lines}</td>
                        <td style={{ padding: '12px 14px', textAlign: 'right', color: C.greenText, fontWeight: 600 }}>{s.posted_lines}</td>
                        <td style={{ padding: '12px 14px', textAlign: 'right', color: parseInt(s.new_lines) > 0 ? C.yellowText : C.textDim, fontWeight: 600 }}>{s.new_lines}</td>
                        <td style={{ padding: '12px 14px' }}>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <span style={{ color: C.accentText, fontSize: 12 }}>Открыть →</span>
                            <button type="button" onClick={e => { e.stopPropagation(); setConfirmDelete(s.id); }}
                              style={{ padding: '2px 8px', background: 'transparent', border: `1px solid ${C.red}`, color: C.redText, borderRadius: 4, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>✕</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
        }

        {/* Модалка: удаление */}
        {confirmDelete && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: C.surface, border: `1px solid ${C.borderLight}`, borderRadius: 10, width: 400, padding: 24 }}>
              <div style={{ color: C.text, fontWeight: 700, fontSize: 15, marginBottom: 10 }}>Удалить выписку?</div>
              <div style={{ color: C.textMuted, fontSize: 13, marginBottom: 20, lineHeight: 1.5 }}>Будут удалены все строки выписки и связанные платежи. Это действие необратимо.</div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" onClick={() => setConfirmDelete(null)} style={{ padding: '8px 16px', background: 'transparent', border: `1px solid ${C.borderLight}`, color: C.textMuted, borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>Отмена</button>
                <button type="button" onClick={() => handleDelete(confirmDelete)} style={{ padding: '8px 16px', background: C.red, border: 'none', color: '#fff', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Удалить</button>
              </div>
            </div>
          </div>
        )}

        {/* Модалка: загрузка выписки */}
        {uploadModal && (
          <div onClick={e => { if (e.target === e.currentTarget) resetModal(); }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: C.surface, border: `1px solid ${C.borderLight}`, borderRadius: 10, width: 560, maxHeight: '90vh', overflow: 'auto', padding: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h2 style={{ margin: 0, color: C.text, fontSize: 16, fontWeight: 700 }}>Загрузить выписку</h2>
                <button type="button" onClick={resetModal} style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: 20 }}>×</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div>
                  <div style={{ color: C.textMuted, fontSize: 11, marginBottom: 4 }}>Банк</div>
                  <select value={uploadForm.bank_id} onChange={e => { setUploadForm(f => ({ ...f, bank_id: e.target.value })); setParsedLines([]); setFileName(''); }} style={sel}>
                    <option value="">— Выбрать банк —</option>
                    {BANKS.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ color: C.textMuted, fontSize: 11, marginBottom: 4 }}>Счёт</div>
                  <select value={uploadForm.bank_account_id} onChange={e => setUploadForm(f => ({ ...f, bank_account_id: e.target.value }))} style={sel}>
                    <option value="">— Выбрать —</option>
                    {(accounts || []).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <div style={{ color: C.textMuted, fontSize: 11, marginBottom: 6 }}>Файл выписки (CSV)</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button type="button" onClick={() => fileRef.current?.click()} disabled={!uploadForm.bank_id}
                    style={{ padding: '8px 16px', background: uploadForm.bank_id ? C.accent : C.surface, border: 'none', color: uploadForm.bank_id ? '#fff' : C.textDim, borderRadius: 6, cursor: uploadForm.bank_id ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 600 }}>
                    📂 Выбрать файл
                  </button>
                  <span style={{ color: fileName ? C.text : C.textDim, fontSize: 12 }}>{fileName || 'Файл не выбран'}</span>
                  <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFileSelect} style={{ display: 'none' }} />
                </div>
              </div>
              {parsedLines.length > 0 && (
                <div style={{ marginBottom: 16, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: 12 }}>
                  <div style={{ color: C.greenText, fontWeight: 600, fontSize: 13, marginBottom: 8 }}>✓ Распознано {parsedLines.length} строк</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                    <div>
                      <div style={{ color: C.textMuted, fontSize: 11, marginBottom: 2 }}>Период с</div>
                      <input type="date" value={uploadForm.date_from} onChange={e => setUploadForm(f => ({ ...f, date_from: e.target.value }))} style={{ ...inp, width: '100%', colorScheme: 'dark' }} />
                    </div>
                    <div>
                      <div style={{ color: C.textMuted, fontSize: 11, marginBottom: 2 }}>Период по</div>
                      <input type="date" value={uploadForm.date_to} onChange={e => setUploadForm(f => ({ ...f, date_to: e.target.value }))} style={{ ...inp, width: '100%', colorScheme: 'dark' }} />
                    </div>
                  </div>
                  <div style={{ maxHeight: 160, overflow: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                      <thead><tr>
                        {['Дата','Направление','Сумма','Контрагент','Назначение'].map(h => (
                          <th key={h} style={{ padding: '4px 6px', color: C.textMuted, textAlign: 'left', borderBottom: `1px solid ${C.border}` }}>{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {parsedLines.slice(0, 5).map((r, i) => (
                          <tr key={i}>
                            <td style={{ padding: '3px 6px', color: C.textDim }}>{r.operation_date}</td>
                            <td style={{ padding: '3px 6px', color: r.direction === 'in' ? C.greenText : C.redText, fontWeight: 600 }}>{r.direction === 'in' ? '↓ Приход' : '↑ Расход'}</td>
                            <td style={{ padding: '3px 6px', fontFamily: 'monospace' }}>{fmt(r.amount)}</td>
                            <td style={{ padding: '3px 6px', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.counterparty_name}</td>
                            <td style={{ padding: '3px 6px', color: C.textMuted, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.purpose}</td>
                          </tr>
                        ))}
                        {parsedLines.length > 5 && <tr><td colSpan={5} style={{ padding: '3px 6px', color: C.textDim, fontStyle: 'italic' }}>...ещё {parsedLines.length - 5} строк</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {uploadError && <div style={{ color: C.redText, background: C.redDim, border: `1px solid ${C.red}`, borderRadius: 6, padding: '8px 12px', fontSize: 12, marginBottom: 12 }}>{uploadError}</div>}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" onClick={resetModal} style={{ padding: '8px 16px', background: 'transparent', border: `1px solid ${C.borderLight}`, color: C.textMuted, borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>Отмена</button>
                <button type="button" onClick={handleUpload} disabled={uploading || !parsedLines.length || !uploadForm.bank_account_id}
                  style={{ padding: '8px 20px', background: C.accent, border: 'none', color: '#fff', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600, opacity: (uploading || !parsedLines.length || !uploadForm.bank_account_id) ? 0.5 : 1 }}>
                  {uploading ? 'Загрузка...' : `Загрузить ${parsedLines.length ? `(${parsedLines.length} строк)` : ''}`}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

export default BankStatements;
