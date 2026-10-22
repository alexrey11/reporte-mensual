import { useEffect, useState, useRef } from 'react';
import {
  db, seedIfEmpty, exportarBackup, importarBackup, importarPlantilla,
  exportarPlantilla, exportarModuloCompleto,
  type Modulo, type Campo,
} from '@/lib/db';
import { exportarExcel, exportarPDF } from '@/lib/export';
import ModuloView from '@/components/ModuloView';
import EditorModulo from '@/components/EditorModulo';
import PWAInstallPrompt from '@/components/PWAInstallPrompt';
import ImportarExcel from '@/components/ImportarExcel';
import Guia from '@/components/Guia';
import Estadisticas from '@/components/Estadisticas';
import AppIcon from '@/components/AppIcon';
import {
  Menu, Plus, Settings, Download, FileText, FileSpreadsheet,
  FolderOpen, Edit3, Copy, Trash2, BookOpen, Save, Upload,
  LayoutGrid, X, ChevronRight, BarChart3
} from 'lucide-react';

function App() {
  const hoy = new Date();
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mes, setMes] = useState(hoy.getMonth());
  const [modulos, setModulos] = useState<Modulo[]>([]);
  const [actualId, setActualId] = useState<string | null>(null);

  const [camposActuales, setCamposActuales] = useState<Campo[]>([]);
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('cards');
  const [isMobile, setIsMobile] = useState(false);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorModulo, setEditorModulo] = useState<Modulo | null>(null);
  const [editorCampos, setEditorCampos] = useState<Campo[]>([]);
  const [exportando, setExportando] = useState<'excel' | 'pdf' | null>(null);
  const [importExcelGlobalOpen, setImportExcelGlobalOpen] = useState(false);

  const [guiaOpen, setGuiaOpen] = useState(false);
  const [estadisticasOpen, setEstadisticasOpen] = useState(false);
  const [mostrarBienvenida, setMostrarBienvenida] = useState(false);

  const [globalMenuOpen, setGlobalMenuOpen] = useState(false);
  const globalMenuRef = useRef<HTMLDivElement>(null);

  const [modulosDrawerOpen, setModulosDrawerOpen] = useState(false);

  const [usuario, setUsuario] = useState<string>('');
  const [loginInput, setLoginInput] = useState('');

  // Detección de móvil
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) setViewMode('cards');
      else setViewMode('table');
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Cerrar menú al clic fuera (solo PC)
  useEffect(() => {
    if (!globalMenuOpen || isMobile) return;
    function handleClickOutside(e: MouseEvent) {
      if (globalMenuRef.current && !globalMenuRef.current.contains(e.target as Node)) {
        setGlobalMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [globalMenuOpen, isMobile]);

  async function cargar() {
    const m = await db.modulos.orderBy('orden').toArray();
    setModulos(m);
    if (!actualId && m.length) setActualId(m[0].id);
    if (actualId && !m.some(x => x.id === actualId)) setActualId(m[0]?.id ?? null);
  }

  useEffect(() => {
    if (actualId) {
      db.campos.where('moduloId').equals(actualId).sortBy('orden').then(setCamposActuales);
    } else {
      setCamposActuales([]);
    }
  }, [actualId]);

  useEffect(() => {
    (async () => {
      if (navigator.storage && navigator.storage.persist) {
        try { await navigator.storage.persist(); } catch { /* ignorar */ }
      }
      await seedIfEmpty();
      const cfg = await db.config.get('usuario');
      if (cfg?.valor) setUsuario(cfg.valor);

      const guiaVista = await db.config.get('guia_vista');
      if (!guiaVista?.valor && cfg?.valor) {
        setMostrarBienvenida(true);
      }

      await cargar();
    })();
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!loginInput.trim()) return;
    await db.config.put({ clave: 'usuario', valor: loginInput.trim() });
    setUsuario(loginInput.trim());

    const guiaVista = await db.config.get('guia_vista');
    if (!guiaVista?.valor) setMostrarBienvenida(true);
  }

  async function cerrarBienvenida(abrirGuia: boolean) {
    setMostrarBienvenida(false);
    await db.config.put({ clave: 'guia_vista', valor: true });
    if (abrirGuia) setGuiaOpen(true);
  }

  async function abrirNuevoModulo() {
    setEditorModulo(null);
    setEditorCampos([]);
    setEditorOpen(true);
    setGlobalMenuOpen(false);
  }

  async function abrirEditarModulo() {
    if (!actualId) return;
    const c = await db.campos.where('moduloId').equals(actualId).sortBy('orden');
    const m = modulos.find(x => x.id === actualId) || null;
    setEditorModulo(m);
    setEditorCampos(c);
    setEditorOpen(true);
    setGlobalMenuOpen(false);
  }

  async function duplicarModulo() {
    const m = modulos.find(x => x.id === actualId);
    if (!m) return;
    if (!confirm(`¿Duplicar el módulo "${m.nombre}"?`)) return;
    const nuevoId = crypto.randomUUID();
    const orden = await db.modulos.count();
    await db.modulos.add({ ...m, id: nuevoId, nombre: `${m.nombre} (Copia)`, orden, creadoEn: new Date().toISOString() });
    const campos = await db.campos.where('moduloId').equals(m.id).toArray();
    for (const c of campos) {
      await db.campos.add({ ...c, id: crypto.randomUUID(), moduloId: nuevoId });
    }
    await cargar();
    setActualId(nuevoId);
    setGlobalMenuOpen(false);
  }

  async function eliminarModulo() {
    const m = modulos.find(x => x.id === actualId);
    if (!m) return;
    if (!confirm(`¿Eliminar el módulo "${m.nombre}" y todos sus registros?`)) return;
    await db.campos.where('moduloId').equals(m.id).delete();
    await db.registros.where('moduloId').equals(m.id).delete();
    await db.modulos.delete(m.id);
    setActualId(null);
    await cargar();
    setGlobalMenuOpen(false);
  }

  async function toggleColumnVisibility(campo: Campo) {
    const nuevoEstado = !campo.mostrarEnTabla;
    await db.campos.update(campo.id, { mostrarEnTabla: nuevoEstado });
    setCamposActuales(prev => prev.map(c => c.id === campo.id ? { ...c, mostrarEnTabla: nuevoEstado } : c));
  }

  async function handleExcel(todos: boolean) {
    setExportando('excel');
    try { await exportarExcel(anio, mes, todos ? undefined : actualId || undefined); }
    finally { setExportando(null); setGlobalMenuOpen(false); }
  }

  async function handlePDF(todos: boolean) {
    setExportando('pdf');
    try { await exportarPDF(anio, mes, todos ? undefined : actualId || undefined, usuario); }
    finally { setExportando(null); setGlobalMenuOpen(false); }
  }

  async function handleImportarBackup(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!confirm('Esto reemplazará TODOS los datos actuales. ¿Continuar?')) {
      e.target.value = '';
      return;
    }
    try {
      await importarBackup(file);
      alert('Backup restaurado con éxito');
      window.location.reload();
    } catch (err) {
      alert('Error al importar: ' + (err as Error).message);
    }
    e.target.value = '';
    setGlobalMenuOpen(false);
  }

  async function handleImportarPlantilla(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const nuevoId = await importarPlantilla(file);
      alert('Plantilla importada correctamente');
      await cargar();
      setActualId(nuevoId);
    } catch (err) {
      alert('Error: ' + (err as Error).message);
    }
    e.target.value = '';
    setGlobalMenuOpen(false);
  }

  // --- LOGIN ---
  if (!usuario) {
    return (
      <div className="login-screen">
        <form className="login-card" onSubmit={handleLogin}>
          <div className="brand-mark" style={{ margin: '0 auto 16px', width: 56, height: 56, fontSize: 22 }}>RM</div>
          <h1>Bienvenido a ReporteMensual</h1>
          <p>Ingresa tu nombre para identificar tus módulos.</p>
          <input type="text" placeholder="Tu nombre..." value={loginInput} onChange={e => setLoginInput(e.target.value)} autoFocus />
          <button type="submit" className="btn-primary" style={{ width: '100%', marginTop: 16 }}>Entrar</button>
        </form>
      </div>
    );
  }

  const anios = [hoy.getFullYear() - 1, hoy.getFullYear(), hoy.getFullYear() + 1];
  const actual = modulos.find(m => m.id === actualId) ?? null;

  const menuItemStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '12px 16px', border: 'none', background: 'transparent', color: 'var(--text)', cursor: 'pointer', borderRadius: 12, fontSize: 14, textAlign: 'left', fontWeight: 500 };
  const menuDangerStyle: React.CSSProperties = { ...menuItemStyle, color: '#dc2626' };
  const dividerStyle: React.CSSProperties = { height: 1, background: 'var(--border)', margin: '8px 0' };
  const sectionTitleStyle: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '12px 16px 4px' };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="header-inner">
          <div className="brand" onClick={() => isMobile && setModulosDrawerOpen(true)} style={{ cursor: isMobile ? 'pointer' : 'default' }}>
            <span className="brand-mark">RM</span>
            <div>
              <h1>ReporteMensual</h1>
              <p className="brand-sub">Hola, {usuario}</p>
            </div>
          </div>

          <div className="header-tools" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {!isMobile && (
              <>
                <div style={{ display: 'flex', background: 'var(--bg)', borderRadius: 10, padding: 4, border: '1px solid var(--border)' }}>
                  <select
                    value={mes}
                    onChange={e => setMes(Number(e.target.value))}
                    style={{ padding: '6px 10px', width: 'auto', background: 'transparent', border: 'none', outline: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
                  >
                    {Array.from({ length: 12 }, (_, i) => (
                      <option key={i} value={i}>{['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'][i]}</option>
                    ))}
                  </select>
                  <div style={{ width: 1, background: 'var(--border)', margin: '4px 0' }} />
                  <select
                    value={anio}
                    onChange={e => setAnio(Number(e.target.value))}
                    style={{ padding: '6px 10px', width: 'auto', background: 'transparent', border: 'none', outline: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
                  >
                    {anios.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>

                <div className="menu-dropdown" ref={globalMenuRef}>
                  <button
                    onClick={() => setGlobalMenuOpen(!globalMenuOpen)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '10px 16px',
                      background: 'var(--primary)',
                      color: 'white',
                      borderRadius: 10,
                      border: 'none',
                      fontWeight: 600,
                      fontSize: 14,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      boxShadow: '0 4px 12px rgba(13, 148, 136, 0.2)'
                    }}
                  >
                    <Settings size={18} /> Menú
                  </button>

                  {globalMenuOpen && (
                    <div className="menu-panel">
                      {actual && (
                        <>
                          <div style={sectionTitleStyle}>Módulo: {actual.nombre}</div>
                          <button style={menuItemStyle} onClick={() => { setEstadisticasOpen(true); setGlobalMenuOpen(false); }}>
                            <BarChart3 size={18} color="var(--primary)" /> <span style={{ color: 'var(--primary)', fontWeight: 600 }}>Ver Estadísticas</span>
                          </button>
                          <button style={menuItemStyle} onClick={() => { setViewMode(viewMode === 'table' ? 'cards' : 'table'); setGlobalMenuOpen(false); }}>
                            <LayoutGrid size={18} color="var(--text-muted)" /> {viewMode === 'table' ? 'Ver como Tarjetas' : 'Ver como Tabla'}
                          </button>
                          <div style={{ padding: '6px 16px' }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Columnas visibles</div>
                            <div style={{ maxHeight: 150, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {camposActuales.map(c => (
                                <label key={c.id} className="menu-checkbox-item">
                                  <input type="checkbox" checked={c.mostrarEnTabla} onChange={() => toggleColumnVisibility(c)} />
                                  <span>{c.etiqueta}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                          <div style={dividerStyle} />
                          <button style={menuItemStyle} onClick={() => { setImportExcelGlobalOpen(true); setGlobalMenuOpen(false); }}>
                            <Download size={18} color="var(--text-muted)" /> Importar Excel
                          </button>
                          <button style={menuItemStyle} onClick={() => { exportarPlantilla(actual.id); setGlobalMenuOpen(false); }}>
                            <Save size={18} color="var(--text-muted)" /> Exportar Plantilla
                          </button>
                          <button style={menuItemStyle} onClick={() => { exportarModuloCompleto(actual.id); setGlobalMenuOpen(false); }}>
                            <Save size={18} color="var(--text-muted)" /> Exportar Módulo
                          </button>
                          <button style={menuItemStyle} onClick={abrirEditarModulo}>
                            <Edit3 size={18} color="var(--text-muted)" /> Editar Módulo
                          </button>
                          <button style={menuItemStyle} onClick={duplicarModulo}>
                            <Copy size={18} color="var(--text-muted)" /> Duplicar Módulo
                          </button>
                          <button style={menuDangerStyle} onClick={eliminarModulo}>
                            <Trash2 size={18} /> Eliminar Módulo
                          </button>
                          <div style={dividerStyle} />
                        </>
                      )}
                      <div style={sectionTitleStyle}>Global</div>
                      <button style={menuItemStyle} onClick={abrirNuevoModulo}>
                        <Plus size={18} color="var(--text-muted)" /> Nuevo Módulo
                      </button>
                      <div style={dividerStyle} />
                      <div style={sectionTitleStyle}>Exportar</div>
                      <button style={menuItemStyle} onClick={() => handleExcel(false)} disabled={!actualId || exportando !== null}>
                        <FileSpreadsheet size={18} color="#16a34a" /> Excel (Módulo actual)
                      </button>
                      <button style={menuItemStyle} onClick={() => handleExcel(true)} disabled={exportando !== null}>
                        <FileSpreadsheet size={18} color="#16a34a" /> Excel (Todos)
                      </button>
                      <button style={menuItemStyle} onClick={() => handlePDF(false)} disabled={!actualId || exportando !== null}>
                        <FileText size={18} color="#dc2626" /> PDF (Módulo actual)
                      </button>
                      <button style={menuItemStyle} onClick={() => handlePDF(true)} disabled={exportando !== null}>
                        <FileText size={18} color="#dc2626" /> PDF (Todos)
                      </button>
                      <div style={dividerStyle} />
                      <div style={sectionTitleStyle}>Sistema</div>
                      <button style={menuItemStyle} onClick={() => { setGuiaOpen(true); setGlobalMenuOpen(false); }}>
                        <BookOpen size={18} color="var(--text-muted)" /> Ver Guía de Uso
                      </button>
                      <button style={menuItemStyle} onClick={exportarBackup}>
                        <Save size={18} color="var(--text-muted)" /> Backup JSON
                      </button>
                      <label style={menuItemStyle}>
                        <Upload size={18} color="var(--text-muted)" /> Restaurar Backup
                        <input type="file" accept=".json" hidden onChange={handleImportarBackup} />
                      </label>
                      <label style={menuItemStyle}>
                        <Upload size={18} color="var(--text-muted)" /> Importar Plantilla
                        <input type="file" accept=".json" hidden onChange={handleImportarPlantilla} />
                      </label>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {!isMobile && (
          <nav className="tabs">
            {modulos.map(m => (
              <button key={m.id} className={`tab ${m.id === actualId ? 'active' : ''}`} onClick={() => setActualId(m.id)}>
                <span className="tab-dot" style={{ background: m.color }} /> {m.nombre}
              </button>
            ))}
          </nav>
        )}
      </header>

      <main className="app-main">
        {mostrarBienvenida && (
          <div className="bienvenida-banner" style={{ background: '#f0fdfa', borderColor: '#5eead4', borderRadius: 16, padding: 20, marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <strong style={{ display: 'block', fontSize: 16, color: '#0f766e', marginBottom: 4 }}>👋 ¡Bienvenido, {usuario}!</strong>
              <p style={{ margin: 0, fontSize: 13, color: '#115e59' }}>
                Tienes un módulo <b>General</b> listo para usar. Incluye un registro de ejemplo que puedes borrar.
                Si necesitas algo a tu medida, pulsa <b>Menú → Editar Módulo</b>.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <button className="btn-primary" onClick={() => cerrarBienvenida(true)}>Ver Guía</button>
              <button className="btn-ghost" onClick={() => cerrarBienvenida(false)} style={{ background: 'transparent' }}>Ya la conozco</button>
            </div>
          </div>
        )}

        {actual ? (
          <ModuloView
            key={actual.id}
            modulo={actual}
            campos={camposActuales}
            viewMode={viewMode}
            isMobile={isMobile}
            anio={anio}
            mes={mes}
            usuario={usuario}
            onDataChanged={() => {
              db.campos.where('moduloId').equals(actual.id).sortBy('orden').then(setCamposActuales);
            }}
          />
        ) : (
          <div className="empty-module" style={{ textAlign: 'center', padding: '60px 20px' }}>
            <LayoutGrid size={48} color="var(--text-muted)" style={{ margin: '0 auto 16px', opacity: 0.5 }} />
            <h2 style={{ margin: '0 0 8px', fontSize: 20 }}>Sin módulos aún</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: 20 }}>Usa el botón "+" para crear tu primer módulo.</p>
            <button className="btn-primary" onClick={abrirNuevoModulo}>Crear mi primer módulo</button>
          </div>
        )}
      </main>

      <footer className="app-footer" style={{ textAlign: 'center', padding: 20, fontSize: 12, color: 'var(--text-muted)', borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
        <p style={{ margin: 0 }}>ReporteMensual · Offline · Tte. Alejandro de la Cuesta Rey</p>
      </footer>

      {/* FAB móvil */}
      {isMobile && actual && (
        <button
          className="fab"
          onClick={() => window.dispatchEvent(new Event('abrir-nuevo-registro'))}
          aria-label="Nuevo registro"
        >
          <Plus size={28} />
        </button>
      )}

      {/* Menú móvil */}
      {isMobile && globalMenuOpen && (
        <div className="modal-overlay" onClick={() => setGlobalMenuOpen(false)} style={{ zIndex: 10000, alignItems: 'flex-end' }}>
          <div
            className="menu-panel-mobile"
            onClick={e => e.stopPropagation()}
            style={{
              position: 'relative', bottom: 'auto', left: 'auto', right: 'auto',
              width: '100%', borderRadius: '24px 24px 0 0', maxHeight: '80vh',
              paddingBottom: 'env(safe-area-inset-bottom)',
              animation: 'slideUp 0.2s ease-out'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12, paddingBottom: 8 }}>
              <div style={{ width: 40, height: 4, borderRadius: 2, background: '#cbd5e1' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 20px 12px' }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Opciones</h3>
              <button className="btn-icon-close" onClick={() => setGlobalMenuOpen(false)}><X size={20} /></button>
            </div>
            <div style={{ overflowY: 'auto', maxHeight: '60vh', padding: '0 12px 16px' }}>
              {actual && (
                <>
                  <div style={sectionTitleStyle}>Módulo: {actual.nombre}</div>
                  <button style={menuItemStyle} onClick={() => { setEstadisticasOpen(true); setGlobalMenuOpen(false); }}>
                    <BarChart3 size={20} color="var(--primary)" /> <span style={{ color: 'var(--primary)', fontWeight: 600 }}>Ver Estadísticas</span>
                  </button>
                  <button style={menuItemStyle} onClick={() => { setImportExcelGlobalOpen(true); setGlobalMenuOpen(false); }}>
                    <Download size={20} color="var(--text-muted)" /> Importar Excel
                  </button>
                  <button style={menuItemStyle} onClick={() => { exportarPlantilla(actual.id); setGlobalMenuOpen(false); }}>
                    <Save size={20} color="var(--text-muted)" /> Exportar Plantilla
                  </button>
                  <button style={menuItemStyle} onClick={abrirEditarModulo}>
                    <Edit3 size={20} color="var(--text-muted)" /> Editar Módulo
                  </button>
                  <button style={menuDangerStyle} onClick={eliminarModulo}>
                    <Trash2 size={20} /> Eliminar Módulo
                  </button>
                  <div style={dividerStyle} />
                </>
              )}
              <div style={sectionTitleStyle}>Global</div>
              <button style={menuItemStyle} onClick={abrirNuevoModulo}>
                <Plus size={20} color="var(--text-muted)" /> Nuevo Módulo
              </button>
              <div style={dividerStyle} />
              <div style={sectionTitleStyle}>Exportar</div>
              <button style={menuItemStyle} onClick={() => handleExcel(false)} disabled={!actualId}>
                <FileSpreadsheet size={20} color="#16a34a" /> Excel del módulo
              </button>
              <button style={menuItemStyle} onClick={() => handlePDF(false)} disabled={!actualId}>
                <FileText size={20} color="#dc2626" /> PDF del módulo
              </button>
              <div style={dividerStyle} />
              <div style={sectionTitleStyle}>Sistema</div>
              <button style={menuItemStyle} onClick={() => { setGuiaOpen(true); setGlobalMenuOpen(false); }}>
                <BookOpen size={20} color="var(--text-muted)" /> Guía de Uso
              </button>
              <button style={menuItemStyle} onClick={exportarBackup}>
                <Save size={20} color="var(--text-muted)" /> Backup JSON
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom nav móvil */}
      {isMobile && (
        <nav className="mobile-bottom-nav">
          <button onClick={() => setModulosDrawerOpen(true)} style={{ color: modulosDrawerOpen ? 'var(--primary)' : 'var(--text-muted)' }}>
            <FolderOpen size={22} />
            <span>Módulos</span>
          </button>
          <button onClick={() => window.dispatchEvent(new Event('abrir-nuevo-registro'))} className="nav-new" disabled={!actual}>
            <Plus size={26} />
            <span>Nuevo</span>
          </button>
          <button onClick={() => setGlobalMenuOpen(true)}>
            <Settings size={22} />
            <span>Menú</span>
          </button>
        </nav>
      )}

      {/* Drawer módulos móvil */}
      {modulosDrawerOpen && (
        <div className="modal-overlay" onClick={() => setModulosDrawerOpen(false)} style={{ zIndex: 10000, alignItems: 'flex-start' }}>
          <div className="drawer-panel" onClick={e => e.stopPropagation()} style={{ width: '85%', maxWidth: 340, height: '100%', borderRadius: '0 24px 24px 0', animation: 'slideIn 0.2s ease-out' }}>
            <div className="drawer-header" style={{ padding: '20px', borderBottom: '1px solid var(--border)' }}>
              <h3 style={{ margin: 0, fontSize: 18 }}>Mis Módulos</h3>
              <button className="btn-icon-close" onClick={() => setModulosDrawerOpen(false)}><X size={20} /></button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {modulos.map(m => (
                <button
                  key={m.id}
                  className={`drawer-item ${m.id === actualId ? 'active' : ''}`}
                  onClick={() => { setActualId(m.id); setModulosDrawerOpen(false); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 12, border: 'none', background: m.id === actualId ? '#f0fdfa' : 'transparent', color: m.id === actualId ? '#0f766e' : 'var(--text)', cursor: 'pointer', width: '100%', textAlign: 'left', fontWeight: m.id === actualId ? 600 : 500 }}
                >
                  <AppIcon emoji={m.icono} size={22} />
                  <span style={{ flex: 1 }}>{m.nombre}</span>
                  {m.id === actualId && <ChevronRight size={18} />}
                </button>
              ))}
              <div style={dividerStyle} />
              <button
                onClick={() => { abrirNuevoModulo(); setModulosDrawerOpen(false); }}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 12, border: 'none', background: 'transparent', color: 'var(--primary)', cursor: 'pointer', width: '100%', textAlign: 'left', fontWeight: 600 }}
              >
                <Plus size={22} />
                <span>Nuevo módulo</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {editorOpen && (
        <EditorModulo
          modulo={editorModulo}
          campos={editorCampos}
          onClose={() => setEditorOpen(false)}
          onSave={async () => {
            setEditorOpen(false);
            await cargar();
            if (actualId) {
              const c = await db.campos.where('moduloId').equals(actualId).sortBy('orden');
              setCamposActuales(c);
            }
          }}
        />
      )}

      {importExcelGlobalOpen && (
        <ImportarExcel
          modulo={actual || undefined}
          campos={camposActuales}
          onClose={() => setImportExcelGlobalOpen(false)}
          onImported={async (nuevoModuloId) => {
            setImportExcelGlobalOpen(false);
            await cargar();
            if (nuevoModuloId) setActualId(nuevoModuloId);
          }}
        />
      )}

      {guiaOpen && <Guia onClose={() => setGuiaOpen(false)} />}

      {estadisticasOpen && actual && (
        <Estadisticas
          modulo={actual}
          campos={camposActuales}
          anio={anio}
          mes={mes}
          usuario={usuario}
          onClose={() => setEstadisticasOpen(false)}
        />
      )}

      <PWAInstallPrompt />
      <div id="pdf-render-area" style={{ position: 'fixed', left: '-99999px', top: 0 }} />
    </div>
  );
}

export default App;