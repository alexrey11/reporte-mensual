import { useState } from 'react';
import * as XLSX from 'xlsx';
import { db, uuid, ahoraISO, type Modulo, type Campo, type TipoCampo } from '@/lib/db';

interface Props {
    modulo?: Modulo | null;
    campos?: Campo[];
    onClose: () => void;
    onImported: (nuevoModuloId?: string) => void;
}

type Modo = 'elegir' | 'actual' | 'nuevo';
type Mapeo = Record<number, string>;
type TiposMapeo = Record<number, TipoCampo>;

function detectarTipo(filas: any[][], colIdx: number): TipoCampo {
    const valores = filas.slice(0, 50).map(f => f[colIdx]).filter(v => v !== '' && v != null);
    if (valores.length === 0) return 'texto';

    const parecenFechasSerial = valores.filter(v => typeof v === 'number' && v > 20000 && v < 60000).length;
    if (parecenFechasSerial > valores.length * 0.7) return 'fecha';

    const todosFechas = valores.every(v => {
        if (v instanceof Date) return true;
        const s = String(v);
        if (!/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/.test(s) && !/^\d{4}-\d{2}-\d{2}/.test(s)) return false;
        return !isNaN(new Date(s).getTime());
    });
    if (todosFechas) {
        const tieneHora = valores.some(v => {
            if (v instanceof Date) return v.getHours() !== 0 || v.getMinutes() !== 0;
            return /\d{1,2}:\d{2}/.test(String(v));
        });
        return tieneHora ? 'fecha_hora' : 'fecha';
    }

    const todosNumeros = valores.every(v => typeof v === 'number' || (!isNaN(Number(String(v))) && String(v).trim() !== ''));
    if (todosNumeros) return 'numero';

    const todosCorreos = valores.every(v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v)));
    if (todosCorreos) return 'correo';

    const todosTelefonos = valores.every(v => /^[\d+\-\s()]{7,}$/.test(String(v)));
    if (todosTelefonos) return 'telefono';

    const promedioLong = valores.reduce((a, v) => a + String(v).length, 0) / valores.length;
    if (promedioLong > 80) return 'textarea';

    const unicos = new Set(valores.map(v => String(v)));
    const esEstado = Array.from(unicos).some(v =>
        /termin|cumpl|instal|activ|ok|pendient|proceso|error|visto|revis|espera|conectado/i.test(v)
    );
    if (unicos.size <= 8 && valores.length >= 5 && esEstado) return 'select';

    return 'texto';
}

function parseValor(v: any, tipo: TipoCampo): any {
    if (v === undefined || v === null || v === '') return '';
    if (tipo === 'fecha_hora' || tipo === 'fecha') {
        if (typeof v === 'number' && v > 20000 && v < 60000) {
            const excelEpoch = new Date(1899, 11, 30);
            const fecha = new Date(excelEpoch.getTime() + v * 86400000);
            return tipo === 'fecha' ? fecha.toISOString().split('T')[0] : fecha.toISOString();
        }
        const d = v instanceof Date ? v : new Date(v);
        if (isNaN(d.getTime())) return '';
        return tipo === 'fecha' ? d.toISOString().split('T')[0] : d.toISOString();
    }
    if (tipo === 'checkbox') {
        const s = String(v).toLowerCase();
        return v === true || s === 'sí' || s === 'si' || s === '1' || s === 'true' || s === 'x';
    }
    if (tipo === 'numero') {
        const n = Number(v);
        return isNaN(n) ? '' : n;
    }
    return String(v).trim();
}

function detectarColumnasVacias(filas: any[][], totalCols: number): Set<number> {
    const vacias = new Set<number>();
    for (let i = 0; i < totalCols; i++) {
        const tieneDatos = filas.some(f => {
            const v = f[i];
            return v !== '' && v !== null && v !== undefined;
        });
        if (!tieneDatos) vacias.add(i);
    }
    return vacias;
}

export default function ImportarExcel({ modulo, campos, onClose, onImported }: Props) {
    const [modo, setModo] = useState<Modo>(modulo ? 'elegir' : 'nuevo');
    const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
    const [selectedSheet, setSelectedSheet] = useState('');
    const [skipRows, setSkipRows] = useState(0);
    const [headers, setHeaders] = useState<string[]>([]);
    const [filas, setFilas] = useState<any[][]>([]);
    const [mapeo, setMapeo] = useState<Mapeo>({});
    const [tipos, setTipos] = useState<TiposMapeo>({});
    const [importando, setImportando] = useState(false);
    const [nombreArchivo, setNombreArchivo] = useState('');

    const [nombreNuevo, setNombreNuevo] = useState('');
    const [iconoNuevo, setIconoNuevo] = useState('📊');
    const [colorNuevo, setColorNuevo] = useState('#8b5cf6');

    async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const data = await file.arrayBuffer();
            const wb = XLSX.read(data, { cellDates: true });
            setWorkbook(wb);
            setNombreArchivo(file.name.replace(/\.(xlsx|xls|csv)$/i, ''));
            const primeraHoja = wb.SheetNames[0];
            setSelectedSheet(primeraHoja);
            procesarHoja(wb, primeraHoja, 0);
        } catch (err) {
            alert('No se pudo leer el archivo: ' + (err as Error).message);
        }
        e.target.value = '';
    }

    function procesarHoja(wb: XLSX.WorkBook, sheetName: string, saltar: number) {
        const ws = wb.Sheets[sheetName];
        if (!ws) return;
        const json: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        if (json.length === 0) return;

        const dataRows = json.slice(saltar);
        if (dataRows.length < 1) { alert('La hoja está vacía.'); return; }

        const hdrs = (dataRows[0] as any[]).map((h, i) => String(h || `Columna ${i + 1}`).trim() || `Columna ${i + 1}`);
        const cuerpo = dataRows.slice(1);
        const cuerpoLimpio = cuerpo.filter(fila => fila.some(v => v !== '' && v !== null && v !== undefined));

        setHeaders(hdrs);
        setFilas(cuerpoLimpio);

        const vacias = detectarColumnasVacias(cuerpoLimpio, hdrs.length);

        if (modo === 'nuevo') {
            setNombreNuevo(nombreArchivo.replace(/[_-]+/g, ' '));
            const mapeoNew: Mapeo = {};
            const tiposNew: TiposMapeo = {};
            hdrs.forEach((_, i) => {
                mapeoNew[i] = vacias.has(i) ? '__ignorar__' : '__nuevo__';
                tiposNew[i] = detectarTipo(cuerpoLimpio, i);
            });
            setMapeo(mapeoNew);
            setTipos(tiposNew);
        } else {
            const auto: Mapeo = {};
            hdrs.forEach((h, i) => {
                if (vacias.has(i)) { auto[i] = '__ignorar__'; return; }
                const encontrado = (campos || []).find(c => c.etiqueta.toLowerCase().trim() === h.toLowerCase().trim());
                auto[i] = encontrado ? encontrado.id : '__ignorar__';
            });
            setMapeo(auto);
            const tiposNew: TiposMapeo = {};
            hdrs.forEach((_, i) => { tiposNew[i] = detectarTipo(cuerpoLimpio, i); });
            setTipos(tiposNew);
        }
    }

    function cambiarHoja(nuevaHoja: string) { if (!workbook) return; setSelectedSheet(nuevaHoja); procesarHoja(workbook, nuevaHoja, skipRows); }
    function cambiarSkipRows(nuevoSkip: number) { if (!workbook) return; setSkipRows(nuevoSkip); procesarHoja(workbook, selectedSheet, nuevoSkip); }

    async function importarAlActual() {
        if (!modulo) return;
        setImportando(true);
        try {
            const camposExtra: Campo[] = [];
            for (const [idxStr, target] of Object.entries(mapeo)) {
                if (target !== '__nuevo__') continue;
                const idx = parseInt(idxStr);
                const tipo = tipos[idx] || 'texto';
                const nuevo: Campo = {
                    id: uuid(), moduloId: modulo.id, etiqueta: headers[idx], tipo,
                    requerido: false, mostrarEnTabla: (campos?.length || 0) + camposExtra.length < 6,
                    orden: (campos?.length || 0) + camposExtra.length,
                    opciones: tipo === 'select' ? Array.from(new Set(filas.map(f => String(f[idx] ?? '')).filter(Boolean))).slice(0, 15) : [],
                    autoFechaCreacion: false, autoFechaEstadoId: null, autoFechaEstadoValor: null,
                };
                await db.campos.add(nuevo);
                camposExtra.push(nuevo);
            }
            const todos = [...(campos || []), ...camposExtra];

            let importados = 0;
            for (const fila of filas) {
                const datos: Record<string, any> = {};
                let tieneAlgo = false;
                for (const [idxStr, target] of Object.entries(mapeo)) {
                    if (target === '__ignorar__') continue;
                    const idx = parseInt(idxStr);
                    const campo = todos.find(c => c.id === target);
                    if (!campo) continue;
                    const val = parseValor(fila[idx], campo.tipo);
                    datos[campo.id] = val;
                    if (val !== '' && val !== null && val !== undefined) tieneAlgo = true;
                }
                if (!tieneAlgo) continue;
                await db.registros.add({ id: uuid(), moduloId: modulo.id, creadoEn: ahoraISO(), actualizadoEn: ahoraISO(), datos, historial: [] });
                importados++;
            }
            alert(`✅ Importación exitosa: ${importados} registros.`);
            onImported();
        } catch (err) { alert('Error al importar: ' + (err as Error).message); } finally { setImportando(false); }
    }

    async function crearModuloDesdeExcel() {
        if (!nombreNuevo.trim()) { alert('Ponle un nombre al módulo nuevo.'); return; }
        setImportando(true);
        try {
            const nuevoModuloId = uuid();
            const orden = await db.modulos.count();
            await db.modulos.add({ id: nuevoModuloId, nombre: nombreNuevo.trim(), icono: iconoNuevo || '📊', color: colorNuevo, orden, creadoEn: ahoraISO() });

            const camposCreados: { campo: Campo; colIdx: number }[] = [];
            const idxs = Object.keys(mapeo).map(Number).sort((a, b) => a - b);
            for (const idx of idxs) {
                if (mapeo[idx] === '__ignorar__') continue;
                const tipo = tipos[idx] || 'texto';
                const opciones = tipo === 'select' ? Array.from(new Set(filas.map(f => String(f[idx] ?? '')).filter(Boolean))).slice(0, 20) : [];
                const campo: Campo = {
                    id: uuid(), moduloId: nuevoModuloId, etiqueta: headers[idx], tipo,
                    requerido: false, mostrarEnTabla: camposCreados.length < 6, orden: camposCreados.length,
                    opciones, autoFechaCreacion: false, autoFechaEstadoId: null, autoFechaEstadoValor: null,
                };
                await db.campos.add(campo);
                camposCreados.push({ campo, colIdx: idx });
            }

            if (camposCreados.length === 0) { await db.modulos.delete(nuevoModuloId); alert('Mapea al menos una columna.'); setImportando(false); return; }

            let importados = 0;
            for (const fila of filas) {
                const datos: Record<string, any> = {};
                let tieneAlgo = false;
                for (const { campo, colIdx } of camposCreados) {
                    const val = parseValor(fila[colIdx], campo.tipo);
                    datos[campo.id] = val;
                    if (val !== '' && val !== null && val !== undefined) tieneAlgo = true;
                }
                if (!tieneAlgo) continue;
                await db.registros.add({ id: uuid(), moduloId: nuevoModuloId, creadoEn: ahoraISO(), actualizadoEn: ahoraISO(), datos, historial: [] });
                importados++;
            }
            alert(`✅ Módulo "${nombreNuevo}" creado con ${importados} registros.`);
            onImported(nuevoModuloId);
        } catch (err) { alert('Error al crear el módulo: ' + (err as Error).message); } finally { setImportando(false); }
    }

    const preview = filas.slice(0, 10);
    const totalConDatos = filas.length;
    const columnasActivas = Object.values(mapeo).filter(v => v !== '__ignorar__').length;

    if (modo === 'elegir') {
        return (
            <div className="modal-overlay" onClick={onClose}>
                <div className="modal-panel" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
                    <div className="modal-header">
                        <h3>📥 Importar desde Excel</h3>
                        <button className="btn-icon-close" onClick={onClose}>✕</button>
                    </div>
                    <div className="modal-body">
                        <p style={{ color: 'var(--text-muted)', marginBottom: 16 }}>¿Qué quieres hacer?</p>
                        <div style={{ display: 'grid', gap: 12 }}>
                            <button onClick={() => setModo('nuevo')} style={{ textAlign: 'left', padding: 16, border: '2px solid var(--border)', borderRadius: 12, background: 'var(--surface)', cursor: 'pointer' }}>
                                <strong style={{ display: 'block', marginBottom: 4, fontSize: 15 }}>🆕 Crear un módulo nuevo</strong>
                                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Cada columna será un campo nuevo.</span>
                            </button>
                            {modulo && (
                                <button onClick={() => setModo('actual')} style={{ textAlign: 'left', padding: 16, border: '2px solid var(--border)', borderRadius: 12, background: 'var(--surface)', cursor: 'pointer' }}>
                                    <strong style={{ display: 'block', marginBottom: 4, fontSize: 15 }}>📂 Agregar a "{modulo.nombre}"</strong>
                                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Suma los registros al módulo actual.</span>
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="modal-footer"><button className="btn-ghost" onClick={onClose}>Cancelar</button></div>
                </div>
            </div>
        );
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-panel" onClick={e => e.stopPropagation()} style={{ maxWidth: 900, height: '90vh', display: 'flex', flexDirection: 'column' }}>
                <div className="modal-header">
                    <h3>{modo === 'nuevo' ? '🆕 Nuevo módulo desde Excel' : `📥 Importar a "${modulo?.nombre}"`}</h3>
                    <button className="btn-icon-close" onClick={onClose}>✕</button>
                </div>

                {/* AQUÍ ESTÁ LA MAGIA: overflow-y auto para que no se rompa el modal */}
                <div className="modal-body" style={{ flex: 1, overflowY: 'auto' }}>
                    {!workbook ? (
                        <>
                            <p style={{ color: 'var(--text-muted)', marginBottom: 12 }}>Selecciona el archivo Excel o CSV.</p>
                            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} />
                        </>
                    ) : (
                        <>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16, padding: 12, background: 'var(--surface-muted)', borderRadius: 8 }}>
                                {workbook.SheetNames.length > 1 && (
                                    <label>Hoja del archivo
                                        <select value={selectedSheet} onChange={e => cambiarHoja(e.target.value)}>
                                            {workbook.SheetNames.map(s => <option key={s} value={s}>{s}</option>)}
                                        </select>
                                    </label>
                                )}
                                <label>Saltar filas antes de la cabecera
                                    <input type="number" min={0} max={50} value={skipRows} onChange={e => cambiarSkipRows(Number(e.target.value))} />
                                </label>
                            </div>

                            {modo === 'nuevo' && (
                                <div style={{ marginBottom: 16, padding: 12, background: 'var(--surface-muted)', borderRadius: 8 }}>
                                    <div className="form-grid">
                                        <label>Nombre del módulo <input value={nombreNuevo} onChange={e => setNombreNuevo(e.target.value)} /></label>
                                        <label>Ícono <input value={iconoNuevo} onChange={e => setIconoNuevo(e.target.value)} maxLength={4} /></label>
                                        <label>Color <input type="color" value={colorNuevo} onChange={e => setColorNuevo(e.target.value)} style={{ height: 38, padding: 4 }} /></label>
                                    </div>
                                </div>
                            )}

                            <div style={{ display: 'flex', gap: 16, marginBottom: 12, padding: '10px 14px', background: '#eff6ff', borderRadius: 8, fontSize: 13, color: '#1e3a8a', flexWrap: 'wrap' }}>
                                <span><b>{totalConDatos}</b> registros con datos</span>
                                <span><b>{headers.length}</b> columnas totales</span>
                                <span><b>{columnasActivas}</b> columnas seleccionadas</span>
                            </div>

                            <p style={{ marginBottom: 8, fontWeight: 600, fontSize: 13 }}>Configura qué hacer con cada columna:</p>

                            {/* Tabla de mapeo con scroll horizontal propio */}
                            <div style={{ overflowX: 'auto', marginBottom: 16, border: '1px solid var(--border)', borderRadius: 8 }}>
                                <table style={{ width: '100%', minWidth: 600, borderCollapse: 'collapse', fontSize: 13 }}>
                                    <thead style={{ background: 'var(--surface-muted)' }}>
                                        <tr>
                                            <th style={{ padding: 8, textAlign: 'left' }}>Columna</th>
                                            <th style={{ padding: 8, textAlign: 'left' }}>Tipo</th>
                                            <th style={{ padding: 8, textAlign: 'left' }}>Acción</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {headers.map((h, i) => (
                                            <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                                                <td style={{ padding: 8 }}><b>{h}</b></td>
                                                <td style={{ padding: 8 }}>
                                                    <select value={tipos[i] || 'texto'} onChange={e => setTipos({ ...tipos, [i]: e.target.value as TipoCampo })}>
                                                        {(['texto', 'textarea', 'numero', 'telefono', 'correo', 'fecha', 'fecha_hora', 'select', 'checkbox'] as TipoCampo[]).map(t => <option key={t} value={t}>{t}</option>)}
                                                    </select>
                                                </td>
                                                <td style={{ padding: 8 }}>
                                                    {modo === 'nuevo' ? (
                                                        <select value={mapeo[i] === '__ignorar__' ? '__ignorar__' : '__nuevo__'} onChange={e => setMapeo({ ...mapeo, [i]: e.target.value })}>
                                                            <option value="__nuevo__">✅ Incluir</option>
                                                            <option value="__ignorar__">❌ Ignorar</option>
                                                        </select>
                                                    ) : (
                                                        <select value={mapeo[i] || '__ignorar__'} onChange={e => setMapeo({ ...mapeo, [i]: e.target.value })}>
                                                            <option value="__ignorar__">— Ignorar —</option>
                                                            {(campos || []).map(c => <option key={c.id} value={c.id}>{c.etiqueta}</option>)}
                                                            <option value="__nuevo__">➕ Crear campo nuevo</option>
                                                        </select>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <p style={{ marginBottom: 8, fontWeight: 600, fontSize: 13 }}>Vista previa (10 de {filas.length} filas):</p>
                            {/* Tabla de preview con scroll propio y truncado */}
                            <div style={{ overflowX: 'auto', maxHeight: 250, border: '1px solid var(--border)', borderRadius: 8 }}>
                                <table style={{ width: '100%', minWidth: 600, borderCollapse: 'collapse', fontSize: 12 }}>
                                    <thead style={{ background: 'var(--surface-muted)', position: 'sticky', top: 0 }}>
                                        <tr>{headers.map((h, i) => <th key={i} style={{ padding: 8, textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>)}</tr>
                                    </thead>
                                    <tbody>
                                        {preview.map((fila, fi) => (
                                            <tr key={fi} style={{ borderTop: '1px solid var(--border)' }}>
                                                {headers.map((_, ci) => (
                                                    <td key={ci} style={{ padding: 8, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {String(fila[ci] ?? '')}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                </div>

                <div className="modal-footer" style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                    <button className="btn-ghost" onClick={onClose}>Cancelar</button>
                    {workbook && filas.length > 0 && (
                        <button className="btn-primary" onClick={modo === 'nuevo' ? crearModuloDesdeExcel : importarAlActual} disabled={importando || columnasActivas === 0}>
                            {importando ? 'Procesando...' : modo === 'nuevo' ? `Crear módulo con ${filas.length} registros` : `Importar ${filas.length} registros`}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}