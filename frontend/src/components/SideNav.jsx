import { useState } from "react";
import { C, APP_CONFIG, NAV, canAccess, setMode, ThemeMenu } from "../utils/globals";
import ClearDataModal from "./ClearDataModal";

// Иконки в стиле lucide (24×24, обводка). Только оформление — логика навигации прежняя (onNav).
const P = {
  dashboard: "M3 13h8V3H3zM13 21h8v-8h-8zM13 3v6h8V3zM3 21h8v-4H3z",
  purchases: "M12 3v12M7 10l5 5 5-5M4 21h16",
  invoices: "M12 21V9M7 14l5-5 5 5M4 3h16",
  payments: "M2 7h20v12H2zM2 11h20M6 15h4",
  cash: "M3 6h18v12H3zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6M6 9v.01M18 15v.01",
  counterparties: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  stock: "M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5 9-5M12 13v8",
  movements: "M3 12h4l3 8 4-16 3 8h4",
  transfers: "M17 3l4 4-4 4M21 7H8M7 21l-4-4 4-4M3 17h13",
  write_offs: "M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14",
  returns: "M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3",
  bank: "M3 21h18M5 21V10M19 21V10M9 21V10M15 21V10M12 3l9 5H3z",
  intercompany: "M4 4h7v7H4zM13 13h7v7h-7zM14 7h3a3 3 0 0 1 3 3M10 17H7a3 3 0 0 1-3-3",
  opening_balances: "M9 3h6v4H9zM6 5H4v16h16V5h-2M8 12h8M8 16h5",
  sales_report: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  directories: "M4 4h12a4 4 0 0 1 4 4v12H8a4 4 0 0 1-4-4zM4 16a4 4 0 0 1 4-4h12",
  audit_log: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14M21 21l-5-5",
  debt_writeoffs: "M6 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6M6 15a3 3 0 1 0 0 6 3 3 0 0 0 0-6M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12",
  clear_data: "M3 6h18M19 6l-1 14H6L5 6M10 11v6M14 11v6",
  sun: "M12 4V2M12 22v-2M4.9 4.9 3.5 3.5M20.5 20.5l-1.4-1.4M4 12H2M22 12h-2M4.9 19.1l-1.4 1.4M20.5 3.5l-1.4 1.4M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10",
  moon: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z",
  palette: "M12 22a10 10 0 1 1 10-10c0 2.8-2.2 4-4 4h-2a2 2 0 0 0-1.5 3.3A1.6 1.6 0 0 1 12 22zM7.5 11.5v.01M10.5 7.5v.01M15.5 7.5v.01M17.5 11.5v.01",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14M21 21l-5-5",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
};
export function Icon({ name, size = 18, stroke = 1.8, color = "currentColor" }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d={P[name] || P.dashboard} /></svg>;
}

export const NAV_GROUPS = [
  { title: null, ids: ["dashboard"] },
  { title: "Документы", ids: ["invoices", "purchases", "returns", "payments", "cash"] },
  { title: "Склад", ids: ["stock", "movements", "transfers", "write_offs"] },
  { title: "Деньги и отчёты", ids: ["counterparties", "sales_report", "bank", "debt_writeoffs"] },
  { title: "Сервис", ids: ["directories", "opening_balances", "audit_log", "intercompany", "clear_data"] },
];
// Подписи без эмодзи; «Расход/Приход» поясняем, что это продажи/поступления
const LABELS = { invoices: "Продажи (расход)", purchases: "Поступления (приход)" };
export const navLabel = item => LABELS[item.id] || item.label.replace(/^[^A-Za-zА-Яа-яЁё]+/u, "");
const PARENT = { invoice_form: "invoices", purchase_form: "purchases", debtors_report: "counterparties", creditors_report: "counterparties" };

export const SIDE_W = 248, RAIL_W = 84;

// Боковое меню стилей A (rail=false) и C (rail=true). Навигация та же: onNav(id).
export default function SideNav({ screen, onNav, user, onLogout, userPerms, rail = false }) {
  const [clearOpen, setClearOpen] = useState(false);
  const isMasterAdmin = user?.master_role === "superadmin" || user?.master_role === "admin";
  const visible = new Map(NAV.filter(item => {
    if (canAccess(user, item.id, userPerms) === false) return false;
    if (item.id === "clear_data" && !isMasterAdmin) return false;
    if (item.id === "intercompany" && APP_CONFIG.mode === "single") return false;
    return true;
  }).map(i => [i.id, i]));
  const cur = PARENT[screen] || screen;
  const isDark = (C.scheme || "dark") === "dark";
  const initials = (user?.full_name || user?.login || "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const W = rail ? RAIL_W : SIDE_W;

  const item = it => {
    const active = cur === it.id, isClear = it.id === "clear_data";
    const ro = canAccess(user, it.id, userPerms) === "readonly";
    const col = isClear ? C.redText : active ? C.sideActiveText : C.sideText;
    return (
      <button key={it.id} title={rail ? navLabel(it) : undefined}
        onClick={() => { if (isClear) { setClearOpen(true); return; } onNav(it.id); }}
        style={rail ? {
          width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "5px 2px",
          background: active ? C.sideActiveBg : "transparent", border: "none", borderRadius: 12, color: col, cursor: "pointer",
          fontSize: 10, fontWeight: active ? 650 : 500, lineHeight: 1.1, textAlign: "center", fontFamily: "inherit",
        } : {
          width: "100%", display: "flex", alignItems: "center", gap: 11, padding: "7px 12px", margin: "1px 0",
          background: active ? C.sideActiveBg : "transparent", border: "none", borderRadius: 9, color: col, cursor: "pointer",
          fontSize: 13.5, fontWeight: active ? 600 : 500, textAlign: "left", fontFamily: "inherit", position: "relative",
        }}
        onMouseEnter={e => { if (!active) e.currentTarget.style.background = C.surfaceHover; }}
        onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}>
        {active && !rail && <span style={{ position: "absolute", left: -12, top: 8, bottom: 8, width: 3, borderRadius: 3, background: C.accent }} />}
        <span style={rail ? { width: 38, height: 26, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 10, background: active ? C.accent : "transparent", color: active ? "#fff" : col } : { display: "flex" }}>
          <Icon name={it.id} size={rail ? 17 : 18} />
        </span>
        <span style={rail ? { maxWidth: 76, overflow: "hidden" } : {}}>{rail ? navLabel(it).replace(/ \(.*\)$/, "") : navLabel(it)}</span>
        {ro && !rail && <span style={{ marginLeft: "auto", fontSize: 10, color: C.yellowText }}>просмотр</span>}
      </button>
    );
  };

  return (
    <>
      <aside style={{ position: "fixed", left: 0, top: 0, bottom: 0, width: W, background: C.sideBg, borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", zIndex: 100 }}>
        {/* Логотип и компания */}
        <div style={{ padding: rail ? "12px 0 8px" : "18px 18px 14px", display: "flex", alignItems: "center", gap: 10, justifyContent: rail ? "center" : "flex-start" }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: C.logoBg || `linear-gradient(135deg, ${C.accent}, ${C.purple})`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 16, boxShadow: C.btnShadow || "none" }}>Т</div>
          {!rail && <div style={{ minWidth: 0 }}>
            <div style={{ color: C.text, fontWeight: 700, fontSize: 15, letterSpacing: "-0.2px" }}>ТоргУчёт</div>
            <div style={{ color: C.textMuted, fontSize: 11.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{user?.company_name || "Моя компания"}</div>
          </div>}
        </div>
        {/* Поиск (Ctrl+K) */}
        <div style={{ padding: rail ? "0 14px 6px" : "0 12px 8px" }}>
          <button type="button" title="Поиск (Ctrl+K)" onClick={() => window.dispatchEvent(new Event("tu:palette"))}
            style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: rail ? "center" : "flex-start", gap: 8, padding: rail ? "7px 0" : "7px 10px", background: C.ctrlBg || C.bg, border: `1px solid ${C.border}`, borderRadius: 9, color: C.textMuted, cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>
            <Icon name="search" size={15} />
            {!rail && <><span>Поиск</span><span style={{ marginLeft: "auto", fontSize: 11, border: `1px solid ${C.border}`, borderRadius: 5, padding: "0 5px" }}>Ctrl+K</span></>}
          </button>
        </div>
        {/* Меню */}
        <nav style={{ flex: 1, overflowY: "auto", padding: rail ? "4px 8px" : "4px 12px 12px" }}>
          {NAV_GROUPS.map((g, gi) => {
            const items = g.ids.map(id => visible.get(id)).filter(Boolean);
            if (!items.length) return null;
            return (
              <div key={gi} style={{ marginTop: gi ? (rail ? 3 : 10) : 2 }}>
                {g.title && !rail && <div style={{ padding: "0 12px 6px", color: C.textDim, fontSize: 10.5, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>{g.title}</div>}
                {g.title && rail && <div style={{ height: 1, background: C.border, margin: "3px 18px 3px" }} />}
                {items.map(item)}
              </div>
            );
          })}
        </nav>
        {/* Пользователь */}
        <div style={{ borderTop: `1px solid ${C.border}`, padding: rail ? "8px 6px" : "12px 14px", display: "flex", flexDirection: "row", flexWrap: rail ? "wrap" : "nowrap", justifyContent: "center", alignItems: "center", gap: rail ? 6 : 10 }}>
          {!rail && <div style={{ width: 34, height: 34, borderRadius: "50%", background: C.accentDim, color: C.accentText, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 12.5, flexShrink: 0 }}>{initials}</div>}
          {!rail && <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: C.text, fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{user?.full_name || user?.login}</div>
            <div style={{ color: C.textDim, fontSize: 11 }}>{user?.role_name || (user?.is_admin ? "Администратор" : "Пользователь")}{APP_CONFIG.version ? ` · v${APP_CONFIG.version}` : ""}</div>
          </div>}
          <ThemeMenu placement={rail ? "right" : "up"}>
            <button type="button" title="Оформление" data-appearance-button="" style={{ width: 32, height: 32, borderRadius: 9, border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="palette" size={16} /></button>
          </ThemeMenu>
          <button type="button" title={isDark ? "Светлая тема" : "Тёмная тема"} onClick={() => setMode(isDark ? "light" : "dark")} style={{ width: 32, height: 32, borderRadius: 9, border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name={isDark ? "sun" : "moon"} size={16} />
          </button>
          <button type="button" title="Выйти" onClick={onLogout} style={{ width: 32, height: 32, borderRadius: 9, border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="logout" size={16} />
          </button>
        </div>
      </aside>
      <ClearDataModal open={clearOpen} onClose={() => setClearOpen(false)} />
    </>
  );
}
