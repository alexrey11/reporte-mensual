import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  db, formatearFecha, formatearFechaCorta, formatearHora,
  nombreMes, type Campo, type Modulo, type Registro,
} from '@/lib/db';

/* =========================================================
   HELPERS
   ========================================================= */

/* Elimina emojis y caracteres no-Latin-1 (que jsPDF no sabe dibujar) */
function stripEmojis(s: string): string {
  return s.replace(/[^\x20-\xFF\n\r\t]/g, '').replace(/\s+/g, ' ').trim();
}

function esc(s: any): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string)
  );
}

function esDelMes(iso: string, anio: number, mes: number): boolean {
  const d = new Date(iso);
  return d.getFullYear() === anio && d.getMonth() === mes;
}

function valorCelda(v: any, c: Campo): any {
  if (v === undefined || v === null || v === '') return '';
  if (c.tipo === 'checkbox') return v ? 'Sí' : 'No';
  if (c.tipo === 'fecha_hora') return v ? new Date(v) : '';
  if (c.tipo === 'fecha') return v ? new Date(v + 'T00:00:00') : '';
  return v;
}

function valorTexto(v: any, c: Campo): string {
  if (v === undefined || v === null || v === '') return '';
  if (c.tipo === 'checkbox') return v ? 'Sí' : 'No';
  if (c.tipo === 'fecha_hora') return formatearFecha(v);
  if (c.tipo === 'fecha') return formatearFechaCorta(v);
  if (c.tipo === 'hora') return formatearHora(v);
  return stripEmojis(String(v)); // <-- Limpieza aplicada aquí
}

async function getRegistrosDelMes(moduloId: string, anio: number, mes: number): Promise<Registro[]> {
  const todos = await db.registros.where('moduloId').equals(moduloId).toArray();
  return todos
    .filter(r => esDelMes(r.creadoEn, anio, mes))
    .sort((a, b) => b.creadoEn.localeCompare(a.creadoEn));
}

/* =========================================================
   ESTADÍSTICAS
   ========================================================= */
interface ModuleStats {
  total: number;
  porEstado: Record<string, number>;
  campoEstado: Campo | null;
  opcionesEstado: string[];
  tasaCompletado: number;
  tiempoPromedioMs: number | null;
  porDia: number[];
}

function calcularStats(campos: Campo[], regs: Registro[], anio: number, mes: number): ModuleStats {
  const campoEstado =
    campos.find(c => c.tipo === 'select' && c.etiqueta.toLowerCase().includes('estado')) ||
    campos.find(c => c.tipo === 'select') || null;
  const opcionesEstado = campoEstado?.opciones || [];

  const porEstado: Record<string, number> = {};
  opcionesEstado.forEach(op => (porEstado[op] = 0));
  regs.forEach(r => {
    const val = campoEstado ? r.datos[campoEstado.id] : null;
    if (val && porEstado[val] !== undefined) porEstado[val]++;
  });

  let completados = 0;
  Object.entries(porEstado).forEach(([estado, cnt]) => {
    const k = estado.toLowerCase();
    if (k.match(/(termin|cumpl|instal|activ|ok)/)) completados += cnt;
  });
  const tasaCompletado = regs.length > 0 ? (completados / regs.length) * 100 : 0;

  const campoInicio = campos.find(c => c.tipo === 'fecha_hora' && c.autoFechaCreacion);
  const campoFin = campos.find(c => c.tipo === 'fecha_hora' && c.autoFechaEstadoId);
  let tiempoPromedioMs: number | null = null;
  if (campoInicio && campoFin) {
    const deltas: number[] = [];
    regs.forEach(r => {
      const ini = r.datos[campoInicio.id];
      const fin = r.datos[campoFin.id];
      if (ini && fin) {
        const d = new Date(fin).getTime() - new Date(ini).getTime();
        if (d > 0) deltas.push(d);
      }
    });
    if (deltas.length > 0) tiempoPromedioMs = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  }

  const diasEnMes = new Date(anio, mes + 1, 0).getDate();
  const porDia = new Array(diasEnMes).fill(0);
  regs.forEach(r => {
    const d = new Date(r.creadoEn);
    if (d.getFullYear() === anio && d.getMonth() === mes) porDia[d.getDate() - 1]++;
  });

  return { total: regs.length, porEstado, campoEstado, opcionesEstado, tasaCompletado, tiempoPromedioMs, porDia };
}

function formatDuration(ms: number): string {
  const horas = ms / (1000 * 60 * 60);
  if (horas < 24) return `${horas.toFixed(1)} h`;
  const dias = horas / 24;
  if (dias < 30) return `${dias.toFixed(1)} días`;
  return `${(dias / 30).toFixed(1)} meses`;
}

function getStatusRGB(estado: string): [number, number, number] {
  const k = estado.toLowerCase();
  if (k.match(/(termin|cumpl|instal|activ|ok)/)) return [22, 163, 74];
  if (k.match(/(proceso|pendient)/)) return [217, 119, 6];
  return [220, 38, 38];
}

/* =========================================================
   DIBUJO DE ELEMENTOS NATIVOS EN PDF
   ========================================================= */
function drawKpiCard(
  pdf: jsPDF, x: number, y: number, w: number, h: number,
  titulo: string, valor: string, color: [number, number, number] = [30, 41, 59]
) {
  pdf.setFillColor(248, 250, 252);
  pdf.setDrawColor(226, 232, 240);
  pdf.roundedRect(x, y, w, h, 2, 2, 'FD');
  pdf.setFillColor(...color);
  pdf.rect(x, y, 1.5, h, 'F');
  pdf.setFontSize(7);
  pdf.setTextColor(100, 116, 139);
  pdf.setFont('helvetica', 'bold');
  pdf.text(titulo.toUpperCase(), x + 4, y + 5);
  pdf.setFontSize(16);
  pdf.setTextColor(15, 23, 42);
  pdf.text(valor, x + 4, y + h - 3);
}

function drawProgressBar(
  pdf: jsPDF, x: number, y: number, w: number, h: number,
  porcentaje: number, color: [number, number, number]
) {
  pdf.setFillColor(226, 232, 240);
  pdf.roundedRect(x, y, w, h, h / 2, h / 2, 'F');
  if (porcentaje > 0) {
    pdf.setFillColor(...color);
    const wPct = Math.max((w * Math.min(porcentaje, 100)) / 100, h);
    pdf.roundedRect(x, y, wPct, h, h / 2, h / 2, 'F');
  }
}

function drawMiniChart(
  pdf: jsPDF, x: number, y: number, w: number, h: number,
  datos: number[], color: [number, number, number] = [29, 78, 216]
) {
  const max = Math.max(...datos, 1);
  const barW = w / datos.length;
  pdf.setDrawColor(203, 213, 225);
  pdf.line(x, y + h, x + w, y + h);
  datos.forEach((v, i) => {
    if (v === 0) return;
    const barH = (v / max) * h;
    pdf.setFillColor(...color);
    pdf.rect(x + i * barW + 0.3, y + h - barH, barW - 0.6, barH, 'F');
  });
  pdf.setFontSize(6);
  pdf.setTextColor(148, 163, 184);
  [1, 10, 20, datos.length].forEach(d => {
    if (d <= datos.length) pdf.text(String(d), x + (d - 0.5) * barW - 1, y + h + 3);
  });
}

function drawPageNumber(pdf: jsPDF, pageNum: number, totalPages: number) {
  const w = pdf.internal.pageSize.getWidth();
  const h = pdf.internal.pageSize.getHeight();
  pdf.setFontSize(8);
  pdf.setTextColor(148, 163, 184);
  pdf.text(`Página ${pageNum} de ${totalPages}`, w - 10, h - 6, { align: 'right' });
  pdf.text('ReporteMensual', 10, h - 6);
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return [r || 59, g || 130, b || 246];
}

/* =========================================================
   EXPORTAR EXCEL
   ========================================================= */
export async function exportarExcel(anio: number, mes: number, moduloIdFiltro?: string) {
  let modulos = await db.modulos.orderBy('orden').toArray();
  if (moduloIdFiltro) modulos = modulos.filter(m => m.id === moduloIdFiltro);
  if (!modulos.length) { alert('No hay módulos para exportar'); return; }

  const wb = XLSX.utils.book_new();
  for (const m of modulos) {
    const campos = await db.campos.where('moduloId').equals(m.id).sortBy('orden');
    const regs = await getRegistrosDelMes(m.id, anio, mes);
    const headers = [...campos.map(c => c.etiqueta), 'Creado en'];
    const rows = regs.map(r => [
      ...campos.map(c => valorCelda(r.datos[c.id], c)),
      r.creadoEn ? new Date(r.creadoEn) : '',
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws['!cols'] = headers.map(() => ({ wch: 22 }));
    let nombre = m.nombre.replace(/[\\\/\?\*\[\]:]/g, '').substring(0, 31) || 'Modulo';
    let final = nombre, i = 1;
    while (wb.SheetNames.includes(final)) final = `${nombre.substring(0, 27)}_${i++}`;
    XLSX.utils.book_append_sheet(wb, ws, final);
  }
  XLSX.writeFile(wb, `ReporteMensual_${nombreMes(mes)}_${anio}.xlsx`, { cellDates: true });
}

/* =========================================================
   EXPORTAR EXCEL (Selección Múltiple)
   ========================================================= */
export function exportarRegistrosAExcel(modulo: Modulo, campos: Campo[], registros: Registro[]) {
  if (!registros.length) { alert('No hay registros seleccionados'); return; }
  const headers = [...campos.map(c => c.etiqueta), 'Creado en'];
  const rows = registros.map(r => [
    ...campos.map(c => valorCelda(r.datos[c.id], c)),
    r.creadoEn ? new Date(r.creadoEn) : '',
  ]);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws['!cols'] = headers.map(() => ({ wch: 22 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Seleccion');
  XLSX.writeFile(wb, `Seleccion_${modulo.nombre.replace(/\s+/g, '_')}.xlsx`, { cellDates: true });
}

/* =========================================================
   EXPORTAR PDF PROFESIONAL
   ========================================================= */
export async function exportarPDF(anio: number, mes: number, moduloIdFiltro?: string, usuario?: string) {
  let modulos = await db.modulos.orderBy('orden').toArray();
  if (moduloIdFiltro) modulos = modulos.filter(m => m.id === moduloIdFiltro);
  if (!modulos.length) { alert('No hay módulos para exportar'); return; }

  const pdf = new jsPDF('p', 'mm', 'a4');
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 12;
  const contentW = pageW - 2 * margin;

  const datosPorModulo: { modulo: Modulo; campos: Campo[]; regs: Registro[]; stats: ModuleStats }[] = [];
  for (const m of modulos) {
    const campos = await db.campos.where('moduloId').equals(m.id).sortBy('orden');
    const regs = await getRegistrosDelMes(m.id, anio, mes);
    datosPorModulo.push({ modulo: m, campos, regs, stats: calcularStats(campos, regs, anio, mes) });
  }

  /* ---------- PÁGINA 1: RESUMEN EJECUTIVO ---------- */
  pdf.setFillColor(15, 23, 42);
  pdf.rect(0, 0, pageW, 38, 'F');
  pdf.setFontSize(20);
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.text('ReporteMensual', margin, 16);
  pdf.setFontSize(11);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(148, 163, 184);
  pdf.text(`${nombreMes(mes)} ${anio}`, margin, 23);
  pdf.setFontSize(8);
  pdf.text(`Generado: ${formatearFecha(new Date().toISOString())}${usuario ? ' · ' + stripEmojis(usuario) : ''}`, margin, 30);

  const totalRegs = datosPorModulo.reduce((s, d) => s + d.stats.total, 0);
  const globalCompletados = datosPorModulo.reduce((s, d) => s + (d.stats.tasaCompletado / 100) * d.stats.total, 0);
  const globalTasa = totalRegs > 0 ? (globalCompletados / totalRegs) * 100 : 0;

  let y = 48;
  pdf.setFontSize(11);
  pdf.setTextColor(15, 23, 42);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Resumen General', margin, y);
  y += 5;

  const cardW = (contentW - 6) / 3;
  drawKpiCard(pdf, margin, y, cardW, 18, 'Módulos activos', String(datosPorModulo.length), [29, 78, 216]);
  drawKpiCard(pdf, margin + cardW + 3, y, cardW, 18, 'Total registros', String(totalRegs), [8, 145, 178]);
  drawKpiCard(pdf, margin + 2 * (cardW + 3), y, cardW, 18, 'Tasa de completado', `${globalTasa.toFixed(0)}%`, [22, 163, 74]);
  y += 26;

  pdf.setFontSize(11);
  pdf.setTextColor(15, 23, 42);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Desglose por módulo', margin, y);
  y += 4;

  const todosLosEstados = new Set<string>();
  datosPorModulo.forEach(d => d.stats.opcionesEstado.forEach(o => todosLosEstados.add(o)));
  const estadosArr = Array.from(todosLosEstados);

  // Aplicamos stripEmojis a los encabezados y al nombre del módulo
  const head = [['Módulo', 'Total', ...estadosArr.map(e => stripEmojis(e)), '% Compl.']];
  const body = datosPorModulo.map(d => [
    stripEmojis(`${d.modulo.icono} ${d.modulo.nombre}`),
    String(d.stats.total),
    ...estadosArr.map(e => String(d.stats.porEstado[e] || 0)),
    `${d.stats.tasaCompletado.toFixed(0)}%`,
  ]);

  autoTable(pdf, {
    head, body,
    startY: y,
    margin: { left: margin, right: margin },
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold', halign: 'center' },
    bodyStyles: { textColor: [30, 41, 59] },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  });

  y = (pdf as any).lastAutoTable.finalY + 8;

  if (y < pageH - 40) {
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(15, 23, 42);
    pdf.text('Actividad del mes (registros por día)', margin, y);
    y += 4;
    const totalPorDia: number[] = [];
    const diasEnMes = new Date(anio, mes + 1, 0).getDate();
    for (let i = 0; i < diasEnMes; i++) {
      totalPorDia.push(datosPorModulo.reduce((s, d) => s + (d.stats.porDia[i] || 0), 0));
    }
    drawMiniChart(pdf, margin, y, contentW, 22, totalPorDia, [29, 78, 216]);
  }

  /* ---------- PÁGINAS POR MÓDULO ---------- */
  for (const { modulo, campos, regs, stats } of datosPorModulo) {
    pdf.addPage();
    y = 15;

    const modColor = hexToRgb(modulo.color);
    pdf.setFillColor(...modColor);
    pdf.rect(margin, y - 4, 3, 8, 'F');
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(15, 23, 42);
    // Aplicamos stripEmojis al título del módulo
    pdf.text(stripEmojis(`${modulo.icono} ${modulo.nombre}`), margin + 6, y + 2);
    y += 12;

    const cardW2 = (contentW - 6) / 3;
    drawKpiCard(pdf, margin, y, cardW2, 16, 'Total registros', String(stats.total), modColor);
    drawKpiCard(pdf, margin + cardW2 + 3, y, cardW2, 16, 'Tasa de completado', `${stats.tasaCompletado.toFixed(0)}%`, [22, 163, 74]);
    drawKpiCard(
      pdf, margin + 2 * (cardW2 + 3), y, cardW2, 16,
      'Tiempo promedio',
      stats.tiempoPromedioMs !== null ? formatDuration(stats.tiempoPromedioMs) : 'N/D',
      [217, 119, 6]
    );
    y += 22;

    if (stats.opcionesEstado.length > 0) {
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(15, 23, 42);
      pdf.text('Distribución por estado', margin, y);
      y += 4;

      stats.opcionesEstado.forEach(op => {
        const cant = stats.porEstado[op] || 0;
        const pct = stats.total > 0 ? (cant / stats.total) * 100 : 0;
        const rgb = getStatusRGB(op);

        pdf.setFontSize(8);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(100, 116, 139);
        pdf.text(stripEmojis(op), margin, y + 3);

        pdf.setFontSize(9);
        pdf.setTextColor(15, 23, 42);
        pdf.text(`${cant} (${pct.toFixed(0)}%)`, margin + 45, y + 3);

        drawProgressBar(pdf, margin + 68, y + 1.5, contentW - 68, 2.5, pct, rgb);
        y += 7;
      });
      y += 3;
    }

    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(15, 23, 42);
    pdf.text('Detalle de registros', margin, y);
    y += 3;

    if (regs.length === 0) {
      pdf.setFontSize(9);
      pdf.setTextColor(148, 163, 184);
      pdf.setFont('helvetica', 'italic');
      pdf.text('Sin registros en este mes.', margin, y + 5);
    } else {
      // Aplicamos stripEmojis a los encabezados de la tabla
      const head = [['Creado', ...campos.map(c => stripEmojis(c.etiqueta))]];
      const body = regs.map(r => [
        formatearFechaCorta(r.creadoEn),
        ...campos.map(c => valorTexto(r.datos[c.id], c)),
      ]);

      autoTable(pdf, {
        head, body,
        startY: y,
        margin: { left: margin, right: margin, top: 15, bottom: 12 },
        styles: { fontSize: 7, cellPadding: 1.8, overflow: 'linebreak' },
        headStyles: { fillColor: modColor, textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: { 0: { cellWidth: 18, halign: 'center', fontStyle: 'bold' } },
      });
    }
  }

  const totalPages = pdf.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i);
    drawPageNumber(pdf, i, totalPages);
  }

  pdf.save(`ReporteMensual_${nombreMes(mes)}_${anio}.pdf`);
}