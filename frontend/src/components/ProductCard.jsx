import { useState, useEffect } from "react";
import { C, api, Lbl, Inp, ConfirmDialog, SectionCard } from "../utils/globals";

function ProductCard({ product, onBack, onSave, categories = [], onAddCategory, units = [], countries = [], grades = [] }) {
  const [form,           setForm]           = useState({ ...product });
  const [tab,            setTab]            = useState("main");
  const [saved,          setSaved]          = useState(false);
  const [confirmDel,     setConfirmDel]     = useState(false);
  const [addingCat,      setAddingCat]      = useState(false);
  const [newCatName,     setNewCatName]     = useState("");
  const [selectedGrades, setSelectedGrades] = useState([]);
  const [gradesSaving,   setGradesSaving]   = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!product.id) return;
    api(`/products/${product.id}/grades`).then(rows => {
      setSelectedGrades(rows.map(r => r.grade_id));
    }).catch(() => {});
  }, [product.id]);

  const handleSave = () => { onSave(form); setSaved(true); setTimeout(() => setSaved(false), 2000); };
  const handleDelete = () => {
    api(`/products/${form.id}`, "DELETE").then(() => { if (onBack) onBack(); }).catch(e => alert(e.message));
    setConfirmDel(false);
  };
  const handleAddCat = () => {
    const name = newCatName.trim(); if (!name) return;
    const c = onAddCategory(name); set("category_id", c.id); setNewCatName(""); setAddingCat(false);
  };
  const handleSaveGrades = async () => {
    setGradesSaving(true);
    try {
      await api(`/products/${form.id}/grades`, "PUT", { grade_ids: selectedGrades });
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } catch (e) { alert("Ошибка: " + e.message); }
    finally { setGradesSaving(false); }
  };
  const toggleGrade = id => setSelectedGrades(prev => prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id]);

  const tabs = [{ id: "main", l: "Основное" }, { id: "grades", l: `Сорта (${selectedGrades.length})` }];

  return (
    /* ── затемнённый фон модалки ── */
    <div onClick={e => { if (e.target === e.currentTarget && onBack) onBack(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>

      <div style={{ background: C.surface, border: `1px solid ${C.borderLight}`, borderRadius: 10, width: "100%", maxWidth: 560, maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>

        {/* ── Шапка ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "18px 20px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ width: 38, height: 38, borderRadius: 8, background: C.accentDim, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>◈</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: C.text, fontWeight: 700, fontSize: 16, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{form.name}</div>
            <div style={{ color: C.textMuted, fontSize: 12, marginTop: 2 }}>{categories.find(c => c.id === form.category_id)?.name || "—"}</div>
          </div>
          <button onClick={onBack} style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer", fontSize: 20, flexShrink: 0 }}>×</button>
        </div>

        {/* ── Табы ── */}
        <div style={{ display: "flex", borderBottom: `1px solid ${C.border}`, padding: "0 20px" }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: "10px 16px", border: "none", background: "transparent", color: tab === t.id ? C.accentText : C.textMuted, borderBottom: tab === t.id ? `2px solid ${C.accent}` : "2px solid transparent", cursor: "pointer", fontSize: 13, fontWeight: tab === t.id ? 600 : 400, marginBottom: -1 }}>{t.l}</button>
          ))}
        </div>

        {/* ── Тело (скроллится) ── */}
        <div style={{ padding: 20, overflowY: "auto", flex: 1 }}>

          {tab === "main" && (
            <SectionCard title="Идентификация">
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div><Lbl req>Наименование</Lbl><Inp value={form.name} onChange={v => set("name", v)}/></div>
                <div>
                  <Lbl>Категория</Lbl>
                  {!addingCat ? (
                    <>
                      <div style={{ display: "flex", gap: 8 }}>
                        <div style={{ position: "relative", flex: 1 }}>
                          <select value={form.category_id || 0} onChange={e => set("category_id", +e.target.value)}
                            style={{ width: "100%", background: C.bg, border: `1px solid ${C.borderLight}`, color: form.category_id ? C.text : C.textMuted, borderRadius: 6, padding: "8px 12px", fontSize: 13, outline: "none", appearance: "none" }}>
                            <option value={0}>— Выберите —</option>
                            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                          <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: C.textDim, pointerEvents: "none", fontSize: 12 }}>▼</span>
                        </div>
                        <button onClick={() => setAddingCat(true)} title="Добавить категорию"
                          style={{ padding: "8px 12px", background: "transparent", border: `1px solid ${C.borderLight}`, color: C.accentText, borderRadius: 6, cursor: "pointer", fontSize: 18, lineHeight: 1 }}>+</button>
                      </div>
                      {form.category_id > 0 && (
                        <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ background: C.accentDim, color: C.accentText, padding: "2px 10px", borderRadius: 10, fontSize: 12, fontWeight: 600 }}>{categories.find(c => c.id === form.category_id)?.name}</span>
                          <button onClick={() => set("category_id", 0)} style={{ background: "none", border: "none", color: C.textDim, cursor: "pointer", fontSize: 12 }}>× сбросить</button>
                        </div>
                      )}
                    </>
                  ) : (
                    <div style={{ background: C.bg, border: `1px solid ${C.accent}`, borderRadius: 6, padding: 12 }}>
                      <div style={{ color: C.textMuted, fontSize: 12, marginBottom: 8 }}>Новая категория</div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <input autoFocus value={newCatName} onChange={e => setNewCatName(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") handleAddCat(); if (e.key === "Escape") setAddingCat(false); }}
                          placeholder="Название..." style={{ flex: 1, background: C.surface, border: `1px solid ${C.borderLight}`, color: C.text, borderRadius: 6, padding: "7px 12px", fontSize: 13, outline: "none" }}/>
                        <button onClick={handleAddCat} style={{ padding: "7px 14px", background: C.accent, border: "none", color: "#fff", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Добавить</button>
                        <button onClick={() => { setAddingCat(false); setNewCatName(""); }} style={{ padding: "7px 10px", background: "transparent", border: `1px solid ${C.borderLight}`, color: C.textMuted, borderRadius: 6, cursor: "pointer", fontSize: 13 }}>Отмена</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </SectionCard>
          )}

          {tab === "grades" && (
            <SectionCard title="Доступные сорта" subtitle="Отмеченные сорта будут доступны при выборе этого товара в накладной. Если не выбрано ни одного — доступны все.">
              {grades.length === 0
                ? <div style={{ color: C.textMuted, fontSize: 13, padding: 8 }}>Сорта не настроены. Добавьте сорта в справочнике.</div>
                : <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {grades.map(g => (
                      <label key={g.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: selectedGrades.includes(g.id) ? C.accentDim : C.bg, border: `1px solid ${selectedGrades.includes(g.id) ? C.accent : C.borderLight}`, borderRadius: 8, cursor: "pointer", transition: "all 0.15s" }}>
                        <input type="checkbox" checked={selectedGrades.includes(g.id)} onChange={() => toggleGrade(g.id)} style={{ width: 16, height: 16, accentColor: C.accent }}/>
                        <span style={{ color: C.text, fontWeight: selectedGrades.includes(g.id) ? 600 : 400, fontSize: 14 }}>{g.name}</span>
                        {g.code && <span style={{ color: C.textMuted, fontSize: 12, fontFamily: "monospace" }}>{g.code}</span>}
                      </label>
                    ))}
                    <div style={{ color: C.textDim, fontSize: 12, marginTop: 4 }}>
                      {selectedGrades.length === 0 ? "Все сорта доступны (не ограничено)" : `Выбрано: ${selectedGrades.length} из ${grades.length}`}
                    </div>
                  </div>
              }
            </SectionCard>
          )}

        </div>

        {/* ── Футер ── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", borderTop: `1px solid ${C.border}` }}>
          <button onClick={() => setConfirmDel(true)} style={{ padding: "7px 16px", background: "transparent", border: `1px solid ${C.red}`, color: C.redText, borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Удалить</button>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onBack} style={{ padding: "7px 16px", background: "transparent", border: `1px solid ${C.borderLight}`, color: C.text, borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Отмена</button>
            <button onClick={tab === "grades" ? handleSaveGrades : handleSave} disabled={gradesSaving}
              style={{ padding: "7px 20px", background: saved ? C.green : C.accent, border: "none", color: "#fff", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 700, transition: "background 0.3s" }}>
              {saved ? "✓ Сохранено" : gradesSaving ? "Сохранение..." : "Сохранить"}
            </button>
          </div>
        </div>

      </div>

      {confirmDel && <ConfirmDialog text={`Удалить товар «${form.name}»?`} onConfirm={handleDelete} onClose={() => setConfirmDel(false)}/>}
    </div>
  );
}

export default ProductCard;
