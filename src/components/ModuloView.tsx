import { useEffect, useState, useMemo } from 'react';
import {
    db, uuid, ahoraISO, nowLocalISO, toDateTimeLocal,
    formatearFecha, formatearFechaCorta, formatearHora, tiempoRelativo,
    type Modulo, type Campo, type Registro, type HistorialEntry,
} from '@/lib/db';
import { exportarRegistrosAExcel } from '@/lib/export';

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
    if (k.match(/(termin|cumpl|instal|activ|ok|conectado)/)) return 'var(--success)';
    if (k.match(/(proceso|pendient|visto|revis|espera)/)) return 'var(--warning)';
    return 'var(--error)';
}

function esDelMes(iso: string, anio: number, mes: number): boolean {
    const d = new Date(iso);
    return d.getFullYear() === anio && d.getMonth() === mes;
}

export default function ModuloView({ modulo, campos, viewMode, isMobile, anio, mes, usuario, onDataChanged }: Props) {
    const [registros, setRegistros] = useState<Registro[]>([]);
    const [modalOpen, setModalOpen] = useState(false);
    const [editando, setEditando] = useState<Registro | null>(null);

    const [busqueda, setBusqueda] = useState('');
    const [filtroEstado, setFiltroEstado] = useState('');
    const [fechaDesde, setFechaDesde] = useState('');
    const [fechaHasta, setFechaHasta] = useState('');

    const [sortCol, setSortCol] = useState<string>('creadoEn');
    const [sortAsc, setSortAsc] = useState(false);

    const [currentPage, setCurrentPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState(20);

    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    async function cargar() {
        const todos = await db.registros.where('moduloId').equals(modulo.id).toArray();
        const filtrados = todos.filter(r => {
            if (!esDelMes(r.creadoEn, anio, mes)) return false;
            if (fechaDesde && r.creadoEn < new Date(fechaDesde).toISOString()) return false;
            if (fechaHasta && r.creadoEn > new Date(fechaHasta + 'T23:59:59').toISOString()) return false;
            return true;
        });
        setRegistros(filtrados);
    }

    useEffect(() => { cargar(); }, [modulo.id, anio, mes]);

    useEffect(() => {
        const handleOpenModal = () => {
            setEditando(null);
            setModalOpen(true);
        };
        window.addEventListener('abrir-nuevo-registro', handleOpenModal);
        return () => window.removeEventListener('abrir-nuevo-registro', handleOpenModal);
    }, []);

    useEffect(() => { setCurrentPage(1); }, [busqueda, filtroEstado, fechaDesde, fechaHasta]);

    async function eliminarRegistro(id: string) {
        if (confirm('¿Eliminar este registro?')) {
            await db.registros.delete(id);
            cargar();
        }
    }

    async function duplicarRegistro(r: Registro) {
        const { id: _i, creadoEn: _c, actualizadoEn: _a, historial: _h, ...resto } = r;
        await db.registros.add({
            ...resto, id: uuid(), creadoEn: ahoraISO(), actualizadoEn: ahoraISO(),
            historial: [{ fecha: ahoraISO(), estado: 'Creado (Duplicado)', usuario }],
        });
        cargar();
    }

    function toggleSelect(id: string) {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id); else next.add(id);
        setSelectedIds(next);
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

    const registrosFiltrados = useMemo(() => {
        let arr = [...registros];
        if (filtroEstado && campoEstado) arr = arr.filter(r => r.datos[campoEstado.id] === filtroEstado);
        if (busqueda.trim()) {
            const txt = busqueda.toLowerCase();
            arr = arr.filter(r => Object.values(r.datos).some(v => String(v).toLowerCase().includes(txt)));
        }
        arr.sort((a, b) => {
            const va = String(sortCol === 'creadoEn' ? a.creadoEn : a.datos[sortCol] ?? '').toLowerCase();
            const vb = String(sortCol === 'creadoEn' ? b.creadoEn : b.datos[sortCol] ?? '').toLowerCase();
            if (va < vb) return sortAsc ? -1 : 1;
            if (va > vb) return sortAsc ? 1 : -1;
            return 0;
        });
        return arr;
    }, [registros, busqueda, filtroEstado, sortCol, sortAsc, campoEstado]);

    const totalPages = Math.ceil(registrosFiltrados.length / rowsPerPage);
    const paginatedRegistros = useMemo(() => {
        const start = (currentPage - 1) * rowsPerPage;
        return registrosFiltrados.slice(start, start + rowsPerPage);
    }, [registrosFiltrados, currentPage, rowsPerPage]);

    const statsPorEstado: Record<string, number> = {};
    if (campoEstado) opcionesEstado.forEach(op => (statsPorEstado[op] = 0));
    registros.forEach(r => {
        const val = campoEstado ? r.datos[campoEstado.id] : null;
        if (val && statsPorEstado[val] !== undefined) statsPorEstado[val]++;
    });

    let tasaCompletado = 0;
    if (registros.length > 0 && campoEstado) {
        if (campoEstado.estadoCompletado && statsPorEstado[campoEstado.estadoCompletado] !== undefined) {
            tasaCompletado = (statsPorEstado[campoEstado.estadoCompletado] / registros.length) * 100;
        } else {
            let cnt = 0;
            Object.entries(statsPorEstado).forEach(([estado, n]) => {
                if (estado.toLowerCase().match(/(termin|cumpl|instal|activ|ok|conectado)/)) cnt += n;
            });
            tasaCompletado = (cnt / registros.length) * 100;
        }
    }

    const cols = campos.filter(c => c.mostrarEnTabla);
    const showTable = viewMode === 'table' && !isMobile;

    return (
        <div>
            <div className="module-head">
                <h2 style={{ color: modulo.color }}>{modulo.icono} {modulo.nombre}</h2>
                {!isMobile && (
                    <div className="module-head-actions">
                        <button className="btn-primary" onClick={() => { setEditando(null); setModalOpen(true); }}>
                            + Nuevo Registro
                        </button>
                    </div>
                )}
            </div>

            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-title">Total</div>
                    <div className="stat-number">{registros.length}</div>
                </div>
                {campoEstado && (
                    <>
                        <div className="stat-card" style={{ borderLeftColor: 'var(--success)' }}>
                            <div className="stat-title">Completado</div>
                            <div className="stat-number">{tasaCompletado.toFixed(0)}%</div>
                        </div>
                        {opcionesEstado.slice(0, 3).map(op => (
                            <div key={op} className="stat-card" style={{ borderLeftColor: getStatusColor(op, campoEstado) }}>
                                <div className="stat-title">{op}</div>
                                <div className="stat-number">{statsPorEstado[op]}</div>
                            </div>
                        ))}
                    </>
                )}
            </div>

            <div className="filtros-bar">
                <input type="text" placeholder="🔍 Buscar..." value={busqueda} onChange={e => setBusqueda(e.target.value)} className="buscador" />
                {opcionesEstado.length > 0 && (
                    <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} className="filtro-select">
                        <option value="">Todos los estados</option>
                        {opcionesEstado.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                )}
            </div>

            {showTable ? (
                <div className="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th onClick={() => handleSort('creadoEn')} style={{ cursor: 'pointer', width: 70 }}>
                                    Creado {sortCol === 'creadoEn' && (sortAsc ? '↑' : '↓')}
                                </th>
                                {cols.map(c => (
                                    <th key={c.id} onClick={() => handleSort(c.id)} style={{ cursor: 'pointer' }} title={c.etiqueta}>
                                        {c.etiqueta} {sortCol === c.id && (sortAsc ? '↑' : '↓')}
                                    </th>
                                ))}
                                <th style={{ minWidth: 100 }}>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {paginatedRegistros.length === 0 && (
                                <tr><td colSpan={cols.length + 2} className="empty">{registros.length === 0 ? 'Sin registros en este mes.' : 'Ningún registro coincide.'}</td></tr>
                            )}
                            {paginatedRegistros.map(r => (
                                <tr key={r.id}>
                                    <td style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }} title={formatearFecha(r.creadoEn)}>
                                        {tiempoRelativo(r.creadoEn)}
                                    </td>
                                    {cols.map(c => <td key={c.id} title={String(r.datos[c.id] ?? '')}>{renderValor(r.datos[c.id], c, campoEstado)}</td>)}
                                    <td className="actions">
                                        <button className="btn-icon" onClick={() => { setEditando(r); setModalOpen(true); }} title="Editar">✎</button>
                                        <button className="btn-icon" onClick={() => duplicarRegistro(r)} title="Duplicar">📋</button>
                                        <button className="btn-icon btn-danger" onClick={() => eliminarRegistro(r.id)} title="Eliminar">🗑</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="cards-grid">
                    {paginatedRegistros.length === 0 && (
                        <div className="empty-module" style={{ gridColumn: '1/-1' }}>
                            <p>{registros.length === 0 ? 'Sin registros en este mes.' : 'Ningún registro coincide.'}</p>
                        </div>
                    )}
                    {paginatedRegistros.map(r => (
                        <div key={r.id} className="record-card">
                            <div className="card-header">
                                <span style={{ fontSize: 11, color: 'var(--text-muted)' }} title={formatearFecha(r.creadoEn)}>
                                    {tiempoRelativo(r.creadoEn)}
                                </span>
                                <div className="actions">
                                    <button className="btn-icon" onClick={() => { setEditando(r); setModalOpen(true); }}>✎</button>
                                    <button className="btn-icon" onClick={() => duplicarRegistro(r)}>📋</button>
                                    <button className="btn-icon btn-danger" onClick={() => eliminarRegistro(r.id)}>🗑</button>
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

            <div className="pagination-bar">
                <div className="pagination-info">
                    <b>{registrosFiltrados.length}</b> registros
                </div>
                <div className="pagination-controls">
                    <button className="btn-ghost" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>‹</button>
                    <span style={{ fontSize: 13, padding: '0 8px' }}>{currentPage}/{totalPages || 1}</span>
                    <button className="btn-ghost" disabled={currentPage === totalPages || totalPages === 0} onClick={() => setCurrentPage(p => p + 1)}>›</button>
                </div>
            </div>

            {isMobile && (
                <button className="fab-new" onClick={() => { setEditando(null); setModalOpen(true); }}>
                    +
                </button>
            )}

            {modalOpen && (
                <RecordModal moduloId={modulo.id} campos={campos} registro={editando} usuario={usuario} campoEstado={campoEstado} onClose={() => { setModalOpen(false); setEditando(null); }} onSave={() => { setModalOpen(false); setEditando(null); cargar(); onDataChanged(); }} />
            )}
        </div>
    );
}

function renderValor(v: any, c: Campo, campoEstado?: Campo | null) {
    if (v === undefined || v === null || v === '') return <span style={{ color: 'var(--text-muted)' }}>—</span>;
    if (c.tipo === 'checkbox') return v ? 'Sí' : 'No';
    if (c.tipo === 'fecha_hora') return formatearFecha(v);
    if (c.tipo === 'fecha') return formatearFechaCorta(v);
    if (c.tipo === 'hora') return formatearHora(v);
    const s = String(v);
    if (c.tipo === 'select' && campoEstado && c.id === campoEstado.id) {
        const color = getStatusColor(s, campoEstado);
        return <span className="badge-estado" style={{ background: color + '22', color: color }}>{s}</span>;
    }
    return s;
}

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
                    <button className="btn-icon-close" onClick={onClose}>✕</button>
                </div>
                <form onSubmit={guardar}>
                    <div className="modal-body">
                        <div className="form-grid">
                            {campos.map(c => (
                                <label key={c.id} className={c.tipo === 'textarea' ? 'full' : ''}>
                                    {c.etiqueta}{c.requerido && <span style={{ color: 'var(--error)' }}> *</span>}
                                    {renderInput(c, datos[c.id], v => setValor(c.id, v))}
                                </label>
                            ))}
                        </div>
                    </div>
                    <div className="modal-footer">
                        <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
                        <button type="submit" className="btn-primary">Guardar</button>
                    </div>
                </form>
            </div>
        </div>
    );
}

function renderInput(c: Campo, valor: any, onChange: (v: any) => void) {
    switch (c.tipo) {
        case 'textarea': return <textarea value={valor ?? ''} onChange={e => onChange(e.target.value)} rows={3} />;
        case 'numero': return <input type="number" value={valor ?? ''} onChange={e => onChange(e.target.value)} min={c.min} max={c.max} />;
        case 'telefono': return <input type="tel" value={valor ?? ''} onChange={e => onChange(e.target.value)} />;
        case 'correo': return <input type="email" value={valor ?? ''} onChange={e => onChange(e.target.value)} />;
        case 'fecha': return <input type="date" value={valor ?? ''} onChange={e => onChange(e.target.value)} />;
        case 'hora': return <input type="time" value={valor ?? ''} onChange={e => onChange(e.target.value)} />;
        case 'fecha_hora': return <input type="datetime-local" value={toDateTimeLocal(valor)} onChange={e => onChange(e.target.value)} />;
        case 'select': return <select value={valor ?? ''} onChange={e => onChange(e.target.value)}><option value="">— Seleccionar —</option>{c.opciones.map(o => <option key={o} value={o}>{o}</option>)}</select>;
        case 'checkbox': return <span className="checkbox-label"><input type="checkbox" checked={!!valor} onChange={e => onChange(e.target.checked)} /> Sí</span>;
        default: return <input type="text" value={valor ?? ''} onChange={e => onChange(e.target.value)} />;
    }
}