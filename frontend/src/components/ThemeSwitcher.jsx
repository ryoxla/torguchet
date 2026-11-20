import { useState, useEffect } from "react";
import { C, THEMES, applyTheme, getThemeName } from "../utils/globals";

// Переключатель темы оформления. Пресеты из globals (THEMES).
// Тема хранится в localStorage по user.id, применяется мгновенно через CSS-переменные.
export default function ThemeSwitcher({ currentUser }) {
  const uid = currentUser?.id;
  const [active, setActive] = useState(() => getThemeName(uid));

  // При монтировании (напр. сразу после логина) применяем сохранённую тему пользователя
  useEffect(() => {
    const name = getThemeName(uid);
    applyTheme(name, uid);
    setActive(name);
  }, [uid]);

  const pick = name => { applyTheme(name, uid); setActive(name); };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      <div style={{ fontSize: 11, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>
        Тема оформления
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {Object.entries(THEMES).map(([name, t]) => {
          const on = active === name;
          return (
            <button key={name} type="button" onClick={() => pick(name)} title={t.label}
              style={{
                display: "flex", alignItems: "center", gap: 7, padding: "5px 10px", cursor: "pointer",
                background: on ? C.accentDim : "transparent",
                border: `1px solid ${on ? C.accent : C.borderLight}`,
                borderRadius: 6, color: on ? C.accentText : C.textMuted,
                fontSize: 12, fontWeight: 600, fontFamily: "inherit", whiteSpace: "nowrap"
              }}>
              <span style={{ width: 12, height: 12, borderRadius: "50%", background: t.vars.accent, border: `1px solid ${C.borderLight}`, flexShrink: 0 }} />
              {t.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
