// ─── АКТ СВЕРКИ ВЗАИМНЫХ РАСЧЁТОВ МЕЖДУ КОМПАНИЯМИ ──────────────────────────
import { useState, useEffect } from "react";
import { C, fmtDate, api, useIsMobile, Card, Btn, Lbl } from "../utils/globals";

const fmt2 = n => new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n || 0));

const DOC_TYPE_LABELS = {
  sale: "Расходная", purchase: "Приходная",
  payment_in: "Платёж вход.", payment_out: "Платёж исх.",
};

const ACT_STATUS = {
  draft:    { label: "Черновик",    color: C.textMuted },
  sent:     { label: "На сверке",   color: C.yellowText },
  agreed:   { label: "Согласован",  color: C.greenText },
  disputed: { label: "Расхождение", color: C.redText },
};

export default function ReconciliationAct({ currentUser }) {
  const isMobile = useIsMobile();
  const [partners, setPartners] = useState([]);
  const [partnerId, setPartnerId] = useState("");
  const today = new Date();
  const iso = d => d.toISOString().slice(0, 10);
  const [dateFrom, setDateFrom] = useState(iso(new Date(today.getFullYear(), today.getMonth(), 1)));
  const [dateTo, setDateTo] = useState(iso(today));
  const [preview, setPreview] = useState(null);
  const [acts, setActs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const loadActs = () => api("/intercompany/reconciliation").then(d => setActs(Array.isArray(d) ? d : [])).catch(() => {});

  useEffect(() => {
    loadActs();
    api("/intercompany/links").then(links => {
      const map = new Map();
      (links || []).forEach(l => map.set(l.linked_company_id, l.linked_company_name));
      setPartners([...map.entries()].map(([id, name]) => ({ id, name })));
    }).catch(() => {});
  }, []);

  const build = () => {
    if (!partnerId) return;
    setLoading(true); setPreview(null);
    api(`/intercompany/reconciliation/preview?partner=${partnerId}&from=${dateFrom}&to=${dateTo}`)
      .then(setPreview).catch(() => {}).finally(() => setLoading(false));
  };

  const send = async () => {
    if (!preview) return;
    setSending(true);
    try {
      await api("/intercompany/reconciliation", "POST", {
        partner_company_id: Number(partnerId),
        date_from: dateFrom, date_to: dateTo,
        our_balance: preview.closing_balance,
        snapshot: preview.rows,
      });
      setPreview(null); loadActs();
    } catch {} finally { setSending(false); }
  };

  const agree = async id => { try { await api(`/intercompany/reconciliation/${id}/agree`, "PUT", {}); } catch {} loadActs(); };
  const disputeAct = async id => {
    const comment = window.prompt("Опишите расхождение:");
    if (comment === null) return;
    try { await api(`/intercompany/reconciliation/${id}/dispute`, "PUT", { comment }); } catch {}
    loadActs();
  };

  const inputStyle = { background: C.bg, color: C.text, border: `1px solid ${C.borderLight}`, borderRadius: 6, padding: "8px 10px", fontSize: 13, outline: "none", colorScheme: "dark" };

  const balanceInfo = bal => {
    if (bal > 0) return { text: `Нам должны ${fmt2(bal)} ₽`, color: C.greenText };
    if (bal < 0) return { text: `Мы должны ${fmt2(-bal)} ₽`, color: C.yellowText };
    return { text: "Сальдо: 0,00 ₽", color: C.textMuted };
  };

  const mono = { fontFamily: "'JetBrains Mono',monospace" };

  return (
    <div style={{ display: "flex", justifyContent: "center", padding: isMobile ? 8 : 24 }}>
      <div style={{ width: "100%", maxWidth: 1000 }}>

        <Card style={{ overflow: "hidden", marginBottom: 18 }}>
          <div style={{ padding: isMobile ? 14 : "18px 24px", borderBottom: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>Акт сверки</div>
            <div style={{ fontSize: 13, color: C.textMuted, marginTop: 2 }}>Взаимные расчёты с компанией-партнёром</div>
          </div>

          <div style={{ padding: isMobile ? 12 : "14px 24px", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div>
              <Lbl>Партнёр</Lbl>
              <select value={partnerId} onChange={e => setPartnerId(e.target.value)} style={{ ...inputStyle, minWidth: 200 }}>
                <option value="">Выбрать…</option>
                {partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <Lbl>С</Lbl>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <Lbl>По</Lbl>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={inputStyle} />
            </div>
            <Btn primary onClick={build} disabled={!partnerId || loading}>{loading ? "Строим…" : "Сформировать"}</Btn>
          </div>

          {preview && (
            <div style={{ padding: isMobile ? 12 : "0 24px 20px" }}>
              {(preview.pending_count > 0 || preview.disputed_count > 0) && (
                <div style={{ padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, background: C.yellowDim, color: C.yellowText, border: `1px solid ${C.yellow}` }}>
                  В периоде есть неподтверждённые документы ({preview.pending_count} ожидает, {preview.disputed_count} оспорено) — показаны в таблице, но не входят в сальдо.
                </div>
              )}

              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: C.textMuted }}>
                      <th style={{ padding: "8px 10px", fontWeight: 600 }}>Дата</th>
                      <th style={{ padding: "8px 10px", fontWeight: 600 }}>Документ</th>
                      <th style={{ padding: "8px 10px", fontWeight: 600, textAlign: "right" }}>Дебет (+)</th>
                      <th style={{ padding: "8px 10px", fontWeight: 600, textAlign: "right" }}>Кредит (−)</th>
                      <th style={{ padding: "8px 10px", fontWeight: 600, textAlign: "right" }}>Сальдо</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ borderTop: `1px solid ${C.border}`, fontWeight: 600, color: C.text }}>
                      <td style={{ padding: "8px 10px" }} colSpan={4}>Начальное сальдо</td>
                      <td style={{ padding: "8px 10px", textAlign: "right", ...mono }}>{fmt2(preview.opening_balance)}</td>
                    </tr>
                    {preview.rows.map(r => (
                      <tr key={r.id} style={{ borderTop: `1px solid ${C.border}`, color: C.text, opacity: r.status === "confirmed" ? 1 : .45 }}>
                        <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>{fmtDate(r.doc_date)}</td>
                        <td style={{ padding: "8px 10px" }}>
                          {DOC_TYPE_LABELS[r.doc_type]} {r.local_doc_number || ""}
                          {r.status !== "confirmed" && <span style={{ fontSize: 11, marginLeft: 6, color: C.yellowText }}>({r.status === "pending" ? "не подтверждён" : "оспорен"})</span>}
                        </td>
                        <td style={{ padding: "8px 10px", textAlign: "right", ...mono }}>{Number(r.signed_amount) > 0 ? fmt2(r.signed_amount) : ""}</td>
                        <td style={{ padding: "8px 10px", textAlign: "right", ...mono }}>{Number(r.signed_amount) < 0 ? fmt2(-r.signed_amount) : ""}</td>
                        <td style={{ padding: "8px 10px", textAlign: "right", ...mono }}>{r.running !== null ? fmt2(r.running) : "—"}</td>
                      </tr>
                    ))}
                    <tr style={{ borderTop: `2px solid ${C.borderLight}`, fontWeight: 700, color: C.text }}>
                      <td style={{ padding: 10 }} colSpan={4}>Конечное сальдо</td>
                      <td style={{ padding: 10, textAlign: "right", ...mono, color: balanceInfo(preview.closing_balance).color }}>{fmt2(preview.closing_balance)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14, flexWrap: "wrap", gap: 10 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: balanceInfo(preview.closing_balance).color }}>
                  {balanceInfo(preview.closing_balance).text}
                </div>
                <Btn primary onClick={send} disabled={sending}>{sending ? "Отправляем…" : "Отправить партнёру на сверку"}</Btn>
              </div>
            </div>
          )}
        </Card>

        <Card style={{ overflow: "hidden" }}>
          <div style={{ padding: isMobile ? 14 : "16px 24px", borderBottom: `1px solid ${C.border}`, fontWeight: 700, color: C.text }}>История актов</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <tbody>
                {acts.length === 0 && <tr><td style={{ padding: 20, textAlign: "center", color: C.textMuted }}>Актов пока нет</td></tr>}
                {acts.map(a => {
                  const st = ACT_STATUS[a.status] || ACT_STATUS.draft;
                  return (
                    <tr key={a.id} style={{ borderTop: `1px solid ${C.border}` }}>
                      <td style={{ padding: "10px 14px" }}>
                        <div style={{ fontWeight: 600, color: C.text }}>{a.partner_company_name}</div>
                        <div style={{ fontSize: 12, color: C.textMuted }}>{fmtDate(a.date_from)} — {fmtDate(a.date_to)}</div>
                      </td>
                      <td style={{ padding: "10px 14px", textAlign: "right", color: C.text, ...mono }}>{fmt2(a.our_balance)} ₽</td>
                      <td style={{ padding: "10px 14px" }}>
                        <span style={{ color: st.color, fontWeight: 600, fontSize: 12 }}>{st.label}</span>
                        {a.dispute_comment && <div style={{ fontSize: 11, color: C.textMuted }}>{a.dispute_comment}</div>}
                      </td>
                      <td style={{ padding: "10px 14px", whiteSpace: "nowrap", textAlign: "right" }}>
                        {a.status === "sent" && (
                          <>
                            <span style={{ marginRight: 6 }}><Btn small primary onClick={() => agree(a.id)}>Согласовать</Btn></span>
                            <Btn small danger onClick={() => disputeAct(a.id)}>Расхождение</Btn>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
