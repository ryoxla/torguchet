import { useState } from "react";
import robotoRegular from "./robotoRegular";
import robotoBold from "./robotoBold";
import { C, fmt, api, Btn, Card, PageHeader, SearchSelect, useIsMobile } from "../utils/globals";

/* ─── цвета по просрочке ─── */
const rowBg    = days => days > 60 ? C.redDim : days > 20 ? C.yellowDim : "transparent";
const dayColor = days => days > 60 ? C.redText  : days > 20 ? C.yellowText : C.text;

const fmtDate = d => {
  const s = String(d).slice(0, 10);
  const [y, m, dd] = s.split("-");
  return `${dd}.${m}.${y}`;
};

/* ════════════════════════════════════════════
   МОБИЛЬНАЯ КАРТОЧКА контрагента
   ════════════════════════════════════════════ */
function DebtorCardMobile({ cp, isDebtors, expanded, onToggle }) {
  const maxDays = Math.max(...cp.invoices.map(i => i.days_passed));
  const accentColor = isDebtors ? C.accentText : C.redText;

  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: 10, marginBottom: 8, overflow: "hidden"
    }}>
      <div
        onClick={onToggle}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 14px", cursor: "pointer", gap: 10,
          borderLeft: `3px solid ${accentColor}`
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontWeight: 700, fontSize: 14, color: C.text,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginBottom: 3
          }}>
            {cp.cp_name}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, color: C.textMuted }}>{cp.cp_category || "Без категории"}</span>
            <span style={{
              fontSize: 10, fontWeight: 600, background: C.bg,
              borderRadius: 4, padding: "1px 6px", color: C.textMuted
            }}>{cp.invoices.length} накл.</span>
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 16, color: accentColor }}>
            {fmt(Math.round(cp.total_debt))} ₽
          </div>
          <div style={{ fontSize: 10, color: dayColor(maxDays), marginTop: 2 }}>
            {maxDays > 60 ? `просрочено ${maxDays} дн.` : maxDays > 20 ? `${maxDays} дн.` : "в норме"}
          </div>
        </div>
        <div style={{ color: C.textMuted, fontSize: 8, marginLeft: 4 }}>
          {expanded ? "▼" : "▶"}
        </div>
      </div>

      {expanded && (
        <div style={{ borderTop: `1px solid ${C.border}` }}>
          {(() => {
            const sorted = [...cp.invoices].sort((a, b) => b.days_passed - a.days_passed);
            let cumulative = 0;
            return sorted.map(inv => {
              cumulative += inv.debt;
              return (
                <div key={inv.id} style={{
                  padding: "10px 14px", background: rowBg(inv.days_passed),
                  borderBottom: `1px solid ${C.border}`,
                  display: "grid", gridTemplateColumns: "1fr auto",
                  gap: "4px 12px", alignItems: "center"
                }}>
                  <div>
                    <div style={{ fontSize: 11, color: C.textDim, marginBottom: 2 }}>{fmtDate(inv.doc_date)}</div>
                    <div style={{ fontSize: 11, color: C.textMuted }}>Сумма: {fmt(Math.round(inv.amount))} ₽</div>
                    <div style={{ fontSize: 11, color: C.textMuted, marginTop: 1 }}>Нараст.: {fmt(Math.round(cumulative))} ₽</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 14, color: dayColor(inv.days_passed) }}>
                      {fmt(Math.round(inv.debt))} ₽
                    </div>
                    <span style={{
                      fontFamily: "monospace", fontWeight: 700, fontSize: 11,
                      color: dayColor(inv.days_passed),
                      background: inv.days_passed > 60 ? C.redDim : inv.days_passed > 20 ? C.yellowDim : C.bg,
                      padding: "2px 7px", borderRadius: 4, marginTop: 4, display: "inline-block",
                      border: `1px solid ${inv.days_passed > 60 ? C.redText : inv.days_passed > 20 ? C.yellowText : C.border}`
                    }}>{inv.days_passed} дн.</span>
                  </div>
                </div>
              );
            });
          })()}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════
   МОБИЛЬНЫЕ ФИЛЬТРЫ
   ════════════════════════════════════════════ */
function MobileFilters({ filterCategory, setFilterCategory, filterCp, setFilterCp, minDays, setMinDays, cpCategories, counterparties, onApply, loading }) {
  const [open, setOpen] = useState(false);
  const activeCount = [filterCategory, filterCp, minDays].filter(Boolean).length;
  const selStyle = {
    background: C.bg, border: `1px solid ${C.borderLight}`,
    color: C.text, borderRadius: 8, padding: "10px 12px",
    fontSize: 13, outline: "none", width: "100%",
    appearance: "none", WebkitAppearance: "none", fontFamily: "inherit"
  };
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, marginBottom: 12, overflow: "hidden" }}>
      <div onClick={() => setOpen(o => !o)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", cursor: "pointer" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>🔍 Фильтры</span>
          {activeCount > 0 && <span style={{ background: C.accent, color: "#fff", borderRadius: 10, fontSize: 10, fontWeight: 700, padding: "1px 7px" }}>{activeCount}</span>}
        </div>
        <span style={{ color: C.textMuted, fontSize: 8 }}>{open ? "▲" : "▼"}</span>
      </div>
      {open && (
        <div style={{ padding: "0 14px 14px", borderTop: `1px solid ${C.border}` }}>
          <div style={{ color: C.textMuted, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", margin: "12px 0 6px" }}>Категория контрагента</div>
          <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} style={selStyle}>
            <option value="">Все категории</option>
            {(cpCategories || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div style={{ color: C.textMuted, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", margin: "10px 0 6px" }}>Контрагент</div>
          <SearchSelect
            value={filterCp} onChange={v => setFilterCp(v)}
            options={[{ value: "", label: "Все контрагенты" }, ...(counterparties || []).filter(c => c.active || c.is_active).map(c => ({ value: String(c.id), label: c.name }))]}
            placeholder="Поиск контрагента..."
          />
          <div style={{ color: C.textMuted, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", margin: "10px 0 6px" }}>Просрочка старше (дней)</div>
          <input type="number" min="0" value={minDays} onChange={e => setMinDays(e.target.value)} placeholder="0" style={selStyle} />
          <button onClick={() => { onApply(); setOpen(false); }} disabled={loading}
            style={{ width: "100%", padding: "12px", marginTop: 14, background: C.accent, color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", opacity: loading ? 0.7 : 1 }}>
            {loading ? "Загрузка..." : "Применить"}
          </button>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════
   ГЛАВНЫЙ КОМПОНЕНТ
   ════════════════════════════════════════════ */
function DebtorsReport({ mode = "debtors", cpCategories = [], counterparties = [], onBack }) {
  const isDebtors = mode === "debtors";
  const title     = isDebtors ? "Дебиторы" : "Кредиторы";
  const endpoint  = isDebtors ? "/debtors-report" : "/creditors-report";

  const [data,           setData]           = useState([]);
  const [loading,        setLoading]        = useState(false);
  const [applied,        setApplied]        = useState(false);
  const [filterCategory, setFilterCategory] = useState("");
  const [filterCp,       setFilterCp]       = useState("");
  const [minDays,        setMinDays]        = useState("");
  const [expanded,       setExpanded]       = useState({});
  const [sortDir, setSortDir] = useState("asc");
  const toggleCpSort = () => setSortDir(d => d === "asc" ? "desc" : "asc");

  const isMobile = useIsMobile();

  const loadReport = () => {
    setLoading(true);
    const p = new URLSearchParams();
    if (filterCategory) p.set("category_id",     filterCategory);
    if (filterCp)       p.set("counterparty_id", filterCp);
    if (minDays)        p.set("min_days",         minDays);
    api(`${endpoint}?${p}`)
      .then(rows => { setData(rows); setApplied(true); })
      .catch(e => alert("Ошибка: " + e.message))
      .finally(() => setLoading(false));
  };

  const toggleExpand  = id => setExpanded(e => ({ ...e, [id]: !e[id] }));
  const totalDebt     = data.reduce((s, cp) => s + cp.total_debt, 0);
  const accentColor   = isDebtors ? C.accentText : C.redText;

  const handlePrint = () => {
    const rowColor2 = days => days > 60 ? "#ffd0d0" : days > 20 ? "#fff3cd" : "#fff";
    const rows = data.map(cp => {
      const sorted = [...cp.invoices].sort((a, b) => b.days_passed - a.days_passed);
      let cumulative = 0;
      const invRows = sorted.map(inv => {
        cumulative += inv.debt;
        return `<tr style="background:${rowColor2(inv.days_passed)}">
          <td></td>
          <td style="padding-left:24px;font-size:11px;color:#555;white-space:nowrap">${fmtDate(inv.doc_date)}</td>
          <td style="text-align:right;font-size:11px">${fmt(Math.round(inv.amount))}</td>
          <td style="text-align:right;font-size:11px;font-weight:bold">${fmt(Math.round(cumulative))}</td>
          <td style="text-align:right;font-size:11px;font-weight:bold">${inv.days_passed}</td>
        </tr>`;
      }).join("");
      return `<tr style="background:#f0f0f0;border-top:2px solid #ccc">
        <td style="font-weight:700;font-size:13px" colspan="2">${cp.cp_name} <span style="font-weight:400;font-size:11px;color:#777">${cp.cp_category || ""}</span></td>
        <td></td>
        <td style="text-align:right;font-weight:700;font-size:13px">${fmt(Math.round(cp.total_debt))}</td>
        <td style="text-align:right;font-size:11px;color:#777">${cp.invoices.length} накл.</td>
      </tr>${invRows}`;
    }).join("");

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
    <style>*{margin:0;padding:0;box-sizing:border-box;}@page{size:A4 portrait;margin:12mm;}
    html,body{width:100%;}
    body{font-family:Arial,sans-serif;font-size:12px;}
    h2{font-size:16px;text-align:center;margin-bottom:4px;}
    .subtitle{text-align:center;font-size:11px;color:#555;margin-bottom:16px;}
    table{width:100%;border-collapse:collapse;table-layout:fixed;}
    th{background:#e0e0e0;border:1px solid #ccc;padding:5px 8px;text-align:left;font-size:11px;}
    td{border:1px solid #ddd;padding:4px 8px;word-break:break-word;}
    tfoot td{background:#f8f8f8;font-weight:bold;border-top:2px solid #ccc;}
    @media print{html,body{margin:0;padding:0;}}</style></head><body>
    <h2>${title}</h2>
    <div class="subtitle">Сформировано: ${new Date().toLocaleDateString("ru-RU")}</div>
    <table>
    <colgroup>
      <col style="width:32%"/>
      <col style="width:16%"/>
      <col style="width:16%"/>
      <col style="width:16%"/>
      <col style="width:10%"/>
    </colgroup>
    <thead><tr><th>Контрагент</th><th>Дата</th><th style="text-align:right">Сумма</th><th style="text-align:right">Остаток долга</th><th style="text-align:right">Дней</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr><td colspan="4">Итого контрагентов: ${data.length}</td><td style="text-align:right">${fmt(Math.round(totalDebt))}</td></tr></tfoot>
    </table><script>window.onload=()=>{window.print();}<\/script></body></html>`;
    const w = window.open("", "_blank");
    w.document.write(html);
    w.document.close();
  };
const handlePDF = () => {
    const fmtNum = v => Number(v).toLocaleString("ru-RU", {minimumFractionDigits:2, maximumFractionDigits:2});

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

    pdf.addFileToVFS("Roboto-Regular.ttf", robotoRegular);
    pdf.addFileToVFS("Roboto-Bold.ttf", robotoBold);
    pdf.addFont("Roboto-Regular.ttf", "Roboto", "normal");
    pdf.addFont("Roboto-Bold.ttf",    "Roboto", "bold");

    const pageW = pdf.internal.pageSize.getWidth();

    // Заголовок
    pdf.setFont("Roboto", "bold");
    pdf.setFontSize(14);
    pdf.text(title, pageW / 2, 15, { align: "center" });

    pdf.setFont("Roboto", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(100);
    pdf.text(`Сформировано: ${new Date().toLocaleDateString("ru-RU")}`, pageW / 2, 21, { align: "center" });
    pdf.setTextColor(0);

    // Строки таблицы — стиль как в 1С (эталон)
    const body = [];

    // Строка "руб." под шапкой
    body.push([
      { content: "руб.", colSpan: 5, styles: { fontStyle: "italic", fontSize: 10, textColor: [80,80,80], fillColor: [255,255,255] } }
    ]);

    // Сортировка контрагентов по алфавиту
    const sortedCps = [...data].sort((a, b) => (a.cp_name || "").localeCompare(b.cp_name || "", "ru"));

    sortedCps.forEach(cp => {
      // Имя контрагента и общий долг встраиваются ПРЯМО в первую строку первой накладной
      const sorted = [...cp.invoices].sort((a, b) => new Date(a.doc_date) - new Date(b.doc_date));
      let cumulative = 0;
      sorted.forEach((inv, idx) => {
        cumulative += inv.debt;
        const firstRow = idx === 0;
        const lastRow  = idx === sorted.length - 1;
        body.push([
          {
            content: "",
            styles: { fillColor: [255,255,255], fontStyle: firstRow ? "bold" : "normal", fontSize: 8, textColor: 0 },
            _isLastOfCp: lastRow,
            ...(firstRow ? { _cpName: cp.cp_name, _cpTotal: fmtNum(cp.total_debt) } : {}),
          },
          { content: fmtDate(inv.doc_date),  styles: { halign: "right",  fontSize: 8, fillColor: [255,255,255], textColor: 0 }, _isLastOfCp: lastRow },
          { content: fmtNum(inv.amount),     styles: { halign: "right",  fontSize: 8, fillColor: [255,255,255], textColor: 0 }, _isLastOfCp: lastRow },
          { content: String(inv.days_passed),styles: { halign: "center", fontSize: 8, fillColor: [255,255,255], textColor: 0 }, _isLastOfCp: lastRow },
          { content: fmtNum(cumulative),     styles: { halign: "right",  fontSize: 8, fillColor: [255,255,255], textColor: 0 }, _isLastOfCp: lastRow },
        ]);
      });
    });

    pdf.autoTable({
      startY: 26,
      head: [[
        { content: "Наименование должника", styles: { halign: "left" } },
        { content: "Дата", styles: { halign: "right" } },
        { content: "Сумма", styles: { halign: "right" } },
        { content: "Просрочено дней", styles: { halign: "center" } },
        { content: "Итого", styles: { halign: "right" } },
      ]],
      body,
      foot: [[
        { content: `Итого контрагентов: ${data.length}`, colSpan: 4, styles: { fontStyle: "bold" } },
        { content: fmtNum(totalDebt), styles: { halign: "right", fontStyle: "bold" } },
      ]],
      columnStyles: {
        3: { halign: "center", cellWidth: 15 },
      },
      headStyles: { fillColor: [255,255,255], textColor: 0, fontSize: 8, fontStyle: "bold", font: "Roboto", lineColor: [0,0,0], lineWidth: 0.2 },
      footStyles: { fillColor: [255,255,255], textColor: 0, font: "Roboto", fontStyle: "bold", lineColor: [0,0,0], lineWidth: 0.2 },
      margin: { top: 10, left: 10, right: 10, bottom: 10 },
      showFoot: "lastPage",
      styles: { font: "Roboto", fontSize: 8, cellPadding: { top: 0.8, bottom: 0.8, left: 2, right: 2 }, overflow: "linebreak", lineColor: [180,180,180], lineWidth: 0.2 },
      tableLineColor: [0,0,0],
      tableLineWidth: 0.3,
      didDrawCell: (data) => {
        const raw = data.cell.raw;
        // Рисуем чёрную толстую линию под последней строкой каждого контрагента
        // (поверх стандартной серой границы) — для визуального разделения блоков
        if (data.section === "body" && raw && typeof raw === "object" && raw._isLastOfCp) {
          const { x, y, width, height } = data.cell;
          pdf.setDrawColor(0, 0, 0);
          pdf.setLineWidth(0.5);
          pdf.line(x, y + height, x + width, y + height);
        }
        // Имя контрагента + сумма долга в первой ячейке первой строки контрагента
        if (data.column.index === 0 && raw && typeof raw === "object" && raw._cpName !== undefined) {
          const { x, y, width, height } = data.cell;
          const padX = 3;
          pdf.setFont("Roboto", "bold");
          pdf.setFontSize(8);
          pdf.setTextColor(0);
          pdf.text(raw._cpName, x + padX, y + height / 2, { baseline: "middle" });
          pdf.text(raw._cpTotal, x + width - padX, y + height / 2, { align: "right", baseline: "middle" });
        }
      },
    });

    const blob = pdf.output("blob");
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
  };

  const selStyle = { background: C.bg, border: `1px solid ${C.borderLight}`, color: C.text, borderRadius: 6, padding: "7px 10px", fontSize: 8, outline: "none" };
  const inpStyle = { ...selStyle, width: 100 };

  /* ════ МОБИЛЬНЫЙ РЕНДЕР ════ */
  if (isMobile) return (
    <div style={{ padding: "12px 12px 48px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        {onBack && (
          <button onClick={onBack} style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: "8px 12px", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>←</button>
        )}
        <div>
          <div style={{ fontWeight: 700, fontSize: 18, color: C.text }}>{title}</div>
          <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>
            {isDebtors ? "Задолженность покупателей" : "Задолженность перед поставщиками"}
          </div>
        </div>
      </div>

      <MobileFilters
        filterCategory={filterCategory} setFilterCategory={setFilterCategory}
        filterCp={filterCp}             setFilterCp={setFilterCp}
        minDays={minDays}               setMinDays={setMinDays}
        cpCategories={cpCategories}     counterparties={counterparties}
        onApply={loadReport}            loading={loading}
      />

      {!applied && !loading && (
        <div style={{ padding: "40px 20px", textAlign: "center", color: C.textDim, fontSize: 14 }}>
          Раскройте фильтры и нажмите «Применить»
        </div>
      )}
      {loading && <div style={{ padding: "40px 20px", textAlign: "center", color: C.textMuted }}>Загрузка...</div>}

      {applied && !loading && (<>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.accentText}`, borderRadius: 10, padding: "10px 14px" }}>
            <div style={{ color: C.textMuted, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>Контрагентов</div>
            <div style={{ fontFamily: "monospace", fontSize: 17, fontWeight: 700, color: C.accentText }}>{data.length} шт.</div>
          </div>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderLeft: `3px solid ${accentColor}`, borderRadius: 10, padding: "10px 14px" }}>
            <div style={{ color: C.textMuted, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>Задолженность</div>
            <div style={{ fontFamily: "monospace", fontSize: 17, fontWeight: 700, color: accentColor }}>{fmt(Math.round(totalDebt))} ₽</div>
          </div>
        </div>

        {data.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
            <button onClick={handlePrint} style={{ padding: "10px", background: "transparent", border: `1px solid ${C.borderLight}`, color: C.textMuted, borderRadius: 8, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
              🖨 Печать
            </button>
            <button onClick={handlePDF} style={{ padding: "10px", background: "transparent", border: `1px solid ${C.accentText}`, color: C.accentText, borderRadius: 8, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
              📄 PDF
            </button>
          </div>
        )}

        {data.length === 0 && <div style={{ padding: "40px 20px", textAlign: "center", color: C.textDim, fontSize: 14 }}>Задолженностей нет</div>}

        {data.map(cp => (
          <DebtorCardMobile key={cp.cp_id} cp={cp} isDebtors={isDebtors} expanded={!!expanded[cp.cp_id]} onToggle={() => toggleExpand(cp.cp_id)} />
        ))}

        {data.length > 0 && (
          <div style={{ marginTop: 4, padding: "12px 14px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: C.textDim, fontSize: 8 }}>Итого: {data.length} контрагентов</span>
            <span style={{ fontFamily: "monospace", fontWeight: 700, color: accentColor }}>{fmt(Math.round(totalDebt))} ₽</span>
          </div>
        )}
      </>)}
    </div>
  );

  /* ════ ДЕСКТОПНЫЙ РЕНДЕР (оригинал без изменений) ════ */
  const sortedData = [...data].sort((a, b) => {
    const av = (a.cp_name||"").toLowerCase();
    const bv = (b.cp_name||"").toLowerCase();
    return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
  });

  return (
    <div style={{ padding: "28px 32px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        {onBack && <Btn onClick={onBack}>← Назад</Btn>}
        <PageHeader
          title={title}
          subtitle={isDebtors ? "Задолженность покупателей по расходным накладным" : "Задолженность перед поставщиками по приходным накладным"}
        />
      </div>

      <Card style={{ padding: "14px 20px", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ color: C.textMuted, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Категория контрагента</div>
            <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} style={{ ...selStyle, width: 200 }}>
              <option value="">Все категории</option>
              {(cpCategories || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <div style={{ color: C.textMuted, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Старше (дней)</div>
            <input type="number" min="0" value={minDays} onChange={e => setMinDays(e.target.value)} placeholder="0" style={inpStyle} />
          </div>
          <div>
            <div style={{ color: C.textMuted, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Контрагент</div>
            <div style={{ width: 220 }}>
              <SearchSelect
                value={filterCp} onChange={v => setFilterCp(v)}
                options={[{ value: "", label: "Все контрагенты" }, ...(counterparties || []).filter(c => c.active || c.is_active).map(c => ({ value: String(c.id), label: c.name }))]}
                placeholder="Поиск контрагента..."
              />
            </div>
          </div>
          <Btn primary onClick={loadReport}>Применить</Btn>
          {applied && <Btn onClick={handlePrint}>🖨 Печать</Btn>}
          {applied && <Btn onClick={handlePDF}>📄 PDF</Btn>}
        </div>
      </Card>

      {!applied && !loading && (
        <Card style={{ padding: 48, textAlign: "center", color: C.textDim, fontSize: 14 }}>Установите фильтры и нажмите «Применить»</Card>
      )}
      {loading && <Card style={{ padding: 48, textAlign: "center", color: C.textMuted }}>Загрузка...</Card>}

      {applied && !loading && (<>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2,auto)", gap: 12, marginBottom: 16, justifyContent: "start" }}>
          {[
            { l: "Контрагентов с долгом", v: data.length + " шт.", c: C.text },
            { l: "Общая задолженность",   v: fmt(Math.round(totalDebt)) + " ₽", c: accentColor },
          ].map((k, i) => (
            <Card key={i} style={{ padding: "12px 20px", borderLeft: `3px solid ${k.c}` }}>
              <div style={{ color: C.textMuted, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{k.l}</div>
              <div style={{ color: k.c, fontSize: 20, fontWeight: 700, fontFamily: "monospace" }}>{k.v}</div>
            </Card>
          ))}
        </div>

        <Card>
          <div className="ct-wrap">
            <table className="ct">
              <thead>
                <tr>
                  <th style={{ width: 24 }}></th>
                  <th onClick={toggleCpSort} style={{cursor:"pointer",userSelect:"none"}}>Контрагент{sortDir==="asc"?" ▲":" ▼"}</th>
                  <th>Тип</th>
                  <th>Дата</th>
                  <th className="r">Сумма</th>
                  <th className="r">Остаток долга</th>
                  <th className="r">Прошло дней</th>
                </tr>
              </thead>
              <tbody>
                {data.length === 0 && (
                  <tr><td colSpan={7} style={{ padding: 32, textAlign: "center", color: C.textDim }}>Задолженностей нет</td></tr>
                )}
                {sortedData.map(cp => (<>
                  <tr key={cp.cp_id} onClick={() => toggleExpand(cp.cp_id)} style={{ cursor: "pointer", background: C.surface, borderTop: `2px solid ${C.border}` }}>
                    <td style={{ textAlign: "center", color: C.textMuted, fontSize: 11 }}>{expanded[cp.cp_id] ? "▼" : "▶"}</td>
                    <td style={{ fontWeight: 700, color: C.text }}>{cp.cp_name}</td>
                    <td colSpan={3} style={{ color: C.textMuted, fontSize: 11 }}>{cp.cp_category || "—"}</td>
                    <td className="r" style={{ fontWeight: 700, color: accentColor, fontFamily: "monospace" }}>{fmt(Math.round(cp.total_debt))} ₽</td>
                    <td className="r" style={{ color: C.textMuted, fontSize: 11 }}>{cp.invoices.length} доп.</td>
                  </tr>
                  {expanded[cp.cp_id] && (() => {
                    const sorted = [...cp.invoices].sort((a, b) => b.days_passed - a.days_passed);
                    let cumulative = 0;
                    return sorted.map(inv => {
                      cumulative += inv.debt;
                      return (
                        <tr key={inv.id} style={{ background: rowBg(inv.days_passed) }}>
                          <td></td>
                          <td></td>
                          <td style={{ padding: "4px 8px" }}>
                            <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 4,
                              background: inv.doc_type === 'payment_out' ? C.infoSoft : inv.doc_type === 'payment_in' ? C.violetSoft : C.greenSoft,
                              color: inv.doc_type === 'payment_out' ? C.blueBright : inv.doc_type === 'payment_in' ? C.violetBright : C.greenBright }}>
                              {inv.doc_type === 'payment_out' ? "Платёж ↑" : inv.doc_type === 'payment_in' ? "Платёж ↓" : "Накладная"}
                            </span>
                            <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2, fontFamily: "monospace" }}>{inv.number}</div>
                          </td>
                          <td style={{ fontSize: 8, color: C.textDim }}>{fmtDate(inv.doc_date)}</td>
                          <td className="r" style={{ fontFamily: "monospace", fontSize: 8, color: C.textMuted }}>{fmt(Math.round(inv.amount))} ₽</td>
                          <td className="r" style={{ fontFamily: "monospace", fontWeight: 700, color: dayColor(inv.days_passed) }}>{fmt(Math.round(cumulative))} ₽</td>
                          <td className="r">
                            <span style={{ fontFamily: "monospace", fontWeight: 700, color: dayColor(inv.days_passed), background: inv.days_passed > 60 ? C.redDim : inv.days_passed > 20 ? C.yellowDim : "transparent", padding: "2px 8px", borderRadius: 4 }}>
                              {inv.days_passed}
                            </span>
                          </td>
                        </tr>
                      );
                    });
                  })()}
                </>))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={5} style={{ color: C.textDim, fontSize: 8, padding: "8px 10px" }}>Итого контрагентов: {data.length}</td>
                  <td className="r" style={{ fontFamily: "monospace", fontWeight: 700, color: accentColor }}>{fmt(Math.round(totalDebt))} ₽</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      </>)}
    </div>
  );
}

export default DebtorsReport;
