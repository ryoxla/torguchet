import { useState, useRef, useEffect } from "react";
import { C, APP_CONFIG, NAV, canAccess, setMode, ThemeMenu } from "../utils/globals";
import { buildNavPool, filterPool } from "./CommandPalette";
import ClearDataModal from "./ClearDataModal";

// Вариант B: «рабочая» шапка — крупный поиск по разделам, быстрые действия с горячими клавишами,
// все основные разделы видны одной строкой (без выпадающих «Учёт товаров»).
// Горячие клавиши F2/F3/F4 и Ctrl+K обрабатывает App; здесь Ctrl+K фокусирует поиск (событие tu:search).
const PARENT = { invoice_form: "invoices", purchase_form: "purchases", debtors_report: "counterparties", creditors_report: "counterparties" };
const MAIN = ["dashboard", "invoices", "purchases", "returns", "payments", "cash", "counterparties", "stock", "movements", "transfers", "write_offs", "sales_report"];
const LABELS = { invoices: "Продажи", purchases: "Приход", counterparties: "Взаиморасчёты" };
const clean = it => LABELS[it.id] || it.label.replace(/^[^A-Za-zА-Яа-яЁё]+/u, "");
export const QUICK = [
  { id: "new_sale", l: "Продажа", key: "F2", primary: true },
  { id: "new_purchase", l: "Приход", key: "F3" },
  { id: "payments", l: "Платёж", key: "F4" },
];
export const WORKBAR_H = 96;

export default function WorkBar({ screen, onNav, user, onLogout, userPerms }) {
  const [q, setQ] = useState(""); const [open, setOpen] = useState(false); const [sel, setSel] = useState(0);
  const [more, setMore] = useState(false); const [clearOpen, setClearOpen] = useState(false);
  const inpRef = useRef(null), moreRef = useRef(null);
  const isMasterAdmin = user?.master_role === "superadmin" || user?.master_role === "admin";
  const visible = NAV.filter(it => canAccess(user, it.id, userPerms) !== false && !(it.id === "clear_data" && !isMasterAdmin) && !(it.id === "intercompany" && APP_CONFIG.mode === "single"));
  const mainNav = MAIN.map(id => visible.find(v => v.id === id)).filter(Boolean);
  const moreNav = visible.filter(v => !MAIN.includes(v.id));
  const cur = PARENT[screen] || screen;
  const isDark = (C.scheme || "dark") === "dark";

  const res = filterPool(buildNavPool(user, userPerms), q);
  const go = id => { setOpen(false); setQ(""); inpRef.current?.blur(); onNav(id); };

  useEffect(() => {
    const focus = () => { inpRef.current?.focus(); setOpen(true); };
    const out = e => { if (moreRef.current && !moreRef.current.contains(e.target)) setMore(false); };
    window.addEventListener("tu:search", focus); document.addEventListener("mousedown", out);
    return () => { window.removeEventListener("tu:search", focus); document.removeEventListener("mousedown", out); };
  }, []);

  const kbd = (t, light) => <span style={{ fontSize: 10.5, fontWeight: 700, padding: "1px 5px", borderRadius: 4, border: `1px solid ${light ? "rgba(255,255,255,.45)" : C.borderLight}`, color: light ? "#fff" : C.textMuted, fontFamily: "'JetBrains Mono Variable', monospace" }}>{t}</span>;

  return (
    <>
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, background: C.surface, borderBottom: `1px solid ${C.border}` }}>
        {/* Ряд 1: логотип · поиск · быстрые действия · пользователь */}
        <div style={{ height: 56, display: "flex", alignItems: "center", gap: 16, padding: "0 16px", background: C.headBg || C.surface, color: C.headText || C.text }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 210 }}>
            <div style={{ width: 30, height: 30, borderRadius: 6, background: C.accent, color: "#fff", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>Т</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>ТоргУчёт</div>
              <div style={{ fontSize: 11, opacity: .7 }}>{user?.company_name || "Моя компания"}</div>
            </div>
          </div>
          <div style={{ position: "relative", flex: 1, maxWidth: 560 }}>
            <span style={{ position: "absolute", left: 12, top: 9, color: C.headMuted || C.textMuted, fontSize: 15 }}>⌕</span>
            <input ref={inpRef} value={q} placeholder="Найти раздел или действие…   (Ctrl+K)"
              onChange={e => { setQ(e.target.value); setOpen(true); setSel(0); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
              onKeyDown={e => { if (e.key === "ArrowDown") { e.preventDefault(); setSel(s => Math.min(s + 1, res.length - 1)); } if (e.key === "ArrowUp") { e.preventDefault(); setSel(s => Math.max(s - 1, 0)); } if (e.key === "Enter" && res[sel]) go(res[sel].id); if (e.key === "Escape") { setOpen(false); e.target.blur(); } }}
              style={{ width: "100%", height: 38, padding: "0 12px 0 34px", fontSize: 14, background: C.searchBg || C.ctrlBg, color: C.headText || C.text, border: `1px solid ${C.searchBorder || C.borderLight}`, borderRadius: 6, outline: "none" }} />
            {open && res.length > 0 && (
              <div style={{ position: "absolute", top: 44, left: 0, right: 0, background: C.surface, border: `1px solid ${C.borderLight}`, borderRadius: 6, boxShadow: "0 12px 32px rgba(0,0,0,.25)", overflow: "hidden", zIndex: 600 }}>
                {res.map((r, i) => (
                  <div key={r.id + i} onMouseDown={() => go(r.id)} onMouseEnter={() => setSel(i)}
                    style={{ padding: "8px 12px", fontSize: 13, cursor: "pointer", color: C.text, background: i === sel ? C.accentDim : "transparent", display: "flex", justifyContent: "space-between" }}>
                    <span>{r.label}</span>{i === sel && <span style={{ color: C.textMuted, fontSize: 11 }}>Enter ↵</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
            {QUICK.map(a => (
              <button key={a.id} onClick={() => onNav(a.id)}
                style={{ height: 36, padding: "0 12px", display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", borderRadius: 6,
                  background: a.primary ? C.accent : "transparent", color: a.primary ? "#fff" : (C.headText || C.text), border: a.primary ? "none" : `1px solid ${C.searchBorder || C.borderLight}` }}>
                + {a.l} {kbd(a.key, a.primary || isDark || !!C.headBg)}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 12, borderLeft: `1px solid ${C.searchBorder || C.border}` }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 12.5, fontWeight: 600 }}>{user?.full_name || user?.login}</div>
              <div style={{ fontSize: 10.5, opacity: .65 }}>{APP_CONFIG.version ? `v${APP_CONFIG.version}` : ""}</div>
            </div>
            <ThemeMenu placement="down">
              <button type="button" title="Оформление" data-appearance-button="" style={{ height: 30, width: 30, borderRadius: 6, border: `1px solid ${C.searchBorder || C.borderLight}`, background: "transparent", color: "inherit", cursor: "pointer" }}>🎨</button>
            </ThemeMenu>
            <button type="button" title="Сменить режим" onClick={() => setMode(isDark ? "light" : "dark")} style={{ height: 30, width: 30, borderRadius: 6, border: `1px solid ${C.searchBorder || C.borderLight}`, background: "transparent", color: "inherit", cursor: "pointer" }}>{isDark ? "☀" : "☾"}</button>
            <button onClick={onLogout} style={{ height: 30, padding: "0 10px", borderRadius: 6, border: `1px solid ${C.searchBorder || C.borderLight}`, background: "transparent", color: "inherit", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Выйти</button>
          </div>
        </div>
        {/* Ряд 2: все разделы одной строкой */}
        <div style={{ height: 40, display: "flex", alignItems: "stretch", padding: "0 10px", gap: 2, background: C.surface }}>
          {mainNav.map((it, i) => {
            const active = cur === it.id;
            const sep = ["invoices", "counterparties", "stock", "sales_report"].includes(it.id) && i > 0;
            return (
              <div key={it.id} style={{ display: "flex", alignItems: "stretch" }}>
                {sep && <div style={{ width: 1, background: C.border, margin: "10px 6px" }} />}
                <button onClick={() => onNav(it.id)}
                  style={{ padding: "0 11px", border: "none", borderBottom: `2px solid ${active ? C.accent : "transparent"}`, background: active ? C.accentDim : "transparent", color: active ? C.accentText : C.textMuted, fontWeight: active ? 650 : 500, fontSize: 13, cursor: "pointer", borderRadius: 0 }}>
                  {clean(it)}
                </button>
              </div>
            );
          })}
          {moreNav.length > 0 && (
            <div ref={moreRef} style={{ position: "relative", marginLeft: "auto", display: "flex", alignItems: "stretch" }}>
              <button onClick={() => setMore(m => !m)} style={{ padding: "0 12px", border: "none", background: "transparent", color: moreNav.some(m => m.id === cur) ? C.accentText : C.textMuted, fontSize: 13, cursor: "pointer", borderRadius: 0 }}>Сервис ▾</button>
              {more && (
                <div style={{ position: "absolute", right: 0, top: 40, minWidth: 220, background: C.surface, border: `1px solid ${C.borderLight}`, borderRadius: 6, boxShadow: "0 12px 32px rgba(0,0,0,.2)", zIndex: 600, padding: 4 }}>
                  {moreNav.map(it => (
                    <button key={it.id} onClick={() => { setMore(false); if (it.id === "clear_data") { setClearOpen(true); return; } onNav(it.id); }}
                      style={{ display: "block", width: "100%", textAlign: "left", padding: "7px 10px", border: "none", background: cur === it.id ? C.accentDim : "transparent", color: it.id === "clear_data" ? C.redText : C.text, fontSize: 13, cursor: "pointer" }}>{clean(it)}</button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <ClearDataModal open={clearOpen} onClose={() => setClearOpen(false)} />
    </>
  );
}
