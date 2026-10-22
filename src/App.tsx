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

function App() {
  const hoy = new Date();
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mes, setMes] = useState(hoy.getMonth());
  const [modulos, setModulos] = useState<Modulo[]>([]);
  const [actualId, setActualId] = useState<string | null>(null);

  const [camposActuales, setCamposActuales] = useState<Campo[]>([]);
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [isMobile, setIsMobile] = useState(false);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorModulo, setEditorModulo] = useState<Modulo | null>(null);
  const [editorCampos, setEditorCampos] = useState<Campo[]>([]);
  const [exportando, setExportando] = useState<'excel' | 'pdf' | null>(null);
  const [importExcelGlobalOpen, setImportExcelGlobalOpen] = useState(false);

  const [guiaOpen, setGuiaOpen] = useState(false);
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
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Cerrar menú al clic fuera
  useEffect(() => {
    if (!globalMenuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (globalMenuRef.current && !globalMenuRef.current.contains(e.target as Node)) {
        setGlobalMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [globalMenuOpen]);

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

  if (!usuario) {
    return (
      <div className="login-screen">
        <form className="login-card" onSubmit={handleLogin}>
          <div className="brand-mark" style={{ margin: '0 auto 16px' }}>RM</div>
          <h1>Bienvenido a ReporteMensual</h1>
          <p>Ingresa tu nombre para identificar tus módulos.</p>
          <input type="text" placeholder="Tu nombre..." value={loginInput} onChange={e => setLoginInput(e.target.value)} autoFocus />
          <button type="submit" className="btn-primary" style={{ width: '100%', marginTop: 12 }}>Entrar</button>
        </form>
      </div>
    );
  }

  const anios = [hoy.getFullYear() - 1, hoy.getFullYear(), hoy.getFullYear() + 1];
  const actual = modulos.find(m => m.id === actualId) ?? null;

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="header-inner">
          <div className="brand" onClick={() => setModulosDrawerOpen(true)} style={{ cursor: 'pointer' }}>
            <span className="brand-mark">RM</span>
            <div>
              <h1>ReporteMensual</h1>
              <p className="brand-sub">Hola, {usuario}</p>
            </div>
          </div>

          <div className="header-tools">
            {!isMobile && (
              <>
                <label className="month-picker">
                  <span>Mes</span>
                  <select value={mes} onChange={e => setMes(Number(e.target.value))}>
                    {Array.from({ length: 12 }, (_, i) => (
                      <option key={i} value={i}>{['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'][i]}</option>
                    ))}
                  </select>
                </label>
                <label className="month-picker">
                  <span>Año</span>
                  <select value={anio} onChange={e => setAnio(Number(e.target.value))}>
                    {anios.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </label>
              </>
            )}

            <div className="menu-dropdown" ref={globalMenuRef}>
              <button className="menu-button" onClick={() => setGlobalMenuOpen(!globalMenuOpen)}>
                ⚙️ {!isMobile && 'Menú'}
              </button>
              {globalMenuOpen && (
                <div className="menu-panel">
                  {actual && (
                    <>
                      <div className="menu-section-title">Módulo: {actual.nombre}</div>
                      {!isMobile && (
                        <button className="menu-item" onClick={() => { setViewMode(viewMode === 'table' ? 'cards' : 'table'); setGlobalMenuOpen(false); }}>
                          <span className="menu-icon">{viewMode === 'table' ? '📱' : '📊'}</span>
                          {viewMode === 'table' ? 'Ver como Tarjetas' : 'Ver como Tabla'}
                        </button>
                      )}
                      <div style={{ padding: '6px 10px' }}>
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
                      <div className="menu-divider" />
                      <button className="menu-item" onClick={() => { setImportExcelGlobalOpen(true); setGlobalMenuOpen(false); }}>
                        <span className="menu-icon">📥</span> Importar Excel
                      </button>
                      <button className="menu-item" onClick={() => { exportarPlantilla(actual.id); setGlobalMenuOpen(false); }}>
                        <span className="menu-icon">🎁</span> Exportar Plantilla
                      </button>
                      <button className="menu-item" onClick={() => { exportarModuloCompleto(actual.id); setGlobalMenuOpen(false); }}>
                        <span className="menu-icon">💾</span> Exportar Módulo
                      </button>
                      <button className="menu-item" onClick={abrirEditarModulo}>
                        <span className="menu-icon">✏️</span> Editar Módulo
                      </button>
                      <button className="menu-item" onClick={duplicarModulo}>
                        <span className="menu-icon">📋</span> Duplicar Módulo
                      </button>
                      <button className="menu-item danger" onClick={eliminarModulo}>
                        <span className="menu-icon">🗑️</span> Eliminar Módulo
                      </button>
                      <div className="menu-divider" />
                    </>
                  )}
                  <div className="menu-section-title">Global</div>
                  <button className="menu-item" onClick={abrirNuevoModulo}>
                    <span className="menu-icon">➕</span> Nuevo Módulo
                  </button>
                  <button className="menu-item" onClick={() => { setImportExcelGlobalOpen(true); setGlobalMenuOpen(false); }}>
                    <span className="menu-icon">📥</span> Crear Módulo desde Excel
                  </button>
                  <div className="menu-divider" />
                  <div className="menu-section-title">Exportar</div>
                  <button className="menu-item" onClick={() => handleExcel(false)} disabled={!actualId || exportando !== null}>
                    <span className="menu-icon">📊</span> Excel (Módulo actual)
                  </button>
                  <button className="menu-item" onClick={() => handleExcel(true)} disabled={exportando !== null}>
                    <span className="menu-icon">📊</span> Excel (Todos)
                  </button>
                  <button className="menu-item" onClick={() => handlePDF(false)} disabled={!actualId || exportando !== null}>
                    <span className="menu-icon">📄</span> PDF (Módulo actual)
                  </button>
                  <button className="menu-item" onClick={() => handlePDF(true)} disabled={exportando !== null}>
                    <span className="menu-icon">📄</span> PDF (Todos)
                  </button>
                  <div className="menu-divider" />
                  <div className="menu-section-title">Sistema</div>
                  <button className="menu-item" onClick={() => { setGuiaOpen(true); setGlobalMenuOpen(false); }}>
                    <span className="menu-icon">📖</span> Ver Guía de Uso
                  </button>
                  <button className="menu-item" onClick={exportarBackup}>
                    <span className="menu-icon">💾</span> Backup JSON
                  </button>
                  <label className="menu-item" style={{ cursor: 'pointer' }}>
                    <span className="menu-icon">📥</span> Restaurar Backup
                    <input type="file" accept=".json" hidden onChange={handleImportarBackup} />
                  </label>
                  <label className="menu-item" style={{ cursor: 'pointer' }}>
                    <span className="menu-icon">🎁</span> Importar Plantilla
                    <input type="file" accept=".json" hidden onChange={handleImportarPlantilla} />
                  </label>
                </div>
              )}
            </div>
          </div>
        </div>

        <nav className="tabs">
          {modulos.map(m => (
            <button key={m.id} className={`tab ${m.id === actualId ? 'active' : ''}`} onClick={() => setActualId(m.id)}>
              <span className="tab-dot" style={{ background: m.color }} /> {m.icono} {m.nombre}
            </button>
          ))}
        </nav>
      </header>

      <main className="app-main">
        {mostrarBienvenida && (
          <div className="bienvenida-banner">
            <div>
              <strong>👋 ¡Bienvenido a ReporteMensual, {usuario}!</strong>
              <p>Es tu primera vez aquí. Te recomendamos leer la guía rápida para aprovechar todas las funciones.</p>
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <button className="btn-primary" onClick={() => cerrarBienvenida(true)}>📖 Ver Guía</button>
              <button className="btn-ghost" onClick={() => cerrarBienvenida(false)}>Ya la conozco</button>
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
          <div className="empty-module">
            <h2>Sin módulos aún</h2>
            <p>Usa el botón "⚙️ Menú" arriba a la derecha para crear tu primer módulo.</p>
          </div>
        )}
      </main>

      <footer className="app-footer">
        <p style={{ margin: 0 }}>ReporteMensual · Offline · Tte. Alejandro de la Cuesta Rey</p>
      </footer>

      {/* BOTTOM NAV MÓVIL */}
      {isMobile && (
        <nav className="mobile-bottom-nav">
          <button onClick={() => setModulosDrawerOpen(true)}>
            <span className="icon">📁</span>
            <span>Módulos</span>
          </button>
          <button onClick={() => { window.dispatchEvent(new Event('abrir-nuevo-registro')); }} className="nav-new">
            <span className="icon">➕</span>
            <span>Nuevo</span>
          </button>
          <button onClick={() => setGlobalMenuOpen(true)}>
            <span className="icon">⚙️</span>
            <span>Menú</span>
          </button>
        </nav>
      )}

      {/* DRAWER DE MÓDULOS (Móvil) */}
      {modulosDrawerOpen && (
        <div className="drawer-overlay" onClick={() => setModulosDrawerOpen(false)}>
          <div className="drawer-panel" onClick={e => e.stopPropagation()}>
            <div className="drawer-header">
              <h3>Mis Módulos</h3>
              <button className="btn-icon-close" onClick={() => setModulosDrawerOpen(false)}>✕</button>
            </div>
            <div className="drawer-body">
              {modulos.map(m => (
                <button
                  key={m.id}
                  className={`drawer-item ${m.id === actualId ? 'active' : ''}`}
                  onClick={() => { setActualId(m.id); setModulosDrawerOpen(false); }}
                >
                  <span style={{ fontSize: 20 }}>{m.icono}</span>
                  <span style={{ flex: 1, textAlign: 'left' }}>{m.nombre}</span>
                  {m.id === actualId && <span style={{ color: 'var(--primary)' }}>✓</span>}
                </button>
              ))}
              <div className="menu-divider" style={{ margin: '12px 0' }} />
              <button className="drawer-item" onClick={() => { abrirNuevoModulo(); setModulosDrawerOpen(false); }}>
                <span style={{ fontSize: 20 }}>➕</span>
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
      <PWAInstallPrompt />
      <div id="pdf-render-area" style={{ position: 'fixed', left: '-99999px', top: 0 }} />
    </div>
  );
}

export default App;