import { useState, useEffect, useRef } from "react";
import { C, APP_CONFIG, NAV, canAccess } from "../utils/globals";

// Список для поиска по разделам и быстрым действиям (Ctrl+K). Права — как в меню.
const ACTIONS = [
  { id: "new_sale", label: "Новая продажа", hint: "F2" },
  { id: "new_purchase", label: "Новый приход", hint: "F3" },
  { id: "payments", label: "Платёж", hint: "F4" },
  { id: "debtors_report", label: "Дебиторы — кто нам должен" },
  { id: "creditors_report", label: "Кредиторы — кому должны мы" },
];
const NEED = { new_sale: "invoices", new_purchase: "purchases", debtors_report: "counterparties", creditors_report: "counterparties" };
export const cleanLabel = item => item.label.replace(/^[^A-Za-zА-Яа-яЁё]+/u, "");

export function buildNavPool(user, userPerms) {
  const ok = id => canAccess(user, NEED[id] || id, userPerms) !== false;
  const nav = NAV.filter(it => it.id !== "clear_data" && !(it.id === "intercompany" && APP_CONFIG.mode === "single") && ok(it.id))
    .map(it => ({ id: it.id, label: cleanLabel(it) }));
  return [...ACTIONS.filter(a => ok(a.id)), ...nav];
}
export function filterPool(pool, q) {
  const s = q.trim().toLowerCase();
  return s ? pool.filter(p => p.label.toLowerCase().includes(s)) : pool.slice(0, 9);
}

// Окно поиска для стилей с боковым и верхним меню (в стиле B поиск встроен в шапку).
export default function CommandPalette({ open, onClose, onNav, user, userPerms }) {
  const [q, setQ] = useState(""); const [sel, setSel] = useState(0);
  const ref = useRef(null);
  useEffect(() => { if (open) { setQ(""); setSel(0); setTimeout(() => ref.current?.focus(), 0); } }, [open]);
  if (!open) return null;
  const res = filterPool(buildNavPool(user, userPerms), q);
  const go = id => { onClose(); onNav(id); };
  return (
    <div onMouseDown={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", zIndex: 900, display: "flex", justifyContent: "center", paddingTop: "14vh" }}>
      <div onMouseDown={e => e.stopPropagation()} data-command-palette=""
        style={{ width: 560, maxWidth: "92vw", alignSelf: "flex-start", background: C.surface, border: `1px solid ${C.borderLight}`, borderRadius: C.radius || 10, boxShadow: "0 24px 60px rgba(0,0,0,.35)", overflow: "hidden" }}>
        <input ref={ref} value={q} placeholder="Найти раздел или действие…"
          onChange={e => { setQ(e.target.value); setSel(0); }}
          onKeyDown={e => {
            if (e.key === "ArrowDown") { e.preventDefault(); setSel(s => Math.min(s + 1, res.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setSel(s => Math.max(s - 1, 0)); }
            else if (e.key === "Enter" && res[sel]) go(res[sel].id);
            else if (e.key === "Escape") onClose();
          }}
          style={{ width: "100%", border: "none", borderBottom: `1px solid ${C.border}`, padding: "16px 18px", fontSize: 16, background: "transparent", color: C.text, outline: "none", fontFamily: "inherit", boxShadow: "none" }} />
        <div style={{ maxHeight: 360, overflowY: "auto", padding: 6 }}>
          {res.length === 0 && <div style={{ padding: 14, color: C.textMuted, fontSize: 13 }}>Ничего не найдено</div>}
          {res.map((r, i) => (
            <div key={r.id} onMouseDown={() => go(r.id)} onMouseEnter={() => setSel(i)}
              style={{ padding: "9px 12px", borderRadius: 7, cursor: "pointer", display: "flex", justifyContent: "space-between", fontSize: 14, color: i === sel ? C.accentText : C.text, background: i === sel ? C.accentDim : "transparent" }}>
              <span>{r.label}</span>
              <span style={{ color: C.textMuted, fontSize: 12 }}>{r.hint || (i === sel ? "Enter ↵" : "")}</span>
            </div>
          ))}
        </div>
        <div style={{ padding: "8px 14px", borderTop: `1px solid ${C.border}`, fontSize: 11.5, color: C.textMuted }}>↑↓ выбрать · Enter открыть · Esc закрыть</div>
      </div>
    </div>
  );
}
