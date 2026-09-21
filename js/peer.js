// Collegamento diretto fra computer e telefono, senza passare dal ponte HTTP.
//
// PERCHE' AGGIUNGERLO, visto che il ponte gia' funziona.
//
// Il ponte ha un difetto: il telefono deve poter BUSSARE al computer, e il
// firewall di Windows, su una rete classificata "Public", lo impedisce.
// Serve una regola, che serve un amministratore.
//
// Qui succede il contrario: i due dispositivi si chiamano l'un l'altro
// verso l'esterno, e il firewall lascia passare le risposte al traffico che
// e' uscito da li'. Nessuna regola da aggiungere. E' lo stesso meccanismo per
// cui una videochiamata funziona senza configurare niente.
//
// IL PREZZO. Perche' due dispositivi si trovino, qualcuno deve presentarli:
// e' il "signalling". Se lo facesse il computer, saremmo punto e a capo —
// il telefono dovrebbe bussare. Quindi le presentazioni passano da un
// servizio esterno (il broker pubblico di PeerJS), e serve internet anche se
// i due dispositivi sono a mezzo metro di distanza.
//
// Al broker passano solo le presentazioni: chi sono e come raggiungermi.
// Le posizioni del corpo viaggiano dirette, da dispositivo a dispositivo,
// e non toccano nessun server.

const PEERJS_URL = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js';
const PREFIX = 'yogasynth-';
const CODE_KEY = 'yogasynth.codice';

// Parole corte, senza accenti e senza lettere che si confondono a voce.
const PAROLE = [
    'luna', 'sole', 'onda', 'pino', 'riva', 'alba', 'vela', 'nodo',
    'lago', 'orso', 'fiume', 'monte', 'cielo', 'pietra', 'vento', 'neve'
];

/** Codice breve e leggibile, da dettare o scrivere sul telefono. */
export function nuovoCodice() {
    const parola = PAROLE[Math.floor(Math.random() * PAROLE.length)];
    const numero = String(Math.floor(1000 + Math.random() * 9000));
    return parola + '-' + numero;
}

/** Lo stesso codice fra una sessione e l'altra, cosi' non si ridigita ogni volta. */
export function codiceSalvato() {
    try {
        const salvato = localStorage.getItem(CODE_KEY);
        if (salvato) return salvato;
    } catch (e) { /* archiviazione non disponibile */ }
    return null;
}

function salvaCodice(codice) {
    try { localStorage.setItem(CODE_KEY, codice); }
    catch (e) { /* archiviazione non disponibile */ }
}

/**
 * La libreria si scarica solo quando serve: sono novanta chilobyte che
 * un utente che non usa il secondo schermo non ha motivo di pagare.
 */
export function caricaPeerJS() {
    if (window.Peer) return Promise.resolve(window.Peer);
    if (!caricaPeerJS._attesa) {
        caricaPeerJS._attesa = new Promise((risolvi, rifiuta) => {
            const tag = document.createElement('script');
            tag.src = PEERJS_URL;
            tag.onload = () => window.Peer
                ? risolvi(window.Peer)
                : rifiuta(new Error('PeerJS caricato ma non definito'));
            tag.onerror = () => rifiuta(new Error('PeerJS non scaricabile (serve internet)'));
            document.head.appendChild(tag);
        });
    }
    return caricaPeerJS._attesa;
}

/**
 * Lato computer: si mette in ascolto su un codice e trasmette a chiunque si
 * colleghi con quel codice.
 */
export class PeerHost {
    /** @param {function} onStato chiamata a ogni cambio: (testo, dettaglio) */
    constructor(onStato) {
        this.onStato = onStato || function () {};
        this.peer = null;
        this.connessioni = [];
        this.codice = null;
        this.attivo = false;
        this._tentativi = 0;
    }

    get collegati() { return this.connessioni.length; }

    /** @param {string} codice se manca, si riusa quello salvato o se ne fa uno nuovo */
    async start(codice) {
        this.attivo = true;
        this.codice = codice || codiceSalvato() || nuovoCodice();
        salvaCodice(this.codice);
        this.onStato('collegamento al servizio di incontro...');

        let Peer;
        try {
            Peer = await caricaPeerJS();
        } catch (e) {
            this.onStato('non disponibile', e.message);
            this.attivo = false;
            return null;
        }
        this._apri(Peer);
        return this.codice;
    }

    _apri(Peer) {
        if (!this.attivo) return;
        this.peer = new Peer(PREFIX + this.codice, { debug: 0 });

        this.peer.on('open', () => {
            this._tentativi = 0;
            this.onStato('in attesa del telefono');
        });

        this.peer.on('connection', conn => {
            conn.on('open', () => {
                this.connessioni.push(conn);
                this.onStato('telefono collegato');
            });
            const chiudi = () => {
                this.connessioni = this.connessioni.filter(c => c !== conn);
                this.onStato(this.connessioni.length ? 'telefono collegato' : 'in attesa del telefono');
            };
            conn.on('close', chiudi);
            conn.on('error', chiudi);
        });

        this.peer.on('error', err => {
            // Il codice e' gia' in uso da qualcun altro sul broker pubblico:
            // se ne prende un altro invece di restare bloccati.
            if (err && err.type === 'unavailable-id' && this._tentativi < 3) {
                this._tentativi++;
                this.codice = nuovoCodice();
                salvaCodice(this.codice);
                this.onStato("codice gia' in uso, ne provo un altro");
                try { this.peer.destroy(); } catch (e) { /* gia' chiuso */ }
                this._apri(Peer);
                return;
            }
            this.onStato('errore', (err && err.message) || String(err));
        });
    }

    /**
     * Manda lo stato a tutti i telefoni collegati.
     *
     * Se un canale e' gia' ingolfato si salta il giro: meglio perdere un
     * aggiornamento che accumulare ritardo. Sono posizioni dal vivo, quella
     * vecchia non serve a nessuno.
     */
    send(snap) {
        for (const conn of this.connessioni) {
            try {
                if (conn.dataChannel && conn.dataChannel.bufferedAmount > 64 * 1024) continue;
                conn.send(snap);
            } catch (e) { /* connessione morente: se ne accorge 'close' */ }
        }
    }

    stop() {
        this.attivo = false;
        for (const conn of this.connessioni) {
            try { conn.close(); } catch (e) { /* gia' chiusa */ }
        }
        this.connessioni = [];
        if (this.peer) {
            try { this.peer.destroy(); } catch (e) { /* gia' distrutto */ }
            this.peer = null;
        }
        this.onStato('spento');
    }
}
