import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

/**
 * Guarda un archivo en el dispositivo de forma que funcione en:
 *  - Web (PWA / navegador)
 *  - Android / iOS (APK con Capacitor)
 *
 * @param filename  Nombre con extensión, ej: "Reporte.pdf"
 * @param data      Blob (para binarios) o string (para texto/JSON)
 * @param mimeType  "application/pdf", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", etc.
 */
export async function saveFile(
    filename: string,
    data: Blob | string,
    mimeType: string
): Promise<void> {
    // ---------- NATIVO (APK) ----------
    if (Capacitor.isNativePlatform()) {
        let base64: string;

        if (typeof data === 'string') {
            // Texto plano → base64
            base64 = btoa(unescape(encodeURIComponent(data)));
        } else {
            // Blob → base64 (usando FileReader para no bloquear con blobs grandes)
            base64 = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => {
                    const result = reader.result as string;
                    // Quitar "data:...;base64," del inicio
                    const comma = result.indexOf(',');
                    resolve(comma >= 0 ? result.substring(comma + 1) : result);
                };
                reader.onerror = reject;
                reader.readAsDataURL(data);
            });
        }

        // 1. Guardar en Documents del dispositivo
        const result = await Filesystem.writeFile({
            path: filename,
            data: base64,
            directory: Directory.Documents,
            recursive: true,
        });

        // 2. Abrir el diálogo nativo "Compartir / Guardar como..."
        //    En Android, "Compartir" permite guardar en Drive, WhatsApp, etc.
        try {
            await Share.share({
                title: filename,
                url: result.uri,
                dialogTitle: 'Guardar o compartir',
            });
        } catch {
            // Si el usuario cancela el share, no es error
        }
        return;
    }

    // ---------- WEB (PWA / navegador) ----------
    const blob = typeof data === 'string'
        ? new Blob([data], { type: mimeType })
        : data;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Liberar memoria después de un tiempo
    setTimeout(() => URL.revokeObjectURL(url), 5000);
}