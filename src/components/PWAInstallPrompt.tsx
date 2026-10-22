import { useEffect, useState } from 'react';

export default function PWAInstallPrompt() {
    const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
    const [showBanner, setShowBanner] = useState(false);

    useEffect(() => {
        // Si ya está instalada (se abre en modo standalone), no mostrar nada
        if (window.matchMedia('(display-mode: standalone)').matches) {
            return;
        }

        const handleBeforeInstallPrompt = (e: Event) => {
            // Evitamos que el navegador muestre su banner automático (feo)
            e.preventDefault();
            // Guardamos el evento para dispararlo cuando el usuario haga clic
            setDeferredPrompt(e);
            setShowBanner(true);
        };

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        };
    }, []);

    const handleInstallClick = async () => {
        if (!deferredPrompt) return;

        // Mostramos el prompt nativo del navegador
        deferredPrompt.prompt();

        // Esperamos la respuesta del usuario
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            console.log('Usuario instaló la app');
        }

        // Limpiamos
        setDeferredPrompt(null);
        setShowBanner(false);
    };

    if (!showBanner) return null;

    return (
        <div className="pwa-banner">
            <div className="pwa-banner-content">
                <span className="pwa-icon">📱</span>
                <div>
                    <strong>Instala ReporteMensual</strong>
                    <p>Añádela a tu pantalla de inicio y úsala como una app nativa, incluso sin internet.</p>
                </div>
            </div>
            <div className="pwa-actions">
                <button className="btn-ghost" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => setShowBanner(false)}>
                    Ahora no
                </button>
                <button className="btn-primary" style={{ fontSize: 12, padding: '6px 16px' }} onClick={handleInstallClick}>
                    Instalar
                </button>
            </div>
        </div>
    );
}