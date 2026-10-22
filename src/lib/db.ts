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
  estadoCompletado?: string | null;
  coloresOpciones?: Record<string, string>;
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

/* ---------- Semilla: UN módulo General universal ---------- */
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
    const modId = uuid();

    await db.modulos.add({
      id: modId,
      nombre: 'Reportes Generales',
      icono: '📡',
      color: '#0d9488',
      orden: 0,
      creadoEn: now,
    });

    const estadoId = uuid();
    const campos: Omit<Campo, 'moduloId' | 'orden'>[] = [
      { id: uuid(), etiqueta: 'Fecha y hora de recibo', tipo: 'fecha_hora', requerido: true, mostrarEnTabla: true, opciones: [], autoFechaCreacion: true, autoFechaEstadoId: null, autoFechaEstadoValor: null },
      { id: uuid(), etiqueta: 'Nombre y Apellidos', tipo: 'texto', requerido: true, mostrarEnTabla: true, opciones: [], autoFechaCreacion: false, autoFechaEstadoId: null, autoFechaEstadoValor: null },
      { id: uuid(), etiqueta: 'Departamento', tipo: 'texto', requerido: true, mostrarEnTabla: true, opciones: [], autoFechaCreacion: false, autoFechaEstadoId: null, autoFechaEstadoValor: null },
      { id: uuid(), etiqueta: 'Reporte', tipo: 'textarea', requerido: true, mostrarEnTabla: true, opciones: [], autoFechaCreacion: false, autoFechaEstadoId: null, autoFechaEstadoValor: null },
      {
        id: estadoId, etiqueta: 'Estado', tipo: 'select', requerido: true, mostrarEnTabla: true,
        opciones: ['Pendiente', 'En proceso', 'Terminado', 'Cancelado'],
        autoFechaCreacion: false, autoFechaEstadoId: null, autoFechaEstadoValor: null,
        estadoCompletado: 'Terminado',
        coloresOpciones: {
          'Pendiente': '#f59e0b',
          'En proceso': '#3b82f6',
          'Terminado': '#16a34a',
          'Cancelado': '#64748b',
        },
      },
      { id: uuid(), etiqueta: 'Fecha y hora de finalización', tipo: 'fecha_hora', requerido: false, mostrarEnTabla: true, opciones: [], autoFechaCreacion: false, autoFechaEstadoId: estadoId, autoFechaEstadoValor: 'Terminado' },
      { id: uuid(), etiqueta: 'Observaciones', tipo: 'textarea', requerido: false, mostrarEnTabla: false, opciones: [], autoFechaCreacion: false, autoFechaEstadoId: null, autoFechaEstadoValor: null },
    ];
    for (let i = 0; i < campos.length; i++) {
      await db.campos.add({ ...campos[i], moduloId: modId, orden: i });
    }

    const byLabel = (lbl: string) => campos.find(x => x.etiqueta === lbl)!.id;
    await db.registros.add({
      id: uuid(),
      moduloId: modId,
      creadoEn: now,
      actualizadoEn: now,
      datos: {
        [byLabel('Fecha y hora de recibo')]: new Date().toISOString(),
        [byLabel('Nombre y Apellidos')]: 'Ejemplo — Juan Pérez',
        [byLabel('Departamento')]: 'Sistemas',
        [byLabel('Reporte')]: 'Registro de ejemplo: el usuario no podía acceder a su correo. Se reinició el perfil y quedó funcionando. Puedes editar o borrar este registro cuando empieces a trabajar.',
        [byLabel('Estado')]: 'Terminado',
        [byLabel('Fecha y hora de finalización')]: new Date().toISOString(),
        [byLabel('Observaciones')]: 'Este es un registro de ejemplo. Bórralo cuando empieces.',
      },
      historial: [{ fecha: now, estado: 'Terminado', usuario: 'Sistema (ejemplo)' }],
    });

    await db.config.put({ clave: 'seed_hecho', valor: true });
    await db.config.put({ clave: 'general_modulo_id', valor: modId });
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
  const json = JSON.stringify(data, null, 2);
  const { saveFile } = await import('@/lib/saveFile');
  await saveFile(
    `Backup_ReporteMensual_${new Date().toISOString().slice(0, 10)}.json`,
    json,
    'application/json'
  );
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
  const json = JSON.stringify(plantilla, null, 2);
  const { saveFile } = await import('@/lib/saveFile');
  await saveFile(
    `Plantilla_${mod.nombre.replace(/[^\w]+/g, '_')}.json`,
    json,
    'application/json'
  );
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
  const json = JSON.stringify(data, null, 2);
  const { saveFile } = await import('@/lib/saveFile');
  await saveFile(
    `Modulo_${mod.nombre.replace(/[^\w]+/g, '_')}.json`,
    json,
    'application/json'
  );
}