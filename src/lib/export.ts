import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { saveFile } from '@/lib/saveFile';
import {
  db, formatearFecha, formatearFechaCorta, formatearHora,
  nombreMes, type Campo, type Modulo, type Registro,
} from '@/lib/db';

/* =========================================================
   HELPERS
   ========================================================= */

function stripEmojis(s: string): string {
  return s.replace(/[^\x20-\xFF\n\r\t]/g, '').replace(/\s+/g, ' ').trim();
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
  return stripEmojis(String(v));
}

async function getRegistrosDelMes(moduloId: string, anio: number, mes: number): Promise<Registro[]> {
  const todos = await db.registros.where('moduloId').equals(moduloId).toArray();
  return todos
    .filter(r => esDelMes(r.creadoEn, anio, mes))
    .sort((a, b) => b.creadoEn.localeCompare(a.creadoEn));
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return [r || 13, g || 148, b || 136];
}

function getStatusColorFromCampo(estado: string, campo: Campo | null): string {
  if (campo?.coloresOpciones?.[estado]) return campo.coloresOpciones[estado];
  const k = estado.toLowerCase();
  if (k.match(/(termin|cumpl|instal|activ|ok|conectado)/)) return '#16a34a';
  if (k.match(/(proceso|pendient|visto|revis|espera)/)) return '#f59e0b';
  return '#dc2626';
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
  rankingData: { label: string; value: number; color: string }[];
  campoRanking: Campo | null;
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
  if (campoEstado?.estadoCompletado && porEstado[campoEstado.estadoCompletado] !== undefined) {
    completados = porEstado[campoEstado.estadoCompletado];
  } else {
    Object.entries(porEstado).forEach(([estado, cnt]) => {
      const k = estado.toLowerCase();
      if (k.match(/(termin|cumpl|instal|activ|ok)/)) completados += cnt;
    });
  }
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

  // Normalizador: sin tildes, minúsculas, espacios colapsados
  // ====== RANKING: "lo que más se reporta" ======
  // Normalizador: sin tildes, minúsculas, sin signos
  const normalizarEtiqueta = (s: string) =>
    s.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[¿?¡!.,;:()]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  // Campos "basura" que NUNCA deben ser el Top
  const camposExcluidos = [
    'grado', 'nombre', 'apellido', 'cedula', 'ci', 'carnet',
    'telefono', 'movil', 'celular', 'correo', 'email', 'usuario',
    'cargo', 'area', 'departamento', 'extension', 'pin', 'certificado',
    'responsable', 'solicitante', 'observacion', 'nota', 'comentario',
    'fecha', 'hora', 'direccion', 'ubicacion', 'equipo', 'serial',
  ];

  const esCampoExcluido = (c: Campo) => {
    const norm = normalizarEtiqueta(c.etiqueta);
    return camposExcluidos.some(ex => norm.includes(ex));
  };

  // Palabras clave por prioridad (de más específico a más general)
  const palabrasClave = [
    'que report',     // "¿Qué reportó?" → "que reporto" ✓ match perfecto
    'report',         // "reportó", "reporte", "reportes"
    'motivo',
    'falla',
    'problema',
    'incidencia',
    'asunto',
    'averia',
    'queja',
    'solicitud',
    'servicio',
    'tipo',
    'categoria',
    'descripcion',
  ];

  // Buscar primero por palabra clave (en TODOS los campos, sin importar tipo)
  let campoRanking: Campo | null = null;
  for (const kw of palabrasClave) {
    const found = campos.find(c => {
      if (c.id === campoEstado?.id) return false;
      if (esCampoExcluido(c)) return false;
      return normalizarEtiqueta(c.etiqueta).includes(kw);
    });
    if (found) { campoRanking = found; break; }
  }

  // Fallback: primer select/textarea/texto que NO sea estado ni esté excluido
  if (!campoRanking) {
    const candidatos = campos.filter(c =>
      c.id !== campoEstado?.id && !esCampoExcluido(c) &&
      (c.tipo === 'select' || c.tipo === 'textarea' || c.tipo === 'texto')
    );
    campoRanking = candidatos[0] || null;
  }
  // Fallback: primer select o texto que no sea el estado
  if (!campoRanking) {
    campoRanking =
      campos.find(c => c.tipo === 'select' && c.id !== campoEstado?.id) ||
      campos.find(c => c.tipo === 'texto' && c.id !== campoEstado?.id) ||
      null;
  }

  const rankingData: { label: string; value: number; color: string }[] = [];
  if (campoRanking) {
    // Normalizador: sin tildes, minúsculas, espacios colapsados
    const normalizar = (s: string) =>
      s.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    const conteo: Record<string, { display: string; count: number }> = {};
    regs.forEach(r => {
      const raw = String(r.datos[campoRanking!.id] || '').trim();
      if (!raw) return;
      const key = normalizar(raw);
      if (!key) return;
      if (!conteo[key]) conteo[key] = { display: raw, count: 0 };
      conteo[key].count++;
    });

    Object.values(conteo)
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
      .forEach(item => {
        rankingData.push({
          label: item.display,
          value: item.count,
          color: '#0d9488',
        });
      });
  }

  return { total: regs.length, porEstado, campoEstado, opcionesEstado, tasaCompletado, tiempoPromedioMs, porDia, rankingData, campoRanking };
}

function formatDuration(ms: number): string {
  const horas = ms / (1000 * 60 * 60);
  if (horas < 24) return `${horas.toFixed(1)} h`;
  const dias = horas / 24;
  if (dias < 30) return `${dias.toFixed(1)} días`;
  return `${(dias / 30).toFixed(1)} meses`;
}

/* =========================================================
   DIBUJO DE ELEMENTOS NATIVOS EN PDF
   ========================================================= */
function drawKpiCard(pdf: jsPDF, x: number, y: number, w: number, h: number, titulo: string, valor: string, color: [number, number, number] = [30, 41, 59]) {
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

/* Donut real dibujado con arcos */
function drawPdfDonut(
  pdf: jsPDF,
  cx: number, cy: number,
  radius: number, thickness: number,
  data: { label: string; value: number; color: string }[],
  centerText: string,
) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const innerR = radius - thickness;

  if (total === 0) {
    pdf.setFillColor(226, 232, 240);
    pdf.circle(cx, cy, radius, 'F');
    pdf.setFillColor(248, 250, 252);
    pdf.circle(cx, cy, innerR, 'F');
  } else {
    let acc = 0;
    data.forEach(d => {
      if (d.value === 0) return;
      const startAngle = (acc / total) * 2 * Math.PI - Math.PI / 2;
      const endAngle = ((acc + d.value) / total) * 2 * Math.PI - Math.PI / 2;
      const [r, g, b] = hexToRgb(d.color);
      pdf.setFillColor(r, g, b);

      const steps = Math.max(Math.ceil((endAngle - startAngle) * 20), 2);
      const outerPts: [number, number][] = [];
      const innerPts: [number, number][] = [];
      for (let i = 0; i <= steps; i++) {
        const a = startAngle + (endAngle - startAngle) * (i / steps);
        outerPts.push([cx + Math.cos(a) * radius, cy + Math.sin(a) * radius]);
        innerPts.push([cx + Math.cos(a) * innerR, cy + Math.sin(a) * innerR]);
      }
      const allPts = [...outerPts, ...innerPts.reverse()];
      const startPt = allPts[0];
      const deltas = allPts.slice(1).map((pt, i) => {
        const prev = i === 0 ? startPt : allPts[i];
        return [pt[0] - prev[0], pt[1] - prev[1]];
      });
      pdf.lines(deltas, startPt[0], startPt[1], [1, 1], 'F');
      acc += d.value;
    });
  }

  pdf.setFillColor(248, 250, 252);
  pdf.circle(cx, cy, innerR, 'F');

  pdf.setFontSize(14);
  pdf.setTextColor(15, 23, 42);
  pdf.setFont('helvetica', 'bold');
  pdf.text(centerText, cx, cy + 2, { align: 'center' });
  pdf.setFontSize(6);
  pdf.setTextColor(100, 116, 139);
  pdf.setFont('helvetica', 'normal');
  pdf.text('COMPLETADO', cx, cy - 4, { align: 'center' });
}

/* Área con degradado simulado */
function drawPdfAreaChart(
  pdf: jsPDF,
  x: number, y: number, w: number, h: number,
  data: number[],
  color: [number, number, number],
) {
  const max = Math.max(...data, 1);
  const step = data.length > 1 ? w / (data.length - 1) : w;

  pdf.setDrawColor(226, 232, 240);
  pdf.line(x, y + h, x + w, y + h);

  const layers = 4;
  for (let L = layers; L >= 1; L--) {
    const opacity = L / layers;
    const [r, g, b] = color;
    const mixed: [number, number, number] = [
      Math.round(255 - (255 - r) * opacity * 0.4),
      Math.round(255 - (255 - g) * opacity * 0.4),
      Math.round(255 - (255 - b) * opacity * 0.4),
    ];
    pdf.setFillColor(...mixed);
    const pts: [number, number][] = data.map((v, i) => [
      x + i * step,
      y + h - (v / max) * h * (L / layers),
    ]);
    const startPt = pts[0];
    const deltas = pts.slice(1).map((pt, i) => {
      const prev = i === 0 ? startPt : pts[i];
      return [pt[0] - prev[0], pt[1] - prev[1]];
    });
    deltas.push([0, y + h - pts[pts.length - 1][1]]);
    deltas.push([-(pts[pts.length - 1][0] - startPt[0]), 0]);
    pdf.lines(deltas, startPt[0], startPt[1], [1, 1], 'F');
  }

  pdf.setDrawColor(...color);
  pdf.setLineWidth(0.5);
  const pts: [number, number][] = data.map((v, i) => [x + i * step, y + h - (v / max) * h]);
  const startPt = pts[0];
  const deltas = pts.slice(1).map((pt, i) => {
    const prev = i === 0 ? startPt : pts[i];
    return [pt[0] - prev[0], pt[1] - prev[1]];
  });
  pdf.lines(deltas, startPt[0], startPt[1], [1, 1], 'S');
  pdf.setLineWidth(0.2);
}

/* Barras horizontales (reutilizable) */
function drawHBarList(
  pdf: jsPDF,
  x: number, y: number, w: number,
  items: { label: string; value: number; color: string }[],
  labelWidth: number,
) {
  const maxVal = Math.max(...items.map(d => d.value), 1);
  const barX = x + labelWidth;
  const barMaxW = w - labelWidth - 12;

  items.forEach((d, i) => {
    const rowY = y + i * 9;
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(51, 65, 85);
    const label = stripEmojis(d.label).substring(0, 30);
    pdf.text(label, x, rowY + 3);

    pdf.setFillColor(241, 245, 249);
    pdf.roundedRect(barX, rowY, barMaxW, 4, 2, 2, 'F');
    const bw = (d.value / maxVal) * barMaxW;
    if (bw > 0) {
      const [r, g, b] = hexToRgb(d.color);
      pdf.setFillColor(r, g, b);
      pdf.roundedRect(barX, rowY, Math.max(bw, 3), 4, 2, 2, 'F');
    }
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(15, 23, 42);
    pdf.text(String(d.value), x + w - 2, rowY + 3, { align: 'right' });
  });

  return items.length * 9;
}

function drawPageNumber(pdf: jsPDF, pageNum: number, totalPages: number) {
  const w = pdf.internal.pageSize.getWidth();
  const h = pdf.internal.pageSize.getHeight();
  pdf.setFontSize(8);
  pdf.setTextColor(148, 163, 184);
  pdf.text(`Página ${pageNum} de ${totalPages}`, w - 10, h - 6, { align: 'right' });
  pdf.text('ReporteMensual', 10, h - 6);
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

    const cols = headers.map((h, i) => {
      const maxLength = Math.max(
        h.length,
        ...rows.map(r => String(r[i] || '').length)
      );
      return { wch: Math.min(Math.max(maxLength + 2, 12), 50) };
    });
    ws['!cols'] = cols;
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } }) };

    let nombre = m.nombre.replace(/[\\\/\?\*\[\]:]/g, '').substring(0, 31) || 'Modulo';
    let final = nombre, i = 1;
    while (wb.SheetNames.includes(final)) final = `${nombre.substring(0, 27)}_${i++}`;
    XLSX.utils.book_append_sheet(wb, ws, final);
  }

  // Generar el Excel como array binario
  const arrayBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([arrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  await saveFile(`ReporteMensual_${nombreMes(mes)}_${anio}.xlsx`, blob, blob.type);
}

/* =========================================================
   EXPORTAR PDF — Estadísticas + Tabla en un solo documento
   ========================================================= */
export async function exportarPDF(anio: number, mes: number, moduloIdFiltro?: string, usuario?: string) {
  let modulos = await db.modulos.orderBy('orden').toArray();
  if (moduloIdFiltro) modulos = modulos.filter(m => m.id === moduloIdFiltro);
  if (!modulos.length) { alert('No hay módulos para exportar'); return; }

  // ¿Cuántas columnas hay en el módulo más ancho? para orientación
  let maxColumnas = 0;
  for (const m of modulos) {
    const campos = await db.campos.where('moduloId').equals(m.id).toArray();
    if (campos.length > maxColumnas) maxColumnas = campos.length;
  }
  const orientacion = maxColumnas > 6 ? 'l' : 'p';
  const pdf = new jsPDF(orientacion, 'mm', 'a4');

  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 12;
  const contentW = pageW - 2 * margin;

  // Precalcular
  const datosPorModulo: { modulo: Modulo; campos: Campo[]; regs: Registro[]; stats: ModuleStats }[] = [];
  for (const m of modulos) {
    const campos = await db.campos.where('moduloId').equals(m.id).sortBy('orden');
    const regs = await getRegistrosDelMes(m.id, anio, mes);
    datosPorModulo.push({ modulo: m, campos, regs, stats: calcularStats(campos, regs, anio, mes) });
  }

  const totalRegs = datosPorModulo.reduce((s, d) => s + d.stats.total, 0);
  const globalCompletados = datosPorModulo.reduce((s, d) => s + (d.stats.tasaCompletado / 100) * d.stats.total, 0);
  const globalTasa = totalRegs > 0 ? (globalCompletados / totalRegs) * 100 : 0;

  /* =====================================================
     PÁGINA 1: PORTADA CON RESUMEN GLOBAL
     ===================================================== */
  pdf.setFillColor(15, 23, 42);
  pdf.rect(0, 0, pageW, 42, 'F');
  pdf.setFontSize(22);
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.text('ReporteMensual', margin, 17);
  pdf.setFontSize(13);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(148, 163, 184);
  pdf.text(`${nombreMes(mes)} ${anio}`, margin, 26);
  pdf.setFontSize(8);
  pdf.text(`Generado: ${formatearFecha(new Date().toISOString())}${usuario ? ' · ' + stripEmojis(usuario) : ''}`, margin, 34);

  let y = 52;
  pdf.setFontSize(11);
  pdf.setTextColor(15, 23, 42);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Resumen General', margin, y);
  y += 5;

  const cardW = (contentW - 6) / 3;
  drawKpiCard(pdf, margin, y, cardW, 18, 'Módulos activos', String(datosPorModulo.length), [13, 148, 136]);
  drawKpiCard(pdf, margin + cardW + 3, y, cardW, 18, 'Total registros', String(totalRegs), [14, 165, 233]);
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
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold', halign: 'center' },
    bodyStyles: { textColor: [30, 41, 59] },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  });

  y = (pdf as any).lastAutoTable.finalY + 8;

  if (y < pageH - 50) {
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
    drawPdfAreaChart(pdf, margin, y + 2, contentW, 30, totalPorDia, [13, 148, 136]);
  }

  /* =====================================================
     PÁGINAS POR MÓDULO:
       - Página A: Dashboard de estadísticas del módulo
       - Página B+: Tabla de registros
     ===================================================== */
  for (const { modulo, campos, regs, stats } of datosPorModulo) {
    const modColor = hexToRgb(modulo.color);

    /* -------- DASHBOARD DEL MÓDULO -------- */
    pdf.addPage();
    y = 15;

    pdf.setFillColor(...modColor);
    pdf.rect(margin, y - 4, 3, 10, 'F');
    pdf.setFontSize(16);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(15, 23, 42);
    pdf.text(stripEmojis(modulo.nombre), margin + 7, y + 3);
    y += 8;

    pdf.setFontSize(10);
    pdf.setTextColor(100, 116, 139);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Estadísticas de ${nombreMes(mes)} ${anio}`, margin + 7, y + 3);
    y += 12;

    // KPIs
    const kpiW = (contentW - 8) / 3;
    drawKpiCard(pdf, margin, y, kpiW, 18, 'Total registros', String(stats.total), modColor);
    drawKpiCard(pdf, margin + kpiW + 4, y, kpiW, 18, 'Tasa de completado', `${stats.tasaCompletado.toFixed(0)}%`, [22, 163, 74]);
    drawKpiCard(
      pdf, margin + 2 * (kpiW + 4), y, kpiW, 18,
      'Tiempo promedio',
      stats.tiempoPromedioMs !== null ? formatDuration(stats.tiempoPromedioMs) : 'N/D',
      [217, 119, 6]
    );
    y += 26;

    // Donut + Área lado a lado
    if (stats.campoEstado) {
      const colW = (contentW - 6) / 2;

      // Card Donut
      pdf.setFillColor(248, 250, 252);
      pdf.setDrawColor(226, 232, 240);
      pdf.roundedRect(margin, y, colW, 70, 3, 3, 'FD');
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(100, 116, 139);
      pdf.text('DISTRIBUCIÓN POR ESTADO', margin + 4, y + 6);

      const estadosData = stats.opcionesEstado.map(op => ({
        label: op,
        value: stats.porEstado[op] || 0,
        color: getStatusColorFromCampo(op, stats.campoEstado),
      }));

      drawPdfDonut(
        pdf,
        margin + colW / 2,
        y + 38,
        20,
        6,
        estadosData,
        `${stats.tasaCompletado.toFixed(0)}%`,
      );

      let leyY = y + 58;
      const half = Math.ceil(estadosData.length / 2);
      estadosData.forEach((d, i) => {
        const col = i < half ? 0 : 1;
        const row = i < half ? i : i - half;
        const xPos = margin + 4 + col * (colW / 2);
        const yy = leyY + row * 4.5;
        pdf.setFillColor(d.color);
        pdf.circle(xPos + 1.2, yy, 1, 'F');
        pdf.setFontSize(6.5);
        pdf.setTextColor(71, 85, 105);
        pdf.setFont('helvetica', 'normal');
        pdf.text(`${stripEmojis(d.label)} (${d.value})`, xPos + 3.5, yy + 1);
      });

      // Card Tendencia
      const tx = margin + colW + 6;
      pdf.setFillColor(248, 250, 252);
      pdf.setDrawColor(226, 232, 240);
      pdf.roundedRect(tx, y, colW, 70, 3, 3, 'FD');
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(100, 116, 139);
      pdf.text('TENDENCIA DEL MES', tx + 4, y + 6);

      drawPdfAreaChart(pdf, tx + 6, y + 12, colW - 12, 44, stats.porDia, modColor);

      pdf.setFontSize(6);
      pdf.setTextColor(148, 163, 184);
      pdf.text('1', tx + 6, y + 62);
      pdf.text(String(Math.ceil(stats.porDia.length / 2)), tx + 6 + (colW - 12) / 2, y + 62);
      pdf.text(String(stats.porDia.length), tx + colW - 8, y + 62);

      y += 78;
    }

    // Volumen por estado
    if (stats.campoEstado && stats.opcionesEstado.length > 0) {
      const estadosData = stats.opcionesEstado.map(op => ({
        label: op,
        value: stats.porEstado[op] || 0,
        color: getStatusColorFromCampo(op, stats.campoEstado),
      }));
      const boxH = 10 + estadosData.length * 9;
      pdf.setFillColor(248, 250, 252);
      pdf.setDrawColor(226, 232, 240);
      pdf.roundedRect(margin, y, contentW, boxH, 3, 3, 'FD');
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(100, 116, 139);
      pdf.text('VOLUMEN POR ESTADO', margin + 4, y + 6);

      drawHBarList(pdf, margin + 4, y + 10, contentW - 8, estadosData, 55);
      y += boxH + 6;
    }

    // Ranking — "lo que más se reporta"
    if (stats.campoRanking && stats.rankingData.length > 0 && y < pageH - 60) {
      const boxH = 10 + stats.rankingData.length * 9;
      pdf.setFillColor(248, 250, 252);
      pdf.setDrawColor(226, 232, 240);
      pdf.roundedRect(margin, y, contentW, boxH, 3, 3, 'FD');
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(100, 116, 139);
      pdf.text(
        `TOP ${stripEmojis(stats.campoRanking.etiqueta).toUpperCase()} (MÁS REPORTADO)`,
        margin + 4,
        y + 6
      );

      drawHBarList(pdf, margin + 4, y + 10, contentW - 8, stats.rankingData, 65);
      y += boxH + 6;
    }

    /* -------- TABLA DE REGISTROS DEL MÓDULO -------- */
    pdf.addPage();
    y = 15;

    pdf.setFillColor(...modColor);
    pdf.rect(margin, y - 4, 3, 10, 'F');
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(15, 23, 42);
    pdf.text(stripEmojis(`${modulo.nombre} — Detalle de registros`), margin + 7, y + 3);
    y += 10;

    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(100, 116, 139);
    pdf.text(`${nombreMes(mes)} ${anio} · ${regs.length} registro${regs.length !== 1 ? 's' : ''}`, margin, y);
    y += 4;

    if (regs.length === 0) {
      pdf.setFontSize(10);
      pdf.setTextColor(148, 163, 184);
      pdf.setFont('helvetica', 'italic');
      pdf.text('Sin registros en este mes.', margin, y + 6);
    } else {
      const head = [['Creado', ...campos.map(c => stripEmojis(c.etiqueta))]];
      const body = regs.map(r => [
        formatearFechaCorta(r.creadoEn),
        ...campos.map(c => valorTexto(r.datos[c.id], c)),
      ]);

      let fontSize = 8;
      if (campos.length > 8) fontSize = 6;
      else if (campos.length > 5) fontSize = 7;

      autoTable(pdf, {
        head, body,
        startY: y,
        margin: { left: margin, right: margin, top: 15, bottom: 12 },
        styles: {
          fontSize,
          cellPadding: 1.5,
          overflow: 'linebreak',
          valign: 'middle',
          halign: 'left',
        },
        headStyles: { fillColor: modColor, textColor: 255, fontStyle: 'bold', halign: 'center' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
          0: { cellWidth: 18, halign: 'center', fontStyle: 'bold' },
        },
        tableWidth: 'auto',
      });
    }
  }

  const totalPages = pdf.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i);
    drawPageNumber(pdf, i, totalPages);
  }

  const pdfBlob = pdf.output('blob');
  await saveFile(`ReporteMensual_${nombreMes(mes)}_${anio}.pdf`, pdfBlob, 'application/pdf');
}