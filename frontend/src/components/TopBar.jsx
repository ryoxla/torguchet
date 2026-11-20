import { useState, useRef, useEffect } from "react";
import { C, api, APP_CONFIG, NAV, canAccess, useIsMobile, ThemeMenu, THEMES, setTheme, themeKeyForUser } from "../utils/globals";
import ClearDataModal from "./ClearDataModal";

// ID пунктов которые уходят в дроп-меню «Сервис»
const SERVICE_IDS = new Set([
  "bank",
  "intercompany",
  "opening_balances",
  "audit_log",
  "directories",
  "debt_writeoffs",
  "clear_data",
]);

// ID пунктов которые уходят в дроп-меню «Учёт товаров»
const STOCK_IDS = new Set([
  "stock",
  "write_offs",
  "movements",
  "transfers",
  "returns",
]);

function TopBar({ screen, onNav, user, onLogout, userPerms, onCompanyChange }) {
  const initials    = user?.full_name ? user.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() : '?';
  // master_role приходит из master_users при логине: 'superadmin' | 'admin' | 'user'
  const isMasterAdmin = user?.master_role === 'superadmin' || user?.master_role === 'admin';
  const visibleNav  = NAV.filter(item => {
    if (canAccess(user, item.id, userPerms) === false) return false;
    // «Очистить данные» видят только админы/суперадмины master (совпадает с серверной проверкой)
    if (item.id === 'clear_data' && !isMasterAdmin) return false;
    if (item.id === 'intercompany' && APP_CONFIG.mode === 'single') return false;
    return true;
  });
  const isSuperAdmin= user?.master_role === 'superadmin';

  // Делим навигацию на основную и сервисную
  const mainNav    = visibleNav.filter(item => !SERVICE_IDS.has(item.id) && !STOCK_IDS.has(item.id));
  const serviceNav = visibleNav.filter(item =>  SERVICE_IDS.has(item.id));
  const stockNav   = visibleNav.filter(item =>  STOCK_IDS.has(item.id));

  // Модалка очистки данных (пункт clear_data управляется твоими правами через canAccess)
  const [clearOpen, setClearOpen] = useState(false);

  // Переключатель компаний
  const [companies,    setCompanies]    = useState([]);
  const [companyOpen,  setCompanyOpen]  = useState(false);
  const [serviceOpen,  setServiceOpen]  = useState(false);
  const [servicePos,   setServicePos]   = useState({ left: 0 });
  const serviceBtnRef = useRef(null);
  const [stockOpen,    setStockOpen]    = useState(false);
  const [stockPos,     setStockPos]     = useState({ left: 0 });
  const stockBtnRef   = useRef(null);
  const stockRef      = useRef(null);
  const companyRef = useRef(null);
  const serviceRef = useRef(null);

  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [stockGroupOpen, setStockGroupOpen] = useState(true);
  const [serviceGroupOpen, setServiceGroupOpen] = useState(true);

  useEffect(() => {
    if (!isSuperAdmin) return;
    api('/superadmin/companies').then(setCompanies).catch(() => {});
  }, [isSuperAdmin]);

  // Закрываем дропдауны при клике снаружи
  useEffect(() => {
    const handler = e => {
      if (companyRef.current && !companyRef.current.contains(e.target)) setCompanyOpen(false);
      if (serviceRef.current && !serviceRef.current.contains(e.target)) setServiceOpen(false);
      if (stockRef.current && !stockRef.current.contains(e.target)) setStockOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const currentCompany = companies.find(c => c.id === user?.company_id) || { name: user?.company_name || '—' };

  const handleSelectCompany = c => { setCompanyOpen(false); if (onCompanyChange) onCompanyChange(c); };

  const serviceActive = serviceNav.some(item => screen === item.id);
  const stockActive   = stockNav.some(item => screen === item.id);

  const dropItem = (item) => {
    const active = screen === item.id;
    const ro     = canAccess(user, item.id, userPerms) === "readonly";
    const isClear = item.id === "clear_data";
    return (
      <button key={item.id} onClick={() => { setServiceOpen(false); setStockOpen(false); if (isClear) { setClearOpen(true); return; } onNav(item.id); }}
        style={{ width: "100%", textAlign: "left", padding: "9px 16px", background: active ? C.accentDim : "transparent", border: "none", color: isClear ? "#e5484d" : (active ? C.accentText : C.text), cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}
        onMouseEnter={e => { if (!active) e.currentTarget.style.background = C.surface; }}
        onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}>
        {active && <span style={{ color: C.accent, fontSize: 10 }}>✓</span>}
        <span style={{ marginLeft: active ? 0 : 18 }}>{item.label}</span>
        {ro && <span style={{ fontSize: 9, color: C.yellowText, marginLeft: 4 }}>👁</span>}
      </button>
    );
  };

  /* ════════════════════════════════════════════
     МОБИЛЬНЫЙ РЕНДЕР: шапка + drawer
     ════════════════════════════════════════════ */
  if (isMobile) {
    const drawerItem = (item, indent = false) => {
      const active = screen === item.id || screen === item.id + "_form";
      const ro     = canAccess(user, item.id, userPerms) === "readonly";
      const isClear = item.id === "clear_data";
      return (
        <button key={item.id}
          onClick={() => { setDrawerOpen(false); if (isClear) { setClearOpen(true); return; } onNav(item.id); }}
          style={{
            width: "100%", textAlign: "left", padding: indent ? "10px 16px 10px 30px" : "11px 16px",
            background: active ? C.accentDim : "transparent",
            border: "none", color: isClear ? "#e5484d" : (active ? C.accentText : C.text),
            cursor: "pointer", fontSize: 14, fontWeight: active ? 600 : 400,
            display: "flex", alignItems: "center", gap: 8, fontFamily: "inherit"
          }}
        >
          {active && <span style={{ color: C.accent, fontSize: 10 }}>●</span>}
          <span>{item.label}</span>
          {ro && <span style={{ fontSize: 9, color: C.yellowText, marginLeft: "auto" }}>👁</span>}
        </button>
      );
    };

    return (
      <>
        {/* ── Шапка ── */}
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
          background: C.surface, borderBottom: `1px solid ${C.border}`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          height: 52, padding: "0 12px"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              onClick={() => setDrawerOpen(true)}
              style={{ background: "transparent", border: "none", color: C.text, cursor: "pointer", padding: 4, display: "flex", alignItems: "center" }}
            >
              <span style={{ fontSize: 22, lineHeight: 1 }}>☰</span>
            </button>
            {user?.company_name && (
              <span style={{ color: C.accentText, fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 160 }}>
                {user.company_name}
              </span>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {isSuperAdmin && (
              <button onClick={() => onNav('superadmin')}
                style={{
                  background: screen === 'superadmin' ? C.accentDim : "transparent",
                  border: `1px solid ${screen === 'superadmin' ? C.accent : C.borderLight}`,
                  borderRadius: 6, padding: "4px 9px", cursor: "pointer",
                  color: screen === 'superadmin' ? C.accentText : C.text,
                  fontSize: 11, fontWeight: 700
                }}
              >
                SA
              </button>
            )}
            <div style={{
              width: 28, height: 28, borderRadius: "50%",
              background: isSuperAdmin ? 'linear-gradient(135deg,#f59e0b,#d97706)' : C.accentDim,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#fff", fontSize: 11, fontWeight: 700, flexShrink: 0
            }}>
              {initials}
            </div>
          </div>
        </div>

        {/* ── Затемнение фона ── */}
        {drawerOpen && (
          <div
            onClick={() => setDrawerOpen(false)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 199 }}
          />
        )}

        {/* ── Выезжающая панель ── */}
        <div style={{
          position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 200,
          width: 280, maxWidth: "82vw",
          background: C.surface, borderRight: `1px solid ${C.border}`,
          transform: drawerOpen ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 0.25s ease",
          display: "flex", flexDirection: "column",
          overflowY: "auto"
        }}>
          {/* Шапка drawer */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "14px 16px", borderBottom: `1px solid ${C.border}`, flexShrink: 0
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 28, height: 28, borderRadius: 6,
                background: `linear-gradient(135deg,${C.accent},#1a56cc)`,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#fff", fontSize: 14, fontWeight: 800
              }}>Т</div>
              <span style={{ color: C.text, fontSize: 15, fontWeight: 700 }}>ТоргУчёт</span>
            </div>
            <button
              onClick={() => setDrawerOpen(false)}
              style={{ background: "transparent", border: "none", color: C.textMuted, cursor: "pointer", fontSize: 20, padding: 4 }}
            >
              ×
            </button>
          </div>

          {/* Список навигации */}
          <div style={{ flex: 1, padding: "8px 0" }}>
            {mainNav.map(item => drawerItem(item))}

            {stockNav.length > 0 && (
              <>
                <div
                  onClick={() => setStockGroupOpen(o => !o)}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "10px 16px 6px", marginTop: 6, cursor: "pointer"
                  }}
                >
                  <span style={{ fontSize: 11, color: C.textDim, letterSpacing: "0.06em", fontWeight: 600 }}>
                    УЧЁТ ТОВАРОВ
                  </span>
                  <span style={{ color: C.textDim, fontSize: 11 }}>{stockGroupOpen ? "▲" : "▼"}</span>
                </div>
                {stockGroupOpen && stockNav.map(item => drawerItem(item, true))}
              </>
            )}

            {serviceNav.length > 0 && (
              <>
                <div
                  onClick={() => setServiceGroupOpen(o => !o)}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "10px 16px 6px", marginTop: 6, cursor: "pointer"
                  }}
                >
                  <span style={{ fontSize: 11, color: C.textDim, letterSpacing: "0.06em", fontWeight: 600 }}>
                    СЕРВИС
                  </span>
                  <span style={{ color: C.textDim, fontSize: 11 }}>{serviceGroupOpen ? "▲" : "▼"}</span>
                </div>
                {serviceGroupOpen && serviceNav.map(item => drawerItem(item, true))}
              </>
            )}
          </div>

          {/* Низ drawer — пользователь и выход */}
          <div style={{ borderTop: `1px solid ${C.border}`, padding: "12px 16px", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div style={{
                width: 32, height: 32, borderRadius: "50%",
                background: isSuperAdmin ? 'linear-gradient(135deg,#f59e0b,#d97706)' : C.accentDim,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#fff", fontSize: 12, fontWeight: 700, flexShrink: 0
              }}>
                {initials}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: C.text, fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {user?.full_name || user?.login || '—'}
                </div>
                <div style={{ color: C.textDim, fontSize: 11 }}>
                  {isSuperAdmin ? 'Супер Админ' : user?.role_name || ''}
                </div>
              </div>
            </div>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: C.textDim, letterSpacing: "0.06em", fontWeight: 600, marginBottom: 6 }}>ОФОРМЛЕНИЕ</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {Object.values(THEMES).map(t => {
                  const active = t.key === themeKeyForUser();
                  return (
                    <button key={t.key} type="button" onClick={() => setTheme(t.key)} title={t.label}
                      style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 9px", borderRadius: 6, cursor: "pointer", fontFamily: "inherit",
                        background: active ? C.accentDim : "transparent", border: `1px solid ${active ? C.accent : C.borderLight}`,
                        color: active ? C.accentText : C.text, fontSize: 12 }}>
                      <span style={{ display: "flex", gap: 2 }}>
                        <span style={{ width: 10, height: 10, borderRadius: 2, background: t.colors.bg, border: `1px solid ${t.colors.borderLight}` }} />
                        <span style={{ width: 10, height: 10, borderRadius: 2, background: t.colors.accent }} />
                      </span>
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <button
              onClick={onLogout}
              style={{
                width: "100%", padding: "9px", background: "transparent",
                border: `1px solid ${C.borderLight}`, color: C.textMuted,
                borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit"
              }}
            >
              Выйти
            </button>
            {APP_CONFIG.version && (
              <div style={{ textAlign: "center", marginTop: 8, fontSize: 11, color: C.textDim }}>Версия {APP_CONFIG.version}</div>
            )}
          </div>
        </div>

        <ClearDataModal open={clearOpen} onClose={() => setClearOpen(false)} />
      </>
    );
  }

  /* ════════════════════════════════════════════
     ДЕСКТОПНЫЙ РЕНДЕР (оригинал без изменений)
     ════════════════════════════════════════════ */
  return (
    <>
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, background: C.surface, borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", height: 52 }}>

      {/* Логотип */}
      <div style={{ padding: "0 16px", borderRight: `1px solid ${C.border}`, height: "100%", display: "flex", alignItems: "center", flexShrink: 0 }}>
        <div style={{ width: 28, height: 28, borderRadius: 6, background: `linear-gradient(135deg,${C.accent},#1a56cc)`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 14, fontWeight: 800 }}>Т</div>
      </div>

      {/* Кнопка SA — только superadmin */}
      {isSuperAdmin && (
        <div style={{ borderRight: `1px solid ${C.border}`, height: "100%", display: "flex", alignItems: "center", padding: "0 12px", flexShrink: 0 }}>
          <button onClick={() => onNav('superadmin')}
            style={{ display: "flex", alignItems: "center", gap: 4, background: screen === 'superadmin' ? C.accentDim : "transparent", border: `1px solid ${screen === 'superadmin' ? C.accent : C.borderLight}`, borderRadius: 6, padding: "5px 12px", cursor: "pointer", color: screen === 'superadmin' ? C.accentText : C.text, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>
            SA
          </button>
        </div>
      )}

      {/* Название компании */}
      {user?.company_name && (
        <div style={{ padding: "0 14px", borderRight: `1px solid ${C.border}`, height: "100%", display: "flex", alignItems: "center", flexShrink: 0 }}>
          <span style={{ color: C.accentText, fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" }}>{user.company_name}</span>
        </div>
      )}

      {/* Основная навигация */}
      <nav style={{ display: "flex", alignItems: "center", height: "100%", padding: "0 4px", flex: 1, overflow: "visible" }}>
        {mainNav.map(item => {
          const active = screen === item.id || screen === item.id + "_form";
          const ro     = canAccess(user, item.id, userPerms) === "readonly";
          return (
            <button key={item.id}
              onClick={e => { if (e.shiftKey || e.ctrlKey || e.metaKey) { window.open('?screen=' + item.id, '_blank'); return; } onNav(item.id); }}
              style={{ height: "100%", padding: "0 13px", background: "transparent", color: active ? C.accentText : C.textMuted, border: "none", borderBottom: active ? `2px solid ${C.accent}` : "2px solid transparent", cursor: "pointer", fontSize: 13, fontWeight: active ? 600 : 400, whiteSpace: "nowrap", transition: "color 0.15s" }}>
              {item.label}{ro && <span style={{ fontSize: 9, color: C.yellowText, marginLeft: 4, verticalAlign: "middle" }}>👁</span>}
            </button>
          );
        })}

        {/* Дроп-меню «Учёт товаров» */}
        {stockNav.length > 0 && (
          <div ref={stockRef} style={{ position: "relative", height: "100%", display: "flex", alignItems: "center" }}>
            <button ref={stockBtnRef} onClick={() => {
                if (stockBtnRef.current) {
                  const rect = stockBtnRef.current.getBoundingClientRect();
                  setStockPos({ left: rect.left });
                }
                setStockOpen(p => !p);
              }}
              style={{ height: "100%", padding: "0 13px", background: "transparent", border: "none", borderBottom: (stockActive || stockOpen) ? `2px solid ${C.accent}` : "2px solid transparent", color: (stockActive || stockOpen) ? C.accentText : C.textMuted, cursor: "pointer", fontSize: 13, fontWeight: (stockActive || stockOpen) ? 600 : 400, whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 5 }}>
              Учёт товаров
              <span style={{ fontSize: 9, color: "inherit", marginTop: 1 }}>{stockOpen ? '▲' : '▼'}</span>
            </button>
            {stockOpen && (
              <div style={{ position: "fixed", top: 52, left: stockPos.left, minWidth: 200, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.5)", zIndex: 500, overflow: "hidden" }}>
                <div style={{ padding: "6px 12px", fontSize: 10, color: C.textDim, borderBottom: `1px solid ${C.border}`, letterSpacing: "0.08em" }}>УЧЁТ ТОВАРОВ</div>
                {stockNav.map(dropItem)}
              </div>
            )}
          </div>
        )}

        {/* Дроп-меню «Сервис» */}
        {serviceNav.length > 0 && (
          <div ref={serviceRef} style={{ position: "relative", height: "100%", display: "flex", alignItems: "center" }}>
            <button ref={serviceBtnRef} onClick={() => {
                if (serviceBtnRef.current) {
                  const rect = serviceBtnRef.current.getBoundingClientRect();
                  setServicePos({ left: rect.left });
                }
                setServiceOpen(p => !p);
              }}
              style={{ height: "100%", padding: "0 13px", background: "transparent", border: "none", borderBottom: (serviceActive || serviceOpen) ? `2px solid ${C.accent}` : "2px solid transparent", color: (serviceActive || serviceOpen) ? C.accentText : C.textMuted, cursor: "pointer", fontSize: 13, fontWeight: (serviceActive || serviceOpen) ? 600 : 400, whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 5 }}>
              Сервис
              <span style={{ fontSize: 9, color: "inherit", marginTop: 1 }}>{serviceOpen ? '▲' : '▼'}</span>
            </button>
            {serviceOpen && (
              <div style={{ position: "fixed", top: 52, left: servicePos.left, minWidth: 210, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.5)", zIndex: 500, overflow: "hidden" }}>
                <div style={{ padding: "6px 12px", fontSize: 10, color: C.textDim, borderBottom: `1px solid ${C.border}`, letterSpacing: "0.08em" }}>СЕРВИС</div>
                {serviceNav.map(dropItem)}
              </div>
            )}
          </div>
        )}
      </nav>

      {/* Пользователь */}
      <div style={{ padding: "0 16px", borderLeft: `1px solid ${C.border}`, height: "100%", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <div style={{ textAlign: "right" }}>
          <div style={{ color: C.text, fontSize: 12, fontWeight: 600 }}>{user?.full_name || user?.login || '—'}</div>
          <div style={{ color: C.textDim, fontSize: 10 }}>{isSuperAdmin ? 'Супер Админ' : user?.role_name || ''}{APP_CONFIG.version ? ` · v${APP_CONFIG.version}` : ''}</div>
        </div>
        <div style={{ width: 30, height: 30, borderRadius: "50%", background: isSuperAdmin ? 'linear-gradient(135deg,#f59e0b,#d97706)' : C.accentDim, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: 700 }}>{initials}</div>
        <ThemeMenu />
        <button onClick={onLogout} title="Выйти" style={{ background: "transparent", border: `1px solid ${C.borderLight}`, color: C.textMuted, borderRadius: 5, padding: "4px 8px", cursor: "pointer", fontSize: 11, fontWeight: 600, marginLeft: 4 }}>Выйти</button>
      </div>

    </div>

    <ClearDataModal open={clearOpen} onClose={() => setClearOpen(false)} />
    </>
  );
}

// ─── ДАШБОРД ──────────────────────────────────────────────────────────────────

export default TopBar;
