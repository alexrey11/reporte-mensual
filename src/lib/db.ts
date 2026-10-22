import Dexie, { type Table } from 'dexie';

export type TipoCampo =
  | 'texto' | 'textarea' | 'numero' | 'telefono' | 'correo'
  | 'fecha' | 'hora' | 'fecha_hora' | 'select' | 'checkbox';

export interface Modulo {
  id: string;
  nombre: string;
  icono: string;
  color: string;
  orden: number;
  creadoEn: string;
}

export interface Campo {
  id: string;
  moduloId: string;
  etiqueta: string;
  tipo: TipoCampo;
  requerido: boolean;
  mostrarEnTabla: boolean;
  orden: number;
  opciones: string[];
  autoFechaCreacion: boolean;
  autoFechaEstadoId: string | null;
  autoFechaEstadoValor: string | null;
  min?: number;
  max?: number;
  noFuturo?: boolean;
  // NUEVOS
  estadoCompletado?: string | null; // Qué opción del select cuenta como "completado"
  coloresOpciones?: Record<string, string>; // { "Terminado": "#16a34a", ... }
}

export interface HistorialEntry {
  fecha: string;
  estado: string;
  usuario: string;
}

export interface Registro {
  id: string;
  moduloId: string;
  creadoEn: string;
  actualizadoEn: string;
  datos: Record<string, any>;
  historial?: HistorialEntry[];
}

export interface Config {
  clave: string;
  valor: any;
}

class ReporteMensualDB extends Dexie {
  modulos!: Table<Modulo, string>;
  campos!: Table<Campo, string>;
  registros!: Table<Registro, string>;
  config!: Table<Config, string>;

  constructor() {
    super('ReporteMensualDB');
    this.version(1).stores({
      reportesGenerales: '++id, fechaRecibo, estado, departamento',
      registrosVenceremos: '++id, fechaInstalacion, estado, cargo',
    });
    this.version(2).stores({
      reportesGenerales: null,
      registrosVenceremos: null,
      modulos: 'id, nombre, orden',
      campos: 'id, moduloId, orden',
      registros: 'id, moduloId, creadoEn',
      config: 'clave',
    });
  }
}

export const db = new ReporteMensualDB();
export const uuid = () => crypto.randomUUID();
export const ahoraISO = () => new Date().toISOString();

/* ---------- Formateadores ---------- */
export function formatearFecha(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatearFechaCorta(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function formatearHora(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function nombreMes(m: number): string {
  const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  return meses[m] ?? '';
}

export function toDateTimeLocal(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function nowLocalISO(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function tiempoRelativo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return 'ahora';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

/* ---------- Semilla ---------- */
let seedPromise: Promise<void> | null = null;

export function seedIfEmpty(): Promise<void> {
  if (seedPromise) return seedPromise;
  seedPromise = (async () => {
    if ((await db.config.get('seed_hecho'))?.valor) return;
    if ((await db.modulos.count()) > 0) {
      await db.config.put({ clave: 'seed_hecho', valor: true });
      return;
    }

    const now = ahoraISO();

    /* --- Módulo A: Reportes Generales --- */
    const modAId = uuid();
    await db.modulos.add({ id: modAId, nombre: 'Reportes Generales', icono: '📡', color: '#3b82f6', orden: 0, creadoEn: now });

    const estadoAId = uuid();
    const camposA: Omit<Campo, 'moduloId' | 'orden'>[] = [
      { id: uuid(), etiqueta: 'Fecha y hora de recibo', tipo: 'fecha_hora', requerido: false, mostrarEnTabla: true, opciones: [], autoFechaCreacion: true, autoFechaEstadoId: null, autoFechaEstadoValor: null },
      { id: uuid(), etiqueta: 'Grado', tipo: 'texto', requerido: true, mostrarEnTabla: true, opciones: [], autoFechaCreacion: false, autoFechaEstadoId: null, autoFechaEstadoValor: null },
      { id: uuid(), etiqueta: 'Nombre y Apellidos', tipo: 'texto', requerido: true, mostrarEnTabla: true, opciones: [], autoFechaCreacion: false, autoFechaEstadoId: null, autoFechaEstadoValor: null },
      { id: uuid(), etiqueta: 'Departamento', tipo: 'texto', requerido: false, mostrarEnTabla: true, opciones: [], autoFechaCreacion: false, autoFechaEstadoId: null, autoFechaEstadoValor: null },
      { id: uuid(), etiqueta: '¿Qué reportó?', tipo: 'textarea', requerido: true, mostrarEnTabla: false, opciones: [], autoFechaCreacion: false, autoFechaEstadoId: null, autoFechaEstadoValor: null },
      {
        id: estadoAId, etiqueta: 'Estado', tipo: 'select', requerido: false, mostrarEnTabla: true,
        opciones: ['En proceso', 'Terminado'],
        autoFechaCreacion: false, autoFechaEstadoId: null, autoFechaEstadoValor: null,
        estadoCompletado: 'Terminado',
        coloresOpciones: { 'En proceso': '#f59e0b', 'Terminado': '#16a34a' },
      },
      { id: uuid(), etiqueta: 'Fecha y hora de finalización', tipo: 'fecha_hora', requerido: false, mostrarEnTabla: true, opciones: [], autoFechaCreacion: false, autoFechaEstadoId: estadoAId, autoFechaEstadoValor: 'Terminado' },
      { id: uuid(), etiqueta: 'Observaciones', tipo: 'textarea', requerido: false, mostrarEnTabla: false, opciones: [], autoFechaCreacion: false, autoFechaEstadoId: null, autoFechaEstadoValor: null },
    ];
    for (let i = 0; i < camposA.length; i++) await db.campos.add({ ...camposA[i], moduloId: modAId, orden: i });

    /* --- Módulo B: Registro Venceremos --- */
    const modBId = uuid();
    await db.modulos.add({ id: modBId, nombre: 'Registro Venceremos', icono: '📲', color: '#10b981', orden: 1, creadoEn: now });

    const estadoBId = uuid();
    const camposB: Omit<Campo, 'moduloId' | 'orden'>[] = [
      { id: uuid(), etiqueta: 'Cargo', tipo: 'texto', requerido: false, mostrarEnTabla: true, opciones: [], autoFechaCreacion: false, autoFechaEstadoId: null, autoFechaEstadoValor: null },
      { id: uuid(), etiqueta: 'Grado - Nombre y Apellidos', tipo: 'texto', requerido: true, mostrarEnTabla: true, opciones: [], autoFechaCreacion: false, autoFechaEstadoId: null, autoFechaEstadoValor: null },
      { id: uuid(), etiqueta: 'Usuario AD', tipo: 'texto', requerido: false, mostrarEnTabla: true, opciones: [], autoFechaCreacion: false, autoFechaEstadoId: null, autoFechaEstadoValor: null },
      { id: uuid(), etiqueta: 'Número de teléfono', tipo: 'telefono', requerido: false, mostrarEnTabla: true, opciones: [], autoFechaCreacion: false, autoFechaEstadoId: null, autoFechaEstadoValor: null },
      { id: uuid(), etiqueta: 'Extensión', tipo: 'texto', requerido: false, mostrarEnTabla: false, opciones: [], autoFechaCreacion: false, autoFechaEstadoId: null, autoFechaEstadoValor: null },
      { id: uuid(), etiqueta: 'Certificado', tipo: 'texto', requerido: false, mostrarEnTabla: false, opciones: [], autoFechaCreacion: false, autoFechaEstadoId: null, autoFechaEstadoValor: null },
      { id: uuid(), etiqueta: 'Pin de Venceremos', tipo: 'texto', requerido: false, mostrarEnTabla: false, opciones: [], autoFechaCreacion: false, autoFechaEstadoId: null, autoFechaEstadoValor: null },
      { id: uuid(), etiqueta: 'Fecha de Instalación', tipo: 'fecha_hora', requerido: false, mostrarEnTabla: true, opciones: [], autoFechaCreacion: true, autoFechaEstadoId: null, autoFechaEstadoValor: null },
      { id: uuid(), etiqueta: 'Observaciones', tipo: 'textarea', requerido: false, mostrarEnTabla: false, opciones: [], autoFechaCreacion: false, autoFechaEstadoId: null, autoFechaEstadoValor: null },
      {
        id: estadoBId, etiqueta: 'Estado', tipo: 'select', requerido: false, mostrarEnTabla: true,
        opciones: ['Instalado', 'Pendiente', 'Con error'],
        autoFechaCreacion: false, autoFechaEstadoId: null, autoFechaEstadoValor: null,
        estadoCompletado: 'Instalado',
        coloresOpciones: { 'Instalado': '#16a34a', 'Pendiente': '#f59e0b', 'Con error': '#dc2626' },
      },
    ];
    for (let i = 0; i < camposB.length; i++) await db.campos.add({ ...camposB[i], moduloId: modBId, orden: i });

    await db.config.put({ clave: 'seed_hecho', valor: true });
  })();
  return seedPromise;
}

/* ---------- Persistencia de almacenamiento ---------- */
export async function pedirPersistencia(): Promise<boolean> {
  if (navigator.storage && navigator.storage.persist) {
    try {
      return await navigator.storage.persist();
    } catch {
      return false;
    }
  }
  return false;
}

/* ---------- Backup Global ---------- */
export async function exportarBackup() {
  const data = {
    version: 2,
    exportedAt: ahoraISO(),
    modulos: await db.modulos.toArray(),
    campos: await db.campos.toArray(),
    registros: await db.registros.toArray(),
    config: await db.config.toArray(),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `Backup_ReporteMensual_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export async function importarBackup(file: File) {
  const data = JSON.parse(await file.text());
  if (!data.modulos || !data.campos || !data.registros) throw new Error('Formato inválido');
  await db.transaction('rw', [db.modulos, db.campos, db.registros, db.config], async () => {
    await db.modulos.clear();
    await db.campos.clear();
    await db.registros.clear();
    await db.config.clear();
    await db.modulos.bulkAdd(data.modulos);
    await db.campos.bulkAdd(data.campos);
    await db.registros.bulkAdd(data.registros);
    if (data.config) await db.config.bulkAdd(data.config);
    await db.config.put({ clave: 'seed_hecho', valor: true });
  });
}

/* ---------- Plantilla de Módulo (solo esquema) ---------- */
export async function exportarPlantilla(moduloId: string) {
  const mod = await db.modulos.get(moduloId);
  if (!mod) { alert('Módulo no encontrado'); return; }
  const campos = await db.campos.where('moduloId').equals(moduloId).sortBy('orden');
  const plantilla = {
    type: 'plantilla',
    version: 1,
    exportedAt: ahoraISO(),
    modulo: { ...mod, id: 'new' },
    campos: campos.map(c => ({ ...c, moduloId: 'new' })),
  };
  const blob = new Blob([JSON.stringify(plantilla, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `Plantilla_${mod.nombre.replace(/[^\w]+/g, '_')}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

export async function importarPlantilla(file: File): Promise<string> {
  const data = JSON.parse(await file.text());
  if (data.type !== 'plantilla' || !data.modulo || !data.campos) {
    throw new Error('Este archivo no es una plantilla válida');
  }
  const nuevoId = uuid();
  const nuevoOrden = await db.modulos.count();
  await db.modulos.add({
    ...data.modulo,
    id: nuevoId,
    nombre: `${data.modulo.nombre} (Importado)`,
    orden: nuevoOrden,
    creadoEn: ahoraISO(),
  });
  for (const c of data.campos) {
    await db.campos.add({ ...c, id: uuid(), moduloId: nuevoId });
  }
  return nuevoId;
}

/* ---------- Exportar Módulo Completo ---------- */
export async function exportarModuloCompleto(moduloId: string) {
  const mod = await db.modulos.get(moduloId);
  if (!mod) return;
  const campos = await db.campos.where('moduloId').equals(moduloId).toArray();
  const registros = await db.registros.where('moduloId').equals(moduloId).toArray();
  const data = { type: 'modulo_completo', version: 1, exportedAt: ahoraISO(), modulo: mod, campos, registros };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `Modulo_${mod.nombre.replace(/[^\w]+/g, '_')}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}