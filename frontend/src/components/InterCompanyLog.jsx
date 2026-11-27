// ─── ЖУРНАЛ ВЗАИМНЫХ ДОКУМЕНТОВ МЕЖДУ КОМПАНИЯМИ ────────────────────────────
import { useState, useEffect, useCallback } from "react";
import { C, fmtDate, api, useIsMobile, Card, Btn, Lbl, SearchSelect, onAppearanceChange } from "../utils/globals";

const DOC_TYPE_LABELS = {
  sale: "Расходная", purchase: "Приходная",
  payment_in: "Платёж (вход.)", payment_out: "Платёж (исх.)",
};

const _mk_STATUS_META=()=>({
  pending:   { label: "Ожидает",      bg: C.yellowDim, color: C.yellowText },
  confirmed: { label: "Подтверждено", bg: C.greenDim,  color: C.greenText },
  disputed:  { label: "Оспорено",     bg: C.redDim,    color: C.redText },
  changed:   { label: "Изменён",      bg: C.yellowDim, color: C.yellowText },
});
let STATUS_META=_mk_STATUS_META(); onAppearanceChange(()=>{ STATUS_META=_mk_STATUS_META(); });

const fmt2 = n => new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n || 0));

function ICStatusBadge({ status }) {
  const m = STATUS_META[status] || STATUS_META.pending;
  return <span style={{ padding: "2px 10px", borderRadius: 12, fontSize: 12, fontWeight: 600, background: m.bg, color: m.color, whiteSpace: "nowrap" }}>{m.label}</span>;
}

// ─── Модалка проводки приходной ──────────────────────────────────────────────
function ICAcceptModal({ docId, onClose, onDone, counterparties, warehouses, products, currentUser }) {
  const [data, setData] = useState(null);
  const [mappings, setMappings] = useState([]);
  const [cpId, setCpId] = useState("");
  const [whId, setWhId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api(`/intercompany/documents/${docId}/mapping`)
      .then(d => {
        setData(d);
        setMappings((d.lines || []).map(l => ({
          product_name: l.product_name, qty: l.qty, price: l.price,
          local_product_id: l.suggestion ? String(l.suggestion.id) : "",
          new_product_name: "",
        })));
      })
      .catch(() => setError("Не удалось загрузить документ"));
  }, [docId]);

  const setLine = (idx, patch) => setMappings(prev => prev.map((m, i) => i === idx ? { ...m, ...patch } : m));
  const allMapped = mappings.every(m => m.local_product_id || m.new_product_name.trim());

  const submit = async () => {
    setError("");
    if (!cpId) { setError("Выберите поставщика"); return; }
    if (!whId) { setError("Выберите склад"); return; }
    if (!allMapped) { setError("Сопоставьте все товары"); return; }
    setSaving(true);
    try {
      const j = await api(`/intercompany/documents/${docId}/accept`, "POST", {
        counterparty_id: cpId,
        warehouse_id: whId,
        created_by: currentUser?.id || null,
        mappings: mappings.map(m => ({
          product_name: m.product_name, qty: m.qty, price: m.price,
          local_product_id: m.local_product_id || null,
          new_product_name: m.local_product_id ? null : m.new_product_name.trim(),
        })),
      });
      onDone(j.purchase_id);
    } catch (e) {
      let msg = e.message;
      try { msg = JSON.parse(e.message).error || msg; } catch {}
      setError(msg);
    } finally { setSaving(false); }
  };

  const cpOptions = (counterparties || []).filter(c => c.active || c.is_active).map(c => ({ value: String(c.id), label: c.name }));
  const whOptions = (warehouses || []).filter(w => w.active || w.is_active).map(w => ({ value: String(w.id), label: w.name }));
  const prodOptions = (products || []).filter(p => p.active || p.is_active).map(p => ({ value: String(p.id), label: p.name }));

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.surface, borderRadius: 12, width: "100%", maxWidth: 760, maxHeight: "90vh", display: "flex", flexDirection: "column", border: `1px solid ${C.border}` }}>
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>Проводка приходной накладной</div>
          {data && (
            <div style={{ fontSize: 13, color: C.textMuted, marginTop: 4 }}>
              {data.doc.doc_number || "б/н"} от {fmtDate(data.doc.doc_date)} · {data.doc.partner_company_name} · <span style={{ fontFamily: "'JetBrains Mono',monospace", color: C.text }}>{fmt2(data.doc.amount)} ₽</span>
            </div>
          )}
        </div>

        <div style={{ padding: 20, overflowY: "auto", flex: 1 }}>
          {!data && !error && <div style={{ color: C.textMuted }}>Загрузка…</div>}
          {data && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                <div>
                  <Lbl req>Поставщик</Lbl>
                  <SearchSelect value={cpId} onChange={setCpId} options={cpOptions} placeholder="Поиск поставщика..." />
                </div>
                <div>
                  <Lbl req>Склад</Lbl>
                  <SearchSelect value={whId} onChange={setWhId} options={whOptions} placeholder="Выбрать склад..." />
                </div>
              </div>

              {mappings.map((m, i) => {
                const sugg = data.lines[i] && data.lines[i].suggestion;
                return (
                  <div key={i} style={{ background: C.bg, borderRadius: 8, padding: 12, marginBottom: 10, border: `1px solid ${C.border}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                      <div>
                        <div style={{ fontWeight: 600, color: C.text }}>{m.product_name}</div>
                        <div style={{ fontSize: 13, color: C.textMuted, fontFamily: "'JetBrains Mono',monospace" }}>
                          {m.qty} × {fmt2(m.price)} = {fmt2(m.qty * m.price)} ₽
                        </div>
                      </div>
                      {sugg && (
                        <span style={{ fontSize: 11, alignSelf: "flex-start", padding: "2px 8px", borderRadius: 10, background: sugg.source === "link" ? C.greenDim : C.accentDim, color: sugg.source === "link" ? C.greenText : C.accentText }}>
                          {sugg.source === "link" ? "связка сохранена" : "найдено по имени"}
                        </span>
                      )}
                    </div>
                    <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <SearchSelect
                        value={m.local_product_id}
                        onChange={v => setLine(i, { local_product_id: v, new_product_name: "" })}
                        options={prodOptions}
                        placeholder="→ товар в нашем справочнике..."
                      />
                      <input
                        type="text" value={m.new_product_name}
                        onChange={e => setLine(i, { new_product_name: e.target.value, local_product_id: "" })}
                        placeholder="...или имя нового товара"
                        style={{ width: "100%", background: C.bg, border: `1px solid ${C.borderLight}`, color: C.text, borderRadius: 6, padding: "8px 12px", fontSize: 13, outline: "none", boxSizing: "border-box" }}
                      />
                    </div>
                  </div>
                );
              })}
            </>
          )}
          {error && <div style={{ color: C.redText, marginTop: 8, fontSize: 13 }}>{error}</div>}
        </div>

        <div style={{ padding: "14px 20px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Btn onClick={onClose}>Отмена</Btn>
          <Btn primary onClick={submit} disabled={saving || !allMapped || !cpId || !whId}>
            {saving ? "Проводим…" : "Провести приходную"}
          </Btn>
        </div>
      </div>
    </div>
  );
}

// ─── Основной экран ───────────────────────────────────────────────────────────
export default function InterCompanyLog({ counterparties, warehouses, products, currentUser }) {
  const isMobile = useIsMobile();
  const [docs, setDocs] = useState([]);
  const [tab, setTab] = useState("all");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [acceptDocId, setAcceptDocId] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (tab !== "all") params.set("direction", tab);
    if (statusFilter) params.set("status", statusFilter);
    api(`/intercompany/documents?${params}`)
      .then(d => setDocs(Array.isArray(d) ? d : []))
      .catch(() => setDocs([]))
      .finally(() => setLoading(false));
  }, [tab, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const confirm = async (id) => { try { await api(`/intercompany/documents/${id}/confirm`, "PUT", {}); } catch {} load(); };
  const dispute = async (id) => {
    const comment = window.prompt("Причина (видна партнёру):");
    if (comment === null) return;
    try { await api(`/intercompany/documents/${id}/dispute`, "PUT", { comment }); } catch {}
    load();
  };

  const tabs = [{ k: "all", l: "Все" }, { k: "received", l: "Входящие" }, { k: "sent", l: "Отправленные" }];

  return (
    <div style={{ display: "flex", justifyContent: "center", padding: isMobile ? 8 : 24 }}>
      <Card style={{ width: "100%", maxWidth: 1100, overflow: "hidden" }}>
        <div style={{ padding: isMobile ? 14 : "18px 24px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>Взаимные документы</div>
          <div style={{ fontSize: 13, color: C.textMuted, marginTop: 2 }}>Накладные и платежи между компаниями системы</div>
        </div>

        <div style={{ padding: isMobile ? 12 : "14px 24px", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ display: "flex", background: C.bg, borderRadius: 8, padding: 3 }}>
            {tabs.map(t => (
              <button type="button" key={t.k} onClick={() => setTab(t.k)} style={{
                padding: "7px 14px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 13,
                background: tab === t.k ? C.surface : "transparent",
                color: tab === t.k ? C.text : C.textMuted,
                fontWeight: tab === t.k ? 600 : 400,
              }}>{t.l}</button>
            ))}
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ background: C.bg, color: C.text, border: `1px solid ${C.borderLight}`, borderRadius: 6, padding: "8px 10px", fontSize: 13, outline: "none" }}>
            <option value="">Все статусы</option>
            <option value="pending">Ожидает</option>
            <option value="confirmed">Подтверждено</option>
            <option value="disputed">Оспорено</option>
          </select>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: C.textMuted }}>
                <th style={{ padding: "10px 12px", fontWeight: 600 }}>Дата</th>
                <th style={{ padding: "10px 12px", fontWeight: 600 }}>Тип</th>
                <th style={{ padding: "10px 12px", fontWeight: 600 }}>№</th>
                <th style={{ padding: "10px 12px", fontWeight: 600 }}>Партнёр</th>
                <th style={{ padding: "10px 12px", fontWeight: 600, textAlign: "right" }}>Сумма</th>
                <th style={{ padding: "10px 12px", fontWeight: 600 }}>Статус</th>
                <th style={{ padding: "10px 12px" }}></th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={7} style={{ padding: 24, textAlign: "center", color: C.textMuted }}>Загрузка…</td></tr>}
              {!loading && docs.length === 0 && (
                <tr><td colSpan={7} style={{ padding: 24, textAlign: "center", color: C.textMuted }}>
                  Документов нет. Они появляются автоматически при операциях со связанными контрагентами.
                </td></tr>
              )}
              {!loading && docs.map(d => {
                const incInvoice = d.direction === "received" && d.doc_type === "purchase" && d.status === "pending";
                const incPayment = d.direction === "received" && d.doc_type.startsWith("payment") && d.status === "pending";
                return (
                  <tr key={d.id} style={{ borderTop: `1px solid ${C.border}` }}>
                    <td style={{ padding: "10px 12px", color: C.text, whiteSpace: "nowrap" }}>{fmtDate(d.doc_date)}</td>
                    <td style={{ padding: "10px 12px", color: C.text }}>{d.direction === "received" ? "↓ " : "↑ "}{DOC_TYPE_LABELS[d.doc_type] || d.doc_type}</td>
                    <td style={{ padding: "10px 12px", color: C.text, fontFamily: "'JetBrains Mono',monospace" }}>{d.local_doc_number || "—"}</td>
                    <td style={{ padding: "10px 12px", color: C.text }}>{d.partner_company_name}</td>
                    <td style={{ padding: "10px 12px", color: C.text, textAlign: "right", fontFamily: "'JetBrains Mono',monospace" }}>{fmt2(d.amount)} ₽</td>
                    <td style={{ padding: "10px 12px" }}>
                      <ICStatusBadge status={d.status} />
                      {d.status === "disputed" && d.dispute_comment && <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>{d.dispute_comment}</div>}
                    </td>
                    <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                      {incInvoice && <span style={{ marginRight: 6 }}><Btn small primary onClick={() => setAcceptDocId(d.id)}>Принять</Btn></span>}
                      {incPayment && <span style={{ marginRight: 6 }}><Btn small primary onClick={() => confirm(d.id)}>Подтвердить</Btn></span>}
                      {d.status === "pending" && d.direction === "received" && <Btn small danger onClick={() => dispute(d.id)}>Оспорить</Btn>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {acceptDocId && (
        <ICAcceptModal
          docId={acceptDocId}
          counterparties={counterparties}
          warehouses={warehouses}
          products={products}
          currentUser={currentUser}
          onClose={() => setAcceptDocId(null)}
          onDone={() => { setAcceptDocId(null); load(); }}
        />
      )}
    </div>
  );
}
