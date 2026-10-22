import { useEffect, useState } from 'react';
import { Smartphone, X } from 'lucide-react';

export default function PWAInstallPrompt() {
    const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
    const [showBanner, setShowBanner] = useState(false);

    useEffect(() => {
        if (window.matchMedia('(display-mode: standalone)').matches) return;

        const handleBeforeInstallPrompt = (e: Event) => {
            e.preventDefault();
            setDeferredPrompt(e);
            // Pequeño delay para que no aparezca instantáneamente al cargar
            setTimeout(() => setShowBanner(true), 2000);
        };

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    }, []);

    const handleInstallClick = async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        await deferredPrompt.userChoice;
        setDeferredPrompt(null);
        setShowBanner(false);
    };

    if (!showBanner) return null;

    return (
        <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 10000,
            padding: '0 16px 16px 16px', pointerEvents: 'none'
        }}>
            <div style={{
                background: 'var(--surface)', borderRadius: 20, padding: 16,
                boxShadow: '0 10px 40px rgba(0,0,0,0.15)', border: '1px solid var(--border)',
                display: 'flex', flexDirection: 'column', gap: 12,
                pointerEvents: 'auto', animation: 'slideUp 0.4s ease-out',
                paddingBottom: 'calc(16px + env(safe-area-inset-bottom))'
            }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{
                        width: 44, height: 44, borderRadius: 12, background: '#f0fdfa',
                        display: 'grid', placeItems: 'center', flexShrink: 0
                    }}>
                        <Smartphone size={24} color="#0d9488" />
                    </div>
                    <div style={{ flex: 1 }}>
                        <strong style={{ display: 'block', fontSize: 15, color: 'var(--text)' }}>Instala ReporteMensual</strong>
                        <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
                            Añádela a tu pantalla de inicio y úsala como una app nativa, incluso sin internet.
                        </p>
                    </div>
                    <button
                        onClick={() => setShowBanner(false)}
                        style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4 }}
                    >
                        <X size={20} />
                    </button>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn-ghost" onClick={() => setShowBanner(false)} style={{ flex: 1, fontSize: 13, padding: '8px 0' }}>
                        Ahora no
                    </button>
                    <button className="btn-primary" onClick={handleInstallClick} style={{ flex: 2, fontSize: 13, padding: '8px 0' }}>
                        Instalar App
                    </button>
                </div>
            </div>
            <style>{`
                @keyframes slideUp {
                    from { transform: translateY(100%); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
            `}</style>
        </div>
    );
}