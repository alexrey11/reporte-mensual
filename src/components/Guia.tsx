import { BookOpen, Rocket, PlusCircle, FileSpreadsheet, Edit3, Search, BarChart3, HardDrive, Keyboard, Smartphone, Palette, StickyNote, X, CheckCircle2 } from 'lucide-react';

interface Props {
    onClose: () => void;
}

export default function Guia({ onClose }: Props) {
    // ✅ MOVEMOS kbdStyle AQUÍ ARRIBA (antes de sections)
    const kbdStyle: React.CSSProperties = {
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        padding: '2px 8px',
        fontSize: 12,
        fontWeight: 600,
        boxShadow: '0 2px 0 var(--border)',
        fontFamily: 'monospace',
    };

    const sections = [
        {
            icon: <Rocket size={22} color="#0d9488" />,
            title: "🚀 Primeros pasos",
            content: (
                <ol style={{ paddingLeft: 20, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <li>Al entrar por primera vez, te pedirá tu nombre. Solo es para identificarte.</li>
                    <li>Verás un módulo llamado <b>General</b>, pensado para cualquier tipo de trabajo.</li>
                    <li>Dentro encontrarás un <b>registro de ejemplo</b>. Edítalo o bórralo cuando quieras.</li>
                    <li>Si necesitas algo distinto, pulsa <b>Menú → Editar Módulo</b> y cambia los campos a tu gusto.</li>
                </ol>
            )
        },
        {
            icon: <PlusCircle size={22} color="#0d9488" />,
            title: "➕ Crear un módulo",
            content: (
                <>
                    <p style={{ marginTop: 0 }}>Un "módulo" es como una tabla o página de reportes. Cada módulo tiene sus propios campos.</p>
                    <ol style={{ paddingLeft: 20, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <li>Abre <b>Menú → Nuevo Módulo</b>.</li>
                        <li>Ponle nombre, ícono y color.</li>
                        <li>Agrega los campos que necesites: texto, número, fecha, teléfono, correo, checkbox o lista desplegable.</li>
                        <li>Marca los campos que quieres ver en la tabla y los que serán obligatorios.</li>
                    </ol>
                </>
            )
        },
        {
            icon: <FileSpreadsheet size={22} color="#16a34a" />,
            title: "📥 Importar desde Excel",
            content: (
                <ol style={{ paddingLeft: 20, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <li>Abre <b>Menú → Crear Módulo desde Excel</b>.</li>
                    <li>Selecciona tu archivo (.xlsx, .xls o .csv).</li>
                    <li>Elige la hoja y revisa las columnas detectadas.</li>
                    <li>Pulsa "Crear módulo". Las columnas se convierten en campos automáticamente.</li>
                </ol>
            )
        },
        {
            icon: <Edit3 size={22} color="#0284c7" />,
            title: "📝 Registrar trabajos",
            content: (
                <>
                    <ol style={{ paddingLeft: 20, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <li>En el módulo, pulsa el botón <b>+</b> flotante (o <b>Alt+N</b>).</li>
                        <li>Rellena los campos. Los obligatorios tienen un asterisco rojo (*).</li>
                        <li>Pulsa Guardar (o <b>Ctrl+S</b>).</li>
                    </ol>
                    <p style={{ marginBottom: 0 }}>Puedes editar un registro con el lápiz <Edit3 size={14} style={{ verticalAlign: 'middle' }} /> o duplicarlo con el ícono <CheckCircle2 size={14} style={{ verticalAlign: 'middle' }} />.</p>
                </>
            )
        },
        {
            icon: <Search size={22} color="#64748b" />,
            title: "🔍 Buscar y filtrar",
            content: (
                <ul style={{ paddingLeft: 20, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <li>Usa el buscador para encontrar cualquier texto en todos los campos.</li>
                    <li>Filtra por estado con el desplegable.</li>
                    <li>Filtra por rango de fechas con los calendarios.</li>
                </ul>
            )
        },
        {
            icon: <BarChart3 size={22} color="#d97706" />,
            title: "📊 Exportar reportes",
            content: (
                <ul style={{ paddingLeft: 20, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <li><b>PDF profesional:</b> Con gráficos, estadísticas y tablas paginadas. Menú → PDF.</li>
                    <li><b>Excel:</b> Para entregar los datos planos. Menú → Excel.</li>
                    <li><b>Vista filtrada:</b> Usa "Exportar esta vista" para exportar solo lo que ves tras filtrar.</li>
                </ul>
            )
        },
        {
            icon: <HardDrive size={22} color="#dc2626" />,
            title: "💾 Backup (¡Muy importante!)",
            content: (
                <>
                    <p style={{ marginTop: 0 }}>Todos los datos se guardan en el navegador de tu dispositivo. Si borras la caché o cambias de equipo, podrías perderlos.</p>
                    <ul style={{ paddingLeft: 20, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <li><b>Haz backup semanal:</b> Menú → Backup JSON.</li>
                        <li>Guarda ese archivo en un USB, Google Drive o donde quieras.</li>
                        <li>Para restaurar: Menú → Restaurar Backup.</li>
                    </ul>
                </>
            )
        },
        {
            icon: <Keyboard size={22} color="#64748b" />,
            title: "⌨️ Atajos de teclado",
            content: (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>Nuevo registro</span>
                        <span style={{ display: 'flex', gap: 4 }}><kbd style={kbdStyle}>Alt</kbd> + <kbd style={kbdStyle}>N</kbd></span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>Guardar en formulario</span>
                        <span style={{ display: 'flex', gap: 4 }}><kbd style={kbdStyle}>Ctrl</kbd> + <kbd style={kbdStyle}>S</kbd></span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>Cerrar modal</span>
                        <span style={{ display: 'flex', gap: 4 }}><kbd style={kbdStyle}>Esc</kbd></span>
                    </div>
                </div>
            )
        },
        {
            icon: <Smartphone size={22} color="#0d9488" />,
            title: "📱 Instalar en el celular",
            content: (
                <ul style={{ paddingLeft: 20, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <li><b>Android (Chrome):</b> Menú del navegador → "Instalar app" o "Añadir a pantalla de inicio".</li>
                    <li><b>iPhone (Safari):</b> Compartir → "Añadir a pantalla de inicio".</li>
                </ul>
            )
        },
        {
            icon: <Palette size={22} color="#9333ea" />,
            title: "🎨 Personalización",
            content: (
                <ul style={{ paddingLeft: 20, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <li>Edita un módulo con <b>Menú → Editar Módulo</b>.</li>
                    <li>Muestra u oculta columnas desde <b>Menú → Columnas visibles</b>.</li>
                    <li>Cambia entre vista Tabla y Tarjetas desde el menú.</li>
                </ul>
            )
        },
        {
            icon: <StickyNote size={22} color="#f59e0b" />,
            title: "📌 Notas adicionales",
            content: (
                <ul style={{ paddingLeft: 20, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <li>Puedes tener tantos módulos y campos como necesites. Todo es <b>editable</b>.</li>
                    <li>Los estados con colores (verde, naranja, rojo) se detectan automáticamente o los defines tú.</li>
                    <li>Los datos viven en el navegador, cada dispositivo tiene los suyos. Usa Backup para moverlos entre equipos.</li>
                </ul>
            )
        }
    ];

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-panel" onClick={e => e.stopPropagation()} style={{ maxWidth: 800 }}>
                <div className="modal-header" style={{ background: 'var(--primary)', color: 'white' }}>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'white' }}>
                        <BookOpen size={22} /> Guía de uso — ReporteMensual
                    </h3>
                    <button className="btn-icon-close" onClick={onClose} style={{ background: 'rgba(255,255,255,0.2)', color: 'white' }}>
                        <X size={20} />
                    </button>
                </div>

                <div className="modal-body" style={{ background: '#f8fafc', padding: 24 }}>
                    <div style={{ textAlign: 'center', marginBottom: 24 }}>
                        <h2 style={{ margin: '0 0 8px', fontSize: 22, color: 'var(--text)' }}>¿Qué es ReporteMensual?</h2>
                        <p style={{ color: 'var(--text-muted)', margin: 0, maxWidth: 500, marginInline: 'auto' }}>
                            Es una aplicación web <b>offline</b> que te permite crear y gestionar reportes de trabajos.
                            Funciona sin internet, guarda todo en tu dispositivo y puedes exportar tus reportes a Excel o PDF.
                        </p>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        {sections.map((s, i) => (
                            <div key={i} style={{
                                background: 'var(--surface)',
                                borderRadius: 16,
                                padding: 20,
                                boxShadow: 'var(--shadow-sm)',
                                border: '1px solid var(--border)'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                                    <div style={{
                                        width: 40, height: 40, borderRadius: 10, background: 'var(--bg)',
                                        display: 'grid', placeItems: 'center'
                                    }}>
                                        {s.icon}
                                    </div>
                                    <h3 style={{ margin: 0, fontSize: 16, color: 'var(--text)' }}>{s.title}</h3>
                                </div>
                                <div style={{ fontSize: 14, color: '#475569', lineHeight: 1.6 }}>
                                    {s.content}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Firma / Marca de agua */}
                    <div style={{
                        marginTop: 32, padding: 24, textAlign: 'center',
                        background: 'linear-gradient(135deg, #0d9488, #0f766e)',
                        borderRadius: 16, color: 'white'
                    }}>
                        <div style={{ fontSize: 32, marginBottom: 8 }}>🏅</div>
                        <h3 style={{ margin: 0, fontSize: 18, color: 'white' }}>ReporteMensual</h3>
                        <p style={{ margin: '4px 0 0', opacity: 0.9, fontSize: 14 }}>
                            Creado por <b>Tte. Alejandro de la Cuesta Rey</b>
                        </p>
                        <p style={{ margin: '4px 0 0', opacity: 0.9, fontSize: 14 }}>
                            Contacto del Ing. <b>+53 55501545</b>
                        </p>
                    </div>
                </div>

                <div className="modal-footer" style={{ padding: '16px 24px' }}>
                    <button className="btn-primary" onClick={onClose} style={{ width: '100%' }}>
                        Entendido, ¡vamos a trabajar! 🚀
                    </button>
                </div>
            </div>
        </div>
    );
}