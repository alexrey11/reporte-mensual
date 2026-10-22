import { useEffect, useMemo, useState } from 'react';
import {
    db, nombreMes, type Modulo, type Campo, type Registro,
} from '@/lib/db';
import { DonutChart, AreaChart, HBarChart } from '@/components/Charts';
import { getStatusColor } from '@/components/ModuloView';
import { exportarPDF } from '@/lib/export';
import {
    X, FileText, BarChart3, Download, Users, TrendingUp, Clock,
} from 'lucide-react';

interface Props {
    modulo: Modulo;
    campos: Campo[];
    anio: number;
    mes: number;
    usuario: string;
    onClose: () => void;
}

function esDelMes(iso: string, anio: number, mes: number): boolean {
    const d = new Date(iso);
    return d.getFullYear() === anio && d.getMonth() === mes;
}

export default function Estadisticas({ modulo, campos, anio, mes, usuario, onClose }: Props) {
    const [registros, setRegistros] = useState<Registro[]>([]);
    const [anioSel, setAnioSel] = useState(anio);
    const [mesSel, setMesSel] = useState(mes);
    const [exportando, setExportando] = useState(false);

    async function cargar() {
        const todos = await db.registros.where('moduloId').equals(modulo.id).toArray();
        setRegistros(todos.filter(r => esDelMes(r.creadoEn, anioSel, mesSel)));
    }

    useEffect(() => { cargar(); }, [modulo.id, anioSel, mesSel]);

    const campoEstado = campos.find(c =>
        c.tipo === 'select' &&
        (c.etiqueta.toLowerCase().includes('estado') || c.etiqueta.toLowerCase().includes('status'))
    ) || null;

    const opcionesEstado = campoEstado?.opciones || [];

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

    const estadosData = opcionesEstado.map(op => ({
        label: op,
        value: statsPorEstado[op] || 0,
        color: getStatusColor(op, campoEstado),
    }));

    const registrosPorDia = useMemo(() => {
        const dias = new Date(anioSel, mesSel + 1, 0).getDate();
        const arr = Array.from({ length: dias }, (_, i) => ({ label: String(i + 1), value: 0 }));
        registros.forEach(r => {
            const d = new Date(r.creadoEn);
            if (d.getFullYear() === anioSel && d.getMonth() === mesSel) arr[d.getDate() - 1].value++;
        });
        return arr;
    }, [registros, anioSel, mesSel]);

    // ====== RANKING: "lo que más se reporta" ======
    // Detecta el campo correcto por palabras clave, priorizando asunto/motivo/falla
    const campoRanking = useMemo(() => {
        const normalizarEtiqueta = (s: string) =>
            s.toLowerCase()
                .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                .replace(/[¿?¡!.,;:()]/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();

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

        const palabrasClave = [
            'que report', 'report', 'motivo', 'falla', 'problema', 'incidencia',
            'asunto', 'averia', 'queja', 'solicitud', 'servicio',
            'tipo', 'categoria', 'descripcion',
        ];

        for (const kw of palabrasClave) {
            const found = campos.find(c => {
                if (c.id === campoEstado?.id) return false;
                if (esCampoExcluido(c)) return false;
                return normalizarEtiqueta(c.etiqueta).includes(kw);
            });
            if (found) return found;
        }

        const candidatos = campos.filter(c =>
            c.id !== campoEstado?.id && !esCampoExcluido(c) &&
            (c.tipo === 'select' || c.tipo === 'textarea' || c.tipo === 'texto')
        );
        return candidatos[0] || null;
    }, [campos, campoEstado]);
    const rankingData = useMemo(() => {
        if (!campoRanking) return [];

        // Normalizador: sin tildes, minúsculas, espacios colapsados
        const normalizar = (s: string) =>
            s.toLowerCase()
                .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                .replace(/\s+/g, ' ')
                .trim();

        const conteo: Record<string, { display: string; count: number }> = {};
        registros.forEach(r => {
            const raw = String(r.datos[campoRanking.id] || '').trim();
            if (!raw) return;
            const key = normalizar(raw);
            if (!key) return;
            if (!conteo[key]) conteo[key] = { display: raw, count: 0 };
            conteo[key].count++;
        });

        return Object.values(conteo)
            .sort((a, b) => b.count - a.count)
            .slice(0, 8)
            .map(item => ({ label: item.display, value: item.count, color: modulo.color }));
    }, [registros, campoRanking, modulo.color]);

    const totalRegistros = registros.length;
    const diasConActividad = registrosPorDia.filter(d => d.value > 0).length;

    // Tiempo promedio (si hay campos auto-fecha)
    const campoInicio = campos.find(c => c.tipo === 'fecha_hora' && c.autoFechaCreacion);
    const campoFin = campos.find(c => c.tipo === 'fecha_hora' && c.autoFechaEstadoId);
    let tiempoPromedioMs: number | null = null;
    if (campoInicio && campoFin) {
        const deltas: number[] = [];
        registros.forEach(r => {
            const ini = r.datos[campoInicio.id];
            const fin = r.datos[campoFin.id];
            if (ini && fin) {
                const d = new Date(fin).getTime() - new Date(ini).getTime();
                if (d > 0) deltas.push(d);
            }
        });
        if (deltas.length > 0) tiempoPromedioMs = deltas.reduce((a, b) => a + b, 0) / deltas.length;
    }

    function formatDuration(ms: number): string {
        const horas = ms / (1000 * 60 * 60);
        if (horas < 24) return `${horas.toFixed(1)} h`;
        const dias = horas / 24;
        if (dias < 30) return `${dias.toFixed(1)} días`;
        return `${(dias / 30).toFixed(1)} meses`;
    }

    async function handleExportPDF() {
        setExportando(true);
        try {
            await exportarPDF(anioSel, mesSel, modulo.id, usuario);
        } finally {
            setExportando(false);
        }
    }

    const anios = [new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1];

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 9000,
            background: 'var(--bg)', overflowY: 'auto',
            animation: 'fadeIn 0.2s ease-out',
        }}>
            {/* Header fijo */}
            <div style={{
                position: 'sticky', top: 0, zIndex: 10,
                background: 'var(--surface)', borderBottom: '1px solid var(--border)',
                padding: '16px 20px', display: 'flex', alignItems: 'center',
                justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
                paddingTop: 'calc(16px + env(safe-area-inset-top))',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                        width: 40, height: 40, borderRadius: 12,
                        background: `linear-gradient(135deg, ${modulo.color}, ${modulo.color}cc)`,
                        display: 'grid', placeItems: 'center',
                    }}>
                        <BarChart3 size={22} color="white" />
                    </div>
                    <div>
                        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Estadísticas</h2>
                        <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
                            {modulo.nombre} · {nombreMes(mesSel)} {anioSel}
                        </p>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', background: 'var(--bg)', borderRadius: 10, padding: 4, border: '1px solid var(--border)' }}>
                        <select
                            value={mesSel}
                            onChange={e => setMesSel(Number(e.target.value))}
                            style={{ padding: '6px 10px', width: 'auto', background: 'transparent', border: 'none', outline: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
                        >
                            {Array.from({ length: 12 }, (_, i) => (
                                <option key={i} value={i}>{nombreMes(i)}</option>
                            ))}
                        </select>
                        <div style={{ width: 1, background: 'var(--border)', margin: '4px 0' }} />
                        <select
                            value={anioSel}
                            onChange={e => setAnioSel(Number(e.target.value))}
                            style={{ padding: '6px 10px', width: 'auto', background: 'transparent', border: 'none', outline: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
                        >
                            {anios.map(a => <option key={a} value={a}>{a}</option>)}
                        </select>
                    </div>

                    <button
                        className="btn-primary"
                        onClick={handleExportPDF}
                        disabled={exportando || totalRegistros === 0}
                        style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                    >
                        <Download size={16} /> {exportando ? 'Generando...' : 'Exportar PDF'}
                    </button>

                    <button className="btn-icon-close" onClick={onClose} style={{ width: 36, height: 36 }}>
                        <X size={20} />
                    </button>
                </div>
            </div>

            {/* Contenido */}
            <div style={{ maxWidth: 1200, margin: '0 auto', padding: 20 }}>

                {totalRegistros === 0 ? (
                    <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
                        <BarChart3 size={48} style={{ margin: '0 auto 16px', opacity: 0.4 }} />
                        <h3 style={{ margin: '0 0 8px', color: 'var(--text)' }}>Sin datos para este período</h3>
                        <p style={{ margin: 0 }}>No hay registros en {nombreMes(mesSel)} {anioSel}.</p>
                    </div>
                ) : (
                    <>
                        {/* KPIs grandes */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: window.innerWidth < 768 ? 'repeat(2, 1fr)' : 'repeat(auto-fit, minmax(180px, 1fr))',
                            gap: 12, marginBottom: 20,
                        }}>
                            <KpiCard icon={<FileText size={20} />} titulo="Total registros" valor={String(totalRegistros)} color={modulo.color} />
                            {campoEstado && (
                                <KpiCard icon={<TrendingUp size={20} />} titulo="Completado" valor={`${tasaCompletado.toFixed(0)}%`} color="#16a34a" />
                            )}
                            <KpiCard icon={<Users size={20} />} titulo="Días con actividad" valor={String(diasConActividad)} color="#3b82f6" />
                            {tiempoPromedioMs !== null && (
                                <KpiCard icon={<Clock size={20} />} titulo="Tiempo promedio" valor={formatDuration(tiempoPromedioMs)} color="#f59e0b" />
                            )}
                        </div>

                        {/* Fila 1: Donut grande + Tendencia */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: window.innerWidth < 768 ? '1fr' : '1fr 1.4fr',
                            gap: 16, marginBottom: 16,
                        }}>
                            {campoEstado && (
                                <Card titulo="Distribución por estado">
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                        <DonutChart
                                            data={estadosData}
                                            size={isMobileSize()}
                                            thickness={30}
                                            centerLabel="Completado"
                                            centerValue={`${tasaCompletado.toFixed(0)}%`}
                                        />
                                        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center', marginTop: 16 }}>
                                            {estadosData.map((d, i) => (
                                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#475569' }}>
                                                    <span style={{ width: 12, height: 12, borderRadius: 3, background: d.color }} />
                                                    {d.label} <span style={{ color: '#94a3b8', fontWeight: 500 }}>({d.value})</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </Card>
                            )}

                            <Card titulo="Tendencia del mes">
                                <AreaChart data={registrosPorDia.map(d => d.value)} height={220} color={modulo.color} />
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>
                                    <span>1</span>
                                    <span>{Math.ceil(registrosPorDia.length / 2)}</span>
                                    <span>{registrosPorDia.length}</span>
                                </div>
                            </Card>
                        </div>

                        {/* Fila 2: Barras horizontales + Ranking */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: window.innerWidth < 768 ? '1fr' : '1fr 1fr',
                            gap: 16,
                        }}>
                            {campoEstado && (
                                <Card titulo="Volumen por estado">
                                    <HBarChart data={estadosData} maxBars={opcionesEstado.length} />
                                </Card>
                            )}

                            {campoRanking && rankingData.length > 0 && (
                                <Card titulo={`Top ${campoRanking.etiqueta} (más reportado)`}>
                                    <HBarChart data={rankingData} maxBars={8} />
                                </Card>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

function isMobileSize() {
    return typeof window !== 'undefined' && window.innerWidth < 768 ? 200 : 240;
}

function KpiCard({ icon, titulo, valor, color }: { icon: React.ReactNode; titulo: string; valor: string; color: string }) {
    return (
        <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 16, padding: 18, boxShadow: 'var(--shadow-sm)',
            borderLeft: `4px solid ${color}`,
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <div style={{ color, display: 'flex' }}>{icon}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {titulo}
                </div>
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>
                {valor}
            </div>
        </div>
    );
}

function Card({ titulo, children }: { titulo: string; children: React.ReactNode }) {
    return (
        <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 16, padding: 20, boxShadow: 'var(--shadow-sm)',
        }}>
            <h3 style={{
                margin: '0 0 16px', fontSize: 12, color: '#64748b',
                textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700,
            }}>
                {titulo}
            </h3>
            {children}
        </div>
    );
}