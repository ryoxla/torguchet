import { useState, useMemo, useEffect } from "react";
import { C, fmt, uniq, api, Card, SearchSelect, fmtQty, useIsMobile } from "../utils/globals";

/* ════════════════════════════════════════════
   МОБИЛЬНЫЙ АККОРДЕОН ФИЛЬТРОВ
   ════════════════════════════════════════════ */
function MobileStockFilters({ filters, setF, resetFilters, hasF, stockData }) {
  const [open, setOpen] = useState(false);
  const activeCount = Object.values(filters).filter(Boolean).length;
  const mSel = { background: C.bg, border: `1px solid ${C.borderLight}`, color: C.text, borderRadius: 8, padding: "9px 11px", fontSize: 13, outline: "none", width: "100%", appearance: "none", WebkitAppearance: "none", fontFamily: "inherit" };

  const selF = (k, label, opts) => (
    <div style={{ marginBottom: 10 }}>
      <div style={{ color: C.textMuted, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 5 }}>{label}</div>
      <select value={filters[k]} onChange={e => setF(k, e.target.value)} style={mSel}>
        <option value="">Все</option>
        {opts.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );

  const selFSearch = (k, label, opts) => (
    <div style={{ marginBottom: 10 }}>
      <div style={{ color: C.textMuted, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 5 }}>{label}</div>
      <SearchSelect value={filters[k]} onChange={v => setF(k, v)} options={[{ value: "", label: "Все" }, ...opts.map(o => ({ value: o, label: o }))]} placeholder="Все"/>
    </div>
  );

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, marginBottom: 12, overflow: "hidden" }}>
      <div onClick={() => setOpen(o => !o)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 14px", cursor: "pointer" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 600, color: C.text }}>
          🔍 Фильтры
          {activeCount > 0 && <span style={{ background: C.accent, color: "#fff", borderRadius: 10, fontSize: 10, fontWeight: 700, padding: "1px 7px" }}>{activeCount}</span>}
        </div>
        <span style={{ color: C.textMuted, fontSize: 12 }}>{open ? "▲" : "▼"}</span>
      </div>
      {open && (
        <div style={{ padding: "0 14px 14px", borderTop: `1px solid ${C.border}` }}>
          <div style={{ marginTop: 12 }}>
            {selF("warehouse", "Склад", uniq(stockData, "warehouse"))}
            {selFSearch("product", "Товар", uniq(stockData, "product"))}
            {selF("grade", "Сорт", uniq(stockData, "grade"))}
            {selFSearch("supplier", "Поставщик", uniq(stockData, "supplier"))}
            {selF("batch", "Партия", uniq(stockData, "batch"))}
            {selF("country", "Страна", uniq(stockData, "country"))}
          </div>
          {hasF && (
            <button onClick={resetFilters} style={{ width: "100%", padding: "9px", background: "transparent", border: `1px solid ${C.red}`, color: C.redText, borderRadius: 7, cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit" }}>
              Сбросить фильтры
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════
   МОБИЛЬНАЯ КАРТОЧКА — группа товара
   ════════════════════════════════════════════ */
function GroupCardMobile({ g, expanded, onToggle }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, marginBottom: 8, overflow: "hidden" }}>
      <div onClick={onToggle} style={{ padding: "12px 14px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, borderLeft: `3px solid ${g.isLow ? C.yellowText : C.accentText}` }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginBottom: 3 }}>{g.product}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 10, color: C.textMuted }}>{g.warehouses} склад{g.warehouses === 1 ? "" : g.warehouses < 5 ? "а" : "ов"}</span>
            <span style={{ fontSize: 10, color: C.textMuted }}>·</span>
            <span style={{ fontSize: 10, color: C.textMuted }}>{g.batches} парт{g.batches === 1 ? "ия" : g.batches < 5 ? "ии" : "ий"}</span>
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 16, color: C.accentText }}>{fmtQty(g.qty)}</div>
          <div style={{ fontSize: 10, color: C.textDim, marginTop: 2 }}>{g.unit}</div>
        </div>
        <div style={{ color: C.textMuted, fontSize: 12, marginLeft: 2 }}>{expanded ? "▼" : "▶"}</div>
      </div>

      {expanded && (
        <div style={{ borderTop: `1px solid ${C.border}` }}>
          {g.rows.map(row => (
            <div key={row.id} style={{ padding: "9px 14px", borderBottom: `1px solid ${C.border}`, display: "grid", gridTemplateColumns: "1fr auto", gap: "3px 10px" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                  <span style={{ fontSize: 12, color: C.text }}>{row.warehouse}</span>
                  <span style={{ fontFamily: "monospace", fontSize: 10, color: C.accentText, background: C.accentDim, padding: "1px 6px", borderRadius: 4 }}>{row.batch}</span>
                </div>
                <div style={{ fontSize: 11, color: C.textDim }}>{row.grade} · {row.country}</div>
                <div style={{ fontSize: 11, color: C.textDim }}>{row.supplier}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: "monospace", fontWeight: 600, fontSize: 13, color: C.text }}>{fmt(row.qty)} {row.unit}</div>
                <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>{fmt(row.cost)} ₽</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════
   МОБИЛЬНАЯ КАРТОЧКА — детальная строка
   ════════════════════════════════════════════ */
function DetailRowMobile({ row }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px", marginBottom: 7 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: C.text, marginBottom: 3 }}>{row.product}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, color: C.textMuted }}>{row.warehouse}</span>
            <span style={{ fontFamily: "monospace", fontSize: 10, color: C.accentText, background: C.accentDim, padding: "1px 6px", borderRadius: 4 }}>{row.batch}</span>
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 15, color: C.text }}>{fmt(row.qty)}</div>
          <div style={{ fontSize: 10, color: C.textDim }}>{row.unit}</div>
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 6, borderTop: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 11, color: C.textDim }}>{row.grade} · {row.country} · {row.supplier}</div>
        <div style={{ fontSize: 12, color: C.textMuted, fontFamily: "monospace" }}>{fmt(row.cost)} ₽</div>
      </div>
    </div>
  );
}

function Stock() {
  const [stockData, setStockData] = useState([]);
  const [mode,      setMode]      = useState("grouped");
  const [filters,   setFilters]   = useState({ warehouse: "", product: "", grade: "", supplier: "", batch: "", country: "" });
  const [showZero,  setShowZero]  = useState(false);
  const [expanded,  setExpanded]  = useState({});

  const isMobile = useIsMobile();
  const setF = (k, v) => setFilters(f => ({ ...f, [k]: v }));

  useEffect(() => {
    api('/stock').then(rows => {
      setStockData(rows.map(r => ({
        id:        r.id,
        warehouse: r.warehouse_name || '—',
        product:   r.product_name   || '—',
        batch:     r.batch_number ? '#' + r.batch_number : '—',
        grade:     r.grade_name   || '—',
        country:   r.country_name || '—',
        supplier:  r.supplier_name|| '—',
        unit:      r.unit_short   || 'шт',
        qty:       Number(r.qty)         || 0,
        cost:      Number(r.cost_price)  || 0,
      })));
    }).catch(() => {});
  }, []);

  const filtered = useMemo(() => stockData.filter(row => {
    if (!showZero && row.qty === 0) return false;
    return Object.entries(filters).every(([k, v]) => !v || row[k] === v);
  }), [filters, showZero, stockData]);

  const groups = useMemo(() => {
    const m = {};
    filtered.forEach(r => { if (!m[r.product]) m[r.product] = []; m[r.product].push(r); });
    return Object.entries(m).map(([product, rows]) => ({
      product, rows,
      qty:        rows.reduce((s, r) => s + r.qty, 0),
      batches:    [...new Set(rows.map(r => r.batch))].length,
      warehouses: [...new Set(rows.map(r => r.warehouse))].length,
      unit:       rows[0].unit,
      isLow:      rows.some(r => r.qty < 500),
    }));
  }, [filtered]);

  const handlePrint = () => {
    const fmtA = v => (Math.round(Number(v) || 0)).toLocaleString("ru-RU");
    const fmtQ = v => { const n = parseFloat(v) || 0; return n % 1 === 0 ? n.toLocaleString("ru-RU") : n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 3 }); };
    const now = new Date().toLocaleDateString("ru-RU");
    const warehouseLabel = filters.warehouse ? filters.warehouse : "Все склады";
    const totalQty = filtered.reduce((s, r) => s + r.qty, 0);

    const rows = groups.map(g => `
      <tr class="group-row">
        <td><b>${g.product}</b></td>
        <td class="r">${g.unit}</td>
        <td class="r"><b>${fmtQ(g.qty)}</b></td>
      </tr>`).join("");

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Остатки на складе</title><style>*{margin:0;padding:0;box-sizing:border-box;}@page{size:A4 portrait;margin:10mm 12mm;}body{font-family:Arial,sans-serif;font-size:8px;color:#000;}.header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1.5px solid #000;padding-bottom:5px;margin-bottom:7px;}.header h1{font-size:12px;font-weight:700;margin-bottom:2px;}.header p{font-size:8px;color:#444;margin-top:2px;}table{width:100%;border-collapse:collapse;table-layout:fixed;}th{border:0.5px solid #999;padding:3px 4px;font-size:7px;font-weight:700;background:#f0f0f0;white-space:nowrap;overflow:hidden;}th.r{text-align:right;}td{border:0.5px solid #ddd;padding:2px 4px;font-size:8px;vertical-align:top;overflow:hidden;}td.r{text-align:right;white-space:nowrap;}tr.group-row td{background:#f0f0f0;font-size:8px;border-bottom:0.5px solid #aaa;border-top:0.5px solid #aaa;}tr.tot td{background:#e8e8e8;font-weight:700;font-size:8px;border-top:1.5px solid #000;}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}</style></head><body><div class="header"><div><h1>ОСТАТКИ НА СКЛАДЕ</h1><p>${warehouseLabel}${filters.product ? " · Товар: " + filters.product : ""}${filters.grade ? " · Сорт: " + filters.grade : ""}${filters.supplier ? " · Поставщик: " + filters.supplier : ""}${filters.country ? " · Страна: " + filters.country : ""}</p></div><div style="text-align:right"><p>Составлен: ${now}</p><p>Позиций: ${filtered.length} · Товаров: ${groups.length}</p></div></div><table><colgroup><col/><col style="width:30px"/><col style="width:55px"/></colgroup><thead><tr><th>Товар</th><th class="r">Ед.</th><th class="r">Кол-во</th></tr></thead><tbody>${rows}<tr class="tot"><td colspan="2" style="text-align:right">ИТОГО:</td><td class="r">${fmtQ(totalQty)}</td></tr></tbody></table><script>window.onload=()=>{window.print();}<\/script></body></html>`;
    const w = window.open("", "_blank", "width=900,height=1100");
    w.document.write(html); w.document.close();
  };

  const hasF = Object.values(filters).some(v => v);
  const tQty = filtered.reduce((s, r) => s + r.qty, 0);
  const resetFilters = () => setFilters({ warehouse: "", product: "", grade: "", supplier: "", batch: "", country: "" });

  /* ════ МОБИЛЬНЫЙ РЕНДЕР ════ */
  if (isMobile) return (
    <div style={{ padding: "12px 12px 48px" }}>

      {/* Заголовок */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 18, color: C.text }}>Остатки на складе</div>
          <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>{filtered.length} позиций</div>
        </div>
        <button onClick={handlePrint} style={{ padding: "7px 12px", background: "transparent", border: `1px solid ${C.borderLight}`, color: C.textMuted, borderRadius: 7, cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit" }}>🖨</button>
      </div>

      {/* Фильтры */}
      <MobileStockFilters filters={filters} setF={setF} resetFilters={resetFilters} hasF={hasF} stockData={stockData}/>

      {/* Активные фильтры-чипы */}
      {hasF && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
          {Object.entries(filters).filter(([, v]) => v).map(([k, v]) => (
            <span key={k} onClick={() => setF(k, "")} style={{ background: C.accentDim, color: C.accentText, padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>{v} ×</span>
          ))}
        </div>
      )}

      {/* Тоггл нулевых остатков */}
      <div onClick={() => setShowZero(v => !v)} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: 12 }}>
        <div style={{ width: 32, height: 18, borderRadius: 9, background: showZero ? C.green : C.border, position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
          <div style={{ width: 14, height: 14, borderRadius: "50%", background: "#fff", position: "absolute", top: 2, left: showZero ? 16 : 2, transition: "left 0.2s" }}/>
        </div>
        <span style={{ color: C.textMuted, fontSize: 12 }}>Показывать нулевые остатки</span>
      </div>

      {/* Переключатель режима */}
      <div style={{ display: "flex", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden", marginBottom: 12 }}>
        {[{ id: "grouped", l: "◈ По товарам" }, { id: "detail", l: "≡ Детально" }].map(m => (
          <button key={m.id} onClick={() => setMode(m.id)} style={{ flex: 1, padding: "8px 10px", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, background: mode === m.id ? C.accent : "transparent", color: mode === m.id ? "#fff" : C.textMuted, fontFamily: "inherit" }}>{m.l}</button>
        ))}
      </div>

      {/* KPI */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.text}`, borderRadius: 10, padding: "10px 14px" }}>
          <div style={{ color: C.textMuted, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>Позиций</div>
          <div style={{ fontFamily: "monospace", fontSize: 17, fontWeight: 700 }}>{filtered.length}</div>
        </div>
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.accentText}`, borderRadius: 10, padding: "10px 14px" }}>
          <div style={{ color: C.textMuted, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>Всего единиц</div>
          <div style={{ fontFamily: "monospace", fontSize: 17, fontWeight: 700, color: C.accentText }}>{fmt(tQty)} ед.</div>
        </div>
      </div>

      {/* Список */}
      {mode === "grouped" ? (
        groups.length === 0
          ? <div style={{ padding: "40px 20px", textAlign: "center", color: C.textDim, fontSize: 14 }}>Нет данных</div>
          : groups.map(g => (
              <GroupCardMobile key={g.product} g={g} expanded={!!expanded[g.product]} onToggle={() => setExpanded(e => ({ ...e, [g.product]: !e[g.product] }))}/>
            ))
      ) : (
        filtered.length === 0
          ? <div style={{ padding: "40px 20px", textAlign: "center", color: C.textDim, fontSize: 14 }}>Нет данных</div>
          : filtered.map(row => <DetailRowMobile key={row.id} row={row}/>)
      )}

      {(mode === "grouped" ? groups.length : filtered.length) > 0 && (
        <div style={{ marginTop: 4, padding: "12px 14px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, color: C.textDim, fontSize: 12, textAlign: "center" }}>
          Товаров: {groups.length} · Позиций: {filtered.length}
        </div>
      )}
    </div>
  );

  /* ════ ДЕСКТОПНЫЙ РЕНДЕР (оригинал без изменений) ════ */
  const selF = (k, label, opts) => (
    <div>
      <label style={{ color: C.textMuted, fontSize: 11, display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</label>
      <select value={filters[k]} onChange={e => setF(k, e.target.value)}
        style={{ background: C.bg, border: `1px solid ${C.borderLight}`, color: filters[k] ? C.text : C.textMuted, borderRadius: 6, padding: "7px 10px", fontSize: 13, outline: "none", width: "100%" }}>
        <option value="">Все</option>
        {opts.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );

  const selFSearch = (k, label, opts) => (
    <div>
      <label style={{ color: C.textMuted, fontSize: 11, display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</label>
      <SearchSelect value={filters[k]} onChange={v => setF(k, v)} options={[{ value: "", label: "Все" }, ...opts.map(o => ({ value: o, label: o }))]} placeholder="Все"/>
    </div>
  );

  return (
    /* центрирующая обёртка */
    <div style={{ display: "flex", justifyContent: "center", padding: "28px 24px" }}>
      <div style={{ width: "100%", maxWidth: 1100 }}>

        {/* ── Шапка ── */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0, color: C.text, fontSize: 22, fontWeight: 700, letterSpacing: "-0.5px" }}>Остатки на складе</h1>
            <div style={{ color: C.textMuted, fontSize: 13, marginTop: 4 }}>{filtered.length} позиций · данные в исходных единицах</div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }} onClick={() => setShowZero(v => !v)}>
              <div style={{ width: 36, height: 20, borderRadius: 10, background: showZero ? C.green : C.border, position: "relative", transition: "background 0.2s" }}>
                <div style={{ width: 16, height: 16, borderRadius: "50%", background: "#fff", position: "absolute", top: 2, left: showZero ? 18 : 2, transition: "left 0.2s" }}/>
              </div>
              <span style={{ color: C.textMuted, fontSize: 13 }}>Нулевые остатки</span>
            </div>
            <div style={{ display: "flex", border: `1px solid ${C.borderLight}`, borderRadius: 6, overflow: "hidden" }}>
              {[{ id: "grouped", l: "◈ По товарам" }, { id: "detail", l: "≡ Детально" }].map(m => (
                <button key={m.id} onClick={() => setMode(m.id)} style={{ padding: "7px 14px", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, background: mode === m.id ? C.accent : C.surface, color: mode === m.id ? "#fff" : C.textMuted }}>{m.l}</button>
              ))}
            </div>
            <button onClick={handlePrint} style={{ padding: "7px 16px", background: "transparent", border: `1px solid ${C.borderLight}`, color: C.textMuted, borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>🖨 Печать</button>
          </div>
        </div>

        {/* ── Фильтры ── */}
        <Card style={{ padding: 16, marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 12, marginBottom: hasF ? 12 : 0 }}>
            {selF("warehouse", "Склад", uniq(stockData, "warehouse"))}
            {selFSearch("product", "Товар", uniq(stockData, "product"))}
            {selF("grade", "Сорт", uniq(stockData, "grade"))}
            {selFSearch("supplier", "Поставщик", uniq(stockData, "supplier"))}
            {selF("batch", "Партия", uniq(stockData, "batch"))}
            {selF("country", "Страна", uniq(stockData, "country"))}
          </div>
          {hasF && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ color: C.textDim, fontSize: 12 }}>Фильтры:</span>
              {Object.entries(filters).filter(([, v]) => v).map(([k, v]) => (
                <span key={k} onClick={() => setF(k, "")} style={{ background: C.accentDim, color: C.accentText, padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{v} ×</span>
              ))}
              <button onClick={resetFilters}
                style={{ background: "none", border: "none", color: C.redText, fontSize: 12, cursor: "pointer", fontWeight: 600 }}>Сбросить</button>
            </div>
          )}
        </Card>

        {/* ── KPI ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 12, marginBottom: 16 }}>
          {[{ l: "Позиций", v: filtered.length, c: C.text }, { l: "Всего единиц", v: fmt(tQty) + " ед.", c: C.accentText }].map((s, i) => (
            <Card key={i} style={{ padding: "14px 16px" }}>
              <div style={{ color: C.textMuted, fontSize: 11, marginBottom: 6 }}>{s.l}</div>
              <div style={{ color: s.c, fontSize: 18, fontWeight: 700 }}>{s.v}</div>
            </Card>
          ))}
        </div>

        {/* ── Таблица ── */}
        {mode === "detail" ? (
          <Card><div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%" }}>
              <thead><tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {["Склад", "Товар", "Партия", "Сорт", "Страна", "Поставщик", "Ед.", "Остаток", "Себест."].map((h, i) => (
                  <th key={i} style={{ padding: "10px 14px", textAlign: i >= 6 ? "right" : "left", color: C.textMuted, fontSize: 11, fontWeight: 600, textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {filtered.map(row => (
                  <tr key={row.id} style={{ borderBottom: `1px solid ${C.border}` }}
                    onMouseEnter={e => e.currentTarget.style.background = C.surfaceHover}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <td style={{ padding: "10px 14px", fontSize: 13 }}>{row.warehouse}</td>
                    <td style={{ padding: "10px 14px", fontSize: 13 }}>{row.product}</td>
                    <td style={{ padding: "10px 14px" }}><span style={{ color: C.accentText, fontFamily: "monospace", fontSize: 12 }}>{row.batch}</span></td>
                    <td style={{ padding: "10px 14px", color: C.text, fontSize: 13 }}>{row.grade}</td>
                    <td style={{ padding: "10px 14px", color: C.text, fontSize: 13 }}>{row.country}</td>
                    <td style={{ padding: "10px 14px", color: C.text, fontSize: 13 }}>{row.supplier}</td>
                    <td style={{ padding: "10px 14px", textAlign: "right", color: C.text, fontSize: 12 }}>{row.unit}</td>
                    <td style={{ padding: "10px 14px", textAlign: "right" }}><span style={{ color: C.text, fontWeight: 600 }}>{fmt(row.qty)}</span></td>
                    <td style={{ padding: "10px 14px", textAlign: "right", color: C.text, fontSize: 12 }}>{fmt(row.cost)} ₽</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div></Card>
        ) : (
          <Card>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%" }}>
                <thead><tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  {["Товар", "Партий", "Складов", "Ед.", "Остаток", ""].map((h, i) => (
                    <th key={i} style={{ padding: "10px 14px", textAlign: i >= 3 ? "right" : "left", color: C.textMuted, fontSize: 11, fontWeight: 600, textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {groups.map(g => {
                    const exp = expanded[g.product];
                    return (
                      <>
                        <tr key={g.product} onClick={() => setExpanded(e => ({ ...e, [g.product]: !e[g.product] }))}
                          style={{ borderBottom: `1px solid ${C.border}`, cursor: "pointer", background: exp ? C.rowOpen : "transparent" }}
                          onMouseEnter={e => e.currentTarget.style.background = exp ? C.rowOpen : C.surfaceHover}
                          onMouseLeave={e => e.currentTarget.style.background = exp ? C.rowOpen : "transparent"}>
                          <td style={{ padding: "12px 14px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <span style={{ color: C.textDim, fontSize: 13, display: "inline-block", transition: "transform 0.2s", transform: exp ? "rotate(90deg)" : "none" }}>▶</span>
                              <span style={{ color: C.text, fontWeight: 600, fontSize: 13 }}>{g.product}</span>
                            </div>
                          </td>
                          <td style={{ padding: "12px 14px", textAlign: "right", color: C.text, fontSize: 13 }}>{g.batches}</td>
                          <td style={{ padding: "12px 14px", textAlign: "right", color: C.text, fontSize: 13 }}>{g.warehouses}</td>
                          <td style={{ padding: "12px 14px", textAlign: "right", color: C.text, fontSize: 12 }}>{g.unit}</td>
                          <td style={{ padding: "12px 14px", textAlign: "right" }}><span style={{ color: C.accentText, fontWeight: 700, fontSize: 14 }}>{fmtQty(g.qty)}</span></td>
                          <td style={{ padding: "12px 14px", color: C.textDim, fontSize: 12 }}>{exp ? "↑ Свернуть" : "↓ Детали"}</td>
                        </tr>
                        {exp && g.rows.map(row => (
                          <tr key={row.id} style={{ borderBottom: `1px solid ${C.border}`, background: C.rowSub }}
                            onMouseEnter={e => e.currentTarget.style.background = C.rowSubHover}
                            onMouseLeave={e => e.currentTarget.style.background = C.rowSub}>
                            <td style={{ padding: "9px 14px 9px 44px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ color: C.textDim }}>└</span>
                                <span style={{ color: C.textMuted, fontSize: 12 }}>{row.warehouse}</span>
                                <span style={{ color: C.accentText, fontFamily: "monospace", fontSize: 11, background: C.accentDim, padding: "1px 6px", borderRadius: 4 }}>{row.batch}</span>
                                <span style={{ color: C.textDim, fontSize: 12 }}>{row.grade} · {row.country}</span>
                              </div>
                            </td>
                            <td colSpan={2} style={{ padding: "9px 14px", textAlign: "right", color: C.textDim, fontSize: 12 }}>{row.supplier}</td>
                            <td style={{ padding: "9px 14px", textAlign: "right", color: C.textDim, fontSize: 12 }}>{row.unit}</td>
                            <td style={{ padding: "9px 14px", textAlign: "right" }}><span style={{ fontWeight: 600, fontSize: 13 }}>{fmt(row.qty)}</span></td>
                            <td style={{ padding: "9px 14px", textAlign: "right", color: C.textDim, fontSize: 12 }}>{fmt(row.cost)} ₽</td>
                          </tr>
                        ))}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ padding: "10px 14px", borderTop: `1px solid ${C.border}`, color: C.textDim, fontSize: 12 }}>Товаров: {groups.length} · Позиций: {filtered.length}</div>
          </Card>
        )}

      </div>
    </div>
  );
}

export default Stock;
