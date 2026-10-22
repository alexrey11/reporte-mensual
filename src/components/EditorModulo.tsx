import { useState } from 'react';
import { db, uuid, type Modulo, type Campo, type TipoCampo } from '@/lib/db';

interface Props {
    modulo: Modulo | null;
    campos: Campo[];
    onClose: () => void;
    onSave: () => void;
}

const TIPOS: TipoCampo[] = ['texto', 'textarea', 'numero', 'telefono', 'correo', 'fecha', 'hora', 'fecha_hora', 'select', 'checkbox'];

export default function EditorModulo({ modulo, campos, onClose, onSave }: Props) {
    const [nombre, setNombre] = useState(modulo?.nombre ?? '');
    const [icono, setIcono] = useState(modulo?.icono ?? '📄');
    const [color, setColor] = useState(modulo?.color ?? '#8b5cf6');
    const [lista, setLista] = useState<Campo[]>(campos.map(c => ({ ...c })));
    const [editandoCampo, setEditandoCampo] = useState<{ campo: Campo | null; index: number } | null>(null);
    const [dragIdx, setDragIdx] = useState<number | null>(null);

    async function guardar() {
        if (!nombre.trim()) { alert('El nombre del módulo es obligatorio'); return; }
        let modId = modulo?.id;
        if (!modId) {
            modId = uuid();
            const orden = await db.modulos.count();
            await db.modulos.add({
                id: modId,
                nombre: nombre.trim(),
                icono: icono.trim() || '📄',
                color,
                orden,
                creadoEn: new Date().toISOString(),
            });
        } else {
            await db.modulos.update(modId, { nombre: nombre.trim(), icono: icono.trim() || '📄', color });
        }
        const existentes = await db.campos.where('moduloId').equals(modId).toArray();
        const idsActuales = lista.map(c => c.id);
        for (const old of existentes) if (!idsActuales.includes(old.id)) await db.campos.delete(old.id);
        for (let i = 0; i < lista.length; i++) {
            await db.campos.put({ ...lista[i], moduloId: modId, orden: i });
        }
        onSave();
    }

    function reorder(from: number, to: number) {
        const copia = [...lista];
        const [mov] = copia.splice(from, 1);
        copia.splice(to, 0, mov);
        setLista(copia);
    }

    const selectsDelModulo = lista.filter(c => c.tipo === 'select');

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-panel" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>{modulo ? 'Editar módulo' : 'Nuevo módulo'}</h3>
                    <button className="btn-icon-close" onClick={onClose}>✕</button>
                </div>
                <div className="modal-body">
                    <div className="form-grid">
                        <label>Nombre del módulo
                            <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej: Reporte de escudos" />
                        </label>
                        <label>Ícono (emoji)
                            <input value={icono} onChange={e => setIcono(e.target.value)} maxLength={4} />
                        </label>
                        <label>Color
                            <input type="color" value={color} onChange={e => setColor(e.target.value)} style={{ height: 38, padding: 4 }} />
                        </label>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, marginBottom: 10 }}>
                        <strong>Campos del módulo</strong>
                        <button
                            type="button"
                            className="btn-primary"
                            style={{ padding: '6px 12px', fontSize: 13 }}
                            onClick={() => setEditandoCampo({ campo: null, index: -1 })}
                        >
                            + Agregar campo
                        </button>
                    </div>

                    <div className="field-list">
                        {lista.length === 0 && (
                            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Aún no hay campos. Agrega al menos uno.</p>
                        )}
                        {lista.map((c, i) => (
                            <div
                                key={c.id}
                                className={`field-item ${dragIdx === i ? 'dragging' : ''}`}
                                draggable
                                onDragStart={() => setDragIdx(i)}
                                onDragEnd={() => setDragIdx(null)}
                                onDragOver={e => e.preventDefault()}
                                onDrop={() => { if (dragIdx !== null && dragIdx !== i) reorder(dragIdx, i); setDragIdx(null); }}
                            >
                                <span className="drag-handle">⋮⋮</span>
                                <div className="field-info">
                                    <strong>{c.etiqueta}</strong>
                                    <span className="field-type">{c.tipo}</span>
                                    {c.requerido && <span className="badge-tag">Req</span>}
                                    {c.mostrarEnTabla && <span className="badge-tag">Tabla</span>}
                                    {c.autoFechaCreacion && <span className="badge-tag">Auto</span>}
                                    {c.autoFechaEstadoId && <span className="badge-tag">Auto-Estado</span>}
                                </div>
                                <div className="actions">
                                    <button type="button" className="btn-icon" onClick={() => setEditandoCampo({ campo: c, index: i })}>✎</button>
                                    <button
                                        type="button"
                                        className="btn-icon btn-danger"
                                        onClick={() => {
                                            if (confirm(`¿Eliminar el campo "${c.etiqueta}"?`)) {
                                                setLista(lista.filter((_, idx) => idx !== i));
                                            }
                                        }}
                                    >
                                        🗑
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="modal-footer">
                    <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
                    <button type="button" className="btn-primary" onClick={guardar}>Guardar módulo</button>
                </div>
            </div>

            {editandoCampo && (
                <FieldEditor
                    campo={editandoCampo.campo}
                    selectsDelModulo={selectsDelModulo}
                    onClose={() => setEditandoCampo(null)}
                    onSave={(nuevoCampo) => {
                        const copia = [...lista];
                        if (editandoCampo.index === -1) copia.push(nuevoCampo);
                        else copia[editandoCampo.index] = nuevoCampo;
                        setLista(copia);
                        setEditandoCampo(null);
                    }}
                />
            )}
        </div>
    );
}

/* ---------- Editor de campo ---------- */
interface FieldEditorProps {
    campo: Campo | null;
    selectsDelModulo: Campo[];
    onClose: () => void;
    onSave: (campo: Campo) => void;
}
function FieldEditor({ campo, selectsDelModulo, onClose, onSave }: FieldEditorProps) {
    const [etiqueta, setEtiqueta] = useState(campo?.etiqueta ?? '');
    const [tipo, setTipo] = useState<TipoCampo>(campo?.tipo ?? 'texto');
    const [opciones, setOpciones] = useState((campo?.opciones ?? []).join('\n'));
    const [requerido, setRequerido] = useState(campo?.requerido ?? false);
    const [mostrarEnTabla, setMostrarEnTabla] = useState(campo?.mostrarEnTabla ?? false);
    const [autoFechaCreacion, setAutoFechaCreacion] = useState(campo?.autoFechaCreacion ?? false);
    const [autoFechaEstadoId, setAutoFechaEstadoId] = useState(campo?.autoFechaEstadoId ?? '');
    const [autoFechaEstadoValor, setAutoFechaEstadoValor] = useState(campo?.autoFechaEstadoValor ?? '');
    const [min, setMin] = useState<string>(campo?.min !== undefined ? String(campo.min) : '');
    const [max, setMax] = useState<string>(campo?.max !== undefined ? String(campo.max) : '');
    const [noFuturo, setNoFuturo] = useState(campo?.noFuturo ?? false);
    const [estadoCompletado, setEstadoCompletado] = useState(campo?.estadoCompletado ?? '');
    const [coloresOpciones, setColoresOpciones] = useState<Record<string, string>>(campo?.coloresOpciones ?? {});

    const selectElegido = selectsDelModulo.find(s => s.id === autoFechaEstadoId);
    const opcsLive = opciones.split('\n').map(s => s.trim()).filter(Boolean);

    const colorDefault = (op: string) => {
        const k = op.toLowerCase();
        if (k.match(/(termin|cumpl|instal|activ|ok)/)) return '#16a34a';
        if (k.match(/(proceso|pendient|visto|revis)/)) return '#f59e0b';
        return '#dc2626';
    };

    function guardar() {
        if (!etiqueta.trim()) { alert('La etiqueta del campo es obligatoria'); return; }
        const opcs = tipo === 'select' ? opcsLive : [];
        if (tipo === 'select' && opcs.length === 0) { alert('Un campo select necesita al menos una opción'); return; }
        onSave({
            id: campo?.id ?? uuid(),
            moduloId: campo?.moduloId ?? '',
            etiqueta: etiqueta.trim(),
            tipo,
            requerido,
            mostrarEnTabla,
            orden: campo?.orden ?? 0,
            opciones: opcs,
            autoFechaCreacion,
            autoFechaEstadoId: autoFechaEstadoId || null,
            autoFechaEstadoValor: autoFechaEstadoId ? autoFechaEstadoValor : null,
            min: tipo === 'numero' && min !== '' ? Number(min) : undefined,
            max: tipo === 'numero' && max !== '' ? Number(max) : undefined,
            noFuturo: tipo === 'fecha' ? noFuturo : undefined,
            estadoCompletado: tipo === 'select' && estadoCompletado ? estadoCompletado : null,
            coloresOpciones: tipo === 'select' ? coloresOpciones : {},
        });
    }

    return (
        <div className="modal-overlay modal-nested" onClick={onClose}>
            <div className="modal-panel" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
                <div className="modal-header">
                    <h3>{campo ? 'Editar campo' : 'Nuevo campo'}</h3>
                    <button className="btn-icon-close" onClick={onClose}>✕</button>
                </div>
                <div className="modal-body">
                    <div className="form-grid">
                        <label>Etiqueta
                            <input value={etiqueta} onChange={e => setEtiqueta(e.target.value)} placeholder="Ej: Estado" />
                        </label>
                        <label>Tipo
                            <select value={tipo} onChange={e => setTipo(e.target.value as TipoCampo)}>
                                {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </label>
                    </div>

                    {tipo === 'select' && (
                        <label style={{ marginTop: 12 }}>Opciones (una por línea)
                            <textarea value={opciones} onChange={e => setOpciones(e.target.value)} rows={4}
                                placeholder={'En proceso\nVisto\nTerminado'} />
                        </label>
                    )}

                    {tipo === 'select' && opcsLive.length > 0 && (
                        <>
                            <label style={{ marginTop: 12 }}>¿Qué opción cuenta como <b>completada</b>?
                                <select value={estadoCompletado} onChange={e => setEstadoCompletado(e.target.value)}>
                                    <option value="">— Automático (por nombre) —</option>
                                    {opcsLive.map(o => <option key={o} value={o}>{o}</option>)}
                                </select>
                            </label>

                            <div style={{ marginTop: 12 }}>
                                <strong style={{ fontSize: 13 }}>Colores por opción</strong>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
                                    {opcsLive.map(o => (
                                        <div key={o} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <span style={{ flex: 1, fontSize: 13 }}>{o}</span>
                                            <input
                                                type="color"
                                                value={coloresOpciones[o] || colorDefault(o)}
                                                onChange={e => setColoresOpciones({ ...coloresOpciones, [o]: e.target.value })}
                                                style={{ width: 40, height: 30, padding: 2 }}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}

                    {tipo === 'numero' && (
                        <div className="form-grid" style={{ marginTop: 12 }}>
                            <label>Valor mínimo<input type="number" value={min} onChange={e => setMin(e.target.value)} /></label>
                            <label>Valor máximo<input type="number" value={max} onChange={e => setMax(e.target.value)} /></label>
                        </div>
                    )}

                    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <label className="checkbox-label"><input type="checkbox" checked={requerido} onChange={e => setRequerido(e.target.checked)} /> Requerido</label>
                        <label className="checkbox-label"><input type="checkbox" checked={mostrarEnTabla} onChange={e => setMostrarEnTabla(e.target.checked)} /> Mostrar en tabla</label>
                        {tipo === 'fecha_hora' && (
                            <label className="checkbox-label"><input type="checkbox" checked={autoFechaCreacion} onChange={e => setAutoFechaCreacion(e.target.checked)} /> Auto-rellenar con fecha/hora al crear</label>
                        )}
                        {tipo === 'fecha' && (
                            <label className="checkbox-label"><input type="checkbox" checked={noFuturo} onChange={e => setNoFuturo(e.target.checked)} /> No permitir fechas futuras</label>
                        )}
                    </div>

                    {selectsDelModulo.length > 0 && tipo === 'fecha_hora' && (
                        <div className="form-grid" style={{ marginTop: 14 }}>
                            <label>Auto-fecha al cambiar select
                                <select value={autoFechaEstadoId} onChange={e => { setAutoFechaEstadoId(e.target.value); setAutoFechaEstadoValor(''); }}>
                                    <option value="">— Ninguno —</option>
                                    {selectsDelModulo.map(s => <option key={s.id} value={s.id}>{s.etiqueta}</option>)}
                                </select>
                            </label>
                            {selectElegido && (
                                <label>Cuando el valor sea
                                    <select value={autoFechaEstadoValor} onChange={e => setAutoFechaEstadoValor(e.target.value)}>
                                        <option value="">— Elegir —</option>
                                        {selectElegido.opciones.map(o => <option key={o} value={o}>{o}</option>)}
                                    </select>
                                </label>
                            )}
                        </div>
                    )}
                </div>
                <div className="modal-footer">
                    <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
                    <button type="button" className="btn-primary" onClick={guardar}>Guardar campo</button>
                </div>
            </div>
        </div>
    );
}