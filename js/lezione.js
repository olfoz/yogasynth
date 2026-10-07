// La lezione, lato insegnante.
//
// In modalita' libera l'insegnante assume la posizione che vuole e l'avatar
// la ripete. Gli allievi lo vedono da casa: inquadrano un QR (o aprono un
// link), e la pagina lezione.html riceve la posa e ridisegna l'avatar da
// se', alla sua risoluzione. E' lo stesso principio del secondo schermo
// (js/schermo.js): si mandano posizioni, non immagini — qualche centinaio di
// byte invece di un video, per ogni allievo.
//
// Il video, se l'insegnante lo vuole, si aggiunge sopra: ogni allievo
// sceglie se vederlo a lato dell'avatar, sovrapposto o per niente, e il
// flusso parte solo verso chi l'ha chiesto. Spento di serie: la webcam
// dell'insegnante esce da questo computer solo se lo decide lui.
//
// Il trasporto e' il collegamento diretto di js/peer.js, con un codice suo:
// un telefono gia' collegato come secondo schermo e una lezione non si
// pestano i piedi.

import { PeerHost } from './peer.js';

// Indirizzo pubblico del sito, per gli inviti fatti da un computer che apre
// l'app da localhost. Gli allievi sono a casa loro: un link a localhost o a
// un 192.168.x.x per loro non porta da nessuna parte. La lezione funziona
// lo stesso, perche' le posizioni viaggiano sul collegamento diretto e non
// passano dal sito: il sito serve solo a consegnare la pagina.
export const SITO_PUBBLICO = 'https://olfoz.github.io/yogasynth/';

// La lezione va piu' fitta del secondo schermo (12): li' si guarda una posa
// ferma da raggiungere, qui un corpo che si muove. Pesa poco lo stesso,
// circa mezzo chilobyte ad aggiornamento.
const HZ_LEZIONE = 20;

// Tetto di banda del video, per allievo. Il computer dell'insegnante manda
// un flusso separato a ciascuno: con dieci allievi sono dieci flussi, e una
// linea di casa in salita non regge dieci video a piena qualita'. A 600 kbit/s
// il corpo si legge benissimo e dieci allievi stanno sotto i 6 Mbit/s.
const VIDEO_MAX_BITRATE = 600000;

export class Lezione {
    /**
     * @param {function} onCambio chiamata quando cambia qualcosa da mostrare:
     *   ({ stato, dettaglio, allievi, video })
     */
    constructor(onCambio) {
        this.onCambio = onCambio || function () {};
        this.stato = 'spenta';
        this.dettaglio = '';
        this.stream = null;          // la webcam, quando la pratica e' partita
        this.videoAcceso = false;    // l'insegnante vuole mandare il video
        this.allievi = new Map();    // conn -> { vuole, chiamata }

        this.host = new PeerHost((testo, dettaglio) => {
            this.stato = testo;
            this.dettaglio = dettaglio || '';
            this._avvisa();
        }, {
            prefisso: 'yogasynth-lezione-',
            chiave: 'yogasynth.codiceLezione',
            hz: HZ_LEZIONE,
            attesa: 'in attesa degli allievi',
            collegato: 'lezione in corso'
        });
        this.host.onMessaggio = (conn, msg) => this._messaggio(conn, msg);
        this.host.onChiusa = conn => {
            const a = this.allievi.get(conn);
            if (a && a.chiamata) { try { a.chiamata.close(); } catch (e) { /* gia' chiusa */ } }
            this.allievi.delete(conn);
            this._avvisa();
        };
    }

    get attiva() { return this.host.attivo; }
    get collegati() { return this.host.collegati; }
    get codice() { return this.host.codice; }

    /** Apre l'ascolto. Restituisce il link da dare agli allievi, o null. */
    async apri() {
        const codice = await this.host.start();
        if (!codice) return null;
        return Lezione.link(codice);
    }

    /**
     * Il link d'invito. Se l'app gira gia' da un sito pubblicato si usa
     * quello; da localhost o dalla rete di casa, il sito pubblico.
     */
    static link(codice) {
        const locale = location.protocol === 'file:'
            || /^(localhost|127\.|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.|\[::1\])/.test(location.hostname);
        const base = locale
            ? SITO_PUBBLICO
            : location.origin + location.pathname.replace(/[^/]*$/, '');
        return base + 'lezione.html#' + codice;
    }

    /** Manda la posa a tutti gli allievi (con il ritmo deciso da PeerHost). */
    send(snap) {
        if (this.host.collegati) this.host.send(snap);
    }

    /** La webcam dell'insegnante: c'e' solo dopo INIZIA. */
    setStream(stream) {
        this.stream = stream || null;
        this._aggiornaTutti();
    }

    /** Acceso o spento dall'insegnante. */
    setVideo(acceso) {
        this.videoAcceso = !!acceso;
        this._aggiornaTutti();
        this._avvisa();
    }

    /** Il video sta davvero partendo verso chi lo chiede? */
    get videoDisponibile() {
        return this.videoAcceso && !!this.stream;
    }

    _messaggio(conn, msg) {
        if (!msg || typeof msg !== 'object') return;
        if (msg.tipo === 'video') {
            const a = this.allievi.get(conn) || { vuole: false, chiamata: null };
            a.vuole = !!msg.vuole;
            this.allievi.set(conn, a);
            this._aggiorna(conn, a);
            this._avvisa();
        }
    }

    _aggiornaTutti() {
        for (const [conn, a] of this.allievi) this._aggiorna(conn, a);
    }

    /** Apre o chiude il video verso un allievo, secondo cosa vogliono i due. */
    _aggiorna(conn, a) {
        const deve = this.videoDisponibile && a.vuole && conn.open && this.host.peer;
        if (deve && !a.chiamata) {
            let chiamata;
            try {
                chiamata = this.host.peer.call(conn.peer, this.stream);
            } catch (e) {
                console.warn('[lezione] video verso un allievo non partito:', e);
                return;
            }
            if (!chiamata) return;
            a.chiamata = chiamata;
            const fine = () => { if (a.chiamata === chiamata) a.chiamata = null; };
            chiamata.on('close', fine);
            chiamata.on('error', fine);
            limitaBanda(chiamata);
        } else if (!deve && a.chiamata) {
            const c = a.chiamata;
            a.chiamata = null;
            try { c.close(); } catch (e) { /* gia' chiusa */ }
        }
    }

    _avvisa() {
        let video = 0;
        for (const a of this.allievi.values()) if (a.chiamata) video++;
        this.onCambio({
            stato: this.stato,
            dettaglio: this.dettaglio,
            allievi: this.host.collegati,
            video
        });
    }

    chiudi() {
        for (const a of this.allievi.values()) {
            if (a.chiamata) { try { a.chiamata.close(); } catch (e) { /* gia' chiusa */ } }
        }
        this.allievi.clear();
        this.host.stop();
    }
}

/**
 * Mette il tetto di banda sul video di una chiamata, appena il collegamento
 * e' in piedi: prima i parametri del mittente non hanno ancora le codifiche
 * su cui scriverlo.
 */
function limitaBanda(chiamata) {
    const pc = chiamata.peerConnection;
    if (!pc || !pc.addEventListener) return;
    const applica = () => {
        if (pc.iceConnectionState !== 'connected' && pc.iceConnectionState !== 'completed') return;
        pc.removeEventListener('iceconnectionstatechange', applica);
        for (const sender of pc.getSenders()) {
            if (!sender.track || sender.track.kind !== 'video') continue;
            try {
                const p = sender.getParameters();
                if (!p.encodings || !p.encodings.length) p.encodings = [{}];
                p.encodings[0].maxBitrate = VIDEO_MAX_BITRATE;
                sender.setParameters(p).catch(e => console.info('[lezione] tetto di banda non applicato:', e));
            } catch (e) {
                console.info('[lezione] tetto di banda non applicato:', e);
            }
        }
    };
    pc.addEventListener('iceconnectionstatechange', applica);
    applica();
}
