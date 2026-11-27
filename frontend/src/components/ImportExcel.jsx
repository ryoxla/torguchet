// Импорт справочника из Excel: выбор файла → предпросмотр → загрузка → итог.
// Вся проверка — на сервере (import/), здесь только показ результата.
import { useState, useRef, useMemo } from "react";
import { C, API, Btn, useIsMobile } from "../utils/globals";

const MAX_MB = 5;
const SHOW_STEP = 300;

function authHeaders(extra = {}) {
  const user = JSON.parse(sessionStorage.getItem("trade_user") || "null");
  const h = { "X-Company-ID": String(user?.company_id || "1"), ...extra };
  if (user?.token) h.Authorization = "Bearer " + user.token;
  return h;
}
async function readError(r) {
  const t = await r.text();
  try { return JSON.parse(t).error || t; } catch { return t || `Ошибка ${r.status}`; }
}
function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function fileNameFrom(r, fallback) {
  const cd = r.headers.get("Content-Disposition") || "";
  const m = cd.match(/filename\*=UTF-8''([^;]+)/i);
  if (m) { try { return decodeURIComponent(m[1]); } catch { /* ignore */ } }
  return fallback;
}

export async function downloadTemplate(kind) {
  const r = await fetch(`${API}/import/${kind}/template`, { headers: authHeaders() });
  if (!r.ok) throw new Error(await readError(r));
  saveBlob(await r.blob(), fileNameFrom(r, `ТоргУчёт-шаблон-${kind}.xlsx`));
}

const STATUS = () => ({
  new:    { label: "Новая",      color: C.greenText,  bg: C.greenDim },
  update: { label: "Обновление", color: C.accentText, bg: C.accentDim },
  skip:   { label: "Пропуск",    color: C.textMuted,  bg: C.border },
  error:  { label: "Ошибка",     color: C.redText,    bg: C.redDim },
});

function Chip({ label, value, color, bg, active, onClick }) {
  return (
    <button onClick={onClick} style={{ display: "flex", alignItems: "baseline", gap: 6, padding: "6px 12px", borderRadius: 999,
      border: `1px solid ${active ? color : C.border}`, background: active ? bg : C.surface, color: C.text, cursor: onClick ? "pointer" : "default", fontSize: 12 }}>
      <span style={{ color: C.textMuted }}>{label}</span>
      <b style={{ color, fontFamily: "'JetBrains Mono',monospace", fontSize: 13 }}>{value}</b>
    </button>
  );
}

function ModeSwitch({ mode, onChange, disabled }) {
  const opt = (v, title, sub) => (
    <label key={v} style={{ flex: 1, minWidth: 220, display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 12px", borderRadius: 8, cursor: disabled ? "default" : "pointer",
      border: `1px solid ${mode === v ? C.accent : C.border}`, background: mode === v ? C.accentDim + "55" : C.bg }}>
      <input type="radio" name="import-mode" checked={mode === v} disabled={disabled} onChange={() => onChange(v)} style={{ marginTop: 2, accentColor: C.accent }} />
      <span><span style={{ display: "block", color: C.text, fontWeight: 600, fontSize: 13 }}>{title}</span>
        <span style={{ display: "block", color: C.textMuted, fontSize: 12, marginTop: 2 }}>{sub}</span></span>
    </label>
  );
  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      {opt("add", "Только добавить новые", "Найденные в справочнике записи не меняются")}
      {opt("upsert", "Добавить и обновить найденные", "У найденных меняются только заполненные в файле поля")}
    </div>
  );
}

export default function ImportExcel({ kind, title, onClose, onImported }) {
  const isMobile = useIsMobile();
  const [step, setStep] = useState("choose"); // choose | preview | result
  const [mode, setMode] = useState("add");
  const [file, setFile] = useState(null);     // { name, size, buf }
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [filter, setFilter] = useState("all");
  const [shown, setShown] = useState(SHOW_STEP);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef(null);
  const S = STATUS();

  const runPreview = async (f, m) => {
    setBusy("Проверяю файл…"); setError("");
    try {
      const r = await fetch(`${API}/import/${kind}/preview?mode=${m}`, {
        method: "POST", body: f.buf,
        headers: authHeaders({ "Content-Type": "application/octet-stream", "X-File-Name": encodeURIComponent(f.name) }),
      });
      if (!r.ok) throw new Error(await readError(r));
      const p = await r.json();
      setPreview(p); setStep("preview"); setShown(SHOW_STEP);
      setFilter(p.counters.error > 0 ? "error" : "all");
    } catch (e) { setError(e.message); setStep(s => s === "preview" ? "preview" : "choose"); }
    finally { setBusy(""); }
  };

  const pickFile = async (f) => {
    if (!f) return;
    setError("");
    if (f.size > MAX_MB * 1024 * 1024) { setError(`Файл больше ${MAX_MB} МБ. Разбейте его на несколько файлов.`); return; }
    const buf = await f.arrayBuffer();
    const nf = { name: f.name, size: f.size, buf };
    setFile(nf);
    runPreview(nf, mode);
  };

  const changeMode = (m) => { setMode(m); if (file && step === "preview") runPreview(file, m); };

  const ready = preview ? preview.counters.new + preview.counters.update : 0;

  const commit = async () => {
    setBusy("Загружаю…"); setError("");
    try {
      const r = await fetch(`${API}/import/${kind}/commit?mode=${mode}&expect=${ready}`, {
        method: "POST", body: file.buf,
        headers: authHeaders({ "Content-Type": "application/octet-stream", "X-File-Name": encodeURIComponent(file.name) }),
      });
      if (r.status === 409) { setError(await readError(r)); await runPreview(file, mode); return; }
      if (!r.ok) throw new Error(await readError(r));
      const res = await r.json();
      setResult(res); setStep("result");
      onImported && onImported(res);
    } catch (e) { setError(e.message); }
    finally { setBusy(""); }
  };

  const downloadErrors = async (rows) => {
    try {
      const r = await fetch(`${API}/import/${kind}/errors-file`, {
        method: "POST", headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ rows }),
      });
      if (!r.ok) throw new Error(await readError(r));
      saveBlob(await r.blob(), fileNameFrom(r, "Ошибки импорта.xlsx"));
    } catch (e) { setError(e.message); }
  };

  const problemRows = useMemo(() => (preview?.rows || []).filter(r => r.status === "error" || r.messages.some(m => m.level === "warning")), [preview]);
  const filtered = useMemo(() => {
    const rows = preview?.rows || [];
    if (filter === "all") return rows;
    if (filter === "warning") return rows.filter(r => r.messages.some(m => m.level === "warning"));
    return rows.filter(r => r.status === filter);
  }, [preview, filter]);
  const cols = (preview?.columns || []).filter(c => c.found);

  const overlay = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 250, display: "flex", alignItems: isMobile ? "stretch" : "center", justifyContent: "center", padding: isMobile ? 0 : 20 };
  const panel = { background: C.surface, color: C.text, border: `1px solid ${C.borderLight}`, borderRadius: isMobile ? 0 : (C.radius || 10) + 2,
    width: step === "choose" ? 640 : 1180, maxWidth: "100%", maxHeight: isMobile ? "100%" : "92vh", display: "flex", flexDirection: "column",
    boxShadow: "0 20px 60px rgba(0,0,0,0.35)", overflow: "hidden" };
  const th = { position: "sticky", top: 0, background: C.surface, padding: "8px 10px", textAlign: "left", color: C.textMuted, fontSize: 11, fontWeight: 600,
    borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap", zIndex: 1 };

  const Msg = ({ m }) => {
    const color = m.level === "error" ? C.redText : m.level === "warning" ? C.yellowText : C.textMuted;
    const icon = m.level === "error" ? "✖" : m.level === "warning" ? "⚠" : "ℹ";
    return <div style={{ color, fontSize: 12, lineHeight: 1.45, whiteSpace: "normal", overflowWrap: "anywhere" }}>{icon} {m.text}</div>;
  };

  return (
    <div style={overlay} onClick={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div style={panel} data-import-dialog={kind}>
        {/* Шапка */}
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: C.greenDim, color: C.greenText, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13, flexShrink: 0 }}>XLS</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Импорт из Excel — {title}</div>
            <div style={{ color: C.textMuted, fontSize: 12, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {step === "choose" && "Шаг 1 из 3 · выбор файла"}
              {step === "preview" && <>Шаг 2 из 3 · предпросмотр · {file?.name}{preview?.sheet ? ` · лист «${preview.sheet}»` : ""}</>}
              {step === "result" && "Шаг 3 из 3 · итог"}
            </div>
          </div>
          <button onClick={() => !busy && onClose()} title="Закрыть" style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer", fontSize: 22, lineHeight: 1 }}>×</button>
        </div>

        {/* Шаг 1 */}
        {step === "choose" && (
          <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16, overflow: "auto" }}>
            <div onClick={() => inputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
              onDrop={e => { e.preventDefault(); setDrag(false); pickFile(e.dataTransfer.files?.[0]); }}
              style={{ border: `2px dashed ${drag ? C.accent : C.borderLight}`, background: drag ? C.accentDim + "40" : C.bg, borderRadius: 10, padding: "30px 20px", textAlign: "center", cursor: "pointer" }}>
              <div style={{ fontSize: 28, color: C.accentText, marginBottom: 6 }}>⇪</div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{busy || "Перетащите файл сюда или нажмите, чтобы выбрать"}</div>
              <div style={{ color: C.textMuted, fontSize: 12, marginTop: 6 }}>.xlsx или .csv, до {MAX_MB} МБ и 5000 строк. Старый .xls пересохраните как .xlsx</div>
              <input ref={inputRef} type="file" accept=".xlsx,.csv,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                style={{ display: "none" }} onChange={e => { pickFile(e.target.files?.[0]); e.target.value = ""; }} />
            </div>
            <div>
              <div style={{ color: C.textMuted, fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Если запись уже есть в справочнике</div>
              <ModeSwitch mode={mode} onChange={setMode} disabled={!!busy} />
            </div>
            <div style={{ color: C.textMuted, fontSize: 12, lineHeight: 1.6 }}>
              Нет файла? <a href="#" onClick={e => { e.preventDefault(); downloadTemplate(kind).catch(er => setError(er.message)); }} style={{ color: C.accentText }}>Скачайте шаблон</a> — в нём подсказки и список допустимых значений.
              Ничего не запишется, пока вы не проверите предпросмотр и не нажмёте «Загрузить».
            </div>
            {error && <div style={{ color: C.redText, background: C.redDim, borderRadius: 8, padding: "10px 12px", fontSize: 13 }}>{error}</div>}
          </div>
        )}

        {/* Шаг 2 */}
        {step === "preview" && preview && (<>
          <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: 12 }}>
            <ModeSwitch mode={mode} onChange={changeMode} disabled={!!busy} />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Chip label="Всего" value={preview.counters.total} color={C.text} bg={C.border} active={filter === "all"} onClick={() => { setFilter("all"); setShown(SHOW_STEP); }} />
              <Chip label="Новых" value={preview.counters.new} color={S.new.color} bg={S.new.bg} active={filter === "new"} onClick={() => { setFilter("new"); setShown(SHOW_STEP); }} />
              <Chip label="Обновить" value={preview.counters.update} color={S.update.color} bg={S.update.bg} active={filter === "update"} onClick={() => { setFilter("update"); setShown(SHOW_STEP); }} />
              <Chip label="Пропуск" value={preview.counters.skip} color={S.skip.color} bg={S.skip.bg} active={filter === "skip"} onClick={() => { setFilter("skip"); setShown(SHOW_STEP); }} />
              <Chip label="Ошибок" value={preview.counters.error} color={S.error.color} bg={S.error.bg} active={filter === "error"} onClick={() => { setFilter("error"); setShown(SHOW_STEP); }} />
              <Chip label="С предупреждениями" value={preview.counters.warnings} color={C.yellowText} bg={C.yellowDim} active={filter === "warning"} onClick={() => { setFilter("warning"); setShown(SHOW_STEP); }} />
            </div>
            {(preview.toCreate.categories.length > 0 || preview.toCreate.grades.length > 0 || preview.fileMessages.length > 0) && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px" }}>
                {preview.toCreate.categories.length > 0 && <div style={{ color: C.text }}><b style={{ color: C.accentText }}>Будут созданы категории:</b> {preview.toCreate.categories.join(", ")}</div>}
                {preview.toCreate.grades.length > 0 && <div style={{ color: C.text }}><b style={{ color: C.accentText }}>Будут созданы сорта:</b> {preview.toCreate.grades.join(", ")}</div>}
                {preview.fileMessages.map((m, i) => <Msg key={i} m={m} />)}
              </div>
            )}
          </div>
          <div style={{ flex: 1, overflow: "auto", minHeight: 160 }}>
            <table style={{ borderCollapse: "separate", borderSpacing: 0, width: "100%", fontSize: 12 }}>
              <thead><tr>
                <th style={{ ...th, width: 54 }}>Стр.</th>
                <th style={{ ...th, width: 96 }}>Статус</th>
                <th style={{ ...th, minWidth: 280 }}>Проверка</th>
                {cols.map(c => <th key={c.key} style={th}>{c.header}{c.required ? " *" : ""}</th>)}
              </tr></thead>
              <tbody>
                {filtered.length === 0 && <tr><td colSpan={cols.length + 3} style={{ padding: 30, textAlign: "center", color: C.textDim }}>Нет строк</td></tr>}
                {filtered.slice(0, shown).map(r => {
                  const st = S[r.status] || S.skip;
                  const lvl = k => r.messages.some(m => m.col === k && m.level === "error") ? "error" : r.messages.some(m => m.col === k && m.level === "warning") ? "warning" : r.messages.some(m => m.col === k && m.level === "info") ? "info" : null;
                  const td = { padding: "7px 10px", borderBottom: `1px solid ${C.border}`, verticalAlign: "top", color: r.status === "skip" ? C.textMuted : C.text };
                  return (
                    <tr key={r.row} data-status={r.status}>
                      <td style={{ ...td, boxShadow: `inset 3px 0 0 ${st.color}`, color: C.textMuted, fontFamily: "'JetBrains Mono',monospace" }}>{r.row}</td>
                      <td style={td}><span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 999, background: st.bg, color: st.color, fontWeight: 600, fontSize: 11, whiteSpace: "nowrap" }}>{st.label}</span></td>
                      <td style={{ ...td, minWidth: 280 }}><div style={{ width: 340, maxWidth: "70vw" }}>{r.messages.length ? r.messages.map((m, i) => <Msg key={i} m={m} />) : <span style={{ color: C.greenText, fontSize: 12 }}>✓ ОК</span>}</div></td>
                      {cols.map(c => {
                        const l = lvl(c.key);
                        const bg = l === "error" ? C.redDim : l === "warning" ? C.yellowDim : l === "info" ? C.accentDim + "66" : "transparent";
                        const v = r.values[c.key];
                        return <td key={c.key} title={r.messages.filter(m => m.col === c.key).map(m => m.text).join("\n") || undefined}
                          style={{ ...td, background: bg, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            outline: l === "error" ? `1px solid ${C.red}` : "none", outlineOffset: -1 }}>{v || <span style={{ color: C.textDim }}>—</span>}</td>;
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length > shown && (
              <div style={{ padding: 12, textAlign: "center", color: C.textMuted, fontSize: 12 }}>
                Показаны {shown} из {filtered.length}. <a href="#" onClick={e => { e.preventDefault(); setShown(s => s + SHOW_STEP * 3); }} style={{ color: C.accentText }}>Показать ещё</a>
              </div>
            )}
          </div>
          <div style={{ padding: "12px 20px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {error && <div style={{ color: C.redText, fontSize: 13, flexBasis: "100%" }}>{error}</div>}
            <Btn onClick={() => { setStep("choose"); setPreview(null); setFile(null); setError(""); }} disabled={!!busy}>← Другой файл</Btn>
            {problemRows.length > 0 && <Btn onClick={() => downloadErrors(problemRows)} disabled={!!busy}>Скачать список ошибок ({problemRows.length})</Btn>}
            <div style={{ flex: 1 }} />
            <span style={{ color: C.textMuted, fontSize: 12 }}>{busy || (preview.counters.error ? "Строки с ошибками не загрузятся" : "")}</span>
            <Btn primary onClick={commit} disabled={!!busy || ready === 0}>{busy === "Загружаю…" ? "Загружаю…" : `Загрузить ${ready} ${plural(ready, "строку", "строки", "строк")}`}</Btn>
          </div>
        </>)}

        {/* Шаг 3 */}
        {step === "result" && result && (
          <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16, overflow: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: "50%", background: C.greenDim, color: C.greenText, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 800 }}>✓</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>Загрузка завершена</div>
                <div style={{ color: C.textMuted, fontSize: 12 }}>{file?.name} · режим «{result.mode === "upsert" ? "добавить и обновить" : "только новые"}»</div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4,1fr)", gap: 10 }}>
              {[["Добавлено", result.inserted, S.new], ["Обновлено", result.updated, S.update], ["Пропущено", result.skipped, S.skip], ["Не загружено (ошибки)", result.errors, S.error]].map(([l, v, st]) => (
                <div key={l} style={{ background: C.bg, border: `1px solid ${C.border}`, borderTop: `3px solid ${st.color}`, borderRadius: 8, padding: "12px 14px" }}>
                  <div style={{ color: C.textMuted, fontSize: 12 }}>{l}</div>
                  <div style={{ color: st.color, fontWeight: 800, fontSize: 24, fontFamily: "'JetBrains Mono',monospace" }}>{v}</div>
                </div>
              ))}
            </div>
            {(result.createdCategories.length > 0 || result.createdGrades.length > 0) && (
              <div style={{ fontSize: 13, color: C.text, lineHeight: 1.7 }}>
                {result.createdCategories.length > 0 && <div>Созданы категории: <b>{result.createdCategories.join(", ")}</b></div>}
                {result.createdGrades.length > 0 && <div>Созданы сорта: <b>{result.createdGrades.join(", ")}</b></div>}
              </div>
            )}
            {result.rows.length > 0 && (
              <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", maxHeight: 220, overflow: "auto" }}>
                {result.rows.slice(0, 50).map(r => (
                  <div key={r.row} style={{ display: "flex", gap: 8, padding: "3px 0" }}>
                    <span style={{ color: C.textMuted, fontFamily: "'JetBrains Mono',monospace", fontSize: 12, minWidth: 54 }}>стр. {r.row}</span>
                    <div>{r.messages.filter(m => m.level !== "info").map((m, i) => <Msg key={i} m={m} />)}</div>
                  </div>
                ))}
                {result.rows.length > 50 && <div style={{ color: C.textMuted, fontSize: 12, marginTop: 4 }}>…и ещё {result.rows.length - 50}. Полный список — в файле ошибок.</div>}
              </div>
            )}
            {error && <div style={{ color: C.redText, fontSize: 13 }}>{error}</div>}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
              {result.rows.length > 0 && <Btn onClick={() => downloadErrors(result.rows)}>Скачать список ошибок</Btn>}
              <Btn primary onClick={onClose}>Готово</Btn>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function plural(n, one, few, many) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}
