import { useEffect, useState, useMemo } from 'react';
import {
    db, uuid, ahoraISO, nowLocalISO, toDateTimeLocal,
    formatearFecha, formatearFechaCorta, formatearHora, tiempoRelativo,
    type Modulo, type Campo, type Registro, type HistorialEntry,
} from '@/lib/db';
import {
    Search, Plus, Edit3, Copy, Trash2, X,
    ChevronLeft, ChevronRight, Inbox, Lightbulb,
    SlidersHorizontal, ChevronDown, ChevronUp,
} from 'lucide-react';

interface Props {
    modulo: Modulo;
    campos: Campo[];
    viewMode: 'table' | 'cards';
    isMobile: boolean;
    anio: number;
    mes: number;
    usuario: string;
    onDataChanged: () => void;
}

export function getStatusColor(estado: string, campo?: Campo | null): string {
    if (campo?.coloresOpciones?.[estado]) return campo.coloresOpciones[estado];
    const k = estado.toLowerCase();
    if (k.match(/(termin|cumpl|instal|activ|ok|conectado)/)) return '#16a34a';
    if (k.match(/(proceso|pendient|visto|revis|espera)/)) return '#f59e0b';
    return '#dc2626';
}

function esDelMes(iso: string, anio: number, mes: number): boolean {
    const d = new Date(iso);
    return d.getFullYear() === anio && d.getMonth() === mes;
}

/* Normalizador para búsquedas sin tildes ni mayúsculas */
function normalizar(s: string): string {
    return s
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .trim();
}

/* Tipo de filtro que corresponde a un campo */
type FiltroTipo = 'select' | 'texto' | 'numero' | 'fecha' | 'fecha_hora' | 'checkbox';

function tipoFiltroDe(c: Campo): FiltroTipo {
    if (c.tipo === 'select') return 'select';
    if (c.tipo === 'numero') return 'numero';
    if (c.tipo === 'fecha') return 'fecha';
    if (c.tipo === 'fecha_hora') return 'fecha_hora';
    if (c.tipo === 'checkbox') return 'checkbox';
    return 'texto';
}

export default function ModuloView({ modulo, campos, viewMode, isMobile, anio, mes, usuario, onDataChanged }: Props) {
    const [registros, setRegistros] = useState<Registro[]>([]);
    const [modalOpen, setModalOpen] = useState(false);
    const [editando, setEditando] = useState<Registro | null>(null);

    const [busqueda, setBusqueda] = useState('');
    const [filtros, setFiltros] = useState<Record<string, string>>({});
    const [filtrosOpen, setFiltrosOpen] = useState(false);

    const [sortCol, setSortCol] = useState<string>('creadoEn');
    const [sortAsc, setSortAsc] = useState(false);

    const [currentPage, setCurrentPage] = useState(1);
    const [rowsPerPage] = useState(20);

    async function cargar() {
        const todos = await db.registros.where('moduloId').equals(modulo.id).toArray();
        setRegistros(todos.filter(r => esDelMes(r.creadoEn, anio, mes)));
    }

    useEffect(() => { cargar(); }, [modulo.id, anio, mes]);

    useEffect(() => {
        const handleOpenModal = () => { setEditando(null); setModalOpen(true); };
        window.addEventListener('abrir-nuevo-registro', handleOpenModal);
        return () => window.removeEventListener('abrir-nuevo-registro', handleOpenModal);
    }, []);

    useEffect(() => { setCurrentPage(1); }, [busqueda, filtros]);

    async function eliminarRegistro(id: string) {
        if (confirm('¿Eliminar este registro?')) {
            await db.registros.delete(id);
            cargar();
            onDataChanged();
        }
    }

    async function duplicarRegistro(r: Registro) {
        const { id: _i, creadoEn: _c, actualizadoEn: _a, historial: _h, ...resto } = r;
        await db.registros.add({
            ...resto, id: uuid(), creadoEn: ahoraISO(), actualizadoEn: ahoraISO(),
            historial: [{ fecha: ahoraISO(), estado: 'Creado (Duplicado)', usuario }],
        });
        cargar();
        onDataChanged();
    }

    function handleSort(colId: string) {
        if (sortCol === colId) setSortAsc(!sortAsc);
        else { setSortCol(colId); setSortAsc(true); }
    }

    const campoEstado = campos.find(c =>
        c.tipo === 'select' &&
        (c.etiqueta.toLowerCase().includes('estado') || c.etiqueta.toLowerCase().includes('status'))
    ) || null;

    const opcionesEstado = campoEstado?.opciones || [];

    // Campos visibles en la tabla → candidatos a filtro
    const camposVisibles = useMemo(
        () => campos.filter(c => c.mostrarEnTabla),
        [campos]
    );

    // Filtros que el usuario tiene activos actualmente
    const filtrosActivos = useMemo(
        () => Object.entries(filtros).filter(([, v]) => v !== ''),
        [filtros]
    );

    function setFiltro(campoId: string, valor: string) {
        setFiltros(prev => ({ ...prev, [campoId]: valor }));
    }

    function limpiarFiltros() {
        setFiltros({});
        setBusqueda('');
    }

    // Aplicar búsqueda global + todos los filtros por campo
    const registrosFiltrados = useMemo(() => {
        let arr = [...registros];

        // Búsqueda global
        if (busqueda.trim()) {
            const txt = normalizar(busqueda);
            arr = arr.filter(r =>
                Object.values(r.datos).some(v => normalizar(String(v)).includes(txt))
            );
        }

        // Filtros por campo
        for (const [campoId, valor] of Object.entries(filtros)) {
            if (!valor) continue;
            const campo = campos.find(c => c.id === campoId);
            if (!campo) continue;
            const tipo = tipoFiltroDe(campo);

            if (tipo === 'select' || tipo === 'checkbox') {
                arr = arr.filter(r => String(r.datos[campoId] ?? '') === valor);
            } else if (tipo === 'numero') {
                const n = Number(valor);
                if (!isNaN(n)) arr = arr.filter(r => Number(r.datos[campoId]) === n);
            } else if (tipo === 'fecha' || tipo === 'fecha_hora') {
                // El valor puede venir como "desde|hasta"
                const [desde, hasta] = valor.split('|');
                arr = arr.filter(r => {
                    const raw = r.datos[campoId];
                    if (!raw) return false;
                    const iso = String(raw);
                    if (desde && iso < new Date(desde + (tipo === 'fecha' ? 'T00:00:00' : '')).toISOString()) return false;
                    if (hasta && iso > new Date(hasta + (tipo === 'fecha' ? 'T23:59:59' : '')).toISOString()) return false;
                    return true;
                });
            } else {
                // texto / textarea / correo / telefono
                const needle = normalizar(valor);
                if (needle) arr = arr.filter(r => normalizar(String(r.datos[campoId] ?? '')).includes(needle));
            }
        }

        // Ordenar
        arr.sort((a, b) => {
            const va = String(sortCol === 'creadoEn' ? a.creadoEn : a.datos[sortCol] ?? '').toLowerCase();
            const vb = String(sortCol === 'creadoEn' ? b.creadoEn : b.datos[sortCol] ?? '').toLowerCase();
            if (va < vb) return sortAsc ? -1 : 1;
            if (va > vb) return sortAsc ? 1 : -1;
            return 0;
        });

        return arr;
    }, [registros, busqueda, filtros, sortCol, sortAsc, campos]);

    const totalPages = Math.ceil(registrosFiltrados.length / rowsPerPage);
    const paginatedRegistros = useMemo(() => {
        const start = (currentPage - 1) * rowsPerPage;
        return registrosFiltrados.slice(start, start + rowsPerPage);
    }, [registrosFiltrados, currentPage, rowsPerPage]);

    // Hint de registro de ejemplo
    const campoAsunto = campos.find(c => c.etiqueta.toLowerCase().includes('asunto') || c.etiqueta.toLowerCase().includes('report'));
    const esRegistroEjemplo = registros.length === 1 && campoAsunto &&
        String(registros[0].datos[campoAsunto.id] || '').toLowerCase().includes('ejemplo');

    const cols = camposVisibles;
    const showTable = viewMode === 'table' && !isMobile;
    const hayFiltrosActivos = filtrosActivos.length > 0 || busqueda.trim() !== '';

    return (
        <div>
            {/* Encabezado del módulo (solo PC) */}
            {!isMobile && (
                <div className="module-head" style={{ marginBottom: 20 }}>
                    <h2 style={{ color: modulo.color, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                        {modulo.nombre}
                    </h2>
                    <div className="module-head-actions">
                        <button className="btn-primary" onClick={() => { setEditando(null); setModalOpen(true); }} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Plus size={18} /> Nuevo Registro
                        </button>
                    </div>
                </div>
            )}

            {/* Hint del registro de ejemplo */}
            {esRegistroEjemplo && (
                <div style={{
                    background: '#f0fdfa', border: '1px dashed #5eead4', borderRadius: 12,
                    padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#115e59',
                    display: 'flex', alignItems: 'center', gap: 10,
                }}>
                    <Lightbulb size={20} color="#0d9488" style={{ flexShrink: 0 }} />
                    <span>
                        Este es un <b>registro de ejemplo</b>. Edítalo o bórralo para empezar a trabajar.
                        Cuando guardes el primero real, este mensaje desaparecerá.
                    </span>
                </div>
            )}

            {/* Barra de búsqueda + botón de filtros */}
            <div style={{ display: 'flex', gap: 10, marginBottom: filtrosOpen ? 12 : 20, flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
                    <Search size={18} color="var(--text-muted)" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
                    <input
                        type="text"
                        placeholder="Buscar en todos los campos..."
                        value={busqueda}
                        onChange={e => setBusqueda(e.target.value)}
                        style={{ paddingLeft: 42, borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--border)', width: '100%' }}
                    />
                </div>

                {camposVisibles.length > 0 && (
                    <button
                        onClick={() => setFiltrosOpen(!filtrosOpen)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '10px 16px',
                            background: hayFiltrosActivos ? 'var(--primary)' : 'var(--surface)',
                            color: hayFiltrosActivos ? 'white' : 'var(--text)',
                            border: '1px solid ' + (hayFiltrosActivos ? 'var(--primary)' : 'var(--border)'),
                            borderRadius: 12,
                            fontWeight: 600,
                            fontSize: 14,
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        <SlidersHorizontal size={18} />
                        Filtros
                        {filtrosActivos.length > 0 && (
                            <span style={{
                                background: 'rgba(255,255,255,0.3)',
                                color: 'white',
                                borderRadius: 99,
                                padding: '1px 8px',
                                fontSize: 12,
                                fontWeight: 700,
                            }}>
                                {filtrosActivos.length}
                            </span>
                        )}
                        {filtrosOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                )}

                {hayFiltrosActivos && (
                    <button
                        onClick={limpiarFiltros}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '10px 14px',
                            background: 'transparent',
                            color: '#dc2626',
                            border: '1px solid var(--border)',
                            borderRadius: 12,
                            fontWeight: 600,
                            fontSize: 13,
                            cursor: 'pointer',
                        }}
                    >
                        <X size={16} /> Limpiar
                    </button>
                )}
            </div>

            {/* Panel de filtros por campo (generado dinámicamente) */}
            {filtrosOpen && camposVisibles.length > 0 && (
                <div style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 16,
                    padding: 16,
                    marginBottom: 20,
                    boxShadow: 'var(--shadow-sm)',
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Filtrar por campo
                        </h3>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                            {camposVisibles.length} campo{camposVisibles.length !== 1 ? 's' : ''} disponible{camposVisibles.length !== 1 ? 's' : ''}
                        </span>
                    </div>

                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(220px, 1fr))',
                        gap: 12,
                    }}>
                        {camposVisibles.map(c => {
                            const tipo = tipoFiltroDe(c);
                            const valor = filtros[c.id] ?? '';

                            if (tipo === 'select') {
                                return (
                                    <label key={c.id} style={{ margin: 0, fontSize: 12 }}>
                                        <span style={{ color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4, display: 'block' }}>
                                            {c.etiqueta}
                                        </span>
                                        <select
                                            value={valor}
                                            onChange={e => setFiltro(c.id, e.target.value)}
                                            style={{ borderRadius: 10, fontSize: 13, padding: '8px 10px' }}
                                        >
                                            <option value="">Todos</option>
                                            {c.opciones.map(o => <option key={o} value={o}>{o}</option>)}
                                        </select>
                                    </label>
                                );
                            }

                            if (tipo === 'checkbox') {
                                return (
                                    <label key={c.id} style={{ margin: 0, fontSize: 12 }}>
                                        <span style={{ color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4, display: 'block' }}>
                                            {c.etiqueta}
                                        </span>
                                        <select
                                            value={valor}
                                            onChange={e => setFiltro(c.id, e.target.value)}
                                            style={{ borderRadius: 10, fontSize: 13, padding: '8px 10px' }}
                                        >
                                            <option value="">Todos</option>
                                            <option value="true">Sí</option>
                                            <option value="false">No</option>
                                        </select>
                                    </label>
                                );
                            }

                            if (tipo === 'fecha' || tipo === 'fecha_hora') {
                                const [desde, hasta] = valor.split('|');
                                return (
                                    <div key={c.id} style={{ fontSize: 12 }}>
                                        <span style={{ color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4, display: 'block' }}>
                                            {c.etiqueta}
                                        </span>
                                        <div style={{ display: 'flex', gap: 6 }}>
                                            <input
                                                type="date"
                                                value={desde || ''}
                                                onChange={e => setFiltro(c.id, `${e.target.value}|${hasta || ''}`)}
                                                style={{ borderRadius: 10, fontSize: 12, padding: '6px 8px', flex: 1 }}
                                                title="Desde"
                                            />
                                            <input
                                                type="date"
                                                value={hasta || ''}
                                                onChange={e => setFiltro(c.id, `${desde || ''}|${e.target.value}`)}
                                                style={{ borderRadius: 10, fontSize: 12, padding: '6px 8px', flex: 1 }}
                                                title="Hasta"
                                            />
                                        </div>
                                    </div>
                                );
                            }

                            if (tipo === 'numero') {
                                return (
                                    <label key={c.id} style={{ margin: 0, fontSize: 12 }}>
                                        <span style={{ color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4, display: 'block' }}>
                                            {c.etiqueta}
                                        </span>
                                        <input
                                            type="number"
                                            value={valor}
                                            onChange={e => setFiltro(c.id, e.target.value)}
                                            placeholder="Igual a..."
                                            style={{ borderRadius: 10, fontSize: 13, padding: '8px 10px' }}
                                        />
                                    </label>
                                );
                            }

                            // texto / textarea / correo / telefono
                            return (
                                <label key={c.id} style={{ margin: 0, fontSize: 12 }}>
                                    <span style={{ color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4, display: 'block' }}>
                                        {c.etiqueta}
                                    </span>
                                    <input
                                        type="text"
                                        value={valor}
                                        onChange={e => setFiltro(c.id, e.target.value)}
                                        placeholder="Contiene..."
                                        style={{ borderRadius: 10, fontSize: 13, padding: '8px 10px' }}
                                    />
                                </label>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* TABLA (PC) */}
            {showTable ? (
                <div className="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th onClick={() => handleSort('creadoEn')} style={{ cursor: 'pointer', width: 90 }}>
                                    Fecha {sortCol === 'creadoEn' && (sortAsc ? '↑' : '↓')}
                                </th>
                                {cols.map(c => (
                                    <th key={c.id} onClick={() => handleSort(c.id)} style={{ cursor: 'pointer' }} title={c.etiqueta}>
                                        {c.etiqueta} {sortCol === c.id && (sortAsc ? '↑' : '↓')}
                                    </th>
                                ))}
                                <th style={{ minWidth: 120, textAlign: 'right' }}>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {paginatedRegistros.length === 0 && (
                                <tr>
                                    <td colSpan={cols.length + 2} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                                        <Inbox size={32} style={{ margin: '0 auto 10px', opacity: 0.5 }} />
                                        {registros.length === 0 ? 'Sin registros en este mes.' : 'Ningún registro coincide con los filtros.'}
                                    </td>
                                </tr>
                            )}
                            {paginatedRegistros.map(r => (
                                <tr key={r.id}>
                                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }} title={formatearFecha(r.creadoEn)}>
                                        {tiempoRelativo(r.creadoEn)}
                                    </td>
                                    {cols.map(c => <td key={c.id} title={String(r.datos[c.id] ?? '')}>{renderValor(r.datos[c.id], c, campoEstado)}</td>)}
                                    <td style={{ textAlign: 'right' }}>
                                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                                            <button className="btn-icon" onClick={() => { setEditando(r); setModalOpen(true); }} title="Editar"><Edit3 size={16} /></button>
                                            <button className="btn-icon" onClick={() => duplicarRegistro(r)} title="Duplicar"><Copy size={16} /></button>
                                            <button className="btn-icon btn-danger" onClick={() => eliminarRegistro(r.id)} title="Eliminar"><Trash2 size={16} /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                /* TARJETAS (Móvil) */
                <div className="cards-grid">
                    {paginatedRegistros.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                            <Inbox size={40} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
                            <p style={{ margin: 0 }}>{registros.length === 0 ? 'Sin registros en este mes.' : 'Ningún registro coincide con los filtros.'}</p>
                        </div>
                    )}
                    {paginatedRegistros.map(r => (
                        <div key={r.id} className="record-card">
                            <div className="card-header">
                                <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }} title={formatearFecha(r.creadoEn)}>
                                    {tiempoRelativo(r.creadoEn)}
                                </span>
                                <div style={{ display: 'flex', gap: 4 }}>
                                    <button className="btn-icon" onClick={() => { setEditando(r); setModalOpen(true); }}><Edit3 size={16} /></button>
                                    <button className="btn-icon" onClick={() => duplicarRegistro(r)}><Copy size={16} /></button>
                                    <button className="btn-icon btn-danger" onClick={() => eliminarRegistro(r.id)}><Trash2 size={16} /></button>
                                </div>
                            </div>
                            <div className="card-body">
                                {cols.map(c => (
                                    <div key={c.id} className="card-row">
                                        <span className="card-label">{c.etiqueta}</span>
                                        <span className="card-value">{renderValor(r.datos[c.id], c, campoEstado)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Paginación */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, padding: '0 4px' }}>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                    <b>{registrosFiltrados.length}</b> registros
                    {hayFiltrosActivos && registros.length !== registrosFiltrados.length && (
                        <span style={{ marginLeft: 6 }}>(de {registros.length})</span>
                    )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button className="btn-icon" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}><ChevronLeft size={18} /></button>
                    <span style={{ fontSize: 13, padding: '0 8px', fontWeight: 600 }}>{currentPage} / {totalPages || 1}</span>
                    <button className="btn-icon" disabled={currentPage === totalPages || totalPages === 0} onClick={() => setCurrentPage(p => p + 1)}><ChevronRight size={18} /></button>
                </div>
            </div>

            {modalOpen && (
                <RecordModal
                    moduloId={modulo.id}
                    campos={campos}
                    registro={editando}
                    usuario={usuario}
                    campoEstado={campoEstado}
                    onClose={() => { setModalOpen(false); setEditando(null); }}
                    onSave={() => { setModalOpen(false); setEditando(null); cargar(); onDataChanged(); }}
                />
            )}
        </div>
    );
}

function renderValor(v: any, c: Campo, campoEstado?: Campo | null) {
    if (v === undefined || v === null || v === '') return <span style={{ color: '#94a3b8' }}>—</span>;
    if (c.tipo === 'checkbox') return v ? 'Sí' : 'No';
    if (c.tipo === 'fecha_hora') return formatearFecha(v);
    if (c.tipo === 'fecha') return formatearFechaCorta(v);
    if (c.tipo === 'hora') return formatearHora(v);
    const s = String(v);
    if (c.tipo === 'select' && campoEstado && c.id === campoEstado.id) {
        const color = getStatusColor(s, campoEstado);
        return <span className="badge-estado" style={{ background: color + '18', color: color }}>{s}</span>;
    }
    return s;
}

/* =========================================================
   MODAL DE REGISTRO (sin cambios)
   ========================================================= */
interface RecordModalProps { moduloId: string; campos: Campo[]; registro: Registro | null; usuario: string; campoEstado: Campo | null; onClose: () => void; onSave: () => void; }

function RecordModal({ moduloId, campos, registro, usuario, campoEstado, onClose, onSave }: RecordModalProps) {
    const [datos, setDatos] = useState<Record<string, any>>(() => {
        const d: Record<string, any> = {};
        for (const c of campos) {
            if (registro && registro.datos[c.id] !== undefined) d[c.id] = registro.datos[c.id];
            else if (!registro && c.autoFechaCreacion && c.tipo === 'fecha_hora') d[c.id] = nowLocalISO();
            else d[c.id] = c.tipo === 'checkbox' ? false : '';
        }
        return d;
    });

    function setValor(campoId: string, valor: any) {
        setDatos(prev => {
            const next = { ...prev, [campoId]: valor };
            for (const c of campos) { if (c.autoFechaEstadoId === campoId && valor === c.autoFechaEstadoValor) next[c.id] = nowLocalISO(); }
            return next;
        });
    }

    function validar(): string | null {
        for (const c of campos) {
            const raw = datos[c.id]; const str = String(raw ?? '').trim();
            if (c.requerido && c.tipo !== 'checkbox' && !str) return `"${c.etiqueta}" es obligatorio.`;
        }
        return null;
    }

    async function guardar(e: React.FormEvent) {
        e.preventDefault();
        const error = validar();
        if (error) { alert(error); return; }
        const datosFinales: Record<string, any> = {};
        for (const c of campos) {
            const raw = datos[c.id];
            if (c.tipo === 'fecha_hora' && raw) datosFinales[c.id] = new Date(raw).toISOString();
            else datosFinales[c.id] = raw ?? '';
        }
        let historial: HistorialEntry[] = registro?.historial || [];
        if (campoEstado) {
            const nuevoEstado = datosFinales[campoEstado.id]; const viejoEstado = registro?.datos[campoEstado.id];
            if (nuevoEstado && nuevoEstado !== viejoEstado) historial = [...historial, { fecha: ahoraISO(), estado: nuevoEstado, usuario }];
        }
        if (registro) { await db.registros.update(registro.id, { datos: datosFinales, actualizadoEn: ahoraISO(), historial }); }
        else {
            await db.registros.add({ id: uuid(), moduloId, creadoEn: ahoraISO(), actualizadoEn: ahoraISO(), datos: datosFinales, historial });
        }
        onSave();
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-panel" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>{registro ? 'Editar' : 'Nuevo'} registro</h3>
                    <button className="btn-icon-close" onClick={onClose}><X size={20} /></button>
                </div>
                <form onSubmit={guardar} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                    <div className="modal-body">
                        <div className="form-grid">
                            {campos.map(c => (
                                <label key={c.id} className={c.tipo === 'textarea' ? 'full' : ''}>
                                    {c.etiqueta}{c.requerido && <span style={{ color: '#dc2626' }}> *</span>}
                                    {renderInput(c, datos[c.id], v => setValor(c.id, v))}
                                </label>
                            ))}
                        </div>
                    </div>
                    <div className="modal-footer">
                        <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
                        <button type="submit" className="btn-primary">Guardar Registro</button>
                    </div>
                </form>
            </div>
        </div>
    );
}

function renderInput(c: Campo, valor: any, onChange: (v: any) => void) {
    switch (c.tipo) {
        case 'textarea': return <textarea value={valor ?? ''} onChange={e => onChange(e.target.value)} rows={4} />;
        case 'numero': return <input type="number" value={valor ?? ''} onChange={e => onChange(e.target.value)} min={c.min} max={c.max} />;
        case 'telefono': return <input type="tel" value={valor ?? ''} onChange={e => onChange(e.target.value)} />;
        case 'correo': return <input type="email" value={valor ?? ''} onChange={e => onChange(e.target.value)} />;
        case 'fecha': return <input type="date" value={valor ?? ''} onChange={e => onChange(e.target.value)} />;
        case 'hora': return <input type="time" value={valor ?? ''} onChange={e => onChange(e.target.value)} />;
        case 'fecha_hora': return <input type="datetime-local" value={toDateTimeLocal(valor)} onChange={e => onChange(e.target.value)} />;
        case 'select': return (
            <select value={valor ?? ''} onChange={e => onChange(e.target.value)}>
                <option value="">— Seleccionar —</option>
                {c.opciones.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
        );
        case 'checkbox': return (
            <span className="checkbox-label">
                <input type="checkbox" checked={!!valor} onChange={e => onChange(e.target.checked)} /> Sí
            </span>
        );
        default: return <input type="text" value={valor ?? ''} onChange={e => onChange(e.target.value)} />;
    }
}