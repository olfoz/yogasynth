// Codice QR per l'indirizzo da aprire sul telefono.
//
// Senza, l'indirizzo va digitato a mano: cinquanta caratteri con un codice
// in mezzo, sbagliarne uno e' la norma. Inquadrarlo e' un gesto solo.
//
// Il disegno avviene qui, nel browser: nessuna immagine chiesta a un
// servizio esterno, quindi l'indirizzo di casa propria non esce da qui. La
// libreria si scarica solo quando serve, come PeerJS.

const QR_URL = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js';

function caricaQr() {
    if (window.qrcode) return Promise.resolve(window.qrcode);
    if (!caricaQr._attesa) {
        caricaQr._attesa = new Promise((risolvi, rifiuta) => {
            const tag = document.createElement('script');
            tag.src = QR_URL;
            tag.onload = () => window.qrcode
                ? risolvi(window.qrcode)
                : rifiuta(new Error('libreria QR caricata ma non definita'));
            tag.onerror = () => rifiuta(new Error('libreria QR non scaricabile'));
            document.head.appendChild(tag);
        });
    }
    return caricaQr._attesa;
}

/**
 * Disegna il QR dentro `contenitore`. Se non ci riesce lo svuota e basta:
 * l'indirizzo scritto sotto resta comunque leggibile.
 *
 * @param {HTMLElement} contenitore
 * @param {string} testo l'indirizzo da codificare
 */
export async function mostraQr(contenitore, testo) {
    if (!contenitore) return false;
    try {
        const qrcode = await caricaQr();
        // tipo 0 = la libreria sceglie da se' la dimensione minima che basta;
        // 'M' regge un quarto di modulo sporco, abbastanza per uno schermo
        const qr = qrcode(0, 'M');
        qr.addData(testo);
        qr.make();
        // celle da 4px con bordo chiaro: il lettore ha bisogno del margine
        contenitore.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 8 });
        const svg = contenitore.querySelector('svg');
        if (svg) {
            svg.removeAttribute('width');
            svg.removeAttribute('height');
            svg.style.width = '100%';
            svg.style.height = 'auto';
            svg.style.display = 'block';
        }
        return true;
    } catch (e) {
        console.info('[qr] non disponibile (' + e.message + '): resta l’indirizzo scritto.');
        contenitore.innerHTML = '';
        return false;
    }
}
