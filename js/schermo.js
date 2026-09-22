// Invio al secondo schermo.
//
// Il computer inquadra e il telefono guarda: la webcam deve stare lontana per
// prendere tutto il corpo, lo schermo vicino per poterlo leggere.
//
// Al telefono si mandano POSIZIONI, non immagini. Dove sono i giunti, dove
// passano i raggi, che note suonano: meno di un chilobyte, che il telefono
// ridisegna alla sua risoluzione. Mandare lo schermo intero come JPEG
// costava quaranta volte tanto, dava al telefono un'immagine compressa da
// ingrandire, e obbligava il computer a copiare e comprimere il canvas a
// ogni fotogramma — proprio mentre deve far girare MediaPipe e l'avatar.

// Relativi, non assoluti: cosi' l'app funziona anche se il sito sta in una
// sottocartella (https://tizio.github.io/yogasynth/) e non alla radice.
const STATE_URL = 'live/state';

/** Meno cifre = meno byte. Un millesimo di riquadro e' gia' sotto il pixel. */
function r4(v) {
    return Math.round(v * 10000) / 10000;
}

function packPoints(uPts) {
    if (!uPts) return null;
    const out = {};
    for (const k in uPts) out[k] = [r4(uPts[k].x), r4(uPts[k].y)];
    return out;
}

/**
 * La posa da raggiungere, in coordinate relative al bacino.
 *
 * Non si mandano le coordinate gia' ancorate sul corpo, che cambierebbero
 * a ogni fotogramma insieme a chi si muove: si manda la posa normalizzata
 * — origine sul bacino, unita' di misura la lunghezza del busto — che per
 * tutta la durata di un asana e' ferma. Il telefono la riancora da solo
 * sul corpo che sta gia' ricevendo, con la stessa aritmetica che usa il
 * computer (`anchorTarget` in js/main.js). Cosi' la figura guida segue chi
 * pratica a ogni fotogramma, ma nei messaggi viaggia solo quando cambia.
 */
function packTarget(tPts) {
    if (!tPts || !tPts.hipMid || !tPts.shoulderMid) return null;
    const torso = Math.hypot(
        tPts.shoulderMid.x - tPts.hipMid.x,
        tPts.shoulderMid.y - tPts.hipMid.y
    );
    if (!(torso > 1e-6)) return null;
    const out = {};
    for (const k in tPts) {
        out[k] = [
            r4((tPts[k].x - tPts.hipMid.x) / torso),
            r4((tPts[k].y - tPts.hipMid.y) / torso)
        ];
    }
    return out;
}

// Ogni quanti messaggi si rimanda la posa guida anche se non e' cambiata.
// Serve a un telefono che si collega a meta' asana: senza, resterebbe
// senza figura fino al prossimo cambio. A 12 Hz sono circa mezzo secondo.
const TARGET_OGNI = 8;

export class Schermo {
    /** @param {object} opts { hz } quanti aggiornamenti al secondo */
    constructor({ hz = 20 } = {}) {
        this.interval = 1000 / hz;
        this.active = false;
        this.last = 0;
        this.inFlight = false;
        this.sent = 0;
        this.failed = 0;
    }

    start() { this.active = true; this.failed = 0; }
    stop() { this.active = false; this.inFlight = false; }

    /**
     * @param {object} snap tutto quello che serve al telefono per ridisegnare
     */
    send(snap) {
        if (!this.active || this.inFlight) return;
        const now = performance.now();
        if (now - this.last < this.interval) return;
        this.last = now;

        this.inFlight = true;
        fetch(STATE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(snap)
        })
            .then(() => { this.sent++; })
            .catch(() => {
                this.failed++;
                // Se il server non e' quello con il ponte (per esempio
                // `python -m http.server`), non ha senso continuare a
                // bussare: si spegne da solo dopo qualche tentativo.
                if (this.failed > 10 && this.sent === 0) {
                    console.warn('[schermo] nessun ponte attivo: avvia il server con tools/serve.py');
                    this.stop();
                }
            })
            .then(() => { this.inFlight = false; });
    }

    /**
     * Confeziona lo stato corrente.
     *
     * `fits` sono le rette bersaglio gia' ancorate sul corpo: al telefono
     * basta centro e direzione, la lunghezza se la calcola lui per far
     * uscire il raggio dallo schermo.
     */
    static snapshot({ practice, res, uPts, fits, targetPts, noteOf, aspect, progress, state, audio, maxHarmonics }) {
        // la posa guida e' ferma per tutto l'asana: si manda quando cambia
        // (compreso lo specchio, che la ribalta) e ogni tanto per chi arriva
        const chiave = (practice.current ? practice.current.id : '') + (res.mirrored ? '-m' : '');
        Schermo._giri = (Schermo._giri || 0) + 1;
        const rimanda = chiave !== Schermo._chiave || Schermo._giri % TARGET_OGNI === 0;
        Schermo._chiave = chiave;

        return {
            // Marca temporale: sul canale diretto i messaggi possono
            // arrivare fuori ordine (vedi js/peer.js), e uno stato vecchio
            // che sorpassa uno nuovo farebbe sobbalzare il disegno.
            t: Date.now(),
            aspect: r4(aspect),
            asana: practice.current ? practice.current.name : '',
            label: practice.current ? practice.current.label : '',
            cue: practice.current ? practice.current.cue : '',
            chord: practice.chord ? practice.chord.symbol : '',
            chordLabel: practice.chord ? practice.chord.label : '',
            step: practice.progressLabel(),
            progress: r4(progress),
            done: state === 'done',
            body: packPoints(uPts),
            targetKey: chiave,
            target: rimanda ? packTarget(targetPts) : undefined,
            rays: practice.rays.map((ray, i) => {
                const fit = fits[i];
                // quale altezza tocca a questa retta lo decide l'ordine di
                // arrivo, non la parte del corpo (js/music/voiceOrder.js)
                const note = noteOf ? noteOf(i) : practice.noteFor(i);
                return {
                    id: ray.id,
                    label: ray.label,
                    color: ray.color,
                    segs: ray.segs,
                    note: note ? note.name : '',
                    score: r4(res.scores[i] || 0),
                    active: !!res.active[i],
                    coverage: r4(res.coverage ? res.coverage[i] : 1),
                    harmonics: audio ? audio.harmonicsOf(i) : 0,
                    maxHarmonics,
                    fit: fit ? {
                        cx: r4(fit.cx), cy: r4(fit.cy),
                        dx: r4(fit.dirx), dy: r4(fit.diry)
                    } : null
                };
            })
        };
    }

    /** Indirizzo da aprire sul telefono, chiesto al server. */
    static async phoneUrl() {
        try {
            const res = await fetch('live/info', { cache: 'no-store' });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return (await res.json()).schermo || null;
        } catch (e) {
            return null;
        }
    }
}
