interface Props {
    onClose: () => void;
}

export default function Guia({ onClose }: Props) {
    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-panel" onClick={e => e.stopPropagation()} style={{ maxWidth: 850 }}>
                <div className="modal-header">
                    <h3>📖 Guía de uso — ReporteMensual</h3>
                    <button className="btn-icon-close" onClick={onClose}>✕</button>
                </div>
                <div className="modal-body guia-content">
                    <h2>¿Qué es ReporteMensual?</h2>
                    <p>
                        Es una aplicación web <b>offline</b> que te permite crear y gestionar reportes de trabajos.
                        Funciona sin internet, guarda todo en tu dispositivo y puedes exportar tus reportes a Excel o PDF.
                    </p>

                    <h2>🚀 Primeros pasos</h2>
                    <ol>
                        <li>Al entrar por primera vez, te pedirá tu nombre. Solo es para identificarte.</li>
                        <li>Verás dos módulos de ejemplo: <b>Reportes Generales</b> y <b>Registro Venceremos</b>.</li>
                        <li>Puedes usar estos módulos, editarlos, o crear los tuyos desde el botón <b>⚙️ Menú Principal</b>.</li>
                    </ol>

                    <h2>➕ Crear un módulo</h2>
                    <p>Un "módulo" es como una tabla o página de reportes. Cada módulo tiene sus propios campos (Nombre, Fecha, Estado, etc.).</p>
                    <ol>
                        <li>Abre <b>⚙️ Menú Principal → Nuevo Módulo</b>.</li>
                        <li>Ponle nombre, ícono y color.</li>
                        <li>Agrega los campos que necesites: texto, número, fecha, teléfono, correo, checkbox o lista desplegable.</li>
                        <li>Marca los campos que quieres ver en la tabla y los que serán obligatorios.</li>
                        <li>Guarda. ¡Ya tienes tu módulo listo!</li>
                    </ol>

                    <h2>📥 Importar desde Excel</h2>
                    <p>Si ya tienes tus datos en un archivo Excel, puedes crear un módulo completo a partir de él.</p>
                    <ol>
                        <li>Abre <b>⚙️ Menú Principal → Crear Módulo desde Excel</b>.</li>
                        <li>Selecciona tu archivo (.xlsx, .xls o .csv).</li>
                        <li>Elige la hoja y revisa las columnas detectadas.</li>
                        <li>Pulsa "Crear módulo". Las columnas se convierten en campos automáticamente.</li>
                    </ol>

                    <h2>📝 Registrar trabajos</h2>
                    <ol>
                        <li>En el módulo, pulsa <b>+ Nuevo Registro</b> (o <b>Alt+N</b>).</li>
                        <li>Rellena los campos. Los obligatorios tienen un asterisco rojo (*).</li>
                        <li>Pulsa Guardar (o <b>Ctrl+S</b>).</li>
                    </ol>
                    <p>Puedes editar un registro con el lápiz ✎ o duplicarlo con el ícono 📋.</p>

                    <h2>🔍 Buscar y filtrar</h2>
                    <ul>
                        <li>Usa el buscador para encontrar cualquier texto en todos los campos.</li>
                        <li>Filtra por estado con el desplegable.</li>
                        <li>Filtra por rango de fechas con los calendarios.</li>
                    </ul>

                    <h2>📊 Exportar reportes</h2>
                    <ul>
                        <li><b>PDF profesional:</b> Con gráficos, estadísticas y tablas paginadas. Menú → PDF.</li>
                        <li><b>Excel:</b> Para entregar los datos planos. Menú → Excel.</li>
                        <li><b>Vista filtrada:</b> Usa "Exportar esta vista" para exportar solo lo que ves tras filtrar.</li>
                    </ul>

                    <h2>💾 Backup (¡Muy importante!)</h2>
                    <p>
                        Todos los datos se guardan en el navegador de tu dispositivo.
                        Si borras la caché o cambias de equipo, podrías perderlos. Por eso:
                    </p>
                    <ul>
                        <li><b>Haz backup semanal:</b> Menú → Backup JSON.</li>
                        <li>Guarda ese archivo en un USB, Google Drive o donde quieras.</li>
                        <li>Para restaurar: Menú → Restaurar Backup.</li>
                    </ul>

                    <h2>⌨️ Atajos de teclado</h2>
                    <ul>
                        <li><b>Alt + N</b> → Nuevo registro</li>
                        <li><b>Ctrl + S</b> → Guardar en el formulario</li>
                        <li><b>Esc</b> → Cerrar modal</li>
                    </ul>

                    <h2>📱 Instalar en el celular</h2>
                    <ul>
                        <li><b>Android (Chrome):</b> Menú del navegador → "Instalar app" o "Añadir a pantalla de inicio".</li>
                        <li><b>iPhone (Safari):</b> Compartir → "Añadir a pantalla de inicio".</li>
                    </ul>

                    <h2>🎨 Personalización</h2>
                    <ul>
                        <li>Edita un módulo con <b>⚙️ Menú → Editar Módulo</b>.</li>
                        <li>Muestra u oculta columnas desde <b>⚙️ Menú → Columnas visibles</b>.</li>
                        <li>Cambia entre vista Tabla y Tarjetas desde el menú.</li>
                    </ul>

                    <h2>📌 Notas adicionales</h2>
                    <ul>
                        <li>Puedes tener tantos módulos y campos como necesites. Todo es <b>editable</b>.</li>
                        <li>Los estados con colores (verde, naranja, rojo) se detectan automáticamente o los defines tú en el editor de campos.</li>
                        <li>Los datos viven en el navegador, cada dispositivo tiene los suyos. Usa Backup para moverlos entre equipos.</li>
                    </ul>

                    {/* MARCA DE AGUA / FIRMA */}
                    <div className="guia-watermark">
                        <div style={{ fontSize: 28, marginBottom: 8 }}>🏅</div>
                        <div style={{ fontWeight: 700, color: 'var(--primary)', fontSize: 15 }}>
                            ReporteMensual
                        </div>
                        <div style={{ marginTop: 6 }}>
                            Creado por <b>Tte. Alejandro de la Cuesta Rey</b>
                        </div>
                        <div style={{ marginTop: 4 }}>
                            Contacto del Ing. <b>+53 55501545</b>
                        </div>
                    </div>
                </div>
                <div className="modal-footer">
                    <button className="btn-primary" onClick={onClose}>Entendido, ¡vamos a trabajar! 🚀</button>
                </div>
            </div>
        </div>
    );
}